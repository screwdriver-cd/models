'use strict';
const async = require('async');
const hashr = require('screwdriver-hashr');
const hoek = require('hoek');
const BaseModel = require('./base');
const PipelineModel = require('./pipeline');

/**
 * Given a Job ID, look up the associated Pipeline ID
 *
 * TODO: Use JobModel object instead
 * @method fetchPipelineId
 * @param  {Object}        datastore The datastore object that can retrieve the data from the datastore
 * @param  {String}        jobId     The ID of the job to look at
 * @param  {Function}      callback  fn(err, result), where result is an object containing a key "pipelineId"
 */
function fetchPipelineId(datastore, jobId, callback) {
    datastore.get({
        table: 'jobs',
        params: {
            id: jobId
        }
    }, callback);
}

/**
 * Given a Pipeline ID, look up the associated SCM Url
 *
 * @method fetchScmUrl
 * @param  {Object}    datastore          The datastore object that can retrieve the data from the datastore
 * @param  {Object}    params             An object
 * @param  {String}    params.pipelineId  The ID of the pipeline to look at
 * @param  {Function}  callback           fn(err, result), where result is an object consisting of two
 *                                        keys: "pipelineID" and "scmUrl"
 */
function fetchScmUrl(datastore, params, callback) {
    const pipelineModel = new PipelineModel(datastore);
    const pipelineId = params.pipelineId;

    pipelineModel.get(pipelineId, (err, data) => {
        if (err) {
            return callback(err);
        }

        return callback(null, {
            pipelineId,
            scmUrl: data.scmUrl
        });
    });
}

class BuildModel extends BaseModel {
    /**
     * Construct a BuildModel object
     * @method constructor
     * @param  {Object}    datastore         Object that will perform operations on the datastore
     * @param  {Object}    executor          Object that will perform executor operations
     */
    constructor(datastore, executor) {
        super(datastore);
        this.executor = executor;
        this.table = 'builds';
    }

    /**
     * Create & start a new build
     * @method create
     * @param  {Object}   config           Config object
     * @param  {String}   config.jobId     The ID of the associated job to start
     * @param  {String}   [config.container] The kind of container to use
     * @param  {Function} callback         fn(err)
     */
    create(config, callback) {
        const container = config.container || 'node:4';
        const jobId = config.jobId;
        const now = Date.now();
        const id = hashr.sha1({
            jobId,
            number: now
        });
        const initialBuildData = {
            cause: 'Started by user',
            container,
            jobId,
            createTime: now,
            number: now,
            status: 'QUEUED'
        };

        async.waterfall([
            (next) => {
                this.datastore.save({
                    table: this.table,
                    params: {
                        id,
                        data: initialBuildData
                    }
                }, (err) => {
                    next(err);
                });
            },
            async.apply(fetchPipelineId, this.datastore, jobId),
            async.apply(fetchScmUrl, this.datastore)
        ], (err, data) => {
            if (err) {
                return callback(err);
            }

            return this.executor.start({
                buildId: id,
                container,
                jobId,
                pipelineId: data.pipelineId,
                scmUrl: data.scmUrl
            }, (executorErr) => {
                if (executorErr) {
                    return callback(executorErr);
                }

                return callback(null, hoek.applyToDefaults({ id }, initialBuildData));
            });
        });
    }

    /**
     * Stream a build
     * @method stream
     * @param  {Object}   config           Config object
     * @param  {String}   config.buildId   The id of the build to stream
     * @param  {Function} callback         The callback object to return the stream to
     */
    stream(config, callback) {
        return this.executor.stream(config, callback);
    }
}

module.exports = BuildModel;
