'use strict';
const hashr = require('screwdriver-hashr');
const hoek = require('hoek');
const JobModel = require('./jobmodel');

const PipelineModel = class {
    /**
     * Construct a PipelineModel object
     * @method constructor
     * @param  {Object}    datastore         Object that will perform operations on the datastore
     */
    constructor(datastore) {
        this.datastore = datastore;
        this.table = 'pipelines';
    }

    /**
     * Create a pipeline
     * @method create
     * @param  {Object}   config                Config object to create the pipeline with
     * @param  {String}   config.scmUrl         The scmUrl for the application
     * @param  {String}   [config.configUrl]    The configUrl for the application
     * @param  {Function} callback              fn(err)
     */
    create(config, callback) {
        const pipelineId = hashr.sha1(config.scmUrl);

        /* eslint-disable consistent-return */
        this.get(pipelineId, (error, data) => {
            if (data) {
                return callback(new Error('scmUrl needs to be unique'));
            }

            const createTime = Date.now();
            const platform = 'generic@1';
            const pipelineData = hoek.applyToDefaults({
                createTime,
                platform,
                configUrl: config.scmUrl
            }, config);
            const pipelineConfig = {
                table: this.table,
                params: {
                    id: pipelineId,
                    data: pipelineData
                }
            };

            return this.datastore.save(pipelineConfig, callback);
        });
    }

    /**
     * Sync the pipeline by looking up what is currently in yaml and create or delete
     * jobs if necessary. Right now, this simply creates the job 'main'.
     * @param  {Object}   config           Config object to create the pipeline with
     * @param  {String}   config.scmUrl    The scmUrl of the repository
     * @param  {Function} callback         Callback function
     */
    // TODO: make this so that it looks up the yaml & create/delete jobs if necessary
    sync(config, callback) {
        const pipelineId = hashr.sha1(config.scmUrl);

        this.get(pipelineId, (error) => {
            if (error) {
                return callback(error);
            }

            const jobModel = new JobModel(this.datastore);
            const jobConfig = {
                pipelineId,
                name: 'main'
            };

            return jobModel.create(jobConfig, callback);
        });
    }

    /**
    * Get a pipeline based on id
    * @param  {String}   id                The id of the record to retrieve
    * @return {Function} callback          fn(err, result) where result is the pipeline with the specific id
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
     * List pipelines with pagination
     * @param  {Object}   paginate           Config object
     * @param  {Number}   paginate.count     Number of items per page
     * @param  {Number}   paginate.page      Specific page of the set to return
     * @return {Function} callback           fn(err, result) where result is an array of pipelines
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
    * Update a pipeline
    * @param  {Object}    config         Config object
    * @param  {String}    config.id      The id of the record to retrieve
    * @param  {Object}    config.data    The new data object to update with
    * @return {Function}  callback       fn(err, result) where result is the new pipeline object
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

module.exports = PipelineModel;
