'use strict';

const boom = require('@hapi/boom');
const dayjs = require('dayjs');
const hoek = require('@hapi/hoek');
const deepcopy = require('deepcopy');
const _ = require('lodash');
const logger = require('screwdriver-logger');
const { EXTERNAL_TRIGGER } = require('screwdriver-data-schema').config.regex;
const { SCM_STATE_MAP, SCM_STATUSES } = require('screwdriver-data-schema').plugins.scm;
const BaseModel = require('./base');
const { getStageFromSetupJobName } = require('./helper');

// Symbols for private members
const executor = Symbol('executor');
const apiUri = Symbol('apiUri');
const tokenGen = Symbol('tokenGen');
const uiUri = Symbol('uiUri');
const ABORT_CODE = 130; // 128 + SIGINT 2 (^C)
const TEMPORAL_JWT_TIMEOUT = 12 * 60; // 12 hours in minutes

/**
 * Get the array of ids for jobs that match the names passed in
 * @method findIdsOfMatchedJobs
 * @param  {Array}   jobs     Array of jobs
 * @param  {Array}   jobNames Array of job names to find the ids
 * @return {Array}            Array of job ids that match the job names
 */
function findIdsOfMatchedJobs(jobs, jobNames) {
    return jobs.reduce((match, j) => {
        const name = j.parsePRJobName('job') || j.name;

        if (jobNames.includes(name)) {
            match.push(j.id);
        }

        return match;
    }, []);
}

/**
 * Get a list of blockedBy jobIds
 * If the blocking job is from an external pipeline, look up the external pipeline to find the jobId
 * @method getBlockedByIds
 * @param  {Pipeline}   pipeline Current Pipeline
 * @param  {Job}        job      Current Job that contains the blockedBy configuration
 * @return {Promise}             Array of blockedby JobIds
 */
function getBlockedByIds(pipeline, job) {
    let blockedByNames = job.permutations[0].blockedBy;
    let blockedByIds = [job.id]; // Always blocked by itself

    if (!blockedByNames || blockedByNames.length === 0) {
        return Promise.resolve(blockedByIds);
    }

    const externalBlockedByNames = blockedByNames.filter(name => name.startsWith('~sd@'));

    // Remove ~ prefix for job names
    blockedByNames = blockedByNames.map(name => name.replace('~', ''));

    return pipeline.getJobs().then(pipelineJobs => {
        // Get internal blocked by first
        blockedByIds = blockedByIds.concat(findIdsOfMatchedJobs(pipelineJobs, blockedByNames));

        // If there is no external blocked by, just return
        if (externalBlockedByNames.length === 0) {
            return Promise.resolve(blockedByIds);
        }

        // eslint-disable-next-line global-require
        const PipelineFactory = require('./pipelineFactory');
        const pipelineFactory = PipelineFactory.getInstance();

        // Go through the external pipeline Ids and find the matching job id
        return (
            Promise.all(
                externalBlockedByNames.map(fullname => {
                    const [, pid, jobname] = fullname.match(EXTERNAL_TRIGGER);

                    return pipelineFactory
                        .get(parseInt(pid, 10)) // convert pid from string to number
                        .then(p => {
                            // If pipeline doesn't exist, don't try to get pipeline jobs
                            if (!p) {
                                return [];
                            }

                            // Without PR jobs
                            return p.getJobs({ type: 'pipeline' });
                        })
                        .then(jobs => findIdsOfMatchedJobs(jobs, [jobname]));
                })
            )
                // Merge the results
                .then(jobIds => blockedByIds.concat(...jobIds))
        );
    });
}

/**
 * Extracts the key value pairs from meta summary and converts
 * them into markdown format
 * @method formatSummary
 * @param {Object}  summary     Meta summary object
 * @return {String}             Formatted summary with good things from markdown
 */
function formatSummary(summary) {
    let formattedSummary = '';

    Object.keys(summary).forEach(key => {
        if (typeof summary[key] === 'string') {
            formattedSummary += `__${key}__ - ${summary[key]}\n`;
        }
    });

    return formattedSummary;
}

/**
 * Extracts the summary from metadata and builds a comment
 * @method getPrComment
 * @param  {Object}   config
 * @param  {Object}   config.metadata      Build metadata
 * @param  {String}   config.buildId       ID of the build
 * @param  {String}   config.buildUrl      Build url
 * @param  {String}   config.container     Container the build is running in (e.g.: node:8)
 * @param  {Boolean}  config.splitComments Boolean to determine if we combine all comment to single string
 * @return {Array}    comments             Array of PR comments
 */
