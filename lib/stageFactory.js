'use strict';

const BaseFactory = require('./baseFactory');
const Stage = require('./stage');
let instance;

class StageFactory extends BaseFactory {
    /**
     * Construct a StageFactory object
     * @method constructor
     * @param  {Object}     config
     * @param  {Datastore}  config.datastore     Object that will perform operations on the datastore
     */
    constructor(config) {
        super('stage', config);
    }

    /**
     * Instantiate a Stage class
     * @method createClass
     * @param  {Object}     config               Stage data
     * @return {Stage}
     */
    createClass(config) {
        return new Stage(config);
    }

    /**
     * Create a Stage model
     * @param {Object}  config
     * @param {String}  [config.description] Stage description
     * @param {Array}   [config.jobIds=[]]   Job IDs that belong to this stage
     * @param {String}  config.name          Name of the stage
     * @param {Number}  config.pipelineId    Pipeline the stage belongs to
     * @param {Array}   [config.setup]       Setup job IDs
     * @param {String}  [config.startFrom]   Stage start point (a job name, e.g. 'main')
     * @param {Array}   [config.teardown]    Teardown job IDs
     * @memberof StageFactory
     */
    create(config) {
        return super.create(config);
    }

    /**
     * Get an instance of the StageFactory
     * @method getInstance
     * @param  {Object}     config
     * @param  {Datastore}  config.datastore
     * @return {StageFactory}
     */
    static getInstance(config) {
        instance = BaseFactory.getInstance(StageFactory, instance, config);

        return instance;
    }
}

module.exports = StageFactory;
