'use strict';

const schema = require('screwdriver-data-schema');
const hoek = require('hoek');
const PAGINATE_PAGE = 1;
const PAGINATE_COUNT = 50;

class BaseFactory {
    /**
     * Construct a BaseModel object
     * @method constructor
     * @param  {String}    modelName            Name of the model to get from data-schema
     * @param  {Object}    config
     * @param  {Object}    config.datastore     Object that will perform operations on the datastore
     * @param  {Object}    config.scm           Object that will perform operations on scm resource
     */
    constructor(modelName, config) {
        this.model = schema.models[modelName];
        this.table = this.model.tableName;
        this.datastore = config.datastore;
        this.scm = config.scm;
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
     * Create a Model
     * @method create
     * @param  {Object}    config               Config object
     * @return {Promise}
     */
    create(config) {
        const modelConfig = {
            table: this.table,
            params: {}
        };

        // Filter for valid keys
        this.model.allKeys.forEach((key) => {
            if (config[key] !== undefined) {
                modelConfig.params[key] = config[key];
            }
        });

        return this.datastore.save(modelConfig)
            .then((modelData) => {
                const c = config;

                c.datastore = this.datastore;
                c.scm = this.scm;
                c.id = modelData.id;

                return this.createClass(c);
            });
    }

    /**
     * Get a record based on id
     * @method get
     * @param  {Mixed}   config    The configuration from which an id is generated or the actual id
     * @return {Promise}
     */
    get(config) {
        const params = {};

        if (typeof config === 'object' && !config.id) {
            // Reduce to unique properties
            this.model.keys.forEach((key) => {
                params[key] = config[key];
            });
        } else {
            const id = parseInt(config.id || config, 10);

            if (id) {
                params.id = id;
            }
        }

        const lookup = {
            table: this.table,
            params
        };

        return this.datastore.get(lookup)
            .then((data) => {
                // datastore miss
                if (!data) {
                    return data;
                }

                data.datastore = this.datastore;
                data.scm = this.scm;

                return this.createClass(data);
            });
    }

    /**
     * List records with pagination and filter options
     * @method list
     * @param  {Object}   [config]
     * @param  {Object}   [config.params]           Parameters to filter on
     * @param  {Object}   [config.paginate]         Pagination parameters
     * @param  {Number}   [config.paginate.count]   Number of items per page
     * @param  {Number}   [config.paginate.page]    Specific page of the set to return
     * @param  {Object}   [config.search]           Search parameters
     * @param  {String}   [config.search.field]     Search field (e.g.: jobName)
     * @param  {String}   [config.search.keyword]   Search keyword (e.g.: %PR-%)
     * @param  {String}   [config.sort]             Sorting option ('ascending' or 'descending')
     * @param  {String}   [config.sortBy]           Key to sort by (default is 'id')
     * @return {Promise}
     */
    list(config) {
        const scanConfig = {
            table: this.table,
            params: hoek.reach(config, 'params', { default: {} })
        };

        if (config && config.search) {
            scanConfig.search = config.search;
        }

        if (config && config.sort) {
            scanConfig.sort = config.sort;
        }

        if (config && config.sortBy) {
            scanConfig.sortBy = config.sortBy;
        }

        if (config && config.paginate) {
            scanConfig.paginate = {
                count: hoek.reach(config, 'paginate.count', { default: PAGINATE_COUNT })
                    || PAGINATE_COUNT,
                page: hoek.reach(config, 'paginate.page', { default: PAGINATE_PAGE })
                    || PAGINATE_PAGE
            };
        }

        return this.datastore.scan(scanConfig)
            .then((data) => {
                if (!Array.isArray(data)) {
                    throw new Error('Unexpected response from datastore, ' +
                        `expected Array, got ${typeof data}`);
                }
                const result = [];

                data.forEach((item) => {
                    item.datastore = this.datastore;
                    item.scm = this.scm;

                    result.push(this.createClass(item));
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
