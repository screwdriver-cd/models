'use strict';

const compareVersions = require('compare-versions');
const hoek = require('@hapi/hoek');
const schema = require('screwdriver-data-schema');
const BaseFactory = require('./baseFactory');
const Template = require('./template');
const { parseTemplateConfigName } = require('./helper');
const TEMPLATE_NAME_REGEX = schema.config.regex.FULL_TEMPLATE_NAME;
const TEMPLATE_NAME_REGEX_WITH_NAMESPACE = schema.config.regex.FULL_TEMPLATE_NAME_WITH_NAMESPACE;
const EXACT_VERSION_REGEX = schema.config.regex.EXACT_VERSION;
const VERSION_REGEX = schema.config.regex.VERSION;
const TAG_REGEX = schema.config.regex.TEMPLATE_TAG_NAME;
let instance;

class TemplateFactory extends BaseFactory {
    /**
     * Construct a TemplateFactory object
     * @method constructor
     * @param  {Object}     config
     * @param  {Datastore}  config.datastore         Object that will perform operations on the datastore
     */
    constructor(config) {
        super('template', config);
    }

    /**
     * Instantiate a Template class
     * @method createClass
     * @param  {Object}     config               Template data
     * @param  {Datastore}  config.datastore     Object that will perform operations on the datastore
     * @param  {String}     config.name          The template name
     * @param  {String}     [config.namespace]   The template namespace
     * @param  {String}     config.version       Version of the template
     * @param  {String}     config.description   Description of the template
     * @param  {String}     config.maintainer    Maintainer's email
     * @param  {Object}     config.config        Config of the screwdriver-template.yaml
     * @param  {String}     config.pipelineId    pipelineId of the template
     * @param  {Array}      [config.labels]      Labels attached to the template
     * @return {Template}
     */
    createClass(config) {
        return new Template(config);
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
     * Parses a full template name and returns template object consisting of
     * actual template name and optionally, namespace
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
        const paginate = {
            page: 1,
            count: 1
        };

        // If fullTemplateName has no '/', don't need to bother to grep for namespace
        if (fullTemplateName.indexOf('/') <= -1) {
            // Check if template with default namespace and name exist, default to using that template
            return super
                .list({
                    params: {
                        namespace: 'default',
                        name: parsedTemplate.name
                    },
                    paginate
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
                    name
                },
                paginate
            })
            .then(namespaceExists => {
                if (namespaceExists.length > 0) {
                    parsedTemplate.namespace = namespace;
                    parsedTemplate.name = name;
                }

                return parsedTemplate;
            });
    }

    /**
     * Create a new template of the correct version (See schema definition)
     * @method create
     * @param  {Object}     config               Config object
     * @param  {Datastore}  config.datastore     Object that will perform operations on the datastore
     * @param  {String}     config.name          The template name
     * @param  {String}     [config.namespace]   The template namespace
     * @param  {String}     config.version       Version of the template
     * @param  {String}     config.description   Description of the template
     * @param  {String}     config.maintainer    Maintainer's email
     * @param  {Object}     config.config        Config of the screwdriver-template.yaml
     * @param  {String}     config.pipelineId    pipelineId of the template
     * @param  {Array}      [config.labels]      Labels attached to the template
     * @return {Promise}
     */
    create(config) {
        const nameObj = parseTemplateConfigName(config);
        const result = hoek.applyToDefaults(config, nameObj);

        return super
            .list({ params: { namespace: config.namespace, name: config.name, latest: true } })
            .then(templates => {
                const latestTemplate = templates[0];

                if (latestTemplate) {
                    latestTemplate.latest = false;

                    return latestTemplate.update().then(() => latestTemplate);
                }

                return null;
            })
            .then(latestTemplate => {
                const [, major, minor] = VERSION_REGEX.exec(config.version);
                const newVersion = minor ? `${major}${minor}.0` : `${major}.0.0`;

                if (!latestTemplate) {
                    result.version = newVersion;
                    result.trusted = false;
                } else {
                    // eslint-disable-next-line max-len
                    const [, latestMajor, latestMinor, latestPatch] = VERSION_REGEX.exec(latestTemplate.version);
                    const patch = parseInt(latestPatch.slice(1), 10) + 1;
                    const newPatch = latestMajor === major && latestMinor === minor;

                    result.version = newPatch ? `${latestMajor}${latestMinor}.${patch}` : newVersion;
                    result.trusted = latestTemplate.trusted || false;
                }

                result.createTime = new Date().toISOString();
                result.latest = true;

                return super.create(result);
            });
    }

