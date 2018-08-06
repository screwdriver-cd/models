'use strict';

const BaseModel = require('./base');

class StepModel extends BaseModel {
    /**
     * Construct a StepModel object
     * @method constructor
     * @param {Object} config
     * @param {Number} config.buildId         Build id
     * @param {String} config.name            Step name
     */
    constructor(config) {
        super('step', config); // data-schema model name
    }
}

module.exports = StepModel;
