'use strict';

const BaseFactory = require('./baseFactory');
const Step = require('./step');

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
}

module.exports = StepFactory;
