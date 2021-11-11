'use strict';

const BaseFactory = require('./baseFactory');
const Step = require('./step');
const { DELETE_STEPS_QUERY, getQueries } = require('./rawQueries');

let instance;

class StepFactory extends BaseFactory {
    /**
     * Construct a StepFactory object
     * @method constructor
     * @param {Object} config
     * @param {Object} config.datastore     Object that will perform operations on the datastore
     */
    constructor(config) {
        super('step', config); // data-schema model name
    }

    /**
     * Instantiate a Step class
     * @method createClass
     * @param {Object} config
     * @return {Step}
     */
    createClass(config) {
        return new Step(config);
    }

    /**
     * Get an instance of StepFactory
     * @method getInstance
     * @param {Object} config
     * @return {StepFactory}
     */
    static getInstance(config) {
        instance = BaseFactory.getInstance(StepFactory, instance, config);

        return instance;
    }

    /**
     * Delete steps for a build with matching buildId
     * @method removeSteps
     * @param  {Object}     config                  Config object
     * @param  {Number}     config.buildId          build ID to delete steps for
     * @return {Promise}
     */
    removeSteps(config) {
        const queryConfig = {
            queries: getQueries(this.datastore.prefix, DELETE_STEPS_QUERY),
            replacements: {
                buildId: config.buildId
            },
            rawResponse: true
        };

        return super.query(queryConfig);
    }
}

module.exports = StepFactory;
