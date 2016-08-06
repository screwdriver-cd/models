'use strict';
const schema = require('screwdriver-data-schema');
const nodeify = require('./nodeify');

class BaseModel {
    /**
     * Construct a BaseModel object
     * @method constructor
     * @param  {String}     modelName           Name of the model to get from data-schema
     * @param  {Object}     config
     * @param  {Object}     config.datastore    Object that will perform operations on the datastore
     */
    constructor(modelName, config) {
        this.model = schema.models[modelName];
        this.table = this.model.tableName;
        this.datastore = config.datastore;

        // TODO: dynamically create setters to enable dirty bits for updates
        this.model.allKeys.forEach(key => {
            this[key] = config[key];
        });
    }

    /**
     * Update a record
     * @method update
     * @return {Promise}
     */
    update() {
        const data = {};

        this.model.allKeys.forEach(key => {
            data[key] = this[key];
        });
        delete data.id;

        const datastoreConfig = {
            table: this.table,
            params: {
                id: this.id,
                data
            }
        };

        // TODO: sync `this` with db response?
        return nodeify.withContext(this.datastore, 'update', [datastoreConfig])
            .then(() => this);
    }

    /**
     * Get a JSON representation of the model data
     * @method toJson
     * @return {Object}
     */
    toJson() {
        const result = {};

        this.model.allKeys.forEach(key => {
            result[key] = this[key];
        });

        return result;
    }

    /**
     * Get a string representation of the model data
     * @method toString
     * @return {String}
     */
    toString() {
        return JSON.stringify(this.toJson());
    }
}

module.exports = BaseModel;
