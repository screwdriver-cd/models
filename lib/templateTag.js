'use strict';

const BaseModel = require('./base');

class TemplateTagModel extends BaseModel {
    /**
     * Construct a TemplateTagModel object
     * @method constructor
     * @param  {Object}    config
     * @param  {Object}    config.datastore     Object that will perform operations on the datastore
     * @param  {String}    config.name          The template name
     * @param  {String}    config.tag           The template tag (e.g.: 'stable' or 'latest')
     * @param  {String}    config.version       Version of the template
     */
    constructor(config) {
        super('templateTag', config);
    }
}

module.exports = TemplateTagModel;