function getPrComment({ metadata, buildId, buildUrl, jobName, container, splitComments }) {
    // Format of the comment
    /**
        ### SD Build [#133652](https://cd.screwdriver.cd/pipelines/1/builds/133652) Job main
        _node:8_
        - - - -
        __coverage__ - Coverage increased by 15%
        __markdown__ - **this** should have been **bold** or *italic*

        ###### ~ Screwdriver automated build summary
      */
    const commentPrefix = `### SD Build [#${buildId}](${buildUrl}) Job ${jobName}\n_${container}_\n- - - -`;
    const commentSuffix = '###### ~ Screwdriver automated build summary';
    const comments = [];

    if (!splitComments) {
        const summaryText = formatSummary(metadata);

        if (!summaryText) {
            return comments;
        }

        const formattedSummary = summaryText ? [commentPrefix, summaryText, commentSuffix].join('\n') : null;

        comments.push({ text: formattedSummary });

        return comments;
    }

    Object.keys(metadata).forEach(key => {
        if (typeof metadata[key] === 'string') {
            const summaryText = `__${key}__ - ${metadata[key]}\n`;
            const formattedSummary = summaryText ? [commentPrefix, summaryText, commentSuffix].join('\n') : null;

            comments.push({ text: formattedSummary, keyword: key });
        }
    });

    return comments;
}

/**
 * Gets status configs to call updateCommitStatus with
 * @param  {Object} metadata Metadata object
 * @return {Array}           Status configs
 */
function getStatusConfig({ metadata }) {
    const statusConfigs = [];

    /* eslint-disable consistent-return */
    Object.keys(metadata).forEach(fieldName => {
        let checkObject = metadata[fieldName];

        // Break early if status is not formatted correctly
        if (typeof checkObject !== 'object' && typeof checkObject !== 'string') {
            logger.info(
                `Skipping adding meta status for meta.status.${fieldName}: ` +
                    'is not an object or JSON-parseable string.'
            );

            return;
        }

        // Parse JSON string
        if (typeof checkObject === 'string') {
            try {
                checkObject = JSON.parse(checkObject);
            } catch (e) {
                const message =
                    `Skipping adding meta status for meta.status.${fieldName}: ` +
                    'string is not a JSON-parseable string.';

                logger.info(message);

                return;
            }
        }

        const status = hoek.reach(checkObject, 'status', { default: 'PENDING' });

        if (!SCM_STATUSES.includes(status)) {
            const message =
                `Skipping adding meta status for meta.status.${fieldName}: ` +
                `status is not valid. It must be one of ${SCM_STATUSES.join(', ')}`;

            logger.info(message);

            return;
        }
        const defaultMessages = {
            SUCCESS: `${fieldName} check succeeded`,
            FAILURE: `${fieldName} check failed`,
            PENDING: `${fieldName} check pending`
        };

        const message = hoek.reach(checkObject, 'message', {
            default: defaultMessages[status] || defaultMessages.pending
        });
        const url = hoek.reach(checkObject, 'url') ? encodeURI(hoek.reach(checkObject, 'url')) : null;
        const config = {
            context: fieldName,
            buildStatus: status,
            description: message
        };

        if (url) {
            config.url = url;
        }

        statusConfigs.push(config);
    });
    /* eslint-enable consistent-return */

    return statusConfigs;
}

/**
 * @description Gets the token from token gen fn
 * @param {Object} self -> this object
 * @param {Object} job
 * @param {Object} pipeline
 * @return {String} A jwt token
 */
function getToken(self, job, pipeline) {
    const tokenGenConfig = {
        isPR: job.isPR(),
        jobId: job.id,
        eventId: self.eventId,
        pipelineId: pipeline.id,
        configPipelineId: pipeline.configPipelineId
    };

    if (job.prParentJobId) {
        tokenGenConfig.prParentJobId = job.prParentJobId;
    }

    // use temporal scope unless executor is queue
    const tokenScope = self[executor].name === 'queue' ? 'sdapi' : 'temporal';

    const token = self[tokenGen](self.id, tokenGenConfig, pipeline.scmContext, TEMPORAL_JWT_TIMEOUT, [tokenScope]);

    return token;
}

