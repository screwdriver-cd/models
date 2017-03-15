'use strict';

const BaseFactory = require('./baseFactory');
const Template = require('./template');
const compareVersions = require('compare-versions');
let instance;

class TemplateFactory extends BaseFactory {
    /**
     * Construct a JobFactory object
     * @method constructor
     * @param  {Object}    config
     * @param  {Datastore}    config.datastore         Object that will perform operations on the datastore
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
     * @param  {String}     config.scmUri        ScmUri of the template pipeline
     * @param  {Array}      [config.labels]        Labels attached to the template
     * @return {Job}
     */
    createClass(config) {
        return new Template(config);
    }

    /**
     * Create a new template (See schema definition)
     * @method create
     * @param  {Object}     config               Config object
     * @param  {Datastore}  config.datastore     Object that will perform operations on the datastore
     * @param  {String}     config.name          The template name
     * @param  {String}     config.version       Version of the template
     * @param  {String}     config.description   Description of the template
     * @param  {String}     config.maintainer    Maintainer's email
     * @param  {Object}     config.config        Config of the screwdriver-template.yaml
     * @param  {String}     config.scmUri        ScmUri of the template pipeline
     * @param  {Array}      [config.labels]        Labels attached to the template
     * @return {Promise}
     */
    create(config) {
        return super.create(config);
    }

    /**
     * Get a the latest template by config
     * @method getTemplate
     * @param  {Object}     config               Config object
     * @param  {String}     config.name          The template name
     * @param  {String}     config.version       Version of the template
     * @param  {String}     [config.label]       Label of template
     * @return {Promise}                         Resolves template model or undefined if not found
     */
    getTemplate(config) {
        // get all templates with the same name
        return super.list({ name: config.name })
            .then((templates) => {
                // get templates that have version prefix as config.version
                const filtered = templates.filter(template =>
                    template.version.startsWith(config.version));

                // Sort templates by descending order
                filtered.sort((a, b) => compareVersions(b.version, a.version));

                // If no config.label, return latest one
                if (filtered.length > 0 && !config.label) {
                    return filtered[0];
                }

                // Loop through filtered to find the first match for config.label
                return filtered.find(template => template.labels.includes(config.label));
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
