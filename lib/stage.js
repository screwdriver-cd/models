'use strict';

const BaseModel = require('./base');

class StageModel extends BaseModel {
    /**
     * Construct a StageModel object
     * @method constructor
     * @param  {Object}    config
     * @param  {Object}    config.datastore     Object that will perform operations on the datastore
     * @param  {String}    config.pipelineId    Pipeline the stage belongs to
     * @param  {String}    config.name          Name of the stage
     * @param  {Array}     config.jobIds        Job Ids that belong to this stage
     * @param  {String}    config.state         Current state of the stage (e.g. ARCHIVED, ACTIVE, etc)
     */
    constructor(config) {
        super('stage', config);
    }
}

module.exports = StageModel;