/**
 * @description Merges metadata from the parent event if available
 * @param {number} parentEventId - The ID of the parent event
 * @param {Object} mergedMeta - The current state of merged metadata
 * @returns {Object} The updated merged metadata
 */
async function mergeParentEventMeta(parentEventId, mergedMeta) {
    let resultMeta = mergedMeta;

    if (parentEventId) {
        // eslint-disable-next-line global-require
        const EventFactory = require('./eventFactory');
        const eventFactory = EventFactory.getInstance();
        const parentEvent = await eventFactory.get(parentEventId);

        resultMeta = _.merge(mergedMeta, parentEvent.meta);
    }

    return resultMeta;
}

/**
 * @description Merges metadata from an external build
 * @param {Object} mergedMeta - The current state of merged metadata
 * @param {Object} parentJob - The job object associated with the parent build
 * @param {Object} parentBuildMeta - The metadata from the parent build
 * @returns {Object} The updated merged metadata
 */
function mergeExternalBuildMeta(mergedMeta, parentJob, parentBuildMeta) {
    const jobName = parentJob.name;

    mergedMeta.sd = mergedMeta.sd || {};
    mergedMeta.sd[parentJob.pipelineId] = mergedMeta.sd[parentJob.pipelineId] || {};
    mergedMeta.sd[parentJob.pipelineId][jobName] = _.merge(
        mergedMeta.sd[parentJob.pipelineId][jobName] || {},
        parentBuildMeta
    );

    return mergedMeta;
}

/**
 * @description Merges metadata from parent builds if available
 * @param {number|number[]} parentBuildId - The ID or list of IDs of parent builds
 * @param {number} pipelineId - The ID of the pipeline
 * @param {Object} mergedMeta - The current state of merged metadata
 * @returns {Object} The updated merged metadata
 */
async function mergeParentBuildsMeta(parentBuildId, pipelineId, mergedMeta) {
    // eslint-disable-next-line global-require
    const BuildFactory = require('./buildFactory');
    const buildFactory = BuildFactory.getInstance();
    const parentBuildIds = Array.isArray(parentBuildId) ? parentBuildId : [Number(parentBuildId)];

    const parentBuilds = await buildFactory.list({
        params: { id: parentBuildIds }
    });

    parentBuilds.sort((a, b) => new Date(a.endTime) - new Date(b.endTime));

    // eslint-disable-next-line global-require
    const JobFactory = require('./jobFactory');
    const jobFactory = JobFactory.getInstance();

    let resultMeta = mergedMeta;

    for (const parentBuild of parentBuilds) {
        if (parentBuild.meta) {
            const parentJob = await jobFactory.get(parentBuild.jobId);

            if (parentJob.pipelineId !== pipelineId) {
                delete parentBuild.meta.parameters;
                resultMeta = mergeExternalBuildMeta(mergedMeta, parentJob, parentBuild.meta);
            }

            resultMeta = _.merge(mergedMeta, parentBuild.meta);
        }
    }

    return resultMeta;
}

/**
 * @description Constructs the build metadata
 * @param {Object} self - The build model instance
 * @param {number} pipelineId - The ID of the pipeline
 * @param {Object} job - The job object
 * @param {Object} mergedMeta - The current state of merged metadata
 * @returns {Object} The constructed build metadata
 */
function constructBuildMeta(self, pipelineId, job, mergedMeta) {
    const buildMeta = {
        pipelineId: String(pipelineId),
        eventId: String(self.eventId),
        jobId: String(job.id),
        buildId: String(self.id),
        jobName: job.name,
        sha: self.sha
    };
    const mergedBuildMeta = mergedMeta.build ? _.merge(mergedMeta.build, buildMeta) : buildMeta;

    delete mergedBuildMeta.warning;

    return mergedBuildMeta;
}

/**
 * @description Constructs the event metadata
 * @param {string} creatorName - The username of the event creator
 * @param {Object} mergedMeta - The current state of merged metadata
 * @returns {Object} The constructed event metadata
 */
function constructEventMeta(creatorName, mergedMeta) {
    const eventMeta = { creator: creatorName };

    return mergedMeta.event ? _.merge(mergedMeta.event, eventMeta) : eventMeta;
}

