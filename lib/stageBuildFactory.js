'use strict';

const BaseFactory = require('./baseFactory');
const StageBuild = require('./stageBuild');
let instance;

class StageBuildFactory extends BaseFactory {
    /**
     * Construct a StageBuildFactory object
     * @method constructor
     * @param  {Object}     config
     * @param  {Datastore}  config.datastore     Object that will perform operations on the datastore
     */
    constructor(config) {
        super('stageBuild', config);
    }

    /**
     * Instantiate a StageBuild class
     * @method createClass
     * @param  {Object}     config               StageBuild data
     * @return {StageBuild}
     */
    createClass(config) {
        return new StageBuild(config);
    }

    /**
     * Create a StageBuild model
     * @param {Object}    config
     * @param {Number}    config.eventId       Event ID
     * @param {Number}    config.stageId       Stage ID
     * @param {Object}    config.workflowGraph Stage workflowGraph
     * @memberof StageBuildFactory
     */
    create(config) {
        return super.create(config);
    }

    /**
     * Get an instance of the StageBuildFactory
     * @method getInstance
     * @param  {Object}     config
     * @param  {Datastore}  config.datastore
     * @return {StageBuildFactory}
     */
    static getInstance(config) {
        instance = BaseFactory.getInstance(StageBuildFactory, instance, config);

        return instance;
    }
}

module.exports = StageBuildFactory;
