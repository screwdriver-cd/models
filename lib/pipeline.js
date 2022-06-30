/* eslint no-param-reassign: ["error", { "props": false }] */
/* eslint-disable no-underscore-dangle */

'use strict';

const parser = require('screwdriver-config-parser');
const workflowParser = require('screwdriver-workflow-parser');
const boom = require('@hapi/boom');
const hoek = require('@hapi/hoek');
const dayjs = require('dayjs');
const yamlParser = require('js-yaml');
const _ = require('lodash');
const { EXTERNAL_TRIGGER_ALL, CHECKOUT_URL } = require('screwdriver-data-schema').config.regex;
const logger = require('screwdriver-logger');
const Schema = require('screwdriver-data-schema');
const BaseModel = require('./base');
const MAX_METRIC_GET_COUNT = 1000;
const MAX_JOB_DELETE_COUNT = 10;
const MAX_EVENT_DELETE_COUNT = 100;
// The default page for fetching not by aggregatedInteval
// And the start page for fetching by aggregatedInteval
const DEFAULT_PAGE = 1;
const SCM_NO_ACCESS_STATUSES = [401, 404];

const { getAllRecords, getBuildClusterName } = require('./helper');

const JOB_CHUNK_SIZE = process.env.JOBS_PARALLEL_COUNT || 5;
const SD_API_URI = process.env.URI;

const DEFAULT_DOWNTIME_JOBS = [];
const DEFAULT_DOWNTIME_STATUSES = ['FAILURE'];

const MATCH_COMPONENT_HOSTNAME = 1;

const PROVIDER_YAML_KEY = /provider: /;

// Process jobs JOB_CHUNK_SIZE at at time
const getJobChunks = jobs => _.chunk(jobs || [], JOB_CHUNK_SIZE);

// Calculate event duration by using max endTime - min startTime of builds
// that belong this event
const eventMetrics = async ({ event, downtimeJobs, downtimeStatuses }) => {
    const buildMetrics = await event.getMetrics();

    // Somehow this event doesn't have any builds
    if (!buildMetrics || buildMetrics.length === 0) {
        return null;
    }

    let { id, jobId, duration, startTime, endTime, queuedTime, imagePullTime, status } = buildMetrics[0];
    let minStartTime = new Date(startTime);
    let maxEndTime = new Date(endTime);
    let eventStatus = status;
    let totalQueuedTime = queuedTime || 0;
    let totalImagePullTime = imagePullTime || 0;
    const builds = [{ id, jobId, duration, status }];
    let isDowntimeEvent =
        (downtimeJobs.length === 0 || downtimeJobs.includes(jobId)) && downtimeStatuses.includes(status);

    for (let i = 1; i < buildMetrics.length; i += 1) {
        ({ id, jobId, duration, startTime, endTime, queuedTime, imagePullTime, status } = buildMetrics[i]);
        const s = new Date(startTime);
        const e = new Date(endTime);

        minStartTime = !minStartTime || s < minStartTime ? s : minStartTime;

        // last build in the event
        if (!maxEndTime || e > maxEndTime) {
            maxEndTime = e;
            eventStatus = status;
        }

        if (queuedTime) {
            totalQueuedTime += queuedTime;
        }
        if (imagePullTime) {
            totalImagePullTime += imagePullTime;
        }

        builds.push({
            id,
            jobId,
            startTime,
            duration,
            status
        });

        // Set downtime event flag if job is in downtimeJobs and status is in downtimeStatuses
        if ((downtimeJobs.length === 0 || downtimeJobs.includes(jobId)) && downtimeStatuses.includes(status)) {
            isDowntimeEvent = true;
        }
    }

    return {
        duration: dayjs(maxEndTime).diff(dayjs(minStartTime), 'second'),
        queuedTime: totalQueuedTime,
        imagePullTime: totalImagePullTime,
        status: eventStatus,
        builds: buildMetrics,
        isDowntimeEvent,
        maxEndTime // need maxEndTime to calculate downtimeDuration
    };
};

/**
 * Sum event metrics per aggregated period
 * @method sumAggregatedEventMetrics
 * @param  {events}             events Array of events belong to the same period (day/week/month)
 * @return {Object}                    Total queued time, image pull time, and duration of events
 */
const sumAggregatedEventMetrics = async events => {
    let totalQueuedTime = 0;
    let totalImagePullTime = 0;
    let totalDuration = 0;
    const emptyCount = {
        event: 0,
        queuedTime: 0,
        imagePullTime: 0,
        duration: 0
    };

    // increment emptyCount and returns 0 if the field is null, otherwise return its value
    const checkForEmpty = (fieldName, time) => {
        if (time) {
            return time;
        }

        emptyCount[fieldName] += 1;

        return 0;
    };

    const promiseArray = events.map(async e => {
        const metrics = await eventMetrics({
            event: e,
            downtimeJobs: DEFAULT_DOWNTIME_JOBS,
            downtimeStatuses: DEFAULT_DOWNTIME_STATUSES
        });

        if (!metrics) {
            emptyCount.event += 1;
            emptyCount.queuedTime += 1;
            emptyCount.imagePullTime += 1;
            emptyCount.duration += 1;

            return;
        }
        totalQueuedTime += checkForEmpty('queuedTime', metrics.queuedTime);
        totalImagePullTime += checkForEmpty('imagePullTime', metrics.imagePullTime);
        totalDuration += checkForEmpty('duration', metrics.duration);
    });

    await Promise.all(promiseArray);

    return {
        totalQueuedTime,
        totalImagePullTime,
        totalDuration,
        emptyCount
    };
};

/**
 * Parse scmUri and return desired field
 * @param  {String} scmUri   Scm uri (e.g.: github.com:12345:master)
 * @param  {String} field    Desired field (host, id, branch, or rootDir)
 * @return {String}          Desired field
 */
function parseScmUri({ scmUri, field }) {
    const fieldMap = {
        host: 0,
        id: 1,
        branch: 2,
        rootDir: 3
    };

    if (!scmUri) {
        return '';
    }
    const uriInfos = scmUri.split(':');
    const position = fieldMap[field];

    if (position >= uriInfos.length) {
        return '';
    }

    return uriInfos[position];
}

/**
 * Sync external triggers
 * Remove the trigger if the job is no longer in yaml, or if the src is no longer in 'requires'
 * Add the trigger src is in 'requires' and was not in the database yet
 * @method syncExternalTriggers
 * @param  {Object}     config              config
 * @param  {Number}     config.pipelineId   pipelineId belongs to this job
 * @param  {String}     config.jobName      name of the job
 * @param  {Array}      config.requiresList requires value of this job
 * @return {Promise}
 */
