'use strict';
const BaseModel = require('./base');
const nodeify = require('./nodeify');
const githubHelper = require('./github');

class BuildModel extends BaseModel {
    /**
     * Construct a BuildModel object
     * @method constructor
     * @param  {Object}    config
     * @param  {Object}    config.datastore         Object that will perform operations on the datastore
     * @param  {Object}    config.executor          Object that will perform executor operations
     * @param  {String}    config.username          The user that created this build
     * @param  {String}    config.jobId             The ID of the associated job to start
     * @param  {String}    [config.sha]             The sha of the build
     * @param  {String}    [config.container]       The kind of container to use
     */
    constructor(config) {
        super('build', config);
        this.executor = config.executor;
        this.username = config.username;
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
     * Start this build
     * @method start
     * @param  {Object}  config
     * @param  {String}  config.apiUri    URI back to the API
     * @param  {String}  config.tokenGen  Generator for building tokens
     * @return {Promise}
     */
    start(config) {
        // Lazy load factory dependency to prevent circular dependency issues
        // https://nodejs.org/api/modules.html#modules_cycles
        /* eslint-disable global-require */
        const UserFactory = require('./userFactory');
        /* eslint-enable global-require */

        const apiUri = config.apiUri;
        const token = config.tokenGen(this.id);
        const userFactory = UserFactory.getInstance();

        return this.job.then(job =>
            job.pipeline.then(pipeline =>
                // Start the build
                nodeify.withContext(this.executor, 'start', [{
                    apiUri,
                    buildId: this.id,
                    container: this.container,
                    token
                }])
                .then(() =>
                    userFactory.get({ username: pipeline.admin })
                    .then(adminUser => {
                        const repoInfo = githubHelper.getInfo(pipeline.scmUrl);

                        return githubHelper.run({
                            user: adminUser,
                            action: 'createStatus',
                            params: {
                                user: repoInfo.user,
                                repo: repoInfo.repo,
                                sha: this.sha,
                                state: 'pending',
                                context: 'screwdriver'
                            }
                        });
                    })
                )
            )
        );
    }

    /**
     * Stream a build
     * @method stream
     * @return {Promise}
     */
    stream() {
        return nodeify.withContext(this.executor, 'stream', [{ buildId: this.id }]);
    }

    /**
     * Stop a build
     * @method stop
     * @return {Promise}
     */
    stop() {
        return nodeify.withContext(this.executor, 'stop', [{ buildId: this.id }]);
    }
}

module.exports = BuildModel;
