'use strict';

const TemplateMetaFactory = require('./templateMetaFactory');

class PipelineTemplateFactory extends TemplateMetaFactory {
    constructor(config) {
        super('pipelineTemplate', config);
    }

    _getTemplateType() {
        return 'PIPELINE';
    }
}

module.exports = PipelineTemplateFactory;
