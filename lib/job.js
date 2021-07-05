'use strict';

const logger = require('screwdriver-logger');
const dayjs = require('dayjs');
const hoek = require('@hapi/hoek');
const BaseModel = require('./base');
const { getAnnotations, getAllRecords, getToken } = require('./helper');
const executor = Symbol('executor');
const tokenGen = Symbol('tokenGen');
const apiUri = Symbol('apiUri');
const START_INDEX = 3;
const MAX_METRIC_GET_COUNT = 1000;
const MAX_BUILD_DELETE_COUNT = 100;
const DEFAULT_COUNT = 10;
const DEPLOY_KEY_SECRET = 'SD_SCM_DEPLOY_KEY';

/**
 * Find metrics and step metrics related to the build
 * @method findMetrics
 * @param  {Object}    build              build object
 * @param  {String}    stepName           only include this step
 * @param  {String}    aggregateInterval  Include step metrics if no aggregation
 * @return {Promise}                      Resolves of metrics
 */
async function findMetrics(build, stepName, aggregateInterval) {
    const { id, jobId, eventId, createTime, sha, status, startTime, endTime } = build;
    const duration = startTime && endTime ? dayjs(endTime).diff(dayjs(startTime), 'second') : null;
    const metrics = { id, jobId, eventId, createTime, sha, status, duration };

    if (!aggregateInterval || aggregateInterval === 'none') {
        metrics.steps = await build.getMetrics({ stepName });
    }

    return metrics;
}

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

        if (!secretNames.includes(DEPLOY_KEY_SECRET)) {
            secretNames.push(DEPLOY_KEY_SECRET);
        }

        const secretList = this.pipeline.then(pipeline => {
            if (!pipeline) {
                throw new Error('Pipeline does not exist');
            }

            return pipeline.secrets.then(secrets =>
                secrets.filter(
                    secret =>
                        // Only allow secrets that are called in the config AND are allowed (if a PR)
                        secretNames.includes(secret.name) && (secret.allowInPR || !this.isPR())
                )
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
     * @param  {String}   [config.endTime]          Search for builds created before this endTime
     * @param  {Boolean}  [config.readOnly]         Use readOnly datastore
     * @return {Promise}                            List of builds
     */
    getBuilds(config = {}) {
        const { sort, sortBy, status, paginate, startTime, endTime, readOnly } = config;
        const defaultConfig = {
            params: {
                jobId: this.id
            },
            paginate: {
                count: DEFAULT_COUNT
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

        if (sortBy) {
            listConfig.sortBy = sortBy;
        }

        if (readOnly) {
            listConfig.readOnly = readOnly;
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
     * Return latest build that belong to this job
     * @param  {Object}   [config]                  Configuration object
     * @param  {String}   [config.status]           Return latest build with this status
     * @return {Promise}                            Lastest build
     */
    getLatestBuild(config = {}) {
        return this.getBuilds({ status: config.status }).then(latestBuilds => latestBuilds[0] || {});
    }

    /**
     * Update a job
     * @method update
     * @return {Promise}
     */
    async update() {
        // Lazy load factory dependency to prevent circular dependency issues
        // https://nodejs.org/api/modules.html#modules_cycles
        /* eslint-disable global-require */
        const PipelineFactory = require('./pipelineFactory');
        const JobFactory = require('./jobFactory');
        /* eslint-enable global-require */
        const pipelineFactory = PipelineFactory.getInstance();
        const jobFactory = JobFactory.getInstance();

        const oldJob = await jobFactory.get(this.id);
        const oldPeriodic = getAnnotations(oldJob.permutations[0], 'screwdriver.cd/buildPeriodically');

        const newJob = await super.update();
        const pipeline = await pipelineFactory.get(newJob.pipelineId);

        try {
            const newPeriodic = getAnnotations(newJob.permutations[0], 'screwdriver.cd/buildPeriodically');
            const isNewJobEnabled = newJob.state === 'ENABLED';
            const isOldJobEnabled = oldJob.state === 'ENABLED';
            const isNewJobArchived = newJob.archived;
            const isOldJobArchived = oldJob.archived;
            const isSettingUpdated = newPeriodic ? newPeriodic !== oldPeriodic : !!oldPeriodic;

            if (
                newPeriodic &&
                (isSettingUpdated || !isOldJobEnabled || isOldJobArchived) &&
                isNewJobEnabled &&
                !isNewJobArchived
            ) {
                await this[executor].startPeriodic({
                    pipeline,
                    job: newJob,
                    tokenGen: this[tokenGen],
                    token: getToken(this[tokenGen], pipeline, newJob.id),
                    apiUri: this[apiUri],
                    isUpdate: true
                });

                return this;
            }
            if (
                (!newPeriodic && oldPeriodic) ||
                (!isNewJobEnabled && isOldJobEnabled) ||
                (isNewJobArchived && !isOldJobArchived)
            ) {
                await this[executor].stopPeriodic({
                    jobId: this.id,
                    pipelineId: pipeline.id,
                    token: getToken(this[tokenGen], pipeline, this.id)
                });
            }
        } catch (err) {
            logger.error(`job:${this.id}: failed to update queue status`, err);
        }

        return this;
    }

    /**
     * Remove all builds associated with this job and the job itself
     * @return {Promise}        Resolves to null if remove successfully
     */
    remove() {
        const removeBuilds = () =>
            // Iterate through the builds and remove MAX_BUILD_DELETE_COUNT at a time
            Promise.all([this.getBuilds({ paginate: { count: MAX_BUILD_DELETE_COUNT } }), this.pipeline]).then(
                ([builds, pipeline]) => {
                    if (builds.length === 0) {
                        // Done removing builds
                        return pipeline;
                    }

                    return Promise.all(
                        builds.map(build => {
                            const stoppedStatuses = ['ABORTED', 'FAILURE', 'SUCCESS', 'COLLAPSED'];

                            if (!stoppedStatuses.includes(build.status)) {
                                this[executor].stop({
                                    buildId: build.id,
                                    pipelineId: pipeline.id,
                                    jobId: this.id,
                                    token: getToken(this[tokenGen], pipeline, this.id)
                                });
                            }

                            return build.remove();
                        })
                    )
                        .then(() => removeBuilds())
                        .then(() => pipeline);
                }
            );

        // Remove builds
        return removeBuilds()
            .then(pipeline => {
                // Remove periodic job
                if (getAnnotations(this.permutations[0], 'screwdriver.cd/buildPeriodically')) {
                    return this[executor].stopPeriodic({
                        jobId: this.id,
                        pipelineId: pipeline.id,
                        token: getToken(this[tokenGen], pipeline, this.id)
                    });
                }

                return null;
            })
            .then(() => super.remove());
    }

    /**
     * getMetrics for this job
     * @method getMetrics
     * @param  {Object}   [config]                    Configuration object
     * @param  {String}   [config.startTime]          Look at builds created after this startTime
     * @param  {String}   [config.endTime]            Look at builds created before this endTime
     * @param  {String}   [config.stepName]           Only include this step
     * @param  {String}   [aggregateInterval]         Aggregate data by day/month/week/year
     * @return {Promise}  Resolves to array of metrics for builds belong to this job
     */
    async getMetrics(config = { startTime: null, endTime: null, stepName: null }) {
        const options = {
            startTime: config.startTime,
            endTime: config.endTime,
            sort: 'ascending',
            sortBy: 'id',
            paginate: {
                count: MAX_METRIC_GET_COUNT
            },
            readOnly: true
        };

        if (!config.aggregateInterval) {
            // Get builds during this time range
            const builds = await this.getBuilds(options);

            // Generate metrics
            return Promise.all(builds.map(b => findMetrics(b, config.stepName, config.aggregateInterval)));
        }

        options.paginate.page = 1;
        const allBuilds = await getAllRecords.call(this, 'getBuilds', config.aggregateInterval, options, [[]]);

        return Promise.all(
            allBuilds.map(sameIntervalBuilds =>
                Promise.all(
                    sameIntervalBuilds.map(b =>
                        findMetrics(b, config.stepName, config.aggregateInterval).then(metrics => metrics.duration)
                    )
                ).then(metrics => {
                    let emptyCount = 0;

                    const totalDuration = metrics.reduce((acc, current) => {
                        if (current) {
                            return acc + current;
                        }

                        emptyCount += 1;

                        return acc;
                    });
                    const duration =
                        metrics.length > emptyCount
                            ? +(totalDuration / (metrics.length - emptyCount)).toFixed(2)
                            : null;

                    return {
                        createTime: sameIntervalBuilds[0].createTime,
                        duration
                    };
                })
            )
        );
    }
}

module.exports = Job;
