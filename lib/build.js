'use strict';

const BaseModel = require('./base');
const hoek = require('hoek');
const { EXTERNAL_TRIGGER } = require('screwdriver-data-schema').config.regex;

// Symbols for private members
const executor = Symbol('executor');
const apiUri = Symbol('apiUri');
const tokenGen = Symbol('tokenGen');
const uiUri = Symbol('uiUri');
const ABORT_CODE = 130; // 128 + SIGINT 2 (^C)

/**
 * Get the array of ids for jobs that match the names passed in
 * @method findIdsOfMatchedJobs
 * @param  {Array}   jobs     Array of jobs
 * @param  {Array}   jobnames Array of job names to find the ids
 * @return {Array}            Array of job ids that match the job names
 */
function findIdsOfMatchedJobs(jobs, jobnames) {
    const matchedJobs = jobs.filter(j => jobnames.includes(j.name));

    return matchedJobs.map(j => j.id);
}

/**
 * Get a list of blockedBy jobIds
 * If the blocking job is from an external pipeline, look up the external pipeline to find the jobId
 * @method getBlockedByIds
 * @param  {Pipeline}   pipeline Current Pipeline
 * @param  {Job}        job      Current Job that contains the blockedBy configuration
 * @return {Promise}             Array of blockedby JobIds
 */
function getBlockedByIds(pipeline, job) {
    const blockedByNames = job.permutations[0].blockedBy;
    let blockedByIds = [job.id]; // always blocked by itself

    if (!blockedByNames || blockedByNames.length === 0) {
        return Promise.resolve(blockedByIds);
    }

    return pipeline.jobs.then((pipelineJobs) => {
        // Get internal blocked by first
        blockedByIds = blockedByIds.concat(
            findIdsOfMatchedJobs(pipelineJobs, blockedByNames));

        const externalBlockedByNames = blockedByNames.filter(
            name => name.startsWith('~sd@'));

        // If there is no external blocked by, just return
        if (externalBlockedByNames.length === 0) {
            return Promise.resolve(blockedByIds);
        }

        // eslint-disable-next-line global-require
        const PipelineFactory = require('./pipelineFactory');
        const pipelineFactory = PipelineFactory.getInstance();

        // Go through the external pipeline Ids and find the matching job id
        return Promise.all(
            externalBlockedByNames.map((fullname) => {
                const [, pid, jobname] = fullname.match(EXTERNAL_TRIGGER);

                return pipelineFactory.get(parseInt(pid, 10)) // convert pid from string to number
                    .then(p => p.jobs)
                    .then(jobs => findIdsOfMatchedJobs(jobs, [jobname]));
            }))
            // Merge the results
            .then(jobIds => blockedByIds.concat(...jobIds));
    });
}

class BuildModel extends BaseModel {
    /**
     * Construct a BuildModel object
     * @method constructor
     * @param  {Object}    config
     * @param  {Object}    config.datastore         Object that will perform operations on the datastore
     * @param  {Object}    config.executor          Object that will perform executor operations
     * @param  {String}    config.jobId             The ID of the associated job to start
     * @param  {String}    config.apiUri            URI back to the API
     * @param  {String}    config.uiUri             URI back to the UI
     * @param  {String}    config.tokenGen          Generator for building tokens
     * @param  {String}    [config.sha]             The sha of the build
     * @param  {String}    [config.container]       The kind of container to use
     */
    constructor(config) {
        super('build', config);
        this[executor] = config.executor;
        this[apiUri] = config.apiUri;
        this[tokenGen] = config.tokenGen;
        this[uiUri] = config.uiUri;
    }

    /**
     * Update status to SCM
     * @method updateSCM
     * @param  {Pipeline}   pipeline     The build's pipeline
     * @return {Promise}
     */
    updateCommitStatus(pipeline) {
        return Promise.all([
            this.job,
            pipeline.token
        ]).then(([job, token]) => {
            const config = {
                token,
                scmUri: pipeline.scmUri,
                scmContext: pipeline.scmContext,
                sha: this.sha,
                buildStatus: this.status,
                jobName: job.name,
                url: `${this[uiUri]}/pipelines/${pipeline.id}/builds/${this.id}`,
                pipelineId: pipeline.id
            };

            return this.scm.updateCommitStatus(config);
        });
    }

