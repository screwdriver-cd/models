'use strict';

const BaseModel = require('./base');

class StageModel extends BaseModel {
    /**
     * Construct a StageModel object
     * @method constructor
     * @param  {Object}    config
     * @param  {Object}    config.datastore     Object that will perform operations on the datastore
     * @param  {String}    [config.description] Stage description
     * @param  {Array}     [config.jobIds=[]]   Job IDs that belong to this stage
     * @param  {String}    config.name          Name of the stage
     * @param  {Number}    config.pipelineId    Pipeline the stage belongs to
     * @param  {Array}     [config.setup]       Setup job IDs
     * @param  {String}    [config.startFrom]   Stage start point (a job name, e.g. 'main')
     * @param  {Array}     [config.teardown]    Teardown job IDs
     */
    constructor(config) {
        super('stage', config);
    }
}

module.exports = StageModel;