class BuildModel extends BaseModel {
    /**
     * Construct a BuildModel object
     * @method constructor
     * @param  {Object}    config
     * @param  {Object}    config.datastore         Object that will perform operations on the datastore
     * @param  {Object}    config.executor          Object that will perform executor operations
     * @param  {String}    config.jobId             The ID of the associated job to start
     * @param  {String}    config.apiUri            URI back to the API
     * @param  {String}    config.uiUri             URI back to the UI
     * @param  {String}    config.tokenGen          Generator for building tokens
     * @param  {String}    [config.sha]             The sha of the build
     * @param  {String}    [config.container]       The kind of container to use
     */
    constructor(config) {
        super('build', config);
        this[executor] = config.executor;
        this[apiUri] = config.apiUri;
        this[tokenGen] = config.tokenGen;
        this[uiUri] = config.uiUri;
    }

    /**
     * Update status to SCM
     * @method updateSCM
     * @param  {Pipeline}   pipeline     The build's pipeline
     * @return {Promise}
     */
    updateCommitStatus(pipeline) {
        return Promise.all([this.job, pipeline.token])
            .then(([job, token]) => {
                const buildUrl = `${this[uiUri]}/pipelines/${pipeline.id}/builds/${this.id}`;
                const config = {
                    token,
                    scmUri: pipeline.scmUri,
                    scmContext: pipeline.scmContext,
                    scmRepo: pipeline.scmRepo,
                    sha: this.sha,
                    buildStatus: SCM_STATE_MAP[this.status],
                    jobName: job.name,
                    url: buildUrl,
                    pipelineId: pipeline.id
                };

                // Skipping handling the empty build status
                if (config.buildStatus === '') {
                    return Promise.resolve();
                }

                const updateTasks = [this.scm.updateCommitStatus(config)];

                // Write meta summary to PR comment if meta.meta.summary object exists
                if (hoek.reach(this.meta, 'meta.summary') && this.isDone() && job.isPR()) {
                    const comments = getPrComment({
                        metadata: hoek.reach(this.meta, 'meta.summary'),
                        buildId: this.id,
                        buildUrl: config.url,
                        jobName: config.jobName,
                        container: this.container,
                        splitComments: hoek.reach(this.meta, 'meta.splitComments')
                    });
                    const prNum = parseInt(config.jobName.match(/^PR-([0-9]+):[\w-]+$/)[1], 10);
                    const prConfig = {
                        comments,
                        jobName: config.jobName,
                        prNum,
                        scmContext: config.scmContext,
                        scmRepo: config.scmRepo,
                        scmUri: config.scmUri,
                        token,
                        pipelineId: pipeline.id
                    };

                    if (Array.isArray(comments) && comments.length > 0) {
                        updateTasks.push(this.scm.addPrComment(prConfig));
                    }
                }

                // Update git commit status if meta.meta.status object exists
                if (hoek.reach(this.meta, 'meta.status') && this.isDone() && job.isPR()) {
                    const statusConfigs = getStatusConfig({
                        metadata: hoek.reach(this.meta, 'meta.status')
                    });

                    if (statusConfigs && statusConfigs.length > 0) {
                        statusConfigs.forEach(c => {
                            const customStatusConfig = hoek.applyToDefaults(config, c);

                            updateTasks.push(this.scm.updateCommitStatus(customStatusConfig));
                        });
                    }
                }

                return Promise.all(updateTasks);
            })
            .catch(err => {
                logger.error(`Failed to update commit status: ${err}`);

                return Promise.resolve();
            });
    }

    /**
     * Get models for all steps
     * @method getSteps
     * @return {Promise}
     */
    getSteps() {
        const listConfig = {
            params: {
                buildId: this.id
            }
        };

        // Lazy load factory dependency to prevent circular dependency issues
        // https://nodejs.org/api/modules.html#modules_cycles
        /* eslint-disable global-require */
        const StepFactory = require('./stepFactory');
        /* eslint-enable global-require */

        const factory = StepFactory.getInstance();

        return factory.list(listConfig);
    }

    /**
     * Lazy load a job model
     * @property pipeline
     * @return {Promise}    Resolves to the job associated with this build
     */
    get job() {
        // Lazy load factory dependency to prevent circular dependency issues
        // https://nodejs.org/api/modules.html#modules_cycles
        /* eslint-disable global-require */
        const JobFactory = require('./jobFactory');
        /* eslint-enable global-require */

        delete this.job;
        const factory = JobFactory.getInstance();
        const job = factory.get(this.jobId);

        // ES6 has weird getters and setters in classes,
        // so we redefine the pipeline property here to resolve to the
        // resulting promise and not try to recreate the factory, etc.
        Object.defineProperty(this, 'job', {
            enumerable: true,
            value: job
        });

        return job;
    }

