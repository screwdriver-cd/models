'use strict';

const TemplateTagFactory = require('./templateTagFactory');

class PipelineTemplateTagFactory extends TemplateTagFactory {
    _getTemplateType() {
        return 'PIPELINE';
    }
}

module.exports = PipelineTemplateTagFactory;
