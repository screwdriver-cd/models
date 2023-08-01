'use strict';

const schema = require('screwdriver-data-schema');
const BaseFactory = require('./baseFactory');
const pipelineTemplate = require('./pipelineTemplate');
const TEMPLATE_NAME_REGEX = schema.config.regex.FULL_TEMPLATE_NAME;
const EXACT_VERSION_REGEX = schema.config.regex.EXACT_VERSION;
const VERSION_REGEX = schema.config.regex.VERSION;
const TAG_REGEX = schema.config.regex.TEMPLATE_TAG_NAME;
let instance;

class pipelineTemplateFactory extends BaseFactory {
    /**
     * Construct a TemplateFactory object
     * @method constructor
     * @param  {Object}     config
     * @param  {Datastore}  config.datastore         Object that will perform operations on the datastore
     */
    constructor(config) {
        super('templateMeta', config);
    }

    /**
     *
     * @param config
     * @returns {PipelineTemplate}
     */
    createClass(config) {
        // eslint-disable-next-line new-cap
        return new pipelineTemplate(config);
    }

    /**
     * Parses full template name to return an object with
     * full template name, versionOrTag, isExactVersion, and isVersion
     * @method getFullNameAndVersion
     * @param  {String} fullTemplateName Full template name (e.g.: chefdk/knife@1.2.3 or chefdk/knife@stable)
     * @return {Object}                  Object with template metadata
     */
    getFullNameAndVersion(fullTemplateName) {
        const [, templateName, versionOrTag] = TEMPLATE_NAME_REGEX.exec(fullTemplateName);
        const isExactVersion = EXACT_VERSION_REGEX.exec(versionOrTag);
        const isVersion = VERSION_REGEX.exec(versionOrTag);
        const isTag = versionOrTag ? versionOrTag.match(TAG_REGEX) : null;

        return {
            templateName, // not yet parsed for namespace
            versionOrTag,
            isExactVersion,
            isVersion,
            isTag
        };
    }

    /**
     * Get an instance of the pipelineTemplateFactory
     * @method getInstance
     * @param  {Object}     config
     * @param  {Datastore}  config.datastore
     * @return {TemplateFactory}
     */
    static getInstance(config) {
        instance = BaseFactory.getInstance(pipelineTemplateFactory, instance, config);

        return instance;
    }
}

module.exports = pipelineTemplateFactory;
