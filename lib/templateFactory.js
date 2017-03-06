'use strict';

const BaseFactory = require('./baseFactory');
const Template = require('./template');
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