function syncExternalTriggers(config) {
    // Lazy load factory dependency to prevent circular dependency issues
    // https://nodejs.org/api/modules.html#modules_cycles
    /* eslint-disable global-require */
    const TriggerFactory = require('./triggerFactory');
    /* eslint-enable global-require */

    const triggerFactory = TriggerFactory.getInstance();
    const newSrcList = config.requiresList;
    const dest = [`~sd@${config.pipelineId}:${config.jobName}`, `sd@${config.pipelineId}:${config.jobName}`];
    const processed = [];

    // list records that would trigger this job
    return triggerFactory.list({ params: { dest } }).then(records => {
        // if the src is not in the new src list, then remove it
        const toRemove = records.filter(rec => !newSrcList.includes(rec.src));

        // if the src is not in the old src list, then create in datastore
        const oldSrcList = records.map(r => r.src); // get the old src list
        const toCreate = newSrcList.filter(src => !oldSrcList.includes(src) && EXTERNAL_TRIGGER_ALL.test(src));

        toRemove.forEach(rec => processed.push(rec.remove()));
        toCreate.forEach(src =>
            processed.push(
                triggerFactory.create({
                    src,
                    dest: `~sd@${config.pipelineId}:${config.jobName}`
                })
            )
        );

        return Promise.all(processed);
    });
}

class PipelineModel extends BaseModel {
    /**
     * Construct a PipelineModel object
     * @method constructor
     * @param  {Object}   config                Config object to create the pipeline with
     * @param  {Object}   config.datastore      Object that will perform operations on the datastore
     * @param  {Object}   config.admins         The admins of this repository
     * @param  {String}   config.scmUri         The scmUri for the application
     * @param  {String}   config.scmContext     The scm context to which user belongs
     * @param  {String}   config.createTime     The time the pipeline was created
     */
    constructor(config) {
        super('pipeline', config);
        this.scmContext = config.scmContext;
    }

    /**
     * Get a pipeline factory instance
     * @method _getPipelineFactory
     * @return {Object}         PipelineFactory instance
     */
    _getPipelineFactory() {
        // Lazy load factory dependency to prevent circular dependency issues
        // https://nodejs.org/api/modules.html#modules_cycles
        // eslint-disable-next-line global-require
        const PipelineFactory = require('./pipelineFactory');

        return PipelineFactory.getInstance();
    }

    /**
     * Get file from SCM
     * @method _getFile
     * @param  {String} token The token used to authenticate to the SCM
     * @param  {String} path  The file in the repo to fetch
     * @param  {String} [ref] The reference to the SCM, either branch or sha
     * @return {Promise}      Resolves to string containing contents of file
     */
    _getFile({ token, path, ref }) {
        const config = {
            scmUri: this.scmUri,
            scmContext: this.scmContext,
            path,
            token,
            scmRepo: this.scmRepo
        };

        if (ref) {
            config.ref = ref;
        }

        return this.scm.getFile(config).catch(err => {
            const message = `pipelineId:${this.id}: Failed to fetch ${path}.`;

            logger.error(message, err);
            throw new Error(message);
        });
    }

    /**
     * Insert provider yaml to screwdriver config
     * @method _getYamlWithProvider
     * @param  {String} config  The Screwdriver yaml configuration (yaml format)
     * @param  {String} token   The token used to authenticate to the SCM
     * @return {Promise}        Resolves to string containing contents of config file (yaml format)
     */
    async _getYamlWithProvider({ config, token }) {
        // Convert config to JSON
        const documents = yamlParser.loadAll(config);

        let doc;

        // If only one document, use it
        if (documents.length === 1) {
            doc = documents[0];
            // If more than one document, look for "version: 4"
        } else {
            doc = documents.find(yamlDoc => yamlDoc && yamlDoc.version === 4);
        }

        // Handle provider path in "shared" section
        if (
            hoek.reach(doc, 'shared.provider') &&
            typeof doc.shared.provider === 'string' &&
            CHECKOUT_URL.test(doc.shared.provider)
        ) {
            // Get provider yaml and convert to JSON
            const providerConfig = await this._getFile({ token, path: doc.shared.provider });
            const providerJson = yamlParser.load(providerConfig);

            doc.shared.provider = providerJson.provider || providerJson;
        }

        // Handle provider path in "jobs" section
        await Promise.all(
            Object.values(doc.jobs).map(async val => {
                if (val.provider && typeof val.provider === 'string' && CHECKOUT_URL.test(val.provider)) {
                    // Get provider yaml and convert to JSON
                    const providerConfig = await this._getFile({ token, path: val.provider });
                    const providerJson = yamlParser.load(providerConfig);

                    val.provider = providerJson.provider || providerJson;
                }
            })
        );

        // Convert entire config back to yaml
        return yamlParser.dump(doc);
    }

    /**
     * Get the screwdriver configuration for the pipeline at the given ref
     * @method getConfiguration
     * @param  {Object}  [configuration]       Config object
     * @param  {String}  [configuration.ref]   Reference to get screwdriver.yaml, e.g.sha, prRef, branch
     * @param  {String}  [configuration.isPR]  Flag to indicate if it is getting config for PR
     * @param  {Number}  [configuration.id]    Id of child pipeline, if the pipeline to be parsed is a child pipeline
     * @return {Promise} Resolves to parsed and flattened configuration
     */
    getConfiguration(configuration) {
        const ref = hoek.reach(configuration, 'ref');
        const isPR = hoek.reach(configuration, 'isPR') || false;
        const id = hoek.reach(configuration, 'id') || this.id;
        // Lazy load factory dependency to prevent circular dependency issues
        // https://nodejs.org/api/modules.html#modules_cycles
        /* eslint-disable global-require */
        const TemplateFactory = require('./templateFactory');
        const templateFactory = TemplateFactory.getInstance();
        const BuildClusterFactory = require('./buildClusterFactory');
        const buildClusterFactory = BuildClusterFactory.getInstance();
        const TriggerFactory = require('./triggerFactory');
        const triggerFactory = TriggerFactory.getInstance();
        const pipelineFactory = this._getPipelineFactory();
        /* eslint-enable global-require */

        // If it is a child pipeline, use config pipeline's getConfiguration
        if (this.configPipelineId) {
            return pipelineFactory.get(this.configPipelineId).then(configPipeline => {
                // If it is a PR on child pipeline, use config from config pipeline
                if (isPR) {
                    return configPipeline.getConfiguration({});
                }

                return configPipeline.getConfiguration({ ref, id });
            });
        }

        let token;

        return (
            this.admin
                .then(user => user.unsealToken())
                // fetch the screwdriver.yaml file
                .then(userToken => {
                    token = userToken;

                    return this._getFile({ token, path: 'screwdriver.yaml', ref });
                })
                // parse the content of the yaml file
                .then(async config => {
                    let parserConfig = {
                        yaml: config,
                        templateFactory,
                        buildClusterFactory,
                        notificationsValidationErr: pipelineFactory.getNotificationsValidationErrFlag()
                    };

                    // Check if we need to fetch provider file
                    if (config.search(PROVIDER_YAML_KEY) !== -1) {
                        parserConfig.yaml = await this._getYamlWithProvider({ config, token });
                    }

                    if (pipelineFactory.getExternalJoinFlag()) {
                        const joinConfig = { triggerFactory, pipelineId: id };

                        parserConfig = { ...parserConfig, ...joinConfig };
                    }

                    return parser(parserConfig);
                })
        );
    }

    /**
     * archive closed PR jobs
     * @param {Array}   existingPrJobs List pipeline's existing pull request jobs (excludes already archived jobs for closed PRs)
     * @param {Array}   openedPRs    List of opened PRs coming from SCM
     * @param {Promise}
     */
    _archiveClosePRs(existingPrJobs, openedPRs) {
        const existingPRs = existingPrJobs.filter(j => j.isPR());
        const openedPRsNames = openedPRs.map(j => j.name);
        const toArchiveList = [];

        existingPRs.forEach(job => {
            // getting PR and number e.g. PR-1
            const prName = job.parsePRJobName('pr');

            // if PR is closed, add it to archive list
            if (!openedPRsNames.includes(prName) && !job.archived) {
                toArchiveList.push(job);
            }
        });

        return this._updateJobArchive(toArchiveList, true);
    }

