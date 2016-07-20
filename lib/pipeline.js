'use strict';
const hashr = require('screwdriver-hashr');
const hoek = require('hoek');
const BaseModel = require('./base');
const JobModel = require('./job');

class PipelineModel extends BaseModel {
    /**
     * Construct a PipelineModel object
     * @method constructor
     * @param  {Object}    datastore         Object that will perform operations on the datastore
     */
    constructor(datastore) {
        super(datastore);
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
        const id = hashr.sha1(config.scmUrl);
        const createTime = Date.now();
        const platform = 'generic@1';
        const data = hoek.applyToDefaults({
            createTime,
            platform,
            configUrl: config.scmUrl
        }, config);
        const pipelineConfig = {
            table: this.table,
            params: {
                id,
                data
            }
        };

        return this.datastore.save(pipelineConfig, callback);
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
}

module.exports = PipelineModel;
