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
     * @param  {String}     config.state         state
     * @param  {String}     config.name          name
     * @param  {String}     config.description   description
     * @return {Job}
     */
    createClass(config) {
        return new Job(config);
    }

    /**
     * Create a new job
     * @method create
     * @param  {Object}    config               Config object
     * @param  {String}    config.pipelineId    The pipeline that the job belongs to
     * @param  {String}    config.name          The job name
     * @return {Promise}
     */
    create(config) {
        const pipelineId = config.pipelineId;
        const name = config.name;
        const modelConfig = {
            name,
            pipelineId,
            state: 'ENABLED'
        };

        return super.create(modelConfig);
    }

    /**
     * Get an instance of the UserFactory
     * @method getInstance
     * @param  {Object}     config
     * @param  {Datastore}  config.datastore
     * @return {UserFactory}
     */
    static getInstance(config) {
        if (!instance) {
            if (!config || !config.datastore) {
                throw new Error('No datastore provided to JobFactory');
            }

            instance = new JobFactory(config);
        }

        return instance;
    }
}

module.exports = JobFactory;
