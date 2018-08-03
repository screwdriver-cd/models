'use strict';

const BaseModel = require('./base');

class StepModel extends BaseModel {
    /**
     * Construct a BannerModel object
     * @method constructor
     * @param {Object} config
     * @param {Number} config.buildId         The banner message
     * @param {String} config.name            The username of the user that created this banner
     * @param {Number} [config.startTime]     Time the banner object was created
     */
    constructor(config) {
        super('step', config); // data-schema model name
    }
}

module.exports = StepModel;