    /**
     * Go through the job list to archive/unarchive it and update job config if parsedConfig passed in
     * @method _updateJobArchive
     * @param  {Array}        jobList              List of job objects
     * @param  {boolean}      archived             Archived value to update to
     * @param  {Object}       [parsedConfig]       Parsed job configuration
     * @return {Promise}
     */
    _updateJobArchive(jobList, archived, parsedConfig) {
        const jobsToUpdate = [];

        jobList.forEach(j => {
            const jobName = j.parsePRJobName('job') || 'main';

            if (parsedConfig) {
                j.permutations = parsedConfig.jobs[jobName];
            }
            j.archived = archived;
            if (archived) logger.info(`pipelineId:${this.id}: Archiving ${j.name} job.`);
            jobsToUpdate.push(j.update());
        });

        return Promise.all(jobsToUpdate);
    }

    /**
     * Attach Screwdriver webhooks to the pipeline's repository
     * @method addWebhooks
     * @param   {String}    webhookUrl    The webhook to be added
     * @return  {Promise}
     */
    async addWebhooks(webhookUrl) {
        const webhookUrlsWithActionsList = [];
        const webhookUrlWithActions = {
            webhookUrl,
            actions: [],
            scmUri: this.scmUri
        };

        webhookUrlsWithActionsList.push(webhookUrlWithActions);

        if (Array.isArray(this.subscribedScmUrlsWithActions)) {
            this.subscribedScmUrlsWithActions.forEach(urlObj => {
                urlObj.webhookUrl = webhookUrl;
            });
            webhookUrlsWithActionsList.push(...this.subscribedScmUrlsWithActions);
        }

        const { enabled, accessToken } = this.scm.getReadOnlyInfo({ scmContext: this.scmContext });
        let token;

        // Use read-only access token
        if (this.configPipelineId && enabled && accessToken) {
            token = accessToken;
        } else {
            const repoAdmin = await this.getFirstRepoAdmin();

            token = await repoAdmin.unsealToken();
        }

        const addWebhookList = [];
        let mappedActions = [];

        const scmActionMappings = this.scm.getWebhookEventsMapping({ scmContext: this.scmContext });

        for (let i = 0; i < webhookUrlsWithActionsList.length; i += 1) {
            mappedActions = [];

            for (const action of webhookUrlsWithActionsList[i].actions) {
                if (scmActionMappings[action]) {
                    if (Array.isArray(scmActionMappings[action])) {
                        mappedActions.concat(scmActionMappings[action]);
                    } else {
                        mappedActions.push(scmActionMappings[action]);
                    }
                }
            }

            // eslint-disable-next-line no-await-in-loop
            const addWebhook = await this.scm.addWebhook({
                scmUri: webhookUrlsWithActionsList[i].scmUri,
                scmContext: this.scmContext,
                token,
                actions: mappedActions,
                webhookUrl: webhookUrlsWithActionsList[i].webhookUrl
            });

            addWebhookList.push(addWebhook);
        }

        return addWebhookList;
    }

    /**
     * Sync the pull requests by checking against SCM
     * Create or update PR jobs if necessary
     * @method syncPRs
     * @return {Promise}
     */
    async syncPRs() {
        const token = await this.token;

        return Promise.all([
            this.pullRequestJobs,
            this.scm.getOpenedPRs({
                scmUri: this.scmUri,
                scmContext: this.scmContext,
                token
            })
        ])
            .then(([existingPrJobs, openedPRs]) => {
                const synced = [];

                openedPRs.forEach(openedPR => {
                    const prNum = openedPR.name.split('-')[1];

                    synced.push(this.syncPR(prNum));
                });

                return Promise.all(synced).then(() => this._archiveClosePRs(existingPrJobs, openedPRs));
            })
            .then(() => this);
    }

    /**
     * Sync PR by looking up the PR's screwdriver.yaml
     * Update the permutations to be correct
     * Create missing PR jobs
     * @method  syncPR
     * @param   {Number}   prNum        PR Number
     * @return  {Promise}
     */
    async syncPR(prNum) {
        const token = await this.token;
        const prInfo = await this.scm.getPrInfo({
            scmUri: this.scmUri,
            scmContext: this.scmContext,
            token,
            prNum,
            scmRepo: this.scmRepo
        });

        const jobs = await this.pipelineJobs;
        const parsedConfig = await this.getConfiguration({
            ref: prInfo.ref,
            isPR: true
        });
        const branch = await prInfo.baseBranch;

        logger.info(`pipelineId:${this.id}: chainPR flag is ${this.chainPR}.`);

        const prJobsForOpenPrs = await this.pullRequestJobs;
        const prJobs = prJobsForOpenPrs.filter(j => j.name.startsWith(`PR-${prNum}:`));
        const { workflowGraph } = parsedConfig;

        // Get next jobs for when startFrom is ~pr
        let nextJobNames = workflowParser.getNextJobs(workflowGraph, {
            trigger: '~pr',
            prNum,
            chainPR: this.chainPR
        });

        // Get next jobs for when startFrom is ~pr:branchName
        nextJobNames = nextJobNames.concat(
            workflowParser.getNextJobs(workflowGraph, {
                trigger: `~pr:${branch}`,
                prNum,
                chainPR: this.chainPR
            })
        );

        // Get all chained jobs if chainPR is true
        if (this.chainPR) {
            let triggerJobs = nextJobNames.concat();

            while (triggerJobs.length > 0) {
                const chainedJobs = workflowParser.getNextJobs(workflowGraph, {
                    trigger: triggerJobs[0],
                    chainPR: this.chainPR
                });

                triggerJobs.splice(0, 1);
                triggerJobs = triggerJobs.concat(chainedJobs);
                nextJobNames = nextJobNames.concat(chainedJobs);
            }
        }

        // PR jobs which requires ~pr or ~pr:branch are both same job name (like PR-1:test),
        // so it needs to remove a duplicated PR job.
        nextJobNames = _.uniq(nextJobNames);

        // Get all the missing PR- job names
        const existingPRJobNames = prJobs.map(prJob => prJob.name);
        const missingPRJobNames = nextJobNames.filter(nextJob => !existingPRJobNames.includes(nextJob));

        // Get the job name part, e.g. main from PR-1:main to create job
        const jobsToCreate = missingPRJobNames.map(name => name.split(':')[1]);
        const jobsToArchive = prJobs.filter(prJob => !nextJobNames.includes(prJob.name));
        const jobsToUnarchive = prJobs.filter(prJob => nextJobNames.includes(prJob.name));

        // Lazy load factory dependency to prevent circular dependency issues
        // https://nodejs.org/api/modules.html#modules_cycles
        /* eslint-disable global-require */
        const JobFactory = require('./jobFactory');
        /* eslint-enable global-require */
        const jobFactory = JobFactory.getInstance();

        // filter to keep only the pipeline jobs that include in the jobsToCreate list
        const prFromPipelineJobs = jobs.filter(
            j => !j.name.startsWith(`PR-${prNum}:`) && jobsToCreate.includes(j.name)
        );

        // create a map for PR Parent Jobs like: {main: 1, publish: 2}
        const prParentJobIdMap = {};

        prFromPipelineJobs.forEach(j => {
            prParentJobIdMap[j.name] = j.id;
        });

        // Create missing PR jobs
        for (const jobNames of getJobChunks(jobsToCreate)) {
            await Promise.all(
                jobNames.map(jobName => {
                    const jobModel = {
                        permutations: parsedConfig.jobs[jobName],
                        pipelineId: this.id,
                        name: `PR-${prNum}:${jobName}`
                    };

                    // If there is a pr parent
                    if (prParentJobIdMap[jobName]) {
                        jobModel.prParentJobId = prParentJobIdMap[jobName];
                    }

                    // Create jobs
                    return jobFactory.create(jobModel);
                })
            );
        }

        await this._updateJobArchive(jobsToArchive, true);
        await this._updateJobArchive(jobsToUnarchive, false, parsedConfig);

        delete this.pullRequestJobs; // so that next time it will not get the cached version of this.pullRequestJobs

        return this;
    }

