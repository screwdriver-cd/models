'use strict';

const BaseFactory = require('./baseFactory');
const Job = require('./job');
let instance;

class JobFactory extends BaseFactory {
    /**
     * Construct a JobFactory object
     * @method constructor
     * @param  {Object}    config
     * @param  {Datastore}    config.datastore         Object that will perform operations on the datastore
     */
    constructor(config) {
        super('job', config);
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
        return new Job(config);
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

        return super.create(c);
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
