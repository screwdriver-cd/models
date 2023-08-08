'use strict';

const BaseFactory = require('./baseFactory');
const TemplateMetaFactory = require('./templateMetaFactory');
let instance;

class PipelineTemplateFactory extends TemplateMetaFactory {
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
