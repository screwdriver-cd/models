'use strict';

const TemplateMetaFactory = require('./templateMetaFactory');
const BaseFactory = require('./baseFactory');

let instance;

class PipelineTemplateFactory extends TemplateMetaFactory {
    /**
     * Get the template type
     * @returns {string}
     */
    _getTemplateType() {
        return 'PIPELINE';
    }

    /**
     * List pipeline templates
     * @method list
     * @param  {Object}   config                  Config object
     * @param  {Object}   config.params           Parameters to filter on
     * @return {Promise}                          Resolve pipeline template meta
     */
    async list(config) {
        if (config.params) {
            config.params.templateType = this._getTemplateType();
        }

        return super.list(config);
    }

    /**
     * Get an instance of the PipelineTemplateFactory
     * @method getInstance
     * @param  {Object}     config
     * @param  {Datastore}  config.datastore
     * @return {PipelineTemplateFactory}
     */
    static getInstance(config) {
        instance = BaseFactory.getInstance(PipelineTemplateFactory, instance, config);

        return instance;
    }
}

module.exports = PipelineTemplateFactory;