    /**
     * Checks if any admin from this.admins has SCM permission to given scmUri
     * @method _hasAdminPermission
     * @param  {String}    scmUri           Scm uri (e.g., gitlab.com:8654386:test)
     * @return {Promise}
     */
    async _hasAdminPermission(scmUri) {
        /* eslint-disable no-restricted-syntax */
        for (const username of Object.keys(this.admins)) {
            // eslint-disable-next-line global-require
            const UserFactory = require('./userFactory');
            const factory = UserFactory.getInstance();

            // eslint-disable-next-line no-await-in-loop
            const user = await factory.get({
                username,
                scmContext: this.scmContext
            });

            // eslint-disable-next-line no-await-in-loop
            const permission = await user.getPermissions(scmUri);

            if (permission.admin) {
                return true;
            }
        }
        /* eslint-enable no-restricted-syntax */

        return false;
    }

    /**
     * Get a pipeline given a scmUrl
     * @method _getScmUri
     * @param {Object} config
     * @param {String} config.scmUrl        Checkout url for a repository
     * @param {String} [config.scmContext]  Scm context
     * @return {Promise}
     */
    async _getScmUri({ scmUrl, scmContext }) {
        const pipelineFactory = this._getPipelineFactory();
        const token = await this.token;
        const scmUri = await pipelineFactory.scm.parseUrl({
            scmContext: scmContext || this.scmContext,
            checkoutUrl: scmUrl,
            token
        });

        return scmUri;
    }

    /**
     * Update or create a pipeline given a scmUrl
     * @method _createOrUpdatePipeline
     * @param {String} scmUrl  checkout url for a repository
     * @param {String} newState  new state for the pipeline associated with the specified scmUrl
     * @return {Promise}
     */
    async _createOrUpdatePipeline(scmUrl, newState) {
        const { admins } = this;
        const newAdmins = admins;
        const shouldCreateOrSyncPipeline = newState !== 'INACTIVE';
        let scmToken;

        // Get hostname using scmUrl
        const regex = Schema.config.regex.CHECKOUT_URL;
        const matched = regex.exec(scmUrl);
        const hostname = matched[MATCH_COMPONENT_HOSTNAME];

        // Set scmContext
        const scmContext = this.scm.getScmContext({ hostname });
        const scmUri = await this._getScmUri({ scmUrl, scmContext });
        let hasAdminPermission = false;

        if (this.scmContext !== scmContext) {
            // If read-only scm, add as admin to admin config
            const readOnlyInfo = this.scm.getReadOnlyInfo({ scmContext });

            if (!readOnlyInfo.enabled) {
                logger.error(`pipelineId:${this.id}: No admins have admin permissions on ${scmUrl}.`);

                return null;
            }

            scmToken = readOnlyInfo.accessToken;
            hasAdminPermission = true;
        } else {
            // Check permissions
            hasAdminPermission = await this._hasAdminPermission(scmUri);
        }

        if (!hasAdminPermission) {
            // TODO: figure out how to bubble up this err to user
            logger.error(`pipelineId:${this.id}: No admins have admin permissions on ${scmUrl}.`);

            return null;
        }

        const pipelineFactory = this._getPipelineFactory();
        const pipeline = await pipelineFactory.get({ scmUri });

        if (pipeline) {
            // Child pipeline belongs to this parent, update it
            if (pipeline.configPipelineId === this.id) {
                pipeline.admins = newAdmins;
                pipeline.state = newState;
                logger.info(`pipelineId:${this.id}: Updating child pipeline ${scmUrl} with pipelineId:${pipeline.id}.`);

                return shouldCreateOrSyncPipeline ? pipeline.sync() : pipeline.update();
            }
            // Child pipeline does not belong to this parent, return
            logger.error(`pipelineId:${this.id}: Pipeline ${scmUrl} already exists: ${pipeline.id}.`);

            return null;
        }

        if (shouldCreateOrSyncPipeline) {
            const pipelineConfig = {
                admins: newAdmins,
                scmContext,
                scmUri,
                configPipelineId: this.id
            };

            if (scmToken) {
                pipelineConfig.scmToken = scmToken;
            }

            return pipelineFactory.create(pipelineConfig).then(async p => {
                logger.info(`pipelineId:${this.id}: Creating child pipeline for ${scmUrl} with pipelineId:${p.id}.`);
                // sync pipeline to create jobs
                await p.sync();
                if (SD_API_URI) {
                    await p.addWebhook(`${SD_API_URI}/v4/webhooks`);
                }
            });
        }

        return null;
    }

    /**
     * Sync child pipelines given scmUrls
     * @method syncChildPipelines
     * @param {Array} scmUrls  An array of scmUrls for child pipelines
     * @return {Promise}
     */
    async _syncChildPipelines(scmUrls) {
        const toCreateOrUpdate = [];
        const toDeactivate = [];
        const oldScmUrls = hoek.reach(this.childPipelines, 'scmUrls') || [];
        const newScmUrls = scmUrls || [];
        // scmUrls in the old list but not the new list should be removed
        const scmUrlsToDeactivate = oldScmUrls.filter(scmUrl => !newScmUrls.includes(scmUrl));

        // create or update active child pipelines
        newScmUrls.forEach(scmUrl => toCreateOrUpdate.push(this._createOrUpdatePipeline(scmUrl, 'ACTIVE')));

        // deactivate obsolete child pipelines
        scmUrlsToDeactivate.forEach(scmUrl => toDeactivate.push(this._createOrUpdatePipeline(scmUrl, 'INACTIVE')));

        return Promise.allSettled([...toCreateOrUpdate, ...toDeactivate]);
    }

