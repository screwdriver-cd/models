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
     * @param  {String}   config.scmContext     The scm context to which user belongs
     * @param  {String}   config.createTime     The time the pipeline was created
     */
    constructor(config) {
        super('pipeline', config);
        this.scmContext = config.scmContext;
    }

    /**
     * Get the screwdriver configuration for the pipeline at the given ref
     * @method getConfiguration
     * @param  {String}  [ref]   Reference to the branch or PR
     * @return {Promise}         Resolves to parsed and flattened configuration
     */
    getConfiguration(ref) {
        // Lazy load factory dependency to prevent circular dependency issues
        // https://nodejs.org/api/modules.html#modules_cycles
        /* eslint-disable global-require */
        const TemplateFactory = require('./templateFactory');
        /* eslint-enable global-require */

        const templateFactory = TemplateFactory.getInstance();

        return this.admin.then(user => user.unsealToken())
            // fetch the screwdriver.yaml file
            .then((token) => {
                const config = {
                    scmUri: this.scmUri,
                    scmContext: this.scmContext,
                    path: 'screwdriver.yaml',
                    token
                };

                if (ref) {
                    config.ref = ref;
                }

                return this.scm.getFile(config)
                    .catch(() => '');
            })
            // parse the content of the yaml file
            .then(config => parser(config, templateFactory));
    }

    /**
     * Get a list of PR jobs to create or update
     * @method _checkPRState
     * @param  {Array}    existingJobs      List pipeline's existing jobs
     * @param  {Array}    openedPRs         List of opened PRs coming from SCM
     * @return {Promise}                    Resolves to the list of jobs to archive, unarchive and create
     * Note: toArchive and toUnarchive is an array of job objects; toCreate is an array of objects with name and ref.
     */
    _checkPRState(existingJobs, openedPRs) {
        const jobList = {
            toCreate: [],
            toArchive: [],
            toUnarchive: []
        };
        const existingPRs = existingJobs.filter(j => j.isPR());   // list of PRs according to SD
        const existingPRsNames = existingPRs.map(j => j.name);
        const openedPRsNames = openedPRs.map(j => j.name);
        const openedPRsRef = openedPRs.map(j => j.ref);

        existingPRs.forEach((job) => {
            // if PR is closed, add it to archive list
            if (openedPRsNames.indexOf(job.name) < 0 && job.archived === false) {
                jobList.toArchive.push(job);
            }
        });

        openedPRsNames.forEach((name, i) => {
            const index = existingPRsNames.indexOf(name);

            if (index < 0) {
                // if opened PR is not in the list of existingPRs, create it
                jobList.toCreate.push({ name, ref: openedPRsRef[i] });
            } else {
                const job = existingPRs[index];

                // if opened PR was previously archived, unarchive it
                if (job.archived) {
                    jobList.toUnarchive.push(existingPRs[index]);
                }
            }
        });

        return jobList;
    }

    /**
     * Go through the job list and archive/unarchive it
     * @method _updateJobArchive
     * @param  {Array}        jobList     List of job objects
     * @param  {boolean}      archived    Archived value to update to
     * @return {Promise}
     */
    _updateJobArchive(jobList, archived) {
        const jobsToUpdate = [];

        jobList.forEach((j) => {
            j.archived = archived;
            jobsToUpdate.push(j.update());
        });

        return Promise.all(jobsToUpdate);
    }

    /**
     * Go through the list of job names and create it
     * @method _createJob
     * @param  {Array}      jobList         Array of job names and refs
     * @param  {Number}     pipelineId      Pipeline id that the job belongs to
     * @return {Promise}
     */
    _createJob(jobList) {
        // Lazy load factory dependency to prevent circular dependency issues
        // https://nodejs.org/api/modules.html#modules_cycles
        /* eslint-disable global-require */
        const JobFactory = require('./jobFactory');
        /* eslint-enable global-require */

        const factory = JobFactory.getInstance();

        const jobsToCreate = jobList.map(j =>
            this.getConfiguration(j.ref).then((config) => {
                const jobConfig = {
                    pipelineId: this.id,
                    name: j.name,
                    permutations: config.jobs.main
                };

                return factory.create(jobConfig);
            }));

        return Promise.all(jobsToCreate);
    }

    /**
     * Attach Screwdriver webhook to the pipeline's repository
     * @param   {String}    webhookUrl    The webhook to be added
     * @method  addWebhook
     * @return  {Promise}
     */
    addWebhook(webhookUrl) {
        return this.token.then(token =>
            this.scm.addWebhook({
                scmUri: this.scmUri,
                scmContext: this.scmContext,
                token,
                webhookUrl
            })
      );
    }

    /**
     * Sync the pull requests by checking against SCM
     * Create or update PR jobs if necessary
     * @method syncPRs
     * @return {Promise}
     */
    syncPRs() {
        /* eslint-disable no-underscore-dangle */
        return this.token.then(token =>
            Promise.all([
                this.jobs,
                this.scm.getOpenedPRs({
                    scmUri: this.scmUri,
                    scmContext: this.scmContext,
                    token
                })
            ]).then(([existingJobs, openedPRs]) => {
                const jobList = this._checkPRState(existingJobs, openedPRs);

                return Promise.all([
                    this._createJob(jobList.toCreate),
                    this._updateJobArchive(jobList.toArchive, true),
                    this._updateJobArchive(jobList.toUnarchive, false)
                ]);
            }));
          /* eslint-enable no-understore-dangle */
    }

    /**
     * Sync PR by looking up the PR's screwdriver.yaml
     * Update the permutations to be correct
     * @param   {Integer}   prNum        PR Number
     * @method syncPR
     * @return {Promise}
     */
    syncPR(prNum) {
        // Lazy load factory dependency to prevent circular dependency issues
        // https://nodejs.org/api/modules.html#modules_cycles
        /* eslint-disable global-require */
        const JobFactory = require('./jobFactory');
        /* eslint-enable global-require */

        const jobFactory = JobFactory.getInstance();

        return this.admin
            .then(user => user.unsealToken())
            .then(token => this.scm.getPrInfo({
                scmUri: this.scmUri,
                scmContext: this.scmContext,
                token,
                prNum
            }))
            .then(prInfo => Promise.all([
                this.getConfiguration(prInfo.ref),
                jobFactory.get({ pipelineId: this.id, name: `PR-${prNum}` })
            ]))
            .then(([parsedConfig, job]) => {
                job.permutations = parsedConfig.jobs.main;

                return job.update();
            })
            .then(() => this);
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
                this.workflowGraph = parsedConfig.workflowGraph;
                this.annotations = parsedConfig.annotations;

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

        const admin = factory.get({
            username: Object.keys(this.admins)[0],
            scmContext: this.scmContext
        });

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
     * Get the token of the pipeline admin
     * @property token
     * @return {Promise} Resolves the admin's token
     */
    get token() {
        return this.admin.then(admin => admin.unsealToken());
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
     * @param  {String}   [config.type]             Type of jobs (pr or pipeline)
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

        if (listConfig.type) {
            delete listConfig.type;
        }

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

                if (config && config.type === 'pr') {
                    return prJobs;
                }
                if (config && config.type === 'pipeline') {
                    return workflowJobs;
                }

                return workflowJobs.concat(prJobs);
            });
    }

    /**
     * Fetch events belong to a pipeline.
     * @param  {Object}   [config]                              Configuration object
     * @param  {Number}   [config.sort]                         Sort rangekey by ascending or descending
     * @param  {Number}   [config.params.type = 'pipeline']     Get pipeline or pr events
     * @return {Promise}  Resolves to an array of events
     */
    getEvents(config) {
        const defaultConfig = {
            params: {
                pipelineId: this.id,
                type: 'pipeline'
            },
            sort: 'descending',
            paginate: {
                count: PAGINATE_COUNT,
                page: PAGINATE_PAGE
            }
        };

        const listConfig = config ? hoek.applyToDefaults(defaultConfig, config) : defaultConfig;

        // Lazy load factory dependency to prevent circular dependency issues
        // https://nodejs.org/api/modules.html#modules_cycles
        /* eslint-disable global-require */
        const EventFactory = require('./eventFactory');
        /* eslint-enable global-require */
        const factory = EventFactory.getInstance();

        return factory.list(listConfig);
    }

    /**
     * Update the repository and branch
     * @method update
     * @return {Promise}
     */
    update() {
        if (this.isDirty('scmUri')) {
            // Lazy load factory dependency to prevent circular dependency issues
            // https://nodejs.org/api/modules.html#modules_cycles
            /* eslint-disable global-require */
            const UserFactory = require('./userFactory');
            /* eslint-enable global-require */

            const userFactory = UserFactory.getInstance();

            return userFactory.get({
                username: Object.keys(this.admins)[0],
                scmContext: this.scmContext
            })
            .then(user => user.unsealToken())
            .then(token => this.scm.decorateUrl({
                scmUri: this.scmUri,
                scmContext: this.scmContext,
                token
            }))
            .then((scmRepo) => {
                this.scmRepo = scmRepo;

                return super.update();
            });
        }

        return super.update();
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

        const removeEvents = (type =>
            this.getEvents({
                params: {
                    type
                }
            })
            .then((events) => {
                if (events.length === 0) {
                    return null;
                }

                return Promise.all(events.map(event => event.remove()))
                    .then(() => removeEvents(type));
            }));

        return this.secrets
            .then(secrets => Promise.all(secrets.map(secret => secret.remove())))   // remove secrets
            .then(() => removeJobs(true))       // remove archived jobs
            .then(() => removeJobs(false))      // remove non-archived jobs
            .then(() => removeEvents('pipeline')) // remove pipeline events
            .then(() => removeEvents('pr'))       // remove pr events
            .then(() => super.remove());        // remove pipeline
    }
}

module.exports = PipelineModel;
