'use strict';

const BaseFactory = require('./baseFactory');
const Event = require('./event');
const { EXTERNAL_TRIGGER } = require('screwdriver-data-schema').config.regex;
const workflowParser = require('screwdriver-workflow-parser');

let instance;

/**
 * Get triggered jobs to start that are enabled
 * @method getJobsFromTrigger
 * @param  {Object}   config
 * @param  {Array}    config.jobs                           Array of job objects
 * @param  {Object}   config.pipelineConfig
 * @param  {Object}   config.pipelineConfig.workflowGraph   Object with nodes and edges that represent the order of jobs
 * @param  {String}   config.startFrom                      Startfrom (e.g. ~commit, ~pr, ~sd@123:main, etc)
 * @return {Array}                                          Array of commit jobs to start
 */
function getJobsFromTrigger(config) {
    const { jobs, pipelineConfig, startFrom } = config;
    const isTrigger = EXTERNAL_TRIGGER.test(startFrom);

    if (startFrom !== '~commit' && !isTrigger) {
        return [];
    }

    const nextJobs = workflowParser.getNextJobs(pipelineConfig.workflowGraph, {
        trigger: startFrom
    });

    return jobs.filter(j => nextJobs.includes(j.name) && j.state === 'ENABLED' && !j.archived);
}

/**
 * Get jobs from job name to start that are enabled
 * @method getJobsToStart
 * @param  {Object}   config
 * @param  {Array}    config.jobs      Array of job objects
 * @param  {String}   config.startFrom Startfrom (e.g. ~commit, ~pr, etc)
 * @return {Array}                     Array of jobs to start
 */
function getJobsFromJobName(config) {
    const { jobs, startFrom } = config;

    if (startFrom === '~commit' || startFrom === '~pr') {
        return [];
    }

    return jobs.filter(j => j.name === startFrom && j.state === 'ENABLED' && !j.archived);
}

/**
 * Get PR jobs to start that are enabled
 * @method getJobsFromPR
 * @param  {Object}   config
 * @param  {Array}    config.jobs                           Array of job objects
 * @param  {Number}   config.prNum                          PR number
 * @param  {String}   config.startFrom                      Startfrom (e.g. ~commit, ~pr, etc)
 * @resolves {Array}                                        Array of PR jobs to start
 */
function getJobsFromPR(config) {
    const { jobs, prNum, startFrom } = config;

    if (startFrom !== '~pr') {
        return [];
    }

    const PRJobArray = jobs.filter(j => j.name.startsWith(`PR-${prNum}:`));
    const jobsToStart = PRJobArray.filter(j => j.state === 'ENABLED' && !j.archived);

    return jobsToStart;
}

/**
 * Starts the build if the changed file is part of the sourcePaths, or if there is no sourcePaths
 * @method startBuild
 * @param  {Object}   config                configuration object
 * @param  {Object}   config.buildConfig    Build Config to create the build with
 * @param  {Array}    config.changedFiles   List of files that were changed
 * @param  {Array}    config.sourcePaths    List of soure paths
 * @param  {Boolean}  [config.webhooks]     If the create came from a webhook (pr or push) or not
 * @return {Promise}
 */
function startBuild(config) {
    /* eslint-disable global-require */
    const BuildFactory = require('./buildFactory');
    const buildFactory = BuildFactory.getInstance();
    /* eslint-enable global-require */
    const { buildConfig, changedFiles, sourcePaths, webhooks } = config;
    let hasChangeInSourcePaths = true;

    buildConfig.environment = {};

    // Only check if sourcePaths exists
    if (webhooks && sourcePaths) {
        if (!changedFiles) {
            throw new Error('Your SCM does not support Source Paths');
        }
        hasChangeInSourcePaths = changedFiles.some(file =>
            sourcePaths.some((source) => {
                let isMatch = false;

                if (source.slice(-1) !== '/') {
                    // source path is a file
                    isMatch = file === source;
                } else {
                    // source path is directory
                    isMatch = file.startsWith(source);
                }

                if (isMatch) {
                    buildConfig.environment.SD_SOURCE_PATH = source;
                }

                return isMatch;
            }));
    }

    return hasChangeInSourcePaths ? buildFactory.create(buildConfig) : null;
}

