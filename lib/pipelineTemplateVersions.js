'use strict';

const BaseModel = require('./base');

class TemplateModel extends BaseModel {
    /**
     * Construct a TemplateModel object
     * @method constructor
     * @param  {Object}    config
     * @param  {String}    config.createTime    The time the template was created
     * @param  {Object}    config.datastore     Object that will perform operations on the datastore
     */
    constructor(config) {
        super('pipelineTemplateVersions', config);
    }
}

module.exports = TemplateModel;