    /**
     * Sync the pipeline by looking up screwdriver.yaml
     * Create, update, or disable jobs if necessary.
     * Store/update the pipeline workflowGraph
     * @method sync
     * @param {String}  [ref]     A reference to fetch the screwdriver.yaml, can be branch/tag/commit
     * @param {Boolean} [chainPR] Chain PR flag
     * @return {Promise}
     */
    async sync(ref, chainPR = false) {
        // Lazy load factory dependency to prevent circular dependency issues
        // https://nodejs.org/api/modules.html#modules_cycles
        /* eslint-disable global-require */
        const JobFactory = require('./jobFactory');
        /* eslint-enable global-require */
        const factory = JobFactory.getInstance();

        // get the pipeline configuration
        const parsedConfig = await this.getConfiguration({ ref });

        const buildClusterAnnotation = 'screwdriver.cd/buildCluster';
        const parsedConfigAnnotations = hoek.reach(parsedConfig, 'annotations', { default: {} });
        const buildCluster = parsedConfigAnnotations[buildClusterAnnotation] || '';

        if (!buildCluster) {
            const dbClusterAnnotations = hoek.reach(this, 'annotations', { default: {} });

            if (dbClusterAnnotations) {
                parsedConfig.annotations[buildClusterAnnotation] = dbClusterAnnotations[buildClusterAnnotation];
            }
        }

        // If it is an external config pipeline, sync all children
        if ((this.childPipelines || parsedConfig.childPipelines) && !this.configPipelineId && !parsedConfig.errors) {
            await this._syncChildPipelines(hoek.reach(parsedConfig, 'childPipelines.scmUrls'));
            this.childPipelines = parsedConfig.childPipelines || null;
        }

        const annotChainPR = parsedConfig.annotations['screwdriver.cd/chainPR'];

        this.chainPR = typeof annotChainPR === 'undefined' ? chainPR : annotChainPR;
        this.workflowGraph = parsedConfig.workflowGraph;
        this.annotations = parsedConfig.annotations;
        this.parameters = parsedConfig.parameters;

        const urlWithActionsList = [];

        if (parsedConfig.subscribe && Object.keys(parsedConfig.subscribe).length !== 0) {
            for (let i = 0; i < parsedConfig.subscribe.scmUrls.length; i += 1) {
                const urlObj = parsedConfig.subscribe.scmUrls[i];
                const scmUrl = Object.keys(urlObj)[0];

                urlWithActionsList.push({
                    actions: urlObj[scmUrl].map(action => (action[0] === '~' ? action.substring(1) : action)),
                    scmUri: await this._getScmUri({ scmUrl })
                });
            }
        }
        this.subscribedScmUrlsWithActions = urlWithActionsList;

        const existingJobs = await this.pipelineJobs;
        const jobsProcessed = [];
        const updatedJobs = [];
        const parsedConfigJobNames = Object.keys(parsedConfig.jobs);
        const pipelineId = this.id;

        // Loop through non-PR existing jobs
        for (const jobChunks of getJobChunks(existingJobs)) {
            await Promise.all(
                jobChunks.map(async job => {
                    const jobName = job.name;
                    let requiresList = [];

                    // if it's in the yaml, update it
                    if (parsedConfigJobNames.includes(jobName)) {
                        const templateId = parsedConfig.jobs[jobName][0].templateId || null;

                        delete parsedConfig.jobs[jobName][0].templateId;

                        const permutations = parsedConfig.jobs[jobName];

                        requiresList = permutations[0].requires || [];
                        job.permutations = permutations;
                        job.templateId = templateId;
                        job.archived = false;
                        updatedJobs.push(await job.update());
                    } else if (!job.archived) {
                        job.archived = true;
                        updatedJobs.push(await job.update());
                    }

                    // sync external triggers for existing jobs
                    await syncExternalTriggers({
                        pipelineId,
                        jobName,
                        requiresList
                    });

                    // if it's a PR, leave it alone
                    jobsProcessed.push(job.name);
                })
            );
        }

        // Loop through all defined jobs in the yaml
        for (const jobChunks of getJobChunks(parsedConfigJobNames)) {
            await Promise.all(
                jobChunks.map(async jobName => {
                    const permutations = parsedConfig.jobs[jobName];
                    const jobConfig = {
                        pipelineId,
                        name: jobName,
                        permutations
                    };
                    const requiresList = permutations[0].requires || [];

                    // If the job has not been processed, create it (new jobs)
                    if (!jobsProcessed.includes(jobName)) {
                        updatedJobs.push(await factory.create(jobConfig));

                        await syncExternalTriggers({
                            pipelineId,
                            jobName,
                            requiresList
                        });
                    }
                })
            );
        }

        const { nodes } = this.workflowGraph;

        // Add jobId to workflowGraph.nodes
        await Promise.all(
            nodes.map(async node => {
                // Handle external nodes
                if (/sd@/.test(node.name)) {
                    const pipelineFactory = this._getPipelineFactory();
                    const [, externalPipelineId, externalJobName] = EXTERNAL_TRIGGER_ALL.exec(node.name);

                    try {
                        const externalPipeline = await pipelineFactory.get(externalPipelineId);
                        const externalWorkflow = externalPipeline.workflowGraph;

                        if (externalWorkflow && Array.isArray(externalWorkflow.nodes)) {
                            const externalJob = externalWorkflow.nodes.find(n => n.name === externalJobName);

                            if (externalJob) {
                                node.id = externalJob.id;
                            } else {
                                logger.error(
                                    `pipelineId:${externalPipelineId}: workflow has no job:${externalJobName}.`
                                );
                            }
                        } else {
                            logger.error(`pipelineId:${externalPipelineId}: has no workflow.`);
                        }
                    } catch (err) {
                        logger.error(`pipelineId:${externalPipelineId}: does not exist.`, err);
                    }

                    return node;
                }

                const job = updatedJobs.find(j => j.name === node.name);

                // Handle internal nodes
                if (job) {
                    node.id = job.id;
                }

                return node;
            })
        );

        // jobs updated or new jobs created during sync
        // delete it here so next time this.pipelineJobs is called a DB query will be forced and new jobs will return
        delete this.pipelineJobs;

        await this.update();

        return this;
    }

    /**
     * Fetch the build admin
     * @property admin
     * @return {Promise}
     */
    get admin() {
        delete this.admin;

        const admin = this.getFirstAdmin();

        // ES6 has weird getters and setters in classes,
        // so we redefine the pipeline property here to resolve to the
        // resulting promise and not try to recreate the factory, etc.
        Object.defineProperty(this, 'admin', {
            enumerable: true,
            value: admin
        });

        return admin;
    }

    /** Fetch a pipeline's tokens
     * @property tokens
     * @return {Promise}
     */
    get tokens() {
        const listConfig = {
            params: {
                pipelineId: this.id
            }
        };

        // Lazy load factory dependency to prevent circular dependency issues
        // https://nodejs.org/api/modules.html#modules_cycles
        /* eslint-disable global-require */
        const TokenFactory = require('./tokenFactory');
        /* eslint-enable global-require */
        const factory = TokenFactory.getInstance();
        const tokens = factory.list(listConfig);

        // ES6 has weird getters and setters in classes,
        // so we redefine the pipeline property here to resolve to the
        // resulting promise and not try to recreate the factory, etc.
        Object.defineProperty(this, 'tokens', {
            enumerable: true,
            value: tokens
        });

        return tokens;
    }

