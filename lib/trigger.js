'use strict';

const BaseModel = require('./base');

class TriggerModel extends BaseModel {
    /**
     * Construct a TriggerModel object
     * @method constructor
     * @param  {Object}    config
     * @param  {Object}    config.datastore     Object that will perform operations on the datastore
     * @param  {String}    config.src           Job that initiates the trigger
     * @param  {String}    config.dest          Job that is triggered
     */
    constructor(config) {
        super('trigger', config);
    }
}

module.exports = TriggerModel;
