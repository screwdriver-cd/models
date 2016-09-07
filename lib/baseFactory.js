'use strict';
const schema = require('screwdriver-data-schema');
const hashr = require('screwdriver-hashr');
const nodeify = require('./nodeify');
const hoek = require('hoek');

class BaseFactory {
    /**
     * Construct a BaseModel object
     * @method constructor
     * @param  {String}    modelName            Name of the model to get from data-schema
     * @param  {Object}    config
     * @param  {Object}    config.datastore     Object that will perform operations on the datastore
     * @param  {Object}    config.scmPlugin     Object that will perform operations on scm resource
     */
    constructor(modelName, config) {
        this.model = schema.models[modelName];
        this.table = this.model.tableName;
        this.datastore = config.datastore;
        this.scmPlugin = config.scmPlugin;
    }

    /**
     * Interface for creating an instance of a Model
     * @method createClass
     * @return {Object}
     */
    createClass() {
        throw new Error('must be implemented by extender');
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
     * Create a Model
     * @method create
     * @param  {Object}    config               Config object
     * @return {Promise}
     */
    create(config) {
        const id = this.generateId(config);
        const modelConfig = {
            table: this.table,
            params: {
                id,
                data: {}
            }
        };

        // Filter for valid keys
        this.model.allKeys.forEach((key) => {
            if (config[key]) {
                modelConfig.params.data[key] = config[key];
            }
        });

        return nodeify.withContext(this.datastore, 'save', [modelConfig])
            .then(modelData => this.createClass(hoek.applyToDefaults(config, {
                datastore: this.datastore,
                scmPlugin: this.scmPlugin,
                id: modelData.id
            })));
    }

    /**
     * Get a record based on id
     * @method get
     * @param  {Mixed}   config    The configuration from which an id is generated or the actual id
     * @return {Promise}
     */
    get(config) {
        let id = config;

        if (typeof config === 'object' && config.id) {
            id = config.id;
        } else if (typeof config === 'object') {
            id = this.generateId(config);
        }

        const lookup = {
            table: this.table,
            params: {
                id
            }
        };

        return nodeify.withContext(this.datastore, 'get', [lookup])
            .then(data => {
                // datastore miss, can not applyToDefaults on null
                if (!data) {
                    return data;
                }

                return this.createClass(hoek.applyToDefaults(data, {
                    datastore: this.datastore,
                    scmPlugin: this.scmPlugin
                }));
            });
    }

    /**
     * List records with pagination and filter options
     * @method list
     * @param  {Object}   config                  Config object
     * @param  {Object}   config.params           Parameters to filter on
     * @param  {Object}   config.paginate         Pagination parameters
     * @param  {Number}   config.paginate.count   Number of items per page
     * @param  {Number}   config.paginate.page    Specific page of the set to return
     * @return {Promise}
     */
    list(config) {
        const scanConfig = {
            table: this.table,
            params: config.params || {},
            paginate: {
                count: config.paginate.count,
                page: config.paginate.page
            }
        };

        return nodeify.withContext(this.datastore, 'scan', [scanConfig])
            .then(data => {
                if (!Array.isArray(data)) {
                    throw new Error('Unexpected response from datastore, ' +
                        `expected Array, got ${typeof data}`);
                }
                const result = [];

                data.forEach(item => {
                    result.push(this.createClass(hoek.applyToDefaults(item, {
                        datastore: this.datastore,
                        scmPlugin: this.scmPlugin
                    })));
                });

                return result;
            });
    }

    /**
     * Get an instance of a Factory
     * @method getInstance
     * @param  {Object}     ClassDef            Class definition of a factory
     * @param  {Object}     instance            The current instance of a factory
     * @param  {Object}     config
     * @param  {Datastore}  config.datastore    A datastore instance
     * @return {Factory}
     */
    static getInstance(ClassDef, instance, config) {
        let inst = instance;

        if (!inst) {
            const className = ClassDef.name;

            if (!config || !config.datastore) {
                throw new Error(`No datastore provided to ${className}`);
            }

            inst = new ClassDef(config);
        }

        return inst;
    }
}

module.exports = BaseFactory;