    /**
     * This function deletes pipeline admins who does not have proper
     * SCM permission, and returns a proper admin (user with push permission).
     * @method getFirstAdmin
     * @return {Promise}
     */
    async getFirstAdmin() {
        let oldAdmins = this.admins;
        let newAdmins = this.admins;
        let { id, scmContext, scmUri } = this;
        const { enabled } = this.scm.getReadOnlyInfo({ scmContext });

        // Use parent pipeline info if child pipeline is in read-only SCM
        if (this.configPipelineId && enabled) {
            // Lazy load factory dependency to prevent circular dependency issues
            // https://nodejs.org/api/modules.html#modules_cycles
            /* eslint-disable global-require */
            const pipelineFactory = this._getPipelineFactory();
            /* eslint-enable global-require */
            const parentPipeline = await pipelineFactory.get(this.configPipelineId);

            oldAdmins = parentPipeline.admins;
            newAdmins = parentPipeline.admins;
            scmContext = parentPipeline.scmContext;
            id = parentPipeline.id;
            scmUri = parentPipeline.scmUri;
        }

        /* eslint-disable global-require */
        const UserFactory = require('./userFactory');
        /* eslint-enable global-require */
        const factory = UserFactory.getInstance();

        /* eslint-disable no-restricted-syntax */
        for (const username of Object.keys(oldAdmins)) {
            // Lazy load factory dependency to prevent circular dependency issues
            // https://nodejs.org/api/modules.html#modules_cycles
            // eslint-disable-next-line no-await-in-loop
            const user = await factory.get({
                username,
                scmContext
            });
            let permission = {};

            try {
                // eslint-disable-next-line no-await-in-loop
                permission = await user.getPermissions(scmUri);
            } catch (err) {
                if (SCM_NO_ACCESS_STATUSES.includes(err.status)) {
                    permission.push = false;
                } else {
                    throw err;
                }
            }

            if (!permission.push) {
                delete newAdmins[username];
                logger.info(`pipelineId:${id}: ${username} has been removed from admins.`);
            } else {
                break;
            }
        }
        /* eslint-enable no-restricted-syntax */

        if (Object.keys(newAdmins).length === 0) {
            logger.error(`pipelineId:${id}: Pipeline has no admin.`);
            throw boom.forbidden('Pipeline has no admin');
        }

        if (!(this.configPipelineId && enabled)) {
            // This is needed to make admins dirty and update db
            this.admins = newAdmins;
        }

        const result = await factory.get({
            username: Object.keys(newAdmins)[0],
            scmContext
        });

        return result;
    }

    /**
     * This function gets a repository admin.
     * @method getFirstRepoAdmin
     * @return {Promise}
     */
    async getFirstRepoAdmin() {
        /* eslint-disable global-require */
        const UserFactory = require('./userFactory');
        /* eslint-enable global-require */
        const factory = UserFactory.getInstance();

        /* eslint-disable no-restricted-syntax */
        for (const username of Object.keys(this.admins)) {
            // Lazy load factory dependency to prevent circular dependency issues
            // https://nodejs.org/api/modules.html#modules_cycles
            // eslint-disable-next-line no-await-in-loop
            const user = await factory.get({
                username,
                scmContext: this.scmContext
            });
            let permission = {};

            try {
                // eslint-disable-next-line no-await-in-loop
                permission = await user.getPermissions(this.scmUri, this.scmContext);
            } catch (err) {
                if (SCM_NO_ACCESS_STATUSES.includes(err.status)) {
                    permission.push = false;
                } else {
                    throw err;
                }
            }

            if ('admin' in permission && permission.admin) {
                return user;
            }
        }
        /* eslint-enable no-restricted-syntax */

        // There is no repository admins
        logger.error(`pipelineId:${this.id}: Pipeline has no repository admin.`);
        throw new Error('Pipeline has no repository admins');
    }

    /**
     * Get the token of the pipeline admin
     * @property token
     * @return {Promise} Resolves the admin's token
     */
    get token() {
        const { enabled, accessToken } = this.scm.getReadOnlyInfo({ scmContext: this.scmContext });

        // Use read-only access token if child pipeline is in read-only SCM
        if (this.configPipelineId && enabled && accessToken) {
            return Promise.resolve(accessToken);
        }

        return this.admin.then(admin => admin.unsealToken());
    }

    /**
     * Get the branch of the pipeline
     * @property branch
     * @return {Promise}
     */
    get branch() {
        return Promise.resolve(
            parseScmUri({
                scmUri: this.scmUri,
                field: 'branch'
            })
        );
    }

    /**
     * Get the rootDir of the pipeline
     * @property rootDir
     * @return {Promise}
     */
    get rootDir() {
        return Promise.resolve(
            parseScmUri({
                scmUri: this.scmUri,
                field: 'rootDir'
            })
        );
    }

    /**
     * Fetch all open pull requests associated with pipeline scmUri
     * @property jobs
     * @return {Promise}
     */
    get openPullRequests() {
        const openPullRequests = this.token.then(token => {
            return this.scm.getOpenedPRs({
                scmUri: this.scmUri,
                scmContext: this.scmContext,
                token
            });
        });

        Object.defineProperty(this, 'openPullRequests', {
            configurable: true,
            enumerable: true,
            value: openPullRequests
        });

        return openPullRequests;
    }

    /**
     * Fetch all non pull request jobs that belong to this pipeline
     * @property jobs
     * @return {Promise}
     */
    get pipelineJobs() {
        const listConfig = {
            params: {
                pipelineId: this.id,
                prParentJobId: null
            }
        };

        // Lazy load factory dependency to prevent circular dependency issues
        // https://nodejs.org/api/modules.html#modules_cycles
        /* eslint-disable global-require */
        const JobFactory = require('./jobFactory');
        /* eslint-enable global-require */
        const factory = JobFactory.getInstance();

        const jobs = factory.list(listConfig).then(value => {
            return value.filter(j => !j.isPR());
        });

        // ES6 has weird getters and setters in classes,
        // so we redefine the pipeline property here to resolve to the
        // resulting promise and not try to recreate the factory, etc.
        Object.defineProperty(this, 'pipelineJobs', {
            configurable: true,
            enumerable: true,
            value: jobs
        });

        return jobs;
    }

    /**
     * Fetch all the pull request jobs that needs to be updated during pipeline sync that are associated with the
     * specified pipeline.
     * This includes:
     *      - only unarchived jobs for closed pull requests
     *      - both archived and unarchived jobs for open pull requests
     * @property jobs
     * @return {Promise}
     */
    get pullRequestJobs() {
        return this.openPullRequests.then(openPRs => {
            const openPrNames = openPRs.map(openedPR => {
                return openedPR.name;
            });
            const listConfig = {
                pipelineId: this.id,
                prNames: openPrNames
            };

            // Lazy load factory dependency to prevent circular dependency issues
            // https://nodejs.org/api/modules.html#modules_cycles
            /* eslint-disable global-require */
            const JobFactory = require('./jobFactory');
            /* eslint-enable global-require */
            const factory = JobFactory.getInstance();

            return factory.getPullRequestJobsForPipelineSync(listConfig);
        });
    }

