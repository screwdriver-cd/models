'use strict';

const BaseFactory = require('./baseFactory');
const TemplateTag = require('./templateTag');
let instance;

class TemplateTagFactory extends BaseFactory {
    /**
     * Construct a TemplateTagFactory object
     * @method constructor
     * @param  {Object}     config
     * @param  {Datastore}  config.datastore     Object that will perform operations on the datastore
     */
    constructor(config) {
        super('templateTag', config);
    }

    /**
     * Instantiate a TemplateTag class
     * @method createClass
     * @param  {Object}     config               Template tag data
     * @param  {Datastore}  config.datastore     Object that will perform operations on the datastore
     * @param  {String}     config.name          The template name
     * @param  {String}     [config.namespace]   The template namespace
     * @param  {String}     config.tag           The template tag (e.g.: 'stable' or 'latest')
     * @param  {String}     config.version       Version of the template
     * @return {TemplateTag}
     */
    createClass(config) {
        return new TemplateTag(config);
    }

    /**
     * Get an instance of the TemplateTagFactory
     * @method getInstance
     * @param  {Object}     config
     * @param  {Datastore}  config.datastore
     * @return {TemplateTagFactory}
     */
    static getInstance(config) {
        instance = BaseFactory.getInstance(TemplateTagFactory, instance, config);

        return instance;
    }
}

module.exports = TemplateTagFactory;
