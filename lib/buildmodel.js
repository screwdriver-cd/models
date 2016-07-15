'use strict';
const async = require('async');
const Executor = require('screwdriver-executor-k8s');
const hashr = require('screwdriver-hashr');
const hoek = require('hoek');
const PipelineModel = require('./pipelinemodel');

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

const BuildModel = class {
    /**
     * Construct a BuildModel object
     * @method constructor
     * @param  {Object}    datastore         Object that will perform operations on the datastore
     * @param  {Object}    [executorOptions] Options to configure the executor-k8s module directly
     */
    constructor(datastore) {
        this.datastore = datastore;
        this.executor = new Executor({});
        this.table = 'builds';
    }

    /**
     * Create & start a new build
     * @method create
     * @param  {Object}   config           Config object
     * @param  {String}   config.jobId     The ID of the associated job to start
     * @param  {String}   config.container The kind of container to use
     * @param  {Function} callback         Callback function
     */
    create(config, callback) {
        const container = config.container;
        const jobId = config.jobId;
        const now = Date.now();
        const id = hashr.sha1({
            jobId,
            runNumber: now
        });
        const initialBuildData = {
            cause: 'Started by user',
            container,
            jobId,
            createTime: now,
            runNumber: now,
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
     * @param  {Object}   response         The response object to stream to
     */
    stream(config, response) {
        return this.executor.stream(config, response);
    }

    /**
     * Get a build based on id
     * @param  {String}   id                The key of the record to retrieve
     * @return {Function} callback
     */
    get(id, callback) {
        const config = {
            table: this.table,
            params: {
                id
            }
        };

        return this.datastore.get(config, callback);
    }

    /**
     * List builds with pagination
     * @param  {Object}   paginate                  Config object
     * @param  {Number}   paginate.count     Number of items per page
     * @param  {Number}   paginate.page      Specific page of the set to return
     * @return {Function} callback
     */
    list(paginate, callback) {
        const config = {
            table: this.table,
            params: {},
            paginate: {
                count: paginate.count,
                page: paginate.page
            }
        };

        return this.datastore.scan(config, callback);
    }

    /**
     * Update a build
     * @param  {Object}    config         Config object
     * @param  {String}    config.id      The key of the record to retrieve
     * @param  {Object}    config.data    The new data object to update with
     * @return {Function}  callback
     */
    update(config, callback) {
        const datastoreConfig = {
            table: this.table,
            params: {
                id: config.id,
                data: config.data
            }
        };

        return this.datastore.update(datastoreConfig, callback);
    }
};

module.exports = BuildModel;
