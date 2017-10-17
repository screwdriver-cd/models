'use strict';

const BaseFactory = require('./baseFactory');
const Event = require('./event');
const workflowParser = require('screwdriver-workflow-parser');

let instance;

/**
 * Returns 2 arrays:
 * 1. Jobs to start
 * 2. Job to create
 * @method splitPRJobs
 * @param  {Object}    config
 * @param  {Array}     config.jobs      PR jobs
 * @param  {Array}     config.nextJobs  PR job names to trigger next
 * @param  {Number}    config.prNum     PR number
 * @return {Object}                     Object with jobsToStart array and jobsToCreate array
 */
function splitPRJobs(config) {
    const { jobs, nextJobs, prNum } = config;
    // Get jobsToStart
    // To start all existing and ENABLED PR-prNum jobs
    const PRJobArray = jobs.filter(j => j.name.startsWith(`PR-${prNum}:`));
    const jobsToStart = PRJobArray.filter(j => j.state === 'ENABLED');
    // Get jobsToCreate
    // Get all the missing PR- job names
    const existingPRJobNames = PRJobArray.map(p => p.name);
    const missingPRJobNames = nextJobs.filter(j => !existingPRJobNames.includes(j));
    // Get the job name part, e.g. main from PR-1:main
    const missingJobNames = missingPRJobNames.map(name => name.split(':')[1]);
    const missingJobs = jobs.filter(j => missingJobNames.includes(j.name));

    return {
        jobsToStart,
        jobsToCreate: missingJobs
    };
}

/**
 * Get commit jobs to start that are enabled
 * @method getJobsFromCommit
 * @param  {Object}   config
 * @param  {Array}    config.jobs                           Array of job objects
 * @param  {Object}   config.pipelineConfig
 * @param  {Array}    [config.pipelineConfig.workflow]      Order of jobs to be run
 * @param  {Object}   config.pipelineConfig.workflowGraph   Object with nodes and edges that represent the order of jobs
 * @param  {String}   config.startFrom                      Startfrom (e.g. ~commit, ~pr, etc)
 * @return {Array}                                          Array of commit jobs to start
 */
function getJobsFromCommit(config) {
    const { jobs, pipelineConfig, startFrom } = config;

    if (startFrom !== '~commit') {
        return [];
    }

    const nextJobs = workflowParser.getNextJobs(pipelineConfig.workflowGraph, {
        trigger: startFrom
    });

    return jobs.filter(j => nextJobs.includes(j.name) && j.state === 'ENABLED');
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

    return jobs.filter(j => j.name === startFrom && j.state === 'ENABLED');
}

/**
 * Get PR jobs to start that are enabled
 * @method getJobsFromPR
 * @param  {Object}   config
 * @param  {Object}   config.jobFactory                     Job Factory
 * @param  {Array}    config.jobs                           Array of job objects
 * @param  {Object}   config.pipeline                       Pipeline object
 * @param  {Object}   config.pipelineConfig
 * @param  {Object}   config.pipelineConfig.workflowGraph   Object with nodes and edges that represent the order of jobs
 * @param  {Array}    config.pipelineConfig.jobs            Array of job objects
 * @param  {Number}   config.prNum                          PR number
 * @param  {String}   config.startFrom                      Startfrom (e.g. ~commit, ~pr, etc)
 * @resolves {Array}                                        Array of PR jobs to start
 */