    /**
     * Lazy load a pipeline model for the build
     * @property pipeline
     * @return {Promise}
     */
    get pipeline() {
        delete this.pipeline;

        const pipeline = this.job.then(job => {
            if (!job) {
                throw new Error('Job does not exist');
            }

            return job.pipeline.then(p => {
                if (!p) {
                    throw new Error('Pipeline does not exist');
                }

                return p;
            });
        });

        // ES6 has weird getters and setters in classes,
        // so we redefine the pipeline property here to resolve to the
        // resulting promise and not try to recreate the factory, etc.
        Object.defineProperty(this, 'pipeline', {
            enumerable: true,
            value: pipeline
        });

        return pipeline;
    }

    /**
     * Lazy load the secrets model for the build
     * @property secrets
     * @return {Promise}
     */
    get secrets() {
        delete this.secrets;

        const secrets = this.job.then(job => {
            if (!job) {
                throw new Error('Job does not exist');
            }

            return job.secrets;
        });

        // ES6 has weird getters and setters in classes,
        // so we redefine the secrets property here to resolve to the
        // resulting promise and not try to recreate the factory, etc.
        Object.defineProperty(this, 'secrets', {
            enumerable: true,
            value: secrets
        });

        return secrets;
    }

    get event() {
        // Lazy load factory dependency to prevent circular dependency issues
        // https://nodejs.org/api/modules.html#modules_cycles
        /* eslint-disable global-require */
        const EventFactory = require('./eventFactory');
        /* eslint-enable global-require */

        delete this.event;
        const factory = EventFactory.getInstance();
        const event = factory.get(this.eventId);

        // ES6 has weird getters and setters in classes,
        // so we redefine the pipeline property here to resolve to the
        // resulting promise and not try to recreate the factory, etc.
        Object.defineProperty(this, 'event', {
            enumerable: true,
            value: event
        });

        return event;
    }

    /**
     * Start this build and update commit status as pending
     * @method start
     * @param startConfig
     * @param startConfig.causeMessage  Message that describes why the event was created
     * @return {Promise}
     */
    async start(startConfig = {}) {
        const { causeMessage } = startConfig;

        const template = {};

        // Get template info
        if (this.templateId) {
            // Lazy load factory dependency to prevent circular dependency issues
            // https://nodejs.org/api/modules.html#modules_cycles
            /* eslint-disable global-require */
            const TemplateFactory = require('./templateFactory');
            const templateFactory = TemplateFactory.getInstance();

            const { id, name, namespace, version } = await templateFactory.get(this.templateId);

            if (id) {
                template.id = id;
            }
            if (name) {
                template.name = name;
            }
            if (namespace) {
                template.namespace = namespace;
            }
            if (namespace && name) {
                template.fullName = `${namespace}/${name}`;
            }
            if (version) {
                template.version = version;
            }
        }

        await this.initMeta();

        // Make sure that a pipeline and job is associated with the build
        return this.job.then(job =>
            Promise.all([job.pipeline, job.prNum])
                .then(([pipeline, prNum]) =>
                    getBlockedByIds(pipeline, job)
                        .then(blockedBy => {
                            const config = {
                                build: this,
                                buildId: this.id,
                                eventId: this.eventId,
                                jobId: job.id,
                                jobState: job.state,
                                jobArchived: job.archived,
                                jobName: job.name,
                                annotations: hoek.reach(job.permutations[0], 'annotations', { default: {} }),
                                blockedBy,
                                pipelineId: pipeline.id,
                                pipeline: {
                                    id: pipeline.id,
                                    name: pipeline.name,
                                    scmContext: pipeline.scmContext,
                                    configPipelineId: pipeline.configPipelineId
                                },
                                causeMessage: causeMessage || '',
                                freezeWindows: hoek.reach(job.permutations[0], 'freezeWindows', { default: [] }),
                                apiUri: this[apiUri],
                                container: this.container,
                                tokenGen: this[tokenGen],
                                token: getToken(this, job, pipeline),
                                isPR: job.isPR(),
                                prParentJobId: job.prParentJobId
                            };

                            if (template && !hoek.deepEqual(template, {})) {
                                config.template = template;
                            }

                            if (prNum) {
                                config.prNum = prNum;
                            }

                            if (this.buildClusterName) {
                                config.buildClusterName = this.buildClusterName;
                            }

                            if (hoek.reach(job.permutations[0], 'provider')) {
                                config.provider = job.permutations[0].provider;
                            }

                            return this[executor].start(config);
                        })
                        .then(() => this.updateCommitStatus(pipeline))
                ) // update github
                .then(() => this)
        );
    }

