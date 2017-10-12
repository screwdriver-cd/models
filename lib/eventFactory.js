'use strict';

const BaseFactory = require('./baseFactory');
const Event = require('./event');
const WorkflowParser = require('screwdriver-workflow-parser');

let instance;

/**
 * Create a job
 * @method createJob
 * @param  {JobFactory} jobFactory  Job factory
 * @param  {Job}        job         Job object
 * @param  {String}     jobName     Job name
 * @return {Job}                    Job object
 */
function createJob(jobFactory, job, jobName) {
    return jobFactory.create({
        pipelineId: job.pipelineId,
        name: jobName,
        permutations: job.permutations
    });
}

/**
 * Create builds associated with this event
 * For example, if startFrom ~commit, then create builds with jobs that have requires: ~commit
 * @method createBuilds
 * @param  {Pipeline} pipeline                   Pipeline to create builds
 * @param  {Object}   config
 * @param  {String}   config.sha                 SHA this project was built on
 * @param  {String}   config.username            Username of the user that creates this event
 * @param  {String}   config.scmContext          The scm context to which user belongs
 * @param  {String}   [config.prRef]             Ref if it's a PR event
 * @param  {String}   [config.prNum]             PR number if it's a PR event
 * @param  {String}   [config.startFrom]         Where the event starts from (jobname or ~commit, ~pr, etc)
 *                                               (Optional for backwards compatibility)
 * @param  {Number}   eventId                    Event id
 */
function createBuilds(pipeline, config, eventId) {
    const startFrom = config.startFrom;
    let jobsToStart = [];

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
        let nextJobs;

        // When startFrom is ~commit or jobName
        if (startFrom !== '~pr') {
            nextJobs = WorkflowParser.getNextJobs(pipeline.workflowGraph, { trigger: startFrom });
            jobsToStart = jobs.filter(j => nextJobs.includes(j.name) && j.state === 'ENABLED');

            return Promise.resolve([]);
        }

        // Get next jobs for when startFrom is ~pr
        nextJobs = WorkflowParser.getNextJobs(pipeline.workflowGraph, {
            trigger: startFrom,
            prNum: config.prNum
        });

        // To start all existing and ENABLED PR-prNum jobs
        const PRJobArray = jobs.filter(j => j.name.startsWith(`PR-${config.prNum}:`));
        const enabledPRJobArray = PRJobArray.filter(j => j.state === 'ENABLED');

        jobsToStart = enabledPRJobArray;

        // Get all the missing PR- job names
        const existingPRJobNames = PRJobArray.map(p => p.name);
        const missingPRJobNames = nextJobs.filter(j => !existingPRJobNames.includes(j));
        // Get the job name part, e.g. main from PR-1:main
        const missingJobNames = missingPRJobNames.map(name => name.split(':')[1]);
        const missingJobs = jobs.filter(j => missingJobNames.includes(j.name));

        // Create missing PR jobs
        return Promise.all(missingJobs.map(j =>
            createJob(jobFactory, j, `PR-${config.prNum}:${j.name}`)
        ));
    })
    .then((newJobs) => {
        // Add newly created PR jobs to jobsToStart array
        jobsToStart = jobsToStart.concat(newJobs);

        // No jobs to start (eg: when jobs are disabled or startFrom is not valid)
        if (jobsToStart.length <= 0) {
            return Promise.reject(new Error('No jobs to start'));
        }

        // Start builds
        return Promise.all(jobsToStart.map(j =>
            buildFactory.create(Object.assign({ jobId: j.id, eventId }, config))
        ));
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
     * @param  {String}  config.pipelineId          Unique id of the pipeline
     * @param  {Array}   config.workflow            Job names that will be executed for this event
     * @param  {Array}   [config.workflowGraph]     Object with nodes and edges that represent the order of jobs
     *                                              (Optional for backwards compatibility)
     * @param  {String}  config.sha                 SHA this project was built on
     * @param  {String}  config.username            Username of the user that creates this event
     * @param  {String}  config.scmContext          The scm context to which user belongs
     * @param  {String}  [config.prRef]             Ref if it's a PR event
     * @param  {String}  [config.startFrom]         Where the event starts from (jobname or ~commit, ~pr, etc)
     *                                              Making optional for backward compatibility
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

        return pipelineFactory.get(config.pipelineId).then((pipeline) => {
            const modelConfig = {
                type: config.type || 'pipeline',
                pipelineId: config.pipelineId,
                sha: config.sha,
                workflow: config.workflow,
                workflowGraph: config.workflowGraph,
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

                    return super.create(modelConfig);
                })
                .then((event) => {
                    if (modelConfig.type === 'pipeline') {
                        pipeline.lastEventId = event.id;
                    }

                    return pipeline.update()
                        .then(() => createBuilds(pipeline, config, event.id))
                        .then(() => event);
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
