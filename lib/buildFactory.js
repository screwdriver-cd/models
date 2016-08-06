'use strict';

const BaseFactory = require('./baseFactory');
const Build = require('./build');
const hoek = require('hoek');
const JobFactory = require('./jobFactory');
const UserFactory = require('./userFactory');
const githubHelper = require('./github');
let instance;

/**
 * Gathers a sha for the build
 * @method getCommitSha
 * @param  {Datastore}     datastore            Datastore instance
 * @param  {Object}        config               build configuration
 * @param  {String}        [config.sha]         the sha we are ultimately looking for
 * @param  {String}        config.username      The name of the user
 * @param  {String}        config.jobId         The id of the job associated with the build
 * @return {Promise}
 */
function getCommitSha(datastore, config) {
    if (config.sha) {
        return new Promise((resolve) => resolve(config.sha));
    }

    const jobFactory = new JobFactory({ datastore });
    const userFactory = new UserFactory({ datastore });

    return Promise.all([
        jobFactory.get(config.jobId),
        userFactory.get({ username: config.username })
    ]).then(models => {
        const job = models[0];
        const user = models[1];

        return job.pipeline
            .then(pipeline => githubHelper.getInfo(pipeline.scmUrl))
            .then(repoInfo => githubHelper.run({
                user,
                action: 'getBranch',
                params: repoInfo
            }))
            .then(data => data.commit.sha);
    });
}

class BuildFactory extends BaseFactory {
    /**
     * Construct a JobFactory object
     * @method constructor
     * @param  {Object}    config
     * @param  {Object}    config.datastore         Object that will perform operations on the datastore
     */
    constructor(config) {
        super('build', config);
    }

    /**
     * Instantiate a Build class
     * @method createClass
     * @param  {Object}     config               Build data
     * @param  {Datastore}  config.datastore     Datastore instance
     * @param  {String}     config.id            unique id
     * @param  {String}     config.username      The user that created this build
     * @param  {String}     config.jobId         The ID of the associated job to start
     * @param  {String}     [config.sha]         The sha of the build
     * @param  {String}     [config.container]   The kind of container to use
     * @return {Build}
     */
    createClass(config) {
        return new Build(config);
    }

    /**
     * Create a new Build
     * @method create
     * @param  {Object}   config                Config object
     * @param  {String}   config.username       The user that created this build
     * @param  {String}   config.jobId          The ID of the associated job to start
     * @param  {String}   config.executor       Build executor instance
     * @param  {String}   [config.sha]          The sha of the build
     * @param  {String}   [config.container]    The kind of container to use
     * @return {Promise}
     */
    create(config) {
        const container = config.container || 'node:4';
        const now = Date.now();
        const modelConfig = hoek.applyToDefaults({
            cause: `Started by user ${config.username}`,
            container,
            createTime: now,
            number: now,
            status: 'QUEUED'
        }, config);

        return getCommitSha(this.datastore, modelConfig)
            .then(sha => {
                modelConfig.sha = sha;

                return super.create(modelConfig);
            })
            .then(build =>
                build.start()
                    .then(() => build)
            );
    }

    /**
     * Gets all the builds for a given jobId
     * @method getBuildsForJobId
     * @param  {Object}   config                Config object
     * @param  {String}   config.jobId          The jobId of the build to filter for
     * @return {Promise}                        List of Build models
     */
    getBuildsForJobId(config) {
        const listConfig = {
            params: {
                jobId: config.jobId
            },
            paginate: {
                count: 25, // This limit is set by the matrix restriction
                page: 1
            }
        };

        return this.list(listConfig)
            .then((records) => records.sort((build1, build2) => build1.number - build2.number));
    }

    /**
     * Get an instance of the BuildFactory
     * @method getInstance
     * @param  {Object}     config
     * @param  {Datastore}  config.datastore
     * @return {UserFactory}
     */
    // TODO: config.executor???
    static getInstance(config) {
        if (!instance) {
            instance = new BuildFactory(config);
        }

        return instance;
    }
}

module.exports = BuildFactory;
