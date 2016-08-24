/* eslint no-param-reassign: ["error", { "props": false }] */
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
     * Sync the pipeline by looking up screwdriver.yaml
     * Create, update, or disable jobs if necessary.
     * @method sync
     * @return {Promise}
     */
    sync() {
        // Lazy load factory dependency to prevent circular dependency issues
        // https://nodejs.org/api/modules.html#modules_cycles
        /* eslint-disable global-require */
        const JobFactory = require('./jobFactory');
        /* eslint-enable global-require */

        const factory = JobFactory.getInstance();

        // get the pipeline configuration
        return this.getConfiguration()
            // get list of jobs to create
            .then(parsedConfig =>
                this.jobs.then(existingJobs => {
                    const jobsToSync = [];
                    const jobsProcessed = [];
                    const parsedConfigJobNames = Object.keys(parsedConfig.jobs);

                    // Loop through all existing jobs
                    existingJobs.forEach(job => {
                        // if it's in the yaml, update it
                        if (parsedConfigJobNames.includes(job.name)) {
                            job.permutations = parsedConfig.jobs[job.name];
                            jobsToSync.push(job.update());
                        // if it's not in the yaml, disable it
                        } else if (!job.isPR()) {
                            job.state = 'DISABLED';
                            jobsToSync.push(job.update());
                        }
                        // if it's a PR, leave it alone
                        jobsProcessed.push(job.name);
                    });

                    // Loop through all defined jobs in the yaml
                    Object.keys(parsedConfig.jobs).forEach(jobName => {
                        const jobConfig = {
                            pipelineId: this.id,
                            name: jobName,
                            permutations: parsedConfig.jobs[jobName]
                        };

                        // If the job has not been processed, create it
                        if (!jobsProcessed.includes(jobName)) {
                            jobsToSync.push(factory.create(jobConfig));
                        }
                    });

                    return jobsToSync;
                }))
            // wait until all promises have resolved
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

    /**
     * Get the screwdriver configuration for the pipeline at the given ref
     * @method getConfiguration
     * @param  {String}  [ref=scmUrl]   Reference to the repo
     * @return {Promise}                Resolves to parsed and flattened configuration
     */
    getConfiguration(ref) {
        const url = ref || this.scmUrl;

        return this.admin.then(user => user.unsealToken())
            // fetch the screwdriver.yaml file
            .then(token =>
                this.scm.getFile({
                    scmUrl: url,
                    path: 'screwdriver.yaml',
                    token
                })
            )
            // parse the content of the yaml file
            .then(content => nodeify(parser, content));
    }
}

module.exports = PipelineModel;
