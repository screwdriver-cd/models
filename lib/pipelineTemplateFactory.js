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