    /**
     * Update a build and update github status
     * @method update
     * @return {Promise}
     */
    update() {
        let prom = Promise.resolve();

        // Abort running steps. If no steps ever ran, abort the first step
        const abortSteps = () => {
            const now = new Date().toISOString();

            return this.getSteps().then(steps => {
                if (steps.length === 0) {
                    return Promise.resolve();
                }

                return Promise.all(
                    steps.map(step => {
                        if (step.startTime && !step.endTime) {
                            step.endTime = now;
                            step.code = ABORT_CODE;
                        }

                        return step.update();
                    })
                );
            });
        };

        // stop the build if we're done
        if (this.isDone()) {
            prom = abortSteps().then(() => this.stop());
        }

        // check if the status is changing
        if (this.isDirty('status')) {
            // update scm with status
            prom = prom.then(() => this.pipeline).then(pipeline => this.updateCommitStatus(pipeline));
        }

        return prom
            .then(() => Promise.all([this.job, this.pipeline])) // get latest status
            .then(([job, pipeline]) => {
                // status is changing to RUNNING so start timer
                if (this.status === 'RUNNING' && this.isDirty('status')) {
                    const config = {
                        buildId: this.id,
                        jobId: job.id,
                        startTime: this.startTime,
                        annotations: job.permutations[0].annotations,
                        buildStatus: this.status,
                        pipelineId: pipeline.id,
                        token: getToken(this, job, pipeline)
                    };

                    if (hoek.reach(job.permutations[0], 'provider')) {
                        config.provider = job.permutations[0].provider;
                    }

                    return this[executor].startTimer(config);
                }

                return Promise.resolve();
            })
            .then(() => super.update())
            .then(() => this);
    }

    /**
     * Remove all steps associated with this build, any stageBuild associated
     * with this build, and the build itself
     * @return {Promise}        Resolves to null if remove successfully
     */
    async remove() {
        // eslint-disable-next-line global-require
        const StepFactory = require('./stepFactory');
        const stepFactory = StepFactory.getInstance();
        const job = await this.job;
        const nextStageName = getStageFromSetupJobName(job.name);

        // Delete stageBuild if current build is from a stage setup job
        if (nextStageName) {
            /* eslint-disable global-require */
            const StageFactory = require('./stageFactory');
            const StageBuildFactory = require('./stageBuildFactory');
            /* eslint-enable global-require */
            const stageFactory = StageFactory.getInstance();
            const stageBuildFactory = StageBuildFactory.getInstance();
            const pipeline = await this.pipeline;
            const nextStage = await stageFactory.get({
                name: nextStageName,
                pipelineId: pipeline.id
            });
            const nextStageBuild = await stageBuildFactory.get({
                stageId: nextStage.id,
                eventId: this.eventId
            });

            await nextStageBuild.remove();
        }

        // Remove steps
        return stepFactory.removeSteps({ buildId: this.id }).then(() => super.remove());
    }

    /**
     * Stop a build
     * @method stop
     * @return {Promise}
     */
    stop() {
        return this.job
            .then(job =>
                job.pipeline
                    .then(pipeline => Promise.all([getBlockedByIds(pipeline, job), this.pipeline]))
                    .then(([blockedBy, pipeline]) => {
                        const config = {
                            annotations: job.permutations[0].annotations,
                            freezeWindows: job.permutations[0].freezeWindows,
                            blockedBy,
                            buildId: this.id,
                            jobId: job.id,
                            pipelineId: pipeline.id,
                            token: getToken(this, job, pipeline),
                            jobName: job.name,
                            apiUri: this[apiUri]
                        };

                        if (this.buildClusterName) {
                            config.buildClusterName = this.buildClusterName;
                        }

                        if (hoek.reach(job.permutations[0], 'provider')) {
                            config.provider = job.permutations[0].provider;
                        }

                        return this[executor].stop(config).then(() => this[executor].stopTimer(config));
                    })
            )
            .then(() => this)
            .catch(err => {
                logger.error(`Failed to stop a build: ${err}`);

                return Promise.reject(err);
            });
    }