/**
 * Create builds associated with this event
 * For example, if startFrom ~commit, then create builds with jobs that have requires: ~commit
 * @method createBuilds
 * @param  {Object}   config
 * @param  {Object}   config.eventConfig
 * @param  {String}   config.eventConfig.sha                 SHA this project was built on
 * @param  {String}   config.eventConfig.username            Username of the user that creates this event
 * @param  {String}   config.eventConfig.scmContext          The scm context to which user belongs
 * @param  {String}   [config.eventConfig.prRef]             Ref if it's a PR event
 * @param  {Number}   [config.eventConfig.prNum]             PR number if it's a PR event
 * @param  {String}   [config.eventConfig.startFrom]         Where the event starts from (jobname or ~commit, ~pr, etc)
 *                                                           (Optional for backwards compatibility)
 * @param  {String}   [config.eventConfig.causeMessage]      Message that describes why the event was created
 * @param  {String}   [config.parentBuildId]                 Id of the build that starts this event
 * @param  {Number}   config.eventId                         Event id
 * @param  {Pipeline} config.pipeline                        Pipeline to create builds
 * @param  {Object}   config.pipelineConfig
 * @param  {Object}   [config.pipelineConfig.workflowGraph]  Object with nodes and edges that represent the order of jobs
 * @param  {Array}    [config.changedFiles]                  Array of files that were changed
 * @param  {Boolean}  [config.webhooks]                      If the create came from a webhook (pr or push) or not
 */
function createBuilds(config) {
    const { eventConfig, eventId, pipeline, pipelineConfig, changedFiles, webhooks } = config;
    const startFrom = eventConfig.startFrom;

    if (!startFrom) {
        return null;
    }

    return pipeline.jobs.then((jobs) => {
        // When startFrom is ~commit
        const jobsFromTrigger = getJobsFromTrigger({
            jobs,
            pipelineConfig,
            startFrom
        });
        // When startFrom is a job name
        const jobsFromJobName = getJobsFromJobName({
            jobs,
            startFrom
        });
        // When startFrom is ~pr
        const jobsFromPR = getJobsFromPR({
            jobs,
            prNum: eventConfig.prNum,
            startFrom
        });

        return Promise.all([jobsFromTrigger, jobsFromJobName, jobsFromPR])
            .then(result => result.reduce((a, b) => a.concat(b)));
    })
        .then((jobsToStart) => {
            // No jobs to start (eg: when jobs are disabled or startFrom is not valid)
            if (jobsToStart.length === 0) {
                throw new Error('No jobs to start');
            }

            // Start builds
            return Promise.all(jobsToStart.map(j =>
                startBuild({
                    buildConfig: Object.assign({ jobId: j.id, eventId }, eventConfig),
                    changedFiles,
                    sourcePaths: j.permutations[0].sourcePaths, // TODO: support matrix job
                    webhooks
                })
            )).then((buildsCreated) => {
                const nobuilds = buildsCreated.every(b => b === null);

                if (nobuilds) {
                    throw new Error('No jobs to start');
                }

                return buildsCreated;
            });
        });
}

/**
 * Get the latest workflowGraph
 * @method getLatestWorkflowGraph
 * @param  {Object}         config
 * @param  {Pipeline}       pipeline            Pipeline
 * @param  {Object}         eventConfig
 * @param  {String}         [eventConfig.prRef] PR ref
 * @resolves {Object}                           Resolves with workflowGraph
 */
function getLatestWorkflowGraph(config) {
    const { pipeline, eventConfig } = config;

    if (eventConfig.prRef) {
        return pipeline.getConfiguration(eventConfig.prRef)
            .then(c => c.workflowGraph);
    }

    // For everything else
    return Promise.resolve(pipeline.workflowGraph);
}

class EventFactory extends BaseFactory {
    /**
     * Construct a EventFactory object
     * @method constructor
     * @param  {Object}    config
     * @param  {Object}    config.datastore     Object that will perform operations on the datastore
     */
    constructor(config) {
        super('event', config);
    }

    /**
     * Instantiate an Event class
     * @method createClass
     * @param  {Object}     config
     * @return {Event}
     */
    createClass(config) {
        return new Event(config);
    }

