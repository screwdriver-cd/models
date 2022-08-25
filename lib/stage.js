'use strict';

const BaseModel = require('./base');

class StageModel extends BaseModel {
    /**
     * Construct a StageModel object
     * @method constructor
     * @param  {Object}    config
     * @param  {Object}    config.datastore     Object that will perform operations on the datastore
     * @param  {String}    [config.description] Stage description
     * @param  {Number}    config.groupEventId  Group event ID
     * @param  {Array}     [config.jobIds=[]]   Job Ids that belong to this stage
     * @param  {String}    config.name          Name of the stage
     * @param  {Number}    config.pipelineId    Pipeline the stage belongs to
     */
    constructor(config) {
        super('stage', config);
    }
}

module.exports = StageModel;
