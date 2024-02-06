'use strict';

const BaseFactory = require('./baseFactory');
const TemplateTagFactory = require('./templateTagFactory');

let instance;

class JobTemplateTagFactory extends TemplateTagFactory {
    /**
     * Get the template type
     * @returns {string}
     */
    _getTemplateType() {
        return 'JOB';
    }

    /**
     * Get an instance of the JobTemplateTagFactory
     * @method getInstance
     * @param  {Object}     config
     * @param  {Datastore}  config.datastore
     * @return {JobTemplateTagFactory}
     */
    static getInstance(config) {
        instance = BaseFactory.getInstance(JobTemplateTagFactory, instance, config);

        return instance;
    }
}

module.exports = JobTemplateTagFactory;
