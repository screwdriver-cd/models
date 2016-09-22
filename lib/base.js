'use strict';
const schema = require('screwdriver-data-schema');
const nodeify = require('./nodeify');
// Get symbols for private fields
const rowData = Symbol();
const dirty = Symbol();
const model = Symbol();
const table = Symbol();
const datastore = Symbol();
const scmPlugin = Symbol();

class BaseModel {
    /**
     * Construct a BaseModel object
     * @method constructor
     * @param  {String}     modelName           Name of the model to get from data-schema
     * @param  {Object}     config
     * @param  {Object}     config.datastore    Object that will perform operations on the datastore
     * @param  {Object}     config.scmPlugin    Object that will perform operations on scm resources
     */
    constructor(modelName, config) {
        this[model] = schema.models[modelName];
        this[table] = this[model].tableName;
        this[datastore] = config.datastore;
        this[scmPlugin] = config.scmPlugin;
        this[rowData] = {};
        this[dirty] = [];

        const setter = (key, val) => {
            this[rowData][key] = val;
            this[dirty].push(key);
        };
        const getter = (key) => this[rowData][key];

        this[model].allKeys.forEach(key => {
            this[rowData][key] = config[key];

            Object.defineProperty(this, key, {
                get: getter.bind(this, key),
                set: setter.bind(this, key),
                enumerable: true
            });
        });
    }

    get scm() {
        return this[scmPlugin];
    }

    /**
     * Check if the model data is dirty.
     * If key is passed in, check if the key is dirty.
     * @param  {String}  [key]    They key to check
     * @return {Boolean}
     */
    isDirty(key) {
        if (key) {
            return this[dirty].includes(key);
        }

        return this[dirty].length > 0;
    }

    /**
     * Update a record
     * @method update
     * @return {Promise}
     */
    update() {
        const data = {};

        if (!this.isDirty()) {
            return nodeify.success(this);
        }

        // only update dirty fields
        this[dirty].forEach(key => {
            data[key] = this[rowData][key];
        });
        delete data.id;

        const datastoreConfig = {
            table: this[table],
            params: {
                id: this.id,
                data
            }
        };

        // TODO: sync `this` with db response?
        return this[datastore].update(datastoreConfig)
            .then(() => {
                this[dirty] = [];

                return this;
            });
    }

    /**
     * Remove this Model
     * @method remove
     * @return {Promise}
     */
    remove() {
        const config = {
            table: this[table],
            params: {
                id: this.id
            }
        };

        return this[datastore].remove(config);
    }

    /**
     * Get a JSON representation of the model data
     * @method toJson
     * @return {Object}
     */
    toJson() {
        return this[rowData];
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