    /**
     * List templates with pagination and filter options
     * @method list
     * @param  {Object}   config                  Config object
     * @param  {Object}   config.params           Parameters to filter on
     * @param  {Object}   config.paginate         Pagination parameters
     * @param  {Number}   config.paginate.count   Number of items per page
     * @param  {Number}   config.paginate.page    Specific page of the set to return
     * @return {Promise}
     */
    list(config) {
        if (config.params && config.params.name && !config.params.namespace) {
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
     * List templates and associated metrics with pagination and filter options
     * @method listWithMetrics
     * @param  {Object}   config                  Config object
     * @param  {Object}   config.params           Parameters to filter on
     * @param  {Object}   config.paginate         Pagination parameters
     * @param  {Number}   config.paginate.count   Number of items per page
     * @param  {Number}   config.paginate.page    Specific page of the set to return
     * @return {Promise}
     */
    listWithMetrics(config) {
        return this.list(config).then(templates => {
            if (templates.length === 0) {
                return templates;
            }

            // eslint-disable-next-line global-require
            const JobFactory = require('./jobFactory');
            const jobFactory = JobFactory.getInstance();

            // eslint-disable-next-line global-require
            const BuildFactory = require('./buildFactory');
            const buildFactory = BuildFactory.getInstance();

            const templateIds = templates.map(t => t.id);

            const listConfig = {
                params: { templateId: templateIds },
                readOnly: true,
                aggregationField: 'templateId'
            };

            return Promise.all([jobFactory.list(listConfig), buildFactory.list(listConfig)]).then(([jCount, bCount]) =>
                templates.map(t => {
                    const jobCount = jCount.find(j => j.templateId === t.id);

                    const buildCount = bCount.find(b => b.templateId === t.id);

                    t.metrics = {
                        jobs: {
                            count: jobCount ? jobCount.count : 0
                        },
                        builds: {
                            count: buildCount ? buildCount.count : 0
                        }
                    };

                    return t;
                })
            );
        });
    }

    /**
     * Get a template
     * @method get
     * @param  {Mixed}     config
     * @param  {String}   [config.name]      Template name
     * @param  {String}   [config.namespace] Template namespace
     * @param  {String}   [config.version]   Template version
     * @return {Promise}
     */
    get(config) {
        if (config.name && !config.namespace) {
            // eslint-disable-next-line no-underscore-dangle
            return this._getNameAndNamespace(config.name).then(parsedTemplateName => {
                const { namespace, name } = parsedTemplateName;

                // Always need to pass in namespace since it's a unique key
                config.namespace = namespace || null;
                config.name = name;

                return super.get(config);
            });
        }

        return super.get(config);
    }

    /**
     * Get a the latest template by config using the full template name
     * @method getTemplate
     * @param  {String}     fullTemplateName    Name of the template and the version or tag (e.g. chef/publish@1.2.3)
     * @return {Promise}                        Resolves template model or null if not found
     */
    getTemplate(fullTemplateName) {
        // eslint-disable-next-line max-len, no-underscore-dangle
        const { templateName, versionOrTag, isExactVersion, isVersion } = this.getFullNameAndVersion(fullTemplateName);

        if (isExactVersion) {
            // Get a template using the exact template version
            return this.get({
                name: templateName,
                version: versionOrTag
            });
        }

        // If tag is passed in, get the version from the tag
        if (versionOrTag && !isVersion) {
            // Lazy load factory dependency to prevent circular dependency issues
            // eslint-disable-next-line global-require
            const TemplateTagFactory = require('./templateTagFactory');
            const templateTagFactory = TemplateTagFactory.getInstance();

            // Get a template tag
            return templateTagFactory
                .get({
                    name: templateName,
                    tag: versionOrTag
                })
                .then(templateTag => {
                    // Return null if no template tag exists
                    if (!templateTag) {
                        return null;
                    }

                    // Get a template using the exact template version
                    return this.get({
                        name: templateName,
                        version: templateTag.version
                    });
                });
        }

        // If no version provided, return the most recently published template
        if (!versionOrTag) {
            const listConfig = {
                params: { name: templateName },
                paginate: { page: 1, count: 1 }
            };

            return this.list(listConfig).then(templates => templates[0] || null);
        }

        // Get all templates with the same name
        return this.list({ params: { name: templateName } }).then(templates => {
            // Get templates that have versions beginning with the version given
            const filtered = templates.filter(template =>
                template.version.concat('.').startsWith(versionOrTag.concat('.'))
            );

            // Sort templates by descending order
            filtered.sort((a, b) => compareVersions(b.version, a.version));

            // Return first filtered template or null if none
            return filtered[0] || null;
        });
    }

    /**
     * Get an instance of the TemplateFactory
     * @method getInstance
     * @param  {Object}     config
     * @param  {Datastore}  config.datastore
     * @return {TemplateFactory}
     */
    static getInstance(config) {
        instance = BaseFactory.getInstance(TemplateFactory, instance, config);

        return instance;
    }
}

module.exports = TemplateFactory;