    /**
     * Stops a frozen build
     * @method stopFrozen
     * @param  {String}  previousStatus  The previous build status
     * @return {Promise}
     */
    stopFrozen(previousStatus) {
        return this.job
            .then(job =>
                job.pipeline.then(pipeline => {
                    const config = {
                        buildId: this.id,
                        jobId: job.id,
                        pipelineId: pipeline.id,
                        token: getToken(this, job, pipeline),
                        status: previousStatus
                    };

                    if (hoek.reach(job.permutations[0], 'provider')) {
                        config.provider = job.permutations[0].provider;
                    }

                    return this[executor].stopFrozen(config);
                })
            )
            .then(() => this);
    }

    /**
     * Unzip a ZIP for build artifacts
     * @method unzipArtifacts
     * @return {Promise}
     */
    unzipArtifacts() {
        return Promise.all([this.job, this.pipeline]).then(([job, pipeline]) =>
            this[executor].unzipArtifacts({
                buildId: this.id,
                token: getToken(this, job, pipeline)
            })
        );
    }

    /**
     * Check if a build is done
     * @method isDone
     * @return boolean
     */
    isDone() {
        return (
            ['ABORTED', 'FAILURE', 'SUCCESS', 'COLLAPSED'].includes(this.status) ||
            (this.status === 'UNSTABLE' && !!this.endTime)
        );
    }

    /**
     * getMetrics for this build
     * @method getMetrics
     * @param  {Object}   [config]              Configuration object
     * @param  {String}   [config.startTime]    Look at steps created after this startTime
     * @param  {String}   [config.endTime]      Look at steps created before this endTime
     * @param  {String}   [config.stepName]     Name of step
     * @return {Promise}  Resolves to array of metrics for steps belong to this build
     */
    getMetrics(config = { stepName: null }) {
        // add build createTime to step metrics
        const { createTime } = this;

        // filter out old steps without id and buildId info
        return this.getSteps().then(steps => {
            let targetSteps = steps;

            // If stepName, get only that step
            if (config.stepName) {
                targetSteps = steps.filter(s => s.name === config.stepName);
            }

            // Generate metrics
            return Promise.all(
                targetSteps.map(s => {
                    // For older steps, add buildId info to it
                    if (!s.buildId) {
                        s.buildId = this.id;
                    }
                    const { id, name, code, startTime, endTime } = s;
                    const duration = startTime && endTime ? dayjs(endTime).diff(dayjs(startTime), 'second') : null;

                    return { id, name, code, duration, createTime };
                })
            );
        });
    }

    /**
     * Get a JSON representation of the build data with steps
     * @method toJsonWithSteps
     * @return {Promise} Resolves JSON of build with steps
     */
    toJsonWithSteps() {
        // eslint-disable-next-line global-require
        const StepFactory = require('./stepFactory');
        const stepFactory = StepFactory.getInstance();

        return stepFactory
            .list({
                params: { buildId: this.id },
                sortBy: 'id',
                sort: 'ascending'
            })
            .then(steps => {
                if (!steps.length) {
                    throw boom.notFound('Steps do not exist');
                }

                return Object.assign(deepcopy(this.toJson()), { steps });
            });
    }

    /**
     * @description Initializes the metadata for the build
     * @returns {Promise} A promise that resolves when the metadata is initialized and updated
     */
    async initMeta() {
        let mergedMeta = this.meta ? _.merge({}, this.meta) : {};

        const event = await this.event;

        mergedMeta = await mergeParentEventMeta(event.parentEventId, mergedMeta);

        if (event.meta) {
            mergedMeta = _.merge(mergedMeta, event.meta);
        }

        const job = await this.job;

        if (this.parentBuildId) {
            mergedMeta = await mergeParentBuildsMeta(this.parentBuildId, job.pipelineId, mergedMeta);
        }
        // Initialize pr comments (Issue #1858)
        if (mergedMeta.meta) {
            delete mergedMeta.meta.summary;
        }
        // Set build parameter explicitly (Issue #2501)
        if (this.meta.parameters) {
            mergedMeta.parameters = this.meta.parameters;
        }

        mergedMeta.build = constructBuildMeta(this, job.pipelineId, job, mergedMeta);
        mergedMeta.event = constructEventMeta(event.creator.username, mergedMeta);

        this.meta = mergedMeta;

        return this.update();
    }
}

module.exports = BuildModel;