    /**
     * Fetch all secrets that belong to this pipeline
     * @property secrets
     * @return Promise
     */
    get secrets() {
        const listConfig = {
            params: {
                pipelineId: this.id
            }
        };

        // Lazy load factory dependency to prevent circular dependency issues
        // https://nodejs.org/api/modules.html#modules_cycles
        /* eslint-disable global-require */
        const SecretFactory = require('./secretFactory');
        /* eslint-enable global-require */
        const factory = SecretFactory.getInstance();

        let secrets = factory.list(listConfig);

        // Fetch and merge config pipeline's secrets
        if (this.configPipelineId) {
            const configPipelineListConfig = hoek.clone(listConfig);

            configPipelineListConfig.params.pipelineId = this.configPipelineId;

            return Promise.all([secrets, factory.list(configPipelineListConfig)]).then(results => {
                // Merge config pipeline's secrets into this pipeline's
                secrets = _.uniqBy([...results[0], ...results[1]], 'name');

                // ES6 has weird getters and setters in classes,
                // so we redefine the pipeline property here to resolve to the
                // resulting promise and not try to recreate the factory, etc.
                Object.defineProperty(this, 'secrets', {
                    enumerable: true,
                    value: secrets
                });

                return secrets;
            });
        }

        Object.defineProperty(this, 'secrets', {
            enumerable: true,
            value: secrets
        });

        return secrets;
    }

    /**
     * Fetch the config pipeline if it exists
     * @property configPipeline
     * @return   {Promise}
     */
    get configPipeline() {
        const pipelineFactory = this._getPipelineFactory();

        return pipelineFactory.get(this.configPipelineId);
    }

    /**
     * Fetch jobs belong to a pipeline.
     * @param  {Object}   [config]                  Configuration object
     * @param  {Object}   [config.params]           Filter params
     * @param  {Boolean}  [config.params.archived]  Get archived/non-archived jobs
     * @param  {String}   [config.params.name]      Get job with this name
     * @param  {String}   [config.type]             Type of jobs (pr or pipeline)
     * @param  {Object}   [config.paginate]         Pagination parameters
     * @param  {Number}   [config.paginate.count]   Number of items per page
     * @param  {Number}   [config.paginate.page]    Specific page of the set to return
     * @return {Promise}  Resolves to an array of jobs
     */
    getJobs(config) {
        const defaultConfig = {
            params: {
                pipelineId: this.id,
                archived: false
            }
        };
        const listConfig = config ? hoek.applyToDefaults(defaultConfig, config) : defaultConfig;

        if (listConfig.type) {
            delete listConfig.type;
        }

        // Lazy load factory dependency to prevent circular dependency issues
        // https://nodejs.org/api/modules.html#modules_cycles
        /* eslint-disable global-require */
        const JobFactory = require('./jobFactory');
        /* eslint-enable global-require */
        const jobFactory = JobFactory.getInstance();

        return jobFactory.list(listConfig).then(async jobs => {
            // get PR jobs
            let prJobs = jobs
                .filter(j => j.isPR() && j.archived === listConfig.params.archived)
                .sort((job1, job2) => job1.prNum - job2.prNum);

            const pipelineJobs = jobs.filter(j => !j.isPR() && j.archived === listConfig.params.archived);

            if (config && config.type === 'pipeline') {
                return pipelineJobs;
            }

            if (prJobs.length) {
                try {
                    const openPrs = await this.scm.getOpenedPRs({
                        scmUri: this.scmUri,
                        scmContext: this.scmContext,
                        token: await this.token
                    });
                    const openedPRsMap = openPrs.reduce((map, pr) => {
                        map[pr.name] = pr;

                        return map;
                    }, {});

                    prJobs = prJobs.map(pr => {
                        const found = openedPRsMap[`PR-${pr.prNum}`];

                        if (found) {
                            pr.url = found.url;
                            pr.title = found.title;
                            pr.username = found.username;
                            pr.userProfile = found.userProfile;
                            pr.createTime = found.createTime;
                        }

                        return pr;
                    });
                } catch (e) {
                    logger.error('Failed to fetch opened PRs', e);
                }
            }

            if (config && config.type === 'pr') {
                return prJobs;
            }

            return pipelineJobs.concat(prJobs);
        });
    }

    /**
     * Fetch events belong to a pipeline.
     * @param  {Object}   [config]
     * @param  {Number}   [config.sort]                         Sort rangekey by ascending or descending
     * @param  {Number}   [config.params.type = 'pipeline']     Get pipeline or pr events
     * @param  {Object}   [config.paginate]                     Pagination parameters
     * @param  {Number}   [config.paginate.count]               Number of items per page
     * @param  {Number}   [config.paginate.page]                Specific page of the set to return
     * @param  {String}   [config.startTime]                    Search for events after this startTime
     * @param  {String}   [config.endTime]                      Search for events before this endTime
     * @param  {Boolean}  [config.readOnly]                     Use readOnly datastore
     * @return {Promise}  Resolves to an array of events
     */
    getEvents(config) {
        const defaultConfig = {
            params: {
                pipelineId: this.id,
                type: 'pipeline'
            },
            sort: 'descending'
        };

        const listConfig = config ? hoek.applyToDefaults(defaultConfig, config) : defaultConfig;

        // Lazy load factory dependency to prevent circular dependency issues
        // https://nodejs.org/api/modules.html#modules_cycles
        /* eslint-disable global-require */
        const EventFactory = require('./eventFactory');
        /* eslint-enable global-require */
        const factory = EventFactory.getInstance();

        return factory.list(listConfig);
    }

    /**
     * Update the repository and branch
     * @method update
     * @return {Promise}
     */
    async update() {
        const token = await this.token;

        return this.scm
            .decorateUrl({
                scmUri: this.scmUri,
                scmContext: this.scmContext,
                token
            })
            .then(async scmRepo => {
                this.scmRepo = scmRepo;
                this.name = scmRepo.name;

                let buildClusterName;
                const annotations = hoek.reach(this, 'annotations', { default: {} });
                const buildClusterAnnotation = 'screwdriver.cd/buildCluster';

                if (String(this.multiBuildClusterEnabled) === 'true') {
                    buildClusterName = await getBuildClusterName({
                        annotations,
                        pipeline: this,
                        isPipelineUpdate: true
                    });

                    if (buildClusterName) {
                        if (!this.annotations) {
                            this.annotations = {};
                        }
                        this.annotations[buildClusterAnnotation] = buildClusterName;
                    }
                }

                return super.update();
            });
    }

