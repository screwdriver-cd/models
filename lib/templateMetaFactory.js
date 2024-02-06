'use strict';

const BaseFactory = require('./baseFactory');
const TemplateMeta = require('./templateMeta');

class TemplateMetaFactory extends BaseFactory {
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
     * @returns {TemplateMeta}
     */
    createClass(config) {
        return new TemplateMeta(config);
    }

    /**
     * Create pipeline template meta
     * @method list
     * @param  {Object}   config                  Config object for template meta
     * @param  {Object}   config.pipelineId       Identifier of the pipeline that is publishing the template
     * @return {Promise}                          Resolve pipeline template meta
     */
    create(config) {
        config.templateType = this.getTemplateType();

        return super.create(config);
    }

    /**
     * Get pipeline template meta
     * @method list
     * @param  {Object}   config                  Config object for template meta
     * @return {Promise}                          Resolve pipeline template meta
     */
    get(config) {
        config.templateType = this.getTemplateType();

        return super.get(config);
    }

    /**
     * List all pipeline template meta
     * @method list
     * @param  {Object}   config                  Config object for template meta
     * @param  {Object}   config.params           Parameters to filter on
     * @return {Promise}                          Resolve pipeline template meta list
     */
    list(config) {
        if (!config.params) {
            config.params = {};
        }
        config.params.templateType = this.getTemplateType();

        return super.list(config);
    }

    /**
     * Gets the template type
     * @returns {string}
     */
    getTemplateType() {
        return this._getTemplateType();
    }

    _getTemplateType() {
        throw new Error('Not implemented');
    }
}

module.exports = TemplateMetaFactory;
