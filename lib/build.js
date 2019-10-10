'use strict';

const BaseModel = require('./base');
const dayjs = require('dayjs');
const hoek = require('hoek');
const winston = require('winston');
const { PR_JOB_NAME, EXTERNAL_TRIGGER } = require('screwdriver-data-schema').config.regex;

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
        let name = j.name;

        // Get the actual job name if the matching job is a PR job
        if (j.isPR()) {
            const prJobName = j.name.match(PR_JOB_NAME);

            if (prJobName) {
                name = prJobName[2];
            }
        }

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

    const externalBlockedByNames = blockedByNames.filter(
        name => name.startsWith('~sd@'));

    // Remove ~ prefix for job names
    blockedByNames = blockedByNames.map(name => name.replace('~', ''));

    return pipeline.getJobs().then((pipelineJobs) => {
        // Get internal blocked by first
        blockedByIds = blockedByIds.concat(
            findIdsOfMatchedJobs(pipelineJobs, blockedByNames));

        // If there is no external blocked by, just return
        if (externalBlockedByNames.length === 0) {
            return Promise.resolve(blockedByIds);
        }

        // eslint-disable-next-line global-require
        const PipelineFactory = require('./pipelineFactory');
        const pipelineFactory = PipelineFactory.getInstance();

        // Go through the external pipeline Ids and find the matching job id
        return Promise.all(
            externalBlockedByNames.map((fullname) => {
                const [, pid, jobname] = fullname.match(EXTERNAL_TRIGGER);

                return pipelineFactory.get(parseInt(pid, 10)) // convert pid from string to number
                    .then((p) => {
                        // If pipeline doesn't exist, don't try to get pipeline jobs
                        if (!p) {
                            return [];
                        }

                        return p.getJobs();
                    })
                    .then(jobs => findIdsOfMatchedJobs(jobs, [jobname]));
            }))
            // Merge the results
            .then(jobIds => blockedByIds.concat(...jobIds));
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

    Object.keys(summary).forEach((key) => {
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
 * @param  {Object}   config.metadata   Build metadata
 * @param  {String}   config.buildId    ID of the build
 * @param  {String}   config.buildUrl   Build url
 * @param  {String}   config.container  Container the build is running in (e.g.: node:8)
 * @return {String}   comment           PR comment
 */
function getPrComment({ metadata, buildId, buildUrl, container }) {
    // Format of the comment
    /**
        ### SD Build [#133652](https://cd.screwdriver.cd/pipelines/1/builds/133652)
        _node:8_
        - - - -
        __coverage__ - Coverage increased by 15%
        __markdown__ - **this** should have been **bold** or *italic*

        ###### ~ Screwdriver automated build summary
      */
    const commentPrefix = `### SD Build [#${buildId}](${buildUrl})\n` +
        `_${container}_\n- - - -`;
    const commentSuffix = '###### ~ Screwdriver automated build summary';
    const summaryText = formatSummary(metadata);

    return summaryText ? [commentPrefix, summaryText, commentSuffix].join('\n') : null;
}

/**
 * Gets status configs to call updateCommitStatus with
 * @param  {Object} metadata Metadata object
 * @return {Array}           Status configs
 */
function getStatusConfig({ metadata }) {
    const statusConfigs = [];

    /* eslint-disable consistent-return */
    Object.keys(metadata).forEach((fieldName) => {
        let checkObject = metadata[fieldName];

        // Break early if status is not formatted correctly
        if (typeof checkObject !== 'object' && typeof checkObject !== 'string') {
            winston.info(`Skipping adding meta status for meta.status.${fieldName}: ` +
                'is not an object or JSON-parseable string.');

            return;
        }

        // Parse JSON string
        if (typeof checkObject === 'string') {
            try {
                checkObject = JSON.parse(checkObject);
            } catch (e) {
                const message = `Skipping adding meta status for meta.status.${fieldName}: ` +
                    'string is not a JSON-parseable string.';

                winston.info(message);

                return;
            }
        }

        const defaultMessages = {
            success: `${fieldName} check succeeded`,
            failure: `${fieldName} check failed`
        };
        const status = hoek.reach(checkObject, 'status', { default: 'success' });
        const message = hoek.reach(checkObject, 'message', {
            default: defaultMessages[status] || defaultMessages.failure
        });
        const url = hoek.reach(checkObject, 'url') ?
            encodeURI(hoek.reach(checkObject, 'url')) : null;
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
        return Promise.all([
            this.job,
            pipeline.token
        ]).then(([job, token]) => {
            const buildUrl = `${this[uiUri]}/pipelines/${pipeline.id}/builds/${this.id}`;
            const config = {
                token,
                scmUri: pipeline.scmUri,
                scmContext: pipeline.scmContext,
                sha: this.sha,
                buildStatus: this.status,
                jobName: job.name,
                url: buildUrl,
                pipelineId: pipeline.id
            };

            const updateTasks = [this.scm.updateCommitStatus(config)];

            // Write meta summary to PR comment if meta.meta.summary object exists
            if (hoek.reach(this.meta, 'meta.summary') && this.isDone() && job.isPR()) {
                const comment = getPrComment({
                    metadata: hoek.reach(this.meta, 'meta.summary'),
                    buildId: this.id,
                    buildUrl: config.url,
                    container: this.container
                });
                const prNum = parseInt(config.jobName.match(/^PR-([0-9]+):[\w-]+$/)[1], 10);
                const prConfig = {
                    comment,
                    prNum,
                    scmContext: config.scmContext,
                    scmUri: config.scmUri,
                    token
                };

                if (comment) {
                    updateTasks.push(this.scm.addPrComment(prConfig));
                }
            }

            // Update git commit status if meta.meta.status object exists
            if (hoek.reach(this.meta, 'meta.status') && this.isDone() && job.isPR()) {
                const statusConfigs = getStatusConfig({
                    metadata: hoek.reach(this.meta, 'meta.status')
                });

                if (statusConfigs && statusConfigs.length > 0) {
                    statusConfigs.forEach((c) => {
                        const customStatusConfig = hoek.applyToDefaults(config, c);

                        updateTasks.push(this.scm.updateCommitStatus(customStatusConfig));
                    });
                }
            }

            return Promise.all(updateTasks);
        })
            .catch((err) => {
                winston.error(`Failed to update commit status: ${err}`);

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

        const pipeline = this.job.then((job) => {
            if (!job) {
                throw new Error('Job does not exist');
            }

            return job.pipeline.then((p) => {
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

        const secrets = this.job.then((job) => {
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

    /**
     * Start this build and update commit status as pending
     * @method start
     * @param startConfig
     * @param startConfig.causeMessage  Message that describes why the event was created
     * @return {Promise}
     */
    start(startConfig = {}) {
        const { causeMessage } = startConfig;

        // Make sure that a pipeline and job is associated with the build
        return this.job.then(job =>
            job.pipeline.then(pipeline => getBlockedByIds(pipeline, job)
                .then((blockedBy) => {
                    const tokenGenConfig = {
                        isPR: job.isPR(),
                        jobId: job.id,
                        eventId: this.eventId,
                        pipelineId: pipeline.id,
                        configPipelineId: pipeline.configPipelineId
                    };

                    if (job.prParentJobId) {
                        tokenGenConfig.prParentJobId = job.prParentJobId;
                    }
                    const config = {
                        build: this,
                        jobId: job.id,
                        jobState: job.state,
                        jobArchived: job.archived,
                        jobName: job.name,
                        annotations: hoek.reach(job.permutations[0],
                            'annotations', { default: {} }),
                        blockedBy,
                        pipeline: {
                            id: pipeline.id,
                            scmContext: pipeline.scmContext
                        },
                        causeMessage: causeMessage || '',
                        freezeWindows: hoek.reach(job.permutations[0],
                            'freezeWindows', { default: [] }),
                        apiUri: this[apiUri],
                        buildId: this.id,
                        eventId: this.eventId,
                        container: this.container,
                        tokenGen: this[tokenGen],
                        token: this[tokenGen](this.id, tokenGenConfig,
                            pipeline.scmContext, TEMPORAL_JWT_TIMEOUT) };

                    if (this.buildClusterName) {
                        config.buildClusterName = this.buildClusterName;
                    }

                    return this[executor].start(config);
                })
                .then(() => this.updateCommitStatus(pipeline))) // update github
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
            const now = (new Date()).toISOString();

            return this.getSteps().then((steps) => {
                if (steps.length !== 0) {
                    return Promise.all(steps.map((step) => {
                        if (step.startTime && !step.endTime) {
                            step.endTime = now;
                            step.code = ABORT_CODE;
                        }

                        return step.update();
                    }));
                }

                this.steps = this.steps.map((step) => {
                    if (step.startTime && !step.endTime) {
                        step.endTime = now;
                        step.code = ABORT_CODE;
                    }

                    return step;
                });

                return this.steps;
            });
        };

        // stop the build if we're done
        if (this.isDone()) {
            prom = abortSteps()
                .then(() => this.stop());
        }

        // check if the status is changing
        if (this.isDirty('status')) {
            // update scm with status
            prom = prom
                .then(() => this.pipeline)
                .then(pipeline => this.updateCommitStatus(pipeline));
        }

        return prom
            .then(() => super.update())
            .then(() => this);
    }

    /**
     * Stop a build
     * @method stop
     * @return {Promise}
     */
    stop() {
        return this.job
            .then(job => job.pipeline
                .then(pipeline => getBlockedByIds(pipeline, job))
                .then((blockedBy) => {
                    const config = {
                        annotations: job.permutations[0].annotations,
                        freezeWindows: job.permutations[0].freezeWindows,
                        blockedBy,
                        buildId: this.id,
                        jobId: job.id
                    };

                    if (this.buildClusterName) {
                        config.buildClusterName = this.buildClusterName;
                    }

                    return this[executor].stop(config);
                }))
            .then(() => this);
    }

    /**
     * Check if a build is done
     * @method isDone
     * @return boolean
     */
    isDone() {
        return ['ABORTED', 'FAILURE', 'SUCCESS'].includes(this.status) ||
        (this.status === 'UNSTABLE' && !!this.endTime);
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
        const createTime = this.createTime;
        // filter out old steps without id and buildId info
        let steps = this.steps;

        // If stepName, get only that step
        if (config.stepName) {
            steps = steps.filter(s => s.name === config.stepName);
        }

        // Generate metrics
        const metrics = steps.map((s) => {
            // For older steps, add buildId info to it
            if (!s.buildId) {
                s.buildId = this.id;
            }
            const { id, name, code, startTime, endTime } = s;
            const duration = startTime && endTime
                ? dayjs(endTime).diff(dayjs(startTime), 'second')
                : null;

            return { id, name, code, duration, createTime };
        });

        return metrics;
    }
}

module.exports = BuildModel;
