'use strict';

const BaseFactory = require('./baseFactory');
const Trigger = require('./trigger');
let instance;

class TriggerFactory extends BaseFactory {
    /**
     * Construct a TriggerFactory object
     * @method constructor
     * @param  {Object}     config
     * @param  {Datastore}  config.datastore     Object that will perform operations on the datastore
     */
    constructor(config) {
        super('trigger', config);
    }

    /**
     * Instantiate a Trigger class
     * @method createClass
     * @param  {Object}     config               Trigger data
     * @param  {Datastore}  config.datastore     Object that will perform operations on the datastore
     * @param  {Number}     config.src           Job that initiates the trigger
     * @param  {String}     config.dest          Job that is triggered
     * @return {Trigger}
     */
    createClass(config) {
        return new Trigger(config);
    }

    /**
     * Get an instance of the TriggerFactory
     * @method getInstance
     * @param  {Object}     config
     * @param  {Datastore}  config.datastore
     * @return {TriggerFactory}
     */
    static getInstance(config) {
        instance = BaseFactory.getInstance(TriggerFactory, instance, config);

        return instance;
    }
}

module.exports = TriggerFactory;
