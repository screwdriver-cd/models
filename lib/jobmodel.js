'use strict';
const hashr = require('screwdriver-hashr');

const JobModel = class {
    /**
     * Construct a JobModel object
     * @method constructor
     * @param  {Object}    datastore         Object that will perform operations on the datastore
     */
    constructor(datastore) {
        this.datastore = datastore;
        this.table = 'jobs';
    }

    /**
     * Get a job based on id
     * @param  {String}     id           The id of the record to retrieve
     * @param  {Function}   callback     fn(err, result) where result is the job with the specific id
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
     * List jobs with pagination
     * @param  {Object}   paginate                  Config object
     * @param  {Number}   paginate.count     Number of items per page
     * @param  {Number}   paginate.page      Specific page of the set to return
     * @return {Function} callback           fn(err, result) where result is an array of jobs
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
     * Update a job
     * @param  {Object}    config         Config object
     * @param  {String}    config.id      The id of the record to retrieve
     * @param  {Object}    config.data    The new data object to update with
     * @return {Function}  callback       fn(err, result) where result is the new job object
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

    /**
     * Create a job
     * @param  {Object}    config               Config object
     * @param  {String}    config.pipelineId    The pipeline that the job belongs to
     * @param  {String}    config.name          The job name
     * @param  {Function}  callback             fn(err)
     */
    create(config, callback) {
        const pipelineId = config.pipelineId;
        const name = config.name;
        const id = hashr.sha1(`${pipelineId}${name}`);
        const jobConfig = {
            table: this.table,
            params: {
                id,
                data: {
                    name,
                    pipelineId,
                    state: 'ENABLED'
                }
            }
        };

        return this.datastore.save(jobConfig, callback);
    }
};

module.exports = JobModel;