function getJobsFromPR(config) {
    const { jobFactory, jobs, pipeline, pipelineConfig, prNum, startFrom } = config;

    if (startFrom !== '~pr') {
        return [];
    }

    // Get next jobs for when startFrom is ~pr
    const nextJobs = workflowParser.getNextJobs(pipelineConfig.workflowGraph, {
        trigger: startFrom,
        prNum
    });
    // Get jobs to start and create
    const { jobsToStart, jobsToCreate } = splitPRJobs({
        jobs,
        nextJobs,
        prNum
    });

    // Create missing PR jobs
    return Promise.all(jobsToCreate.map(j =>
        // Create jobs
        jobFactory.create({
            permutations: pipelineConfig.jobs[j.name],
            pipelineId: pipeline.id,
            name: `PR-${prNum}:${j.name}`
        })))
    // Add newly created PR jobs to jobsToStart array
    .then(newJobs => jobsToStart.concat(newJobs));
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
 * @param  {Number}   config.eventId                         Event id
 * @param  {Pipeline} config.pipeline                        Pipeline to create builds
 * @param  {Object}   config.pipelineConfig
 * @param  {Array}    [config.pipelineConfig.workflow]       Job names that will be executed for this event
 * @param  {Object}   [config.pipelineConfig.workflowGraph]  Object with nodes and edges that represent the order of jobs
 */
function createBuilds(config) {
    const { eventConfig, eventId, pipeline, pipelineConfig } = config;
    const startFrom = eventConfig.startFrom;

    // If no startFrom, then do nothing. Remove once we switch to new workflow design
    if (!startFrom) {
        return null;
    }

    /* eslint-disable global-require */
    const BuildFactory = require('./buildFactory');
    const buildFactory = BuildFactory.getInstance();
    const JobFactory = require('./jobFactory');
    const jobFactory = JobFactory.getInstance();
    /* eslint-enable global-require */

    return pipeline.jobs.then((jobs) => {
        // When startFrom is ~commit
        const jobsFromCommit = getJobsFromCommit({
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
            jobFactory,
            jobs,
            pipeline,
            pipelineConfig,
            prNum: eventConfig.prNum,
            startFrom
        });

        return Promise.all([jobsFromCommit, jobsFromJobName, jobsFromPR])
        .then(result => result.reduce((a, b) => a.concat(b)));
    })
    .then((jobsToStart) => {
        // No jobs to start (eg: when jobs are disabled or startFrom is not valid)
        if (jobsToStart.length === 0) {
            throw new Error('No jobs to start');
        }

        // Start builds
        return Promise.all(jobsToStart.map(j =>
            buildFactory.create(Object.assign({ jobId: j.id, eventId }, eventConfig))
        ));
    });
}

/**
 * Get the latest workflowGraph and pipelineConfig
 * @method getLatestConfig
 * @param  {Object}         config
 * @param  {Pipeline}       pipeline            Pipeline to be synced
 * @param  {Object}         eventConfig
 * @param  {Number}         [eventConfig.prNum] PR number
 * @param  {String}         [eventConfig.prRef] PR ref
 * @resolves {Object}                           Resolves with object with workflowGraph
 */
function getLatestConfig(config) {
    const { pipeline, eventConfig } = config;

    // For pull request
    if (eventConfig.prRef) {
        return pipeline.syncPR(eventConfig.prNum)
        .then(() => pipeline.getConfiguration(eventConfig.prRef));
    }

    // For everything else
    return Promise.resolve({
        workflow: pipeline.workflow,
        workflowGraph: pipeline.workflowGraph
    });
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

        return pipelineFactory.get(config.pipelineId)
        // Sync pipeline
        .then(p => p.sync())
        .then((pipeline) => {
            const modelConfig = {
                type: config.type || 'pipeline',
                pipelineId: config.pipelineId,
                sha: config.sha,
                startFrom: config.startFrom,
                causeMessage: config.causeMessage || `Started by ${displayName}`
            };

            return pipeline.token
                .then(token =>
                    this.scm.decorateAuthor({           // decorate user who creates this event
                        username: config.username,
                        scmContext: config.scmContext,
                        token
                    })
                    .then((creator) => {
                        modelConfig.creator = creator;

                        const scmUri = pipeline.scmUri;

                        return this.scm.decorateCommit({
                            scmUri,
                            scmContext: config.scmContext,
                            sha: config.sha,
                            token
                        });
                    }))
                .then((commit) => {
                    modelConfig.commit = commit;
                    modelConfig.createTime = (new Date()).toISOString();

                    // Get latest config
                    return getLatestConfig({
                        pipeline,
                        eventConfig: config
                    })
                    .then((latestConfig) => {
                        modelConfig.workflowGraph = latestConfig.workflowGraph;
                        modelConfig.workflow = latestConfig.workflow;

                        return super.create(modelConfig)
                        .then((event) => {
                            if (modelConfig.type === 'pipeline') {
                                pipeline.lastEventId = event.id;
                            }

                            return pipeline.update()
                            // Start builds
                            .then(() => createBuilds({
                                eventConfig: config,
                                eventId: event.id,
                                pipeline,
                                pipelineConfig: latestConfig
                            }))
                            .then(() => event);
                        });
                    });
                });
        });
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
