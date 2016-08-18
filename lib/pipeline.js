'use strict';
const BaseModel = require('./base');
const parser = require('screwdriver-config-parser');
const nodeify = require('./nodeify');

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
    // TODO: update existing jobs, delete unneeded jobs
    sync() {
        // Lazy load factory dependency to prevent circular dependency issues
        // https://nodejs.org/api/modules.html#modules_cycles
        /* eslint-disable global-require */
        const JobFactory = require('./jobFactory');
        /* eslint-enable global-require */

        const factory = JobFactory.getInstance();

        // get the admin user that has access to read the file, then get their unsealed git token
        return this.admin.then(user => user.unsealToken)
            // fetch the screwdriver.yaml file
            .then(token =>
                this.scm.getFile({
                    scmUrl: this.scmUrl,
                    path: 'screwdriver.yaml',
                    token
                })
            )
            // parse the content of the yaml file
            .then(content => nodeify(parser, content))
            // get list of jobs to create
            .then(parsedConfig => {
                const jobsToCreate = [];

                // Loop through all defined jobs
                Object.keys(parsedConfig.jobs).forEach(jobName => {
                    const jobConfig = {
                        pipelineId: this.id,
                        name: jobName,
                        containers: parsedConfig.jobs[jobName].map(j => j.image)
                    };

                    // add a method to create job
                    jobsToCreate.push(factory.create(jobConfig));
                });

                return jobsToCreate;
            })
            // Wait until all job.create promises have resolved
            .then(jobs => Promise.all(jobs))
            // return the pipeline
            .then(() => this);
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

    /**
     * Fetch all jobs that belong to this pipeline
     * @property jobs
     * @return Promise
    */
    get jobs() {
        const listConfig = {
            params: {
                pipelineId: this.id
            },
            paginate: {
                count: 25, // This limit is set by the matrix restriction
                page: 1
            }
        };

        // Lazy load factory dependency to prevent circular dependency issues
        // https://nodejs.org/api/modules.html#modules_cycles
        /* eslint-disable global-require */
        const JobFactory = require('./jobFactory');
        /* eslint-enable global-require */
        const factory = JobFactory.getInstance();

        const jobs = factory.list(listConfig);

        // ES6 has weird getters and setters in classes,
        // so we redefine the pipeline property here to resolve to the
        // resulting promise and not try to recreate the factory, etc.
        Object.defineProperty(this, 'jobs', {
            enumerable: true,
            value: jobs
        });

        return jobs;
    }
}

module.exports = PipelineModel;
