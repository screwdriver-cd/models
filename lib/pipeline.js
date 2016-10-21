/* eslint no-param-reassign: ["error", { "props": false }] */

'use strict';

const BaseModel = require('./base');
const parser = require('screwdriver-config-parser');
const hoek = require('hoek');
const PAGINATE_PAGE = 1;
const PAGINATE_COUNT = 50;

class PipelineModel extends BaseModel {
    /**
     * Construct a PipelineModel object
     * @method constructor
     * @param  {Object}   config                Config object to create the pipeline with
     * @param  {Object}   config.datastore      Object that will perform operations on the datastore
     * @param  {Object}   config.admins         The admins of this repository
     * @param  {String}   config.scmUri         The scmUri for the application
     * @param  {String}   config.createTime     The time the pipeline was created
     */
    constructor(config) {
        super('pipeline', config);
    }

    /**
     * Get the screwdriver configuration for the pipeline at the given ref
     * @method getConfiguration
     * @param  {String}  [ref]   Reference to the branch or PR
     * @return {Promise}         Resolves to parsed and flattened configuration
     */
    getConfiguration(ref) {
        return this.admin.then(user => user.unsealToken())
            // fetch the screwdriver.yaml file
            .then((token) => {
                const config = {
                    scmUri: this.scmUri,
                    path: 'screwdriver.yaml',
                    token
                };

                if (ref) {
                    config.ref = ref;
                }

                return this.scm.getFile(config);
            })
            // parse the content of the yaml file
            .then(parser);
    }

    /**
     * Sync the pipeline by looking up screwdriver.yaml
     * Create, update, or disable jobs if necessary.
     * Store/update the pipeline workflow
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
            .then((parsedConfig) => {
                this.workflow = parsedConfig.workflow;

                return this.update()
                    .then(() => this.jobs)
                    // update job list
                    .then((existingJobs) => {
                        const jobsToSync = [];
                        const jobsProcessed = [];
                        const parsedConfigJobNames = Object.keys(parsedConfig.jobs);

                        // Loop through all existing jobs
                        existingJobs.forEach((job) => {
                            // if it's in the yaml, update it
                            if (parsedConfigJobNames.includes(job.name)) {
                                job.permutations = parsedConfig.jobs[job.name];
                                job.archived = false;
                                jobsToSync.push(job.update());
                            // if it's not in the yaml and archive it
                            } else if (!job.isPR()) {
                                job.archived = true;
                                jobsToSync.push(job.update());
                            }
                            // if it's a PR, leave it alone
                            jobsProcessed.push(job.name);
                        });

                        // Loop through all defined jobs in the yaml
                        Object.keys(parsedConfig.jobs).forEach((jobName) => {
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
                    });
            })
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
                count: PAGINATE_COUNT,
                page: PAGINATE_PAGE
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
     * Fetch all secrets that belong to this pipeline
     * @property secrets
     * @return Promise
    */
    get secrets() {
        const listConfig = {
            params: {
                pipelineId: this.id
            },
            paginate: {
                count: PAGINATE_COUNT,
                page: PAGINATE_PAGE
            }
        };

        // Lazy load factory dependency to prevent circular dependency issues
        // https://nodejs.org/api/modules.html#modules_cycles
        /* eslint-disable global-require */
        const SecretFactory = require('./secretFactory');
        /* eslint-enable global-require */
        const factory = SecretFactory.getInstance();

        const secrets = factory.list(listConfig);

        // ES6 has weird getters and setters in classes,
        // so we redefine the pipeline property here to resolve to the
        // resulting promise and not try to recreate the factory, etc.
        Object.defineProperty(this, 'secrets', {
            enumerable: true,
            value: secrets
        });

        return secrets;
    }

    /**
     * Fetch jobs belong to a pipeline.
     * By default, only fetch active jobs. Sorted by workflow order, followed by PR jobs
     * @param  {Object}   [config]                  Configuration object
     * @param  {Object}   [config.params]           Filter params
     * @param  {Boolean}  [config.params.archived]  Get archived/non-archived jobs
     * @param  {Object}   [config.paginate]         Pagination parameters
     * @param  {Number}   [config.paginate.count]   Number of items per page
     * @param  {Number}   [config.paginate.page]    Specific page of the set to return
     * @return {Promise}  Resolves to an array of jobs
     */
    getJobs(config) {
        const defaultConfig = {
            params: {
                pipelineId: this.id,
                archived: false
            },
            paginate: {
                count: PAGINATE_COUNT,
                page: PAGINATE_PAGE
            }
        };

        const listConfig = (config) ? hoek.applyToDefaults(defaultConfig, config) : defaultConfig;

        // Lazy load factory dependency to prevent circular dependency issues
        // https://nodejs.org/api/modules.html#modules_cycles
        /* eslint-disable global-require */
        const JobFactory = require('./jobFactory');
        /* eslint-enable global-require */
        const factory = JobFactory.getInstance();

        const workflow = this.workflow;

        return factory.list(listConfig)
            .then((jobs) => {
                // If archived is true, don't sort and just return jobs
                if (listConfig.params.archived) {
                    return jobs;
                }

                // If archived is false, sort by workflow then PR jobs
                // get jobs in the workflow
                let workflowJobs = jobs.filter(job => workflow.includes(job.name));

                // sort them by the order that they appear in workflow
                workflowJobs = workflowJobs.sort((job1, job2) =>
                    workflow.indexOf(job1.name) - workflow.indexOf(job2.name));

                // get PR jobs
                let prJobs = jobs.filter(job => job.isPR());

                // sort them by pr number
                prJobs = prJobs.sort((job1, job2) => job1.prNum - job2.prNum);

                return workflowJobs.concat(prJobs);
            });
    }

    /**
     * Remove all jobs & builds associated with this pipeline and the pipeline itself
     * @return {Promise}        Resolves to null if remove successfully
     */
    remove() {
        const removeJobs = (archived =>
            this.getJobs({
                params: {
                    archived
                }
            }).then((jobs) => {
                if (jobs.length === 0) {
                    return null;
                }

                return Promise.all(jobs.map(job => job.remove()))
                    .then(() => removeJobs(archived));
            }));

        return this.secrets
            .then(secrets => Promise.all(secrets.map(secret => secret.remove())))   // remove secrets
            .then(() => removeJobs(true))       // remove archived jobs
            .then(() => removeJobs(false))      // remove non-archived jobs
            .then(() => super.remove());        // remove pipeline
    }
}

module.exports = PipelineModel;
