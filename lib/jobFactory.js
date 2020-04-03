'use strict';

const BaseFactory = require('./baseFactory');
const { getAnnotations } = require('./helper');
const Job = require('./job');
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

        c.state = 'ENABLED';
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
                            apiUri: this.apiUri,
                            jobId: job.id,
                            pipelineId: pipeline.id
                        })
                    )
                    .then(() => job);
            }

            return job;
        });
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
}

module.exports = JobFactory;
