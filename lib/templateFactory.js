'use strict';

const BaseFactory = require('./baseFactory');
const Template = require('./template');
const compareVersions = require('compare-versions');
const schema = require('screwdriver-data-schema');
let instance;

const TEMPLATE_NAME_REGEX = schema.config.regex.FULL_TEMPLATE_NAME;
const EXACT_VERSION_REGEX = schema.config.regex.EXACT_VERSION;
const VERSION_REGEX = schema.config.regex.VERSION;

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
     * Create a new template of the correct version (See schema definition)
     * @method create
     * @param  {Object}     config               Config object
     * @param  {Datastore}  config.datastore     Object that will perform operations on the datastore
     * @param  {String}     config.name          The template name
     * @param  {String}     config.version       Version of the template
     * @param  {String}     config.description   Description of the template
     * @param  {String}     config.maintainer    Maintainer's email
     * @param  {Object}     config.config        Config of the screwdriver-template.yaml
     * @param  {String}     config.pipelineId    pipelineId of the template
     * @param  {Array}      [config.labels]      Labels attached to the template
     * @return {Promise}
     */
    create(config) {
        const [, major, minor] = VERSION_REGEX.exec(config.version);
        const searchVersion = minor ? `${major}${minor}` : major;

        return this.getTemplate(`${config.name}@${searchVersion}`)
        .then((latest) => {
            if (!latest) {
                config.version = minor ? `${major}${minor}.0` : `${major}.0.0`;
            } else {
                // eslint-disable-next-line max-len
                const [, latestMajor, latestMinor, latestPatch] = VERSION_REGEX.exec(latest.version);
                const patch = parseInt(latestPatch.slice(1), 10) + 1;

                config.version = `${latestMajor}${latestMinor}.${patch}`;
            }

            return super.create(config);
        });
    }

    /**
     * Get a the latest template by config using the full template name
     * @method getTemplate
     * @param  {String}     fullTemplateName    Name of the template and the version or tag (e.g. chef/publish@1.2.3)
     * @return {Promise}                        Resolves template model or null if not found
     */
    getTemplate(fullTemplateName) {
        const [, templateName, versionOrTag] = TEMPLATE_NAME_REGEX.exec(fullTemplateName);
        const isExactVersion = EXACT_VERSION_REGEX.exec(versionOrTag);
        const isVersion = VERSION_REGEX.exec(versionOrTag);

        if (isExactVersion) {
            // Get a template using the exact template version
            return super.get({
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
            return templateTagFactory.get({
                name: templateName,
                tag: versionOrTag
            })
            .then((templateTag) => {
                // Return null if no template tag exists
                if (!templateTag) {
                    return null;
                }

                // Get a template using the exact template version
                return super.get({
                    name: templateName,
                    version: templateTag.version
                });
            });
        }

        // Get all templates with the same name
        return super.list({ params: { name: templateName } })
            .then((templates) => {
                // If no version provided, return the most recently published template
                if (!versionOrTag) {
                    return templates[0];
                }

                // Get templates that have versions beginning with the version given
                const filtered = templates.filter(template =>
                    template.version.startsWith(versionOrTag));

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
