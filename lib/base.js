'use strict';

class BaseModel {

    /**
     * Construct a BaseModel object
     * @method constructor
     * @param  {Object}    datastore         Object that will perform operations on the datastore
     */
    constructor(datastore) {
        this.datastore = datastore;
    }

    /**
     * Get a record based on id
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
     * List records with pagination
     * @param  {Object}   paginate           Config object
     * @param  {Number}   paginate.count     Number of items per page
     * @param  {Number}   paginate.page      Specific page of the set to return
     * @return {Function} callback           fn(err, result) where result is an array of records
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
     * Update a record
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
