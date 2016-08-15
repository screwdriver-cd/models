'use strict';
const BaseModel = require('./base');

class PipelineModel extends BaseModel {
    /**
     * Construct a PipelineModel object
     * @method constructor
     * @param  {Object}   config                Config object to create the pipeline with
     * @param  {Object}   config.datastore      Object that will perform operations on the datastore
     * @param  {Object}   config.admins         The admins of this repository
     * @param  {String}   config.scmUrl         The scmUrl for the application
     * @param  {String}   config.createTime     The time the pipeline was created
     * @param  {String}   config.configUrl      The configUrl for the application
     */
    constructor(config) {
        super('pipeline', config);
    }

    /**
     * Sync the pipeline by looking up what is currently in yaml and create or delete
     * jobs if necessary. Right now, this simply creates the job 'main'.
     * @method sync
     * @return {Promise}
     */
    // TODO: make this so that it looks up the yaml & create/delete jobs if necessary
    sync() {
        // Lazy load factory dependency to prevent circular dependency issues
        // https://nodejs.org/api/modules.html#modules_cycles
        /* eslint-disable global-require */
        const JobFactory = require('./jobFactory');
        /* eslint-enable global-require */

        const factory = JobFactory.getInstance();
        const jobConfig = {
            pipelineId: this.id,
            name: 'main'
        };

        return factory.create(jobConfig);
    }

    /**
     * Fetch the build admin
     * @property admin
     * @return Promise
    */
    // TODO: Get the first admin. Validate if it's valid. If not, remove from admins field,
    //       and retry with the next admin.
    get admin() {
        delete this.admin;

        // Lazy load factory dependency to prevent circular dependency issues
        // https://nodejs.org/api/modules.html#modules_cycles
        /* eslint-disable global-require */
        const UserFactory = require('./userFactory');
        /* eslint-enable global-require */
        const factory = UserFactory.getInstance();

        const admin = factory.get({ username: Object.keys(this.admins)[0] });

        // ES6 has weird getters and setters in classes,
        // so we redefine the pipeline property here to resolve to the
        // resulting promise and not try to recreate the factory, etc.
        Object.defineProperty(this, 'admin', {
            enumerable: true,
            value: admin
        });

        return admin;
    }
}

module.exports = PipelineModel;
