'use strict';
const schema = require('screwdriver-data-schema');
const hashr = require('screwdriver-hashr');

class BaseModel {
    /**
     * Construct a BaseModel object
     * @method constructor
     * @param  {String}    modelName         Name of the model to get from data-schema
     * @param  {Object}    datastore         Object that will perform operations on the datastore
     */
    constructor(modelName, datastore) {
        this.model = schema.models[modelName];
        this.table = this.model.tableName;
        this.datastore = datastore;
    }

    /**
     * Generate the id for the model
     * @method generateId
     * @param  {Object}   config Object to generate a hashed ID for
     * @return {String}          SHA1 unique ID
     */
    generateId(config) {
        const hashObject = {};

        this.model.keys.forEach((keyName) => {
            hashObject[keyName] = config[keyName];
        });

        return hashr.sha1(hashObject);
    }

    /**
     * Get a record based on id
     * @method get
     * @param  {String}   id                The id of the record to retrieve
     * @return {Function} callback          fn(err, result) where result is the record with the specific id
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
     * List records with pagination and filter options
     * @method list
     * @param  {Object}   config                  Config object
     * @param  {Object}   config.params           Parameters to filter on
     * @param  {Object}   config.paginate         Pagination parameters
     * @param  {Number}   config.paginate.count   Number of items per page
     * @param  {Number}   config.paginate.page    Specific page of the set to return
     * @return {Function} callback                fn(err, result) where result is an array of records
     */
    list(config, callback) {
        const scanConfig = {
            table: this.table,
            params: config.params || {},
            paginate: {
                count: config.paginate.count,
                page: config.paginate.page
            }
        };

        return this.datastore.scan(scanConfig, callback);
    }

    /**
     * Update a record
     * @method update
     * @param  {Object}    config         Config object
     * @param  {String}    config.id      The id of the record to retrieve
     * @param  {Object}    config.data    The new data object to update with
     * @return {Function}  callback       fn(err, result) where result is the new record
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
}

module.exports = BaseModel;