    /**
     * Remove all jobs & builds associated with this pipeline,
     * remove id from all associated collection and the pipeline itself
     * @return {Promise}        Resolves to null if remove successfully
     */
    remove() {
        const pipelineFactory = this._getPipelineFactory();

        const removeJobs = archived =>
            this.getJobs({
                params: {
                    archived
                },
                paginate: {
                    count: MAX_JOB_DELETE_COUNT
                }
            }).then(jobs => {
                if (jobs.length === 0) {
                    return null;
                }

                logger.info(`pipelineId:${this.id}: Removing jobs.`);

                return Promise.all(jobs.map(job => job.remove())).then(() => removeJobs(archived));
            });

        const removeEvents = type =>
            this.getEvents({
                params: {
                    type
                },
                paginate: {
                    count: MAX_EVENT_DELETE_COUNT
                }
            }).then(events => {
                if (events.length === 0) {
                    return null;
                }

                logger.info(`pipelineId:${this.id}: Removing ${type} events.`);

                return Promise.all(events.map(event => event.remove())).then(() => removeEvents(type));
            });

        const removeChildPipelines = () =>
            pipelineFactory
                .list({
                    params: {
                        configPipelineId: this.id
                    }
                })
                .then(pipelines => {
                    logger.info(`pipelineId:${this.id}: Removing child pipelines.`);

                    return Promise.all(pipelines.map(p => p.remove()));
                });

        const removeTokens = () =>
            this.tokens.then(tokens => {
                logger.info(`pipelineId:${this.id}: Removing tokens.`);

                return Promise.all(tokens.map(t => t.remove()));
            });

        const removeTriggers = () => {
            // Lazy load factory dependency to prevent circular dependency issues
            // https://nodejs.org/api/modules.html#modules_cycles
            /* eslint-disable global-require */
            const TriggerFactory = require('./triggerFactory');
            /* eslint-enable global-require */

            const triggerFactory = TriggerFactory.getInstance();

            // list records that would trigger this job
            return this.getJobs({ type: 'pipeline' }).then(jobs => {
                const srcArray = jobs.map(j => `~sd@${this.id}:${j.name}`);

                // Get dest triggers for each src job
                return triggerFactory
                    .list({
                        params: {
                            dest: srcArray
                        }
                    })
                    .then(triggersArr => {
                        logger.info(`pipelineId:${this.id}: Removing triggers.`);

                        return Promise.all(triggersArr.map(t => t.remove()));
                    });
            });
        };

        const removeFromCollections = () => {
            // Lazy load factory dependency to prevent circular dependency issues
            // https://nodejs.org/api/modules.html#modules_cycles
            /* eslint-disable global-require */
            const CollectionFactory = require('./collectionFactory');
            /* eslint-enable global-require */

            const collectionFactory = CollectionFactory.getInstance();
            const search = {
                field: 'pipelineIds',
                keyword: `%${this.id}%`
            };

            return collectionFactory.list({ search }).then(collections => {
                const filteredCollections = collections.filter(collection => collection.pipelineIds.includes(this.id));

                logger.info(`pipelineId:${this.id}: Removing pipeline from collections.`);

                return Promise.all(
                    filteredCollections.map(collection => {
                        const newPipelineIds = collection.pipelineIds.filter(pipelineId => pipelineId !== this.id);

                        // Using a new array to mark pipelineIds dirty, otherwsie db won't update
                        collection.pipelineIds = newPipelineIds;

                        return collection.update();
                    })
                );
            });
        };

        return this.secrets
            .then(secrets => {
                // remove secrets
                const filteredSecrets = secrets.filter(secret => secret.pipelineId === this.id);

                logger.info(`pipelineId:${this.id}: Removing secrets.`);

                return Promise.all(filteredSecrets.map(secret => secret.remove()));
            })
            .then(() => removeTokens()) // remove tokens
            .then(() => removeTriggers()) // remove triggers
            .then(() => removeJobs(true)) // remove archived jobs
            .then(() => removeJobs(false)) // remove non-archived jobs
            .then(() => removeEvents('pipeline')) // remove pipeline events
            .then(() => removeEvents('pr')) // remove pr events
            .then(() => removeChildPipelines()) // remove pr events
            .then(() => removeFromCollections())
            .then(() => super.remove()) // remove pipeline
            .catch(err => {
                logger.error(`pipelineId:${this.id}: Failed to remove pipeline. :${err}`);

                throw err;
            });
    }

    /**
     * getMetrics for this pipeline
     * @method getMetrics
     * @param  {Object}   [config]                      Configuration object
     * @param  {String}   [config.startTime]            Look at events created after this startTime
     * @param  {String}   [config.endTime]              Look at events created before this endTime
     * @param  {String}   [config.aggregateInterval]    Whether to aggregateInterval the data. For example, day/week/month/year
     * @param  {Array}    [config.downtimeJobs]         Array of jobs to track towards downtime metrics; default all jobs
     * @param  {Array}    [config.downtimeStatuses]     Array of build statuses to track for downtime metrics; default ['FAILURE']
     * @return {Promise}  Resolves to array of metrics for events belong to this pipeline
     */
    async getMetrics(
        config = {
            startTime: null,
            endTime: null,
            page: null,
            count: null
        }
    ) {
        const options = {
            startTime: config.startTime,
            endTime: config.endTime,
            sort: config.sort || 'ascending',
            sortBy: 'id',
            paginate: {
                page: DEFAULT_PAGE,
                count: MAX_METRIC_GET_COUNT
            },
            readOnly: true
        };

        if (!config.aggregateInterval || config.aggregateInterval === 'none') {
            // If fetching events by page and count, update them according to config
            if (config.page || config.count) {
                options.paginate = {
                    page: config.page,
                    count: config.count
                };
            }

            const events = await this.getEvents(options);
            const metrics = await Promise.all(
                events.map(async e => {
                    const { id, createTime, causeMessage, sha, commit } = e;
                    const m = await eventMetrics({
                        event: e,
                        downtimeJobs: config.downtimeJobs || DEFAULT_DOWNTIME_JOBS,
                        downtimeStatuses: config.downtimeStatuses || DEFAULT_DOWNTIME_STATUSES
                    });

                    if (!m) {
                        return null;
                    }

                    return { id, createTime, causeMessage, sha, commit, ...m };
                })
            );

            // Get downtime events
            const downtimeEvents = metrics.filter(m => m && m.isDowntimeEvent);

            if (downtimeEvents.length) {
                let i = 0;

                // Add downtime duration info
                for (; i < downtimeEvents.length - 1; i += 1) {
                    downtimeEvents[i].downtimeDuration = dayjs(downtimeEvents[i + 1].maxEndTime).diff(
                        dayjs(downtimeEvents[i].maxEndTime),
                        'second'
                    );
                }

                downtimeEvents[i].downtimeDuration = dayjs(new Date()).diff(
                    dayjs(downtimeEvents[i].maxEndTime),
                    'second'
                );
            }

            // filter for empty event
            return metrics.filter(m => m);
        }

        const allEvents = await getAllRecords.call(this, 'getEvents', config.aggregateInterval, options, [[]]);

        return Promise.all(
            allEvents.map(async sameIntervalEvents => {
                const { length } = sameIntervalEvents;
                const {
                    totalQueuedTime,
                    totalImagePullTime,
                    totalDuration,
                    emptyCount
                } = await sumAggregatedEventMetrics(sameIntervalEvents);
                const duration =
                    length > emptyCount.duration ? +(totalDuration / (length - emptyCount.duration)).toFixed(2) : null;
                const queuedTime =
                    length > emptyCount.queuedTime
                        ? +(totalQueuedTime / (length - emptyCount.queuedTime)).toFixed(2)
                        : null;
                const imagePullTime =
                    length > emptyCount.imagePullTime
                        ? +(totalImagePullTime / (length - emptyCount.imagePullTime)).toFixed(2)
                        : null;

                return {
                    createTime: sameIntervalEvents[0].createTime,
                    duration,
                    queuedTime,
                    imagePullTime
                };
            })
        );
    }

    /**
     * Fetch the value of prChain via chainPR property.
     * @property chainPR
     * @return {boolean}
     */
    get chainPR() {
        return this.prChain;
    }

    /**
     * Set the value of prChain via chainPR property.
     * @property chainPR
     */
    set chainPR(chainPR) {
        this.prChain = chainPR;
    }
}

module.exports = PipelineModel;
