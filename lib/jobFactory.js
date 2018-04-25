'use strict';

const BaseFactory = require('./baseFactory');
const PipelineFactory = require('./pipelineFactory');
const pipelineFactory = PipelineFactory.getInstance();
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
        const perm = c.permutations[0];

        return super.create(c).then((job) => {
            if (!perm.annotations ||
                !perm.annotations['beta.screwdriver.cd/buildPeriodically']) {
                return job;
            }

            return pipelineFactory.get(c.pipelineId)
                .then(pipeline => this.executor.startPeriodic({
                    pipeline,
                    job,
                    tokenGen: this.tokenGen
                }))
                .then(() => job);
        });
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
