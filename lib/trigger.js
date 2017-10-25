'use strict';

const BaseModel = require('./base');

class TriggerModel extends BaseModel {
    /**
     * Construct a TriggerModel object
     * @method constructor
     * @param  {Object}    config
     * @param  {Object}    config.datastore     Object that will perform operations on the datastore
     * @param  {Number}    config.pipelineId    The pipeline Id
     * @param  {String}    config.jobName       The job's name
     * @param  {String}    config.trigger       The triggered job in the pipelineId:jobName format. Example: 12345:main
     */
    constructor(config) {
        super('trigger', config);
    }

}

module.exports = TriggerModel;