    /**
     * Create an event model
     * @method create
     * @param  {Object}  config
     * @param  {String}  [config.type = 'pipeline'] Type of event (pipeline or pr)
     * @param  {Number}  config.pipelineId          Unique id of the pipeline
     * @param  {String}  config.sha                 SHA this project was built on
     * @param  {String}  config.username            Username of the user that creates this event
     * @param  {String}  config.scmContext          The scm context to which user belongs
     * @param  {String}  [config.prNum]             PR number if it's a PR event
     * @param  {String}  [config.prRef]             Ref if it's a PR event
     * @param  {String}  [config.startFrom]         Where the event starts from (jobname or ~commit, ~pr, etc)
     *                                              Optional for backwards compatibility
     * @param  {String}  [config.causeMessage]      Message that describes why the event was created
     * @param  {String}  [config.parentBuildId]     Id of the build that starts this event
     * @param  {String}  [config.parentEventId]     Id of the parent event
     * @param  {String}  [config.workflowGraph]     workflowGraph of parentEvent if there is a parentEvent
     * @param  {Array}   [config.changedFiles]      Array of files that were changed
     * @param  {Boolean} [config.webhooks]          If the create came from a webhook (pr or push) or not
     * @return {Promise}
     */
    create(config) {
        // Lazy load factory dependency to prevent circular dependency issues
        // https://nodejs.org/api/modules.html#modules_cycles
        // eslint-disable-next-line global-require
        const PipelineFactory = require('./pipelineFactory');
        const pipelineFactory = PipelineFactory.getInstance();
        const displayLabel = this.scm.getDisplayName(config);
        const displayName = displayLabel ? `${displayLabel}:${config.username}` : config.username;
        const modelConfig = {
            type: config.type || 'pipeline',
            pipelineId: config.pipelineId,
            sha: config.sha,
            startFrom: config.startFrom,
            causeMessage: config.causeMessage || `Started by ${displayName}`,
            meta: {},
            pr: {}
        };

        return pipelineFactory.get(config.pipelineId)
            // Sync pipeline to make sure workflowGraph is generated
            .then((p) => {
                if (config.parentEventId) {
                    modelConfig.parentEventId = config.parentEventId;

                    // Sync pipeline with the parentEvent sha and create jobs based on that sha
                    return p.sync(config.sha);
                }

                return p.sync();
            })
            .then((p) => {
                if (config.prInfo && config.prInfo.url) {
                    modelConfig.pr.url = config.prInfo.url;
                }

                if (config.prRef) {
                    return p.syncPR(config.prNum);
                }

                return p;
            })
            .then(pipeline => pipeline.token
                .then(token =>
                    this.scm.decorateAuthor({ // decorate user who creates this event
                        username: config.username,
                        scmContext: config.scmContext,
                        token
                    })
                        .then((creator) => {
                            modelConfig.creator = creator;

                            return this.scm.decorateCommit({
                                scmUri: pipeline.scmUri,
                                scmContext: config.scmContext,
                                sha: config.sha,
                                token
                            });
                        }))
                .then((commit) => {
                    modelConfig.commit = commit;
                    modelConfig.createTime = (new Date()).toISOString();

                    return getLatestWorkflowGraph({
                        pipeline,
                        eventConfig: config
                    });
                })
                .then((workflowGraph) => {
                    modelConfig.workflowGraph = workflowGraph;

                    return super.create(modelConfig);
                })
                .then((event) => {
                    if (modelConfig.type === 'pipeline') {
                        pipeline.lastEventId = event.id;
                    }

                    return pipeline.update()
                        // Start builds
                        .then(p => createBuilds({
                            eventConfig: config,
                            eventId: event.id,
                            pipeline: p,
                            pipelineConfig: modelConfig,
                            changedFiles: config.changedFiles,
                            webhooks: config.webhooks
                        }))
                        .then(() => event);
                })
            );
    }

    /**
     * Get an instance of the EventFactory
     * @method getInstance
     * @param  {Object}     config
     * @param  {Datastore}  config.datastore    A datastore instance
     * @param  {Scm}        config.scm          A scm instance
     * @return {EventFactory}
     */
    static getInstance(config) {
        if (!instance && (!config || !config.scm)) {
            throw new Error('No scm plugin provided to EventFactory');
        }
        instance = BaseFactory.getInstance(EventFactory, instance, config);

        return instance;
    }
}

module.exports = EventFactory;
