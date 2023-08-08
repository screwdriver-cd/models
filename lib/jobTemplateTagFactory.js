'use strict';

const TemplateTagFactory = require('./templateTagFactory');

class JobTemplateTagFactory extends TemplateTagFactory {
    _getTemplateType() {
        return 'JOB';
    }
}

module.exports = JobTemplateTagFactory;
