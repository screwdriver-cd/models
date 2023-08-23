'use strict';

const hoek = require('@hapi/hoek');
const schema = require('screwdriver-data-schema');
const BaseFactory = require('./baseFactory');
const TemplateTag = require('./templateTag');
const { parseTemplateConfigName } = require('./helper');
const TEMPLATE_NAME_REGEX = schema.config.regex.FULL_TEMPLATE_NAME;
const TEMPLATE_NAME_REGEX_WITH_NAMESPACE = schema.config.regex.FULL_TEMPLATE_NAME_WITH_NAMESPACE;

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
     * Parses a full template name and returns template object consisting of
     * template name and namespace
     * @method _getNameAndNamespace
     * @param  {String} fullTemplateName Full template name (e.g.: chefdk/knife@1.2.3 or chefdk/knife@stable)
     * @return {Promise}                 Object with template metadata
     */
    _getNameAndNamespace(fullTemplateName) {
        // Use regex to filter out possible version
        // Note: not sure if we should expect no version or handle case where version is passed in
        const [, nameWithNamespace] = TEMPLATE_NAME_REGEX.exec(fullTemplateName);
        const parsedTemplate = {
            name: nameWithNamespace
        };

        // If fullTemplateName has no '/', don't need to bother to grep for namespace
        if (fullTemplateName.indexOf('/') <= -1) {
            // Check if template with default namespace and name exist, default to using that template
            return super
                .list({
                    params: {
                        namespace: 'default',
                        name: parsedTemplate.name,
                        templateType: this.getTemplateType()
                    }
                })
                .then(namespaceExists => {
                    if (namespaceExists.length > 0) {
                        parsedTemplate.namespace = 'default';
                    }

                    return parsedTemplate;
                });
        }

        const [, namespace, name] = TEMPLATE_NAME_REGEX_WITH_NAMESPACE.exec(fullTemplateName);

        // Check if template with namespace and name exist, default to using that template
        return super
            .list({
                params: {
                    namespace,
                    name,
                    templateType: this.getTemplateType()
                }
            })
            .then(namespaceExists => {
                if (namespaceExists.length > 0) {
                    parsedTemplate.namespace = namespace;
                    parsedTemplate.name = name;
                }

                return parsedTemplate;
            });
    }

    getTemplateType() {
        return this._getTemplateType();
    }

    _getTemplateType() {
        // Note: To keep it backward compatible, returning 'JOB'.
        // TODO: After PR screwdriver-cd/models#585 is merged https://github.com/screwdriver-cd/models/pull/585 and the code refactored to use jobTemplateTagFactory, this needs to be updated
        return 'JOB';
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

    /**
     * Create a new template tag for a given version
     * @method create
     * @param  {Object}     config
     * @param  {String}     config.name          The template name
     * @param  {String}     [config.namespace]   The template namespace
     * @param  {String}     config.tag           The template tag
     * @param  {String}     config.version       The template version
     * @return {Promise}
     */
    create(config) {
        const nameObj = parseTemplateConfigName(config);
        const result = hoek.applyToDefaults(config, nameObj);

        result.createTime = new Date().toISOString();

        return super.create(result);
    }

    /**
     * List template tags with pagination and filter options
     * @method list
     * @param  {Object}   config                  Config object
     * @param  {Object}   config.params           Parameters to filter on
     * @param  {Object}   config.paginate         Pagination parameters
     * @param  {Number}   config.paginate.count   Number of items per page
     * @param  {Number}   config.paginate.page    Specific page of the set to return
     * @return {Promise}
     */
    list(config) {
        if (!config.params) {
            config.params = {};
        }
        config.params.templateType = this.getTemplateType();

        if (config.params.name && !config.params.namespace) {
            // eslint-disable-next-line no-underscore-dangle
            return this._getNameAndNamespace(config.params.name).then(parsedTemplateName => {
                const { namespace, name } = parsedTemplateName;

                if (namespace) {
                    config.params.namespace = namespace;
                    config.params.name = name;
                }

                return super.list(config);
            });
        }

        return super.list(config);
    }

    /**
     * Get a template tag
     * @method get
     * @param  {Mixed}    config
     * @param  {String}   [config.name]      Template name (may or may not contain namespace)
     * @param  {String}   [config.namespace] Template namespace
     * @param  {String}   [config.tag]       Template tag
     * @return {Promise}
     */
    get(config) {
        config.templateType = this.getTemplateType();

        if (config.name && !config.namespace) {
            // eslint-disable-next-line no-underscore-dangle
            return this._getNameAndNamespace(config.name).then(parsedTemplateName => {
                const { namespace, name } = parsedTemplateName;

                config.namespace = namespace || null;
                config.name = name;

                return super.get(config);
            });
        }

        return super.get(config);
    }
}

module.exports = TemplateTagFactory;
