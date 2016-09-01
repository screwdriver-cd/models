'use strict';
const BaseModel = require('./base');
const nodeify = require('./nodeify');

// Symbols for private members
const executor = Symbol('executor');
const apiUri = Symbol('apiUri');
const tokenGen = Symbol('tokenGen');
const uiUri = Symbol('uiUri');

/**
 * Update status to SCM
 * @method updateSCM
 * @param  {Object}  config
 * @param  {String}  conFig.scmUrl      Url for the repoInfo
 * @param  {String}  config.sha         Sha for the commit
 * @param  {String}  config.state       Build status
 * @param  {User}    config.user        Owner of the repo
 * @return {Promise}
 */

class BuildModel extends BaseModel {
    /**
     * Construct a BuildModel object
     * @method constructor
     * @param  {Object}    config
     * @param  {Object}    config.datastore         Object that will perform operations on the datastore
     * @param  {Object}    config.executor          Object that will perform executor operations
     * @param  {String}    config.username          The user that created this build
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
        this.username = config.username;
    }

    /**
     * Update status to SCM
     * @method updateSCM
     * @param  {Pipeline}   pipeline     The build's pipeline
     * @return {Promise}
     */
    updateCommitStatus(pipeline) {
        return pipeline.admin
            // update github
            .then(admin => admin.unsealToken())
            .then(githubToken => {
                const config = {
                    token: githubToken,
                    scmUrl: pipeline.scmUrl,
                    sha: this.sha,
                    buildStatus: this.status,
                    url: `${this[uiUri]}/builds/${this.id}`
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
     * Lazy load a user model
     * @property user
     * @return {Promise}    Resolves to the user associated with this build
     */
    get user() {
        // Lazy load factory dependency to prevent circular dependency issues
        // https://nodejs.org/api/modules.html#modules_cycles
        /* eslint-disable global-require */
        const UserFactory = require('./userFactory');
        /* eslint-enable global-require */

        delete this.user;
        const factory = UserFactory.getInstance();
        const user = factory.get({ username: this.username });

        // ES6 has weird getters and setters in classes,
        // so we redefine the pipeline property here to resolve to the
        // resulting promise and not try to recreate the factory, etc.
        Object.defineProperty(this, 'user', {
            enumerable: true,
            value: user
        });

        return user;
    }

    /**
     * Lazy load a pipeline model for the build
     * @property pipeline
     * @return {Promise}
     */
    get pipeline() {
        delete this.pipeline;

        const pipeline = this.job.then(job => {
            if (!job) {
                throw new Error('Job does not exist');
            }

            return job.pipeline.then(p => {
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
     * Start this build and update github status as pending
     * @method start
     * @return {Promise}
     */
    start() {
        // Make sure that a pipeline and job is associated with the build
        return this.pipeline
            // start the build
            .then(pipeline =>
                nodeify.withContext(this[executor], 'start', [{
                    apiUri: this[apiUri],
                    buildId: this.id,
                    container: this.container,
                    token: this[tokenGen](this.id)
                }])
                // update github
                .then(() => this.updateCommitStatus(pipeline))
                .then(() => this)
            );
    }

    /**
     * Stream a build
     * @method stream
     * @return {Promise}
     */
    stream() {
        return nodeify.withContext(this[executor], 'stream', [{ buildId: this.id }]);
    }

    /**
     * Update a build and update github status
     * @method update
     * @return {Promise}
     */
    update() {
        const dirty = this.isDirty('status');

        return super.update()
            .then(() => {
                if (!dirty) {
                    return this;
                }

                // update scm with status
                return this.pipeline
                    .then(pipeline => this.updateCommitStatus(pipeline))
                    .then(() => this);
            });
    }

    /**
     * Stop a build and update github status as failure
     * @method stop
     * @return {Promise}
     */
    stop() {
        if (this.status !== 'QUEUED' && this.status !== 'RUNNING') {
            return nodeify.success(null);
        }

        // We are aborting the build here, setting the status so SCM updated properly
        this.status = 'ABORTED';

        // stop the build
        return nodeify.withContext(this[executor], 'stop', [{ buildId: this.id }])
            // update status
            .then(() => this.update());
    }
}

module.exports = BuildModel;
