'use strict';

const BaseFactory = require('./baseFactory');
const Event = require('./event');
const jobConfigSchema = require('screwdriver-data-schema').config.job;
const joi = require('joi');

let instance;

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
 * @param  {String}   [config.prNum]             PR Number if it's a PR event
 * @param  {String}   [config.startFrom]         Where the event starts from (jobname or ~commit, ~pr, etc)
 *                                               Making optional for backward compatibility
 * @param  {Number}   eventId                    Event's id
 */
function createBuilds(pipeline, config, eventId) {
    const startFrom = config.startFrom;

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

    const createJob = (job, jobName) => jobFactory.create({
        pipelineId: job.pipelineId,
        name: jobName,
        permutations: job.permutations
    });

    return pipeline.jobs.then((jobs) => {
        const jobNamesArray = jobs.map(j => j.name);
        const jobsToCreate = [];
        let jobsToStart = [];

        jobs.forEach((job) => {
            const enabled = job.state === 'ENABLED';
            const requires = job.permutations.requires;
            const isJobName = joi.validate(startFrom, jobConfigSchema.jobname);
            const isTrigger = joi.validate(startFrom, jobConfigSchema.trigger);

            if (enabled) {
                // if startFrom is a jobname, then start that job
                if (!isJobName.error && startFrom === job.name) {
                    jobsToStart.push(job);
                // if startFrom is a trigger (example: ~commit, ~pr) then start jobs that include that key
                } else if (!isTrigger.error && requires && requires.includes(startFrom)) {
                    const prJobName = `PR-${config.prNum}-${job.name}`;
                    const prJobIndex = jobNamesArray.indexOf(prJobName);

                    // if startFrom is not ~pr, or if ~pr and PR job already exists
                    if (startFrom !== '~pr' || prJobIndex >= 0) {
                        jobsToStart.push(job);
                    } else {
                        // PR job doesn't exist yet, need to create the job
                        jobsToCreate.push(createJob(job, prJobName));
                    }
                }
            }
        });

        return Promise.all(jobsToCreate)
            .then((newJobs) => {
                jobsToStart = jobsToStart.concat(newJobs);

                // No jobs to start (For example: job are disabled, or startFrom is not valid)
                if (jobsToStart.length <= 0) {
                    return Promise.reject(new Error('No jobs to start'));
                }

                return Promise.all(jobsToStart.map(j =>
                    buildFactory.create(Object.assign({ jobId: j.id, eventId }, config))
                ));
            });
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