    /**
     * Lazy load a job model
     * @property pipeline
     * @return {Promise}    Resolves to the job associated with this build
     */
    get job() {
        // Lazy load factory dependency to prevent circular dependency issues
        // https://nodejs.org/api/modules.html#modules_cycles
        /* eslint-disable global-require */
        const JobFactory = require('./jobFactory');
        /* eslint-enable global-require */

        delete this.job;
        const factory = JobFactory.getInstance();
        const job = factory.get(this.jobId);

        // ES6 has weird getters and setters in classes,
        // so we redefine the pipeline property here to resolve to the
        // resulting promise and not try to recreate the factory, etc.
        Object.defineProperty(this, 'job', {
            enumerable: true,
            value: job
        });

        return job;
    }

    /**
     * Lazy load a pipeline model for the build
     * @property pipeline
     * @return {Promise}
     */
    get pipeline() {
        delete this.pipeline;

        const pipeline = this.job.then((job) => {
            if (!job) {
                throw new Error('Job does not exist');
            }

            return job.pipeline.then((p) => {
                if (!p) {
                    throw new Error('Pipeline does not exist');
                }

                return p;
            });
        });

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
     * Lazy load the secrets model for the build
     * @property secrets
     * @return {Promise}
     */
    get secrets() {
        delete this.secrets;

        const secrets = this.job.then((job) => {
            if (!job) {
                throw new Error('Job does not exist');
            }

            return job.secrets;
        });

        // ES6 has weird getters and setters in classes,
        // so we redefine the secrets property here to resolve to the
        // resulting promise and not try to recreate the factory, etc.
        Object.defineProperty(this, 'secrets', {
            enumerable: true,
            value: secrets
        });

        return secrets;
    }

    /**
     * Start this build and update commit status as pending
     * @method start
     * @return {Promise}
     */
    start() {
        // Make sure that a pipeline and job is associated with the build
        return this.job.then(job =>
            job.pipeline.then(pipeline => getBlockedByIds(pipeline, job)
                .then(blockedBy => this[executor].start({
                    annotations: hoek.reach(job.permutations[0], 'annotations'),
                    blockedBy,
                    apiUri: this[apiUri],
                    buildId: this.id,
                    container: this.container,
                    token: this[tokenGen](this.id, {
                        isPR: job.isPR(),
                        jobId: job.id,
                        pipelineId: pipeline.id
                    }, pipeline.scmContext) }))
                .then(() => this.updateCommitStatus(pipeline))) // update github
                .then(() => this)
        );
    }

    /**
     * Update a build and update github status
     * @method update
     * @return {Promise}
     */
    update() {
        let prom = Promise.resolve();

        // Abort running steps. If no steps ever ran, abort the first step
        const abortSteps = () => {
            const now = (new Date()).toISOString();

            // Fail any running steps
            this.steps = this.steps.map((step) => {
                if (step.startTime && !step.endTime) {
                    step.endTime = now;
                    step.code = ABORT_CODE;
                }

                return step;
            });
        };

        // check if the status is changing
        if (this.isDirty('status')) {
            // stop the build if we're done
            if (this.isDone()) {
                abortSteps();
                prom = prom
                    .then(() => this.stop());
            }
            // update scm with status
            prom = prom
                .then(() => this.pipeline)
                .then(pipeline => this.updateCommitStatus(pipeline));
        }

        return prom
            .then(() => super.update())
            .then(() => this);
    }

    /**
     * Stop a build
     * @method stop
     * @return {Promise}
     */
    stop() {
        return this.job
            .then(job => this[executor].stop({
                annotations: job.permutations[0].annotations,
                buildId: this.id
            }))
            .then(() => this);
    }

    /**
     * Check if a build is done
     * @method isDone
     * @return boolean
     */
    isDone() {
        return ['ABORTED', 'FAILURE', 'SUCCESS'].includes(this.status);
    }
}

module.exports = BuildModel;
