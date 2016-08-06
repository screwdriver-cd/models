'use strict';
const BaseModel = require('./base');
const nodeify = require('./nodeify');

class JobModel extends BaseModel {
    /**
     * Construct a JobModel object
     * @method constructor
     * @param  {Object}    datastore         Object that will perform operations on the datastore
     */
    constructor(datastore) {
        super('job', datastore);
    }

    /**
     * Create a job
     * @method create
     * @param  {Object}    config               Config object
     * @param  {String}    config.pipelineId    The pipeline that the job belongs to
     * @param  {String}    config.name          The job name
     * @param  {Function}  [callback]           fn(err, data) where data is the newly created object
     * @return {Promise}                        If no callback is given, a Promise is returned
     */
    create(config, callback) {
        const pipelineId = config.pipelineId;
        const name = config.name;
        const id = this.generateId(config);
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

        return nodeify.withContext(this.datastore, 'save', [jobConfig], callback);
    }
}

module.exports = JobModel;
