'use strict';

const BaseModel = require('./base');
const hoek = require('hoek');
const getAnnotations = require('./helper').getAnnotations;
const START_INDEX = 3;
const executor = Symbol('executor');
const tokenGen = Symbol('tokenGen');
const apiUri = Symbol('apiUri');

class Job extends BaseModel {
    /**
     * Constructs a Job Model
     * @method constructor
     * @param  {Object}     config
     * @param  {Datastore}  config.datastore    Datastore instance
     * @param  {Object}     config.executor     Object that will perform executor operations
     * @param  {String}     config.tokenGen     Generator for tokens
     * @param  {String}     config.apiUri       URI back to the API
     * See model schema
     * @constructor
     */
    constructor(config) {
        super('job', config);
        this[executor] = config.executor;
        this[tokenGen] = config.tokenGen;
        this[apiUri] = config.apiUri;
    }

    /**
     * Lazy load a pipeline model
     * @property pipeline
     * @return {Promise}    Resolves to a pipeline
     */
    get pipeline() {
        // Lazy load factory dependency to prevent circular dependency issues
        // https://nodejs.org/api/modules.html#modules_cycles
        /* eslint-disable global-require */
        const PipelineFactory = require('./pipelineFactory');
        /* eslint-enable global-require */

        delete this.pipeline;
        const factory = PipelineFactory.getInstance();
        const pipeline = factory.get(this.pipelineId);

        // ES6 has weird getters and setters in classes,
        // so we redefine the pipeline property here to resolve to the
        // resulting promise and not try to recreate the factory, etc.
        Object.defineProperty(this, 'pipeline', {
            enumerable: true,
            value: pipeline
        });

        return pipeline;
    }

    /**
     * Lazy load the list of secrets
     * @property secrets
     * @return {Promise}    Resolves to a list of secrets
     */
    get secrets() {
        delete this.secrets;

        const secretNames = hoek.reach(this.permutations, '0.secrets', { default: [] });
        const secretList = this.pipeline.then((pipeline) => {
            if (!pipeline) {
                throw new Error('Pipeline does not exist');
            }

            return pipeline.secrets.then(secrets =>
                secrets.filter(secret =>
                    // Only allow secrets that are called in the config AND are allowed (if a PR)
                    secretNames.includes(secret.name) && (secret.allowInPR || !this.isPR()))
            );
        });

        // ES6 has weird getters and setters in classes,
        // so we redefine the pipeline property here to resolve to the
        // resulting promise and not try to recreate the factory, etc.
        Object.defineProperty(this, 'secrets', {
            enumerable: true,
            value: secretList
        });

        return secretList;
    }

    /**
     * Return true if job is a PR job
     * @return {Boolean}
     */
    isPR() {
        return /^PR-/.test(this.name);
    }

    /**
     * Return PR number. Returns null if this is not a PR job
     * @return {Number}     PR number
     */
    get prNum() {
        return this.isPR() ? parseInt(this.name.slice(START_INDEX), 10) : null;
    }

    /**
     * Return builds that belong to this job
     * @param  {Object}   [config]                  Configuration object
     * @param  {String}   [config.sort]             Ascending or descending
     * @param  {Object}   [config.paginate]         Pagination parameters
     * @param  {Number}   [config.paginate.count]   Number of items per page
     * @param  {Number}   [config.paginate.page]    Specific page of the set to return
     * @param  {String}   [config.status]           List only builds with this status
     * @param  {String}   [config.startTime]        Search for builds created after this startTime
    * @param  {String}    [config.endTime]          Search for builds created before this endTime
     * @return {Promise}                            List of builds
     */
    getBuilds(config = {}) {
        const { sort, status, paginate, startTime, endTime } = config;
        const defaultConfig = {
            params: {
                jobId: this.id
            },
            sort: sort ? sort.toLowerCase() : 'descending' // Sort by primary sort key
        };

        const listConfig = hoek.applyToDefaults(defaultConfig, {
            paginate,
            startTime,
            endTime
        });

        if (status) {
            listConfig.params.status = status;
        }

        // Lazy load factory dependency to prevent circular dependency issues
        // https://nodejs.org/api/modules.html#modules_cycles
        /* eslint-disable global-require */
        const BuildFactory = require('./buildFactory');
        /* eslint-enable global-require */
        const factory = BuildFactory.getInstance();

        return factory.list(listConfig);
    }

    /**
     * Return all running builds that belong to this job
     * @return {Promise}        List of running builds
     */
    getRunningBuilds() {
        return Promise.all([
            this.getBuilds({ status: 'RUNNING' }),
            this.getBuilds({ status: 'QUEUED' })
        ]).then(([runningBuilds, queuedBuilds]) => [...runningBuilds, ...queuedBuilds]);
    }

    /**
     * Return the last successful build that belong to this job
     * @return {Promise}        Resolves to the last successful build of this job
     */
    getLastSuccessfulBuild() {
        return this.getBuilds({ status: 'SUCCESS' })
            .then(successfulBuilds => successfulBuilds[0]);
    }

    /**
     * Update a job
     * @method update
     * @return {Promise}
     */
    update() {
        // Lazy load factory dependency to prevent circular dependency issues
        // https://nodejs.org/api/modules.html#modules_cycles
        /* eslint-disable global-require */
        const PipelineFactory = require('./pipelineFactory');
        /* eslint-enable global-require */
        const pipelineFactory = PipelineFactory.getInstance();

        return super.update()
            .then(newJob => pipelineFactory.get(newJob.pipelineId)
                .then(pipeline => this[executor].startPeriodic({
                    pipeline,
                    job: newJob,
                    tokenGen: this[tokenGen],
                    apiUri: this[apiUri],
                    isUpdate: true
                }))
                .then(() => this));
    }

    /**
     * Remove all builds associated with this job and the job itself
     * @return {Promise}        Resolves to null if remove successfully
     */
    remove() {
        const removeBuilds = (() =>
            // Iterate through the builds and remove them
            this.getBuilds().then((builds) => {
                if (builds.length === 0) {
                    // Done removing builds
                    return null;
                }

                return Promise.all(builds.map((build) => {
                    this[executor].stop({ buildId: build.id });

                    return build.remove();
                }))
                    .then(() => removeBuilds());
            }));

        // Remove builds
        return removeBuilds()
            .then(() => {
                // Remove periodic job
                if (getAnnotations(this.permutations[0], 'screwdriver.cd/buildPeriodically')) {
                    return this[executor].stopPeriodic({ jobId: this.id });
                }

                return null;
            })
            .then(() => super.remove());
    }

    /**
     * getMetrics for this job
     * @method getMetrics
     * @param  {Object}   [config]              Configuration object
     * @param  {String}   [config.startTime]    Look at builds created after this startTime
     * @param  {String}   [config.endTime]      Look at builds created before this endTime
     * @return {Promise}  Resolves to array of metrics for steps belong to this event
     */
    async getMetrics(config = { startTime: null, endTime: null }) {
        // Get builds during this time range
        const builds = await this.getBuilds({
            startTime: config.startTime,
            endTime: config.endTime
        });

        // Generate metrics
        const metrics = builds.map((b) => {
            const { id, createTime, status, startTime, endTime } = b;
            const duration = Math.round((new Date(endTime) - new Date(startTime)) / 1000);

            return { id, createTime, status, duration };
        });

        return metrics;
    }
}

module.exports = Job;
