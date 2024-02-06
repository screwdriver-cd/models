'use strict';

const BaseFactory = require('./baseFactory');
const TemplateTagFactory = require('./templateTagFactory');

let instance;

class PipelineTemplateTagFactory extends TemplateTagFactory {
    /**
     * Get the template type
     * @returns {string}
     */
    _getTemplateType() {
        return 'PIPELINE';
    }

    /**
     * Get an instance of the PipelineTemplateTagFactory
     * @method getInstance
     * @param  {Object}     config
     * @param  {Datastore}  config.datastore
     * @return {PipelineTemplateTagFactory}
     */
    static getInstance(config) {
        instance = BaseFactory.getInstance(PipelineTemplateTagFactory, instance, config);

        return instance;
    }
}

module.exports = PipelineTemplateTagFactory;
