'use strict';
const hoek = require('hoek');
const BaseModel = require('./base');
const nodeify = require('./nodeify');
const PipelineModel = require('./pipeline');
const JobModel = require('./job');
const UserModel = require('./user');
const githubHelper = require('./github');

/**
 * Given a Pipeline ID, look up the associated SCM Url
 * @method fetchScmUrl
 * @param  {Model }    pipeline           Instance of the Pipeline model
 * @param  {Object}    job                The job object
 * @param  {String}    job.pipelineId     The ID of the pipeline to look at
 * @param  {String}    params.name        The name of the job we are building
 * @param  {Function}  callback           fn(err, result), where result is an object consisting of two
 *                                        keys: "pipelineID", "scmUrl", and "jobName"
 */
function fetchScmUrl(pipeline, job, callback) {
    const pipelineId = job.pipelineId;

    pipeline.get(pipelineId, (err, data) => {
        if (err) {
            return callback(err);
        }

        return callback(null, {
            pipelineId,
            jobName: job.name,
            scmUrl: data.scmUrl
        });
    });
}

/**
 * Look up repo info such as user, repo name, and sha
 * @method getRepoInfo
 * @param  {Model}    user          The user model
 * @param  {Object}   config        Configuration object that might/might not include sha
 * @param  {Object}   buildInfo     Other build info that will be returned. Includes
 *                                  pipelineId, jobName, and scmUrl
 * @param  {Function} callback      fn(err, sha)
 */
function getRepoInfo(user, config, buildInfo, callback) {
    const repoInfo = githubHelper.getInfo(buildInfo.scmUrl);
    const response = hoek.applyToDefaults(buildInfo, repoInfo);

    if (config.sha) {
        return callback(null, hoek.applyToDefaults(response, { sha: config.sha }));
    }

    return githubHelper.run({
        user,
        username: config.username,
        action: 'getBranch',
        params: repoInfo
    }, (err, repo) => callback(err, hoek.applyToDefaults(response, { sha: repo.commit.sha })));
}

class BuildModel extends BaseModel {
    /**
     * Construct a BuildModel object
     * @method constructor
     * @param  {Object}    datastore         Object that will perform operations on the datastore
     * @param  {Object}    executor          Object that will perform executor operations
     * @param  {String}    password          Login password
     */
    constructor(datastore, executor, password) {
        super('build', datastore);
        this.executor = executor;
        this.password = password;
        this.user = new UserModel(datastore, password);
        this.job = new JobModel(datastore);
        this.pipeline = new PipelineModel(datastore);
    }

    /**
     * Create & start a new build
     * @method create
     * @param  {Object}   config                Config object
     * @param  {String}   config.username       The user that created this build
     * @param  {String}   config.jobId          The ID of the associated job to start
     * @param  {String}   [config.sha]          The sha of the build
     * @param  {String}   [config.container]    The kind of container to use
     * @param  {Function} [callback]            fn(err, data) where data is the newly created object
     * @return {Promise}                        If no callback is given, a Promise is returned
     */
    create(config, callback) {
        const container = config.container || 'node:4';
        const jobId = config.jobId;
        const now = Date.now();
        const id = this.generateId({
            jobId,
            number: now
        });
        const initialBuildData = {
            cause: `Started by user ${config.username}`,
            container,
            jobId,
            createTime: now,
            number: now,
            status: 'QUEUED'
        };

        return this.job.get(jobId)
            .then((jobData) => nodeify(fetchScmUrl, this.pipeline, jobData))
            .then((buildInfo) => nodeify(getRepoInfo, this.user, config, buildInfo))
            .then((response) => {
                initialBuildData.sha = response.sha;

                // Save build data to datastore
                return nodeify(this.datastore.save, {
                    table: this.table,
                    params: {
                        id,
                        data: initialBuildData
                    }
                })
                .then(() => nodeify.success(response));
            })
            .then((response) =>
                // Start the build
                nodeify(this.executor.start, {
                    buildId: id,
                    container,
                    jobId,
                    jobName: response.jobName,
                    pipelineId: response.pipelineId,
                    scmUrl: response.scmUrl
                })
                .then(() => nodeify.success(response))
            )
            .then((response) =>
                this.pipeline.getAdmin(response.pipelineId)
                    .then((admin) => nodeify.success(hoek.applyToDefaults(response, { admin })))
            )
            .then((response) =>
                // Create github status
                nodeify(githubHelper.run, {
                    user: this.user,
                    username: response.admin,
                    action: 'createStatus',
                    params: {
                        user: response.user,
                        repo: response.repo,
                        sha: initialBuildData.sha,
                        state: 'pending',
                        context: 'screwdriver'
                    }
                })
            )
            .then(() => nodeify.success(hoek.applyToDefaults({ id }, initialBuildData), callback))
            .catch((err) => nodeify.fail(err, callback));
    }

    /**
     * Gets all the builds for a jobId
     * @method getBuildsForJobId
     * @param  {Object}   config                Config object
     * @param  {String}   config.jobId          The jobId of the build to filter for
     * @param  {Function} [callback]            The callback object to return the stream to
     * @return {Promise}                        If no callback is given, a Promise is returned
     */
    getBuildsForJobId(config, callback) {
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
            .then((records) => {
                records.sort((build1, build2) => build1.number - build2.number);

                return nodeify.success(records, callback);
            })
            .catch((err) => nodeify.fail(err, callback));
    }

    /**
     * Stream a build
     * @method stream
     * @param  {Object}   config           Config object
     * @param  {String}   config.buildId   The id of the build to stream
     * @param  {Function} [callback]       The callback object to return the stream to
     * @return {Promise}                   If no callback is given, a Promise is returned
     */
    stream(config, callback) {
        return nodeify(this.executor.stream, config, callback);
    }

    /**
     * Stop a build
     * @method stop
     * @param  {Object}   config           Config object
     * @param  {String}   config.buildId   The id of the build to stop
     * @param  {Function} callback         The callback function
     */
    stop(config, callback) {
        return this.executor.stop(config, callback);
    }
}

module.exports = BuildModel;
