'use strict';

const BaseModel = require('./base');

class StageBuildModel extends BaseModel {
    /**
     * Construct a StageBuildModel object
     * @method constructor
     * @param  {Object}    config
     * @param  {Object}    config.datastore     Object that will perform operations on the datastore
     * @param  {Number}    config.eventId       Event ID
     * @param  {Number}    config.stageId       Stage ID
     * @param  {String}    config.status        Stage build status
     */
    constructor(config) {
        super('stageBuild', config);
    }
}

module.exports = StageBuildModel;
