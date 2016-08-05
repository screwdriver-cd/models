'use strict';
const hoek = require('hoek');
const BaseModel = require('./base');
const JobModel = require('./job');
const nodeify = require('./nodeify');
const schema = require('screwdriver-data-schema');

class PipelineModel extends BaseModel {
    /**
     * Construct a PipelineModel object
     * @method constructor
     * @param  {Object}    datastore         Object that will perform operations on the datastore
     */
    constructor(datastore) {
        super('pipeline', datastore);
    }

    /**
     * Create a pipeline
     * @method create
     * @param  {Object}   config                Config object to create the pipeline with
     * @param  {Object}   config.admins         The admins of this repository
     * @param  {String}   config.scmUrl         The scmUrl for the application
     * @param  {String}   [config.configUrl]    The configUrl for the application
     * @param  {Function} [callback]            fn(err, data) where data is the newly created object
     * @return {Promise}                        If no callback is provided, a Promise is returned.
     */
    create(config, callback) {
        const id = this.generateId(config);
        const createTime = Date.now();
        const data = hoek.applyToDefaults({
            createTime,
            configUrl: config.scmUrl
        }, config);
        const pipelineConfig = {
            table: this.table,
            params: {
                id,
                data
            }
        };

        return nodeify(this.datastore.save, pipelineConfig, callback);
    }

    /**
     * Sync the pipeline by looking up what is currently in yaml and create or delete
     * jobs if necessary. Right now, this simply creates the job 'main'.
     * @method sync
     * @param  {Object}   config           Config object to create the pipeline with
     * @param  {String}   config.scmUrl    The scmUrl of the repository
     * @param  {Function} [callback]       Callback function
     * @return {Promise}                   If no callback is provided, a Promise is returned.
     */
    // TODO: make this so that it looks up the yaml & create/delete jobs if necessary
    sync(config, callback) {
        const pipelineId = this.generateId(config);

        return this.get(pipelineId)
            .then((data) => {
                const jobModel = new JobModel(this.datastore);
                const jobConfig = {
                    pipelineId,
                    name: 'main'
                };

                if (!data) {
                    return nodeify.success(null, callback);
                }

                return jobModel.create(jobConfig, callback);
            })
            .catch((errorObject) => nodeify.fail(errorObject, callback));
    }

    /**
     * Format the scm url to include a branch and make case insensitive
     * @method formatScmUrl
     * @param  {String}     scmUrl Github scm url
     * @return {String}            Lowercase scm url with branch name
     */
    formatScmUrl(scmUrl) {
        let result = scmUrl;
        const matched = (schema.config.regex.SCM_URL).exec(result);

        // Check if branch name exists
        if (!matched[4]) {
            result = result.concat('#master');
        }

        return result.toLowerCase();
    }

    /**
     * Given a pipeline id, fetch the build admin
     * @method getAdmin
     * @param  {String}       pipelineId    Identifier for the Pipeline
     * @param  {Function}     callback      fn(error, admin) where admin is the admin of the pipeline
    */
    // TODO: Get the first admin. Validate if it's valid. If not, remove from admins field,
    //       and retry with the next admin.
    getAdmin(pipelineId, callback) {
        return this.get(pipelineId)
            .then((result) =>
                nodeify.success(Object.keys(result.admins)[0], callback)
            )
            .catch((err) => nodeify.fail(err, callback));
    }
}

module.exports = PipelineModel;
