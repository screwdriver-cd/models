'use strict';

const BaseModel = require('./base');

class PipelineTemplateVersionModel extends BaseModel {
    /**
     * Construct a PipelineTemplateVersionModel object
     * @method constructor
     * @param  {Object}    config
     * @param  {Datastore}  config.datastore     Object that will perform operations on the datastore
     * @param  {String}     config.name          The template name
     * @param  {String}     config.namespace   The template namespace
     * @param  {String}     config.version       Version of the template
     * @param  {String}     config.description   Description of the template
     * @param  {String}     config.maintainer    Maintainer's email
     * @param  {Object}     config.config        Config of the screwdriver-template.yaml
     * @param  {String}     config.pipelineId    pipelineId of the template
     */
    constructor(config) {
        super('pipelineTemplateVersions', config);
    }
}

module.exports = PipelineTemplateVersionModel;
