'use strict';

const BaseFactory = require('./baseFactory');
const { getAnnotations, getToken, convertToBool } = require('./helper');
const Job = require('./job');
const { getQueries, PR_JOBS_FOR_PIPELINE_SYNC, PIPELINE_USAGE_COUNT_FOR_JOB_TEMPLATES } = require('./rawQueries');
let instance;

class JobFactory extends BaseFactory {
    /**
     * Construct a JobFactory object
     * @method constructor
     * @param  {Object}       config
     * @param  {Datastore}    config.datastore         Object that will perform operations on the datastore
     * @param  {Executor}     config.executor          Object that will perform executor operations
     */
    constructor(config) {
        super('job', config);
        this.executor = config.executor;
        this.tokenGen = null;
        this.apiUri = null;
    }

    /**
     * Instantiate a Job class
     * @method createClass
     * @param  {Object}     config               Job data
     * @param  {Datastore}  config.datastore     Object that will perform operations on the datastore
     * @param  {String}     config.id            unique id
     * @param  {String}     config.pipelineId    unique id of the pipeline
     * @param  {Array}      config.containers    List of images
     * @param  {String}     config.state         state
     * @param  {String}     config.name          name
     * @param  {String}     config.description   description
     * @return {Job}
     */
    createClass(config) {
        const c = config;

        c.executor = this.executor;
        c.tokenGen = this.tokenGen;
        c.apiUri = this.apiUri;

        return new Job(c);
    }

    /**
     * Create a new job (See schema definition)
     * @method create
     * @param  {Object}    config               Config object
     * @param  {String}    config.pipelineId    The pipeline that the job belongs to
     * @param  {String}    config.name          The job name
     * @param  {Array}     config.permutations  Array of configurations of the job
     * @return {Promise}
     */
    create(config) {
        const c = config;
        const jobDisabledByDefault = convertToBool(
            getAnnotations(c.permutations[0], 'screwdriver.cd/jobDisabledByDefault')
        );

        c.state = jobDisabledByDefault === true && !/^PR-/.test(c.name) ? 'DISABLED' : 'ENABLED';
        c.archived = false;

        // eslint-disable-next-line global-require
        const PipelineFactory = require('./pipelineFactory');
        const pipelineFactory = PipelineFactory.getInstance();

        return super.create(c).then(job => {
            // Do not run job periodically if job is PR
            if (getAnnotations(c.permutations[0], 'screwdriver.cd/buildPeriodically') && !/^PR-/.test(c.name)) {
                return pipelineFactory
                    .get(c.pipelineId)
                    .then(pipeline =>
                        this.executor.startPeriodic({
                            pipeline,
                            job,
                            tokenGen: this.tokenGen,
                            token: getToken(this.tokenGen, pipeline, job.id),
                            apiUri: this.apiUri
                        })
                    )
                    .then(() => job);
            }

            return job;
        });
    }

    /**
     * Get all the pull request jobs that needs to be updated during pipeline sync that are associated with the
     * specified pipeline.
     * This includes:
     *  - unarchived jobs for closed pull requests
     *  - both archived and unarchived jobs for open pull requests
     * @method getPullRequestJobsForPipelineSync
     * @param  {Object}   config                Config object
     * @param  {Number}   config.pipelineId     Pipeline ID to get jobs for. Ex: 76562
     * @param  {Array}    config.prNames        PR identifiers to get jobs for. Ex: ['PR-32', 'PR-34', 'PR-2']
     */
    getPullRequestJobsForPipelineSync(config) {
        const { prNames } = config;
        const queryConfig = {
            queries: getQueries(this.datastore.prefix, PR_JOBS_FOR_PIPELINE_SYNC),
            replacements: {
                pipelineId: config.pipelineId,
                prNames: prNames && prNames.length > 0 ? prNames : null
            }
        };

        return super.query(queryConfig);
    }

    /**
     * Cleanup any processing
     */
    async cleanUp() {
        await this.executor.cleanUp();
    }

    /**
     * Get an instance of the JobFactory
     * @method getInstance
     * @param  {Object}     config
     * @param  {Datastore}  config.datastore
     * @return {JobFactory}
     */
    static getInstance(config) {
        instance = BaseFactory.getInstance(JobFactory, instance, config);

        return instance;
    }

    getPipelineUsageCountForTemplates(templateIds) {
        const jobsQueryConfig = {
            queries: getQueries(this.datastore.prefix, PIPELINE_USAGE_COUNT_FOR_JOB_TEMPLATES),
            readOnly: true,
            replacements: {
                templateIds
            },
            rawResponse: true
        };

        return this.query(jobsQueryConfig).then(r => r[0]);
    }
}

module.exports = JobFactory;
