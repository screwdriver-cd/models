'use strict';

const BaseModel = require('./base');

class TemplateModel extends BaseModel {
    /**
     * Construct a TemplateModel object
     * @method constructor
     * @param  {Object}    config
     * @param  {Object}    config.datastore         Object that will perform operations on the datastore
     */
    constructor(config) {
        super('template', config);
    }

}

module.exports = TemplateModel;
