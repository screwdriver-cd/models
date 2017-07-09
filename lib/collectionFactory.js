'use strict';

const BaseFactory = require('./baseFactory');
const Collection = require('./collection');

let instance;

class CollectionFactory extends BaseFactory {
    /**
     * Construct a CollectionFactory object
     * @method constructor
     * @param {Object} config
     * @param {Object} config.datastore     Object that will perform operations on the datastore
     */
    constructor(config) {
        super('collection', config);
    }

    /**
     * Instantiate a Collection class
     * @method createClass
     * @param {Object} config
     * @return {Collection}
     */
    createClass(config) {
        return new Collection(config);
    }

    /**
     * Create a Collection model
     * @param {Object} config
     * @param {Number} config.userId         The ID of the associated user
     * @param {String} config.name           The collection name
     * @param {String} [config.description]  The collection description (Optional)
     * @param {Array}  [config.pipelineIds]  The ids of the pipelines associated with this collection
     * @memberof CollectionFactory
     */
    create(config) {
        if (!config.pipelineIds) {
            config.pipelineIds = [];
        }

        return super.create(config);
    }

    /**
     * Get an instance of CollectionFactory
     * @method getInstance
     * @param {Object} config
     * @param {DataStore} config.datastore    A datastore instance
     * @return {CollectionFactory}
     */
    static getInstance(config) {
        instance = BaseFactory.getInstance(CollectionFactory, instance, config);

        return instance;
    }
}

module.exports = CollectionFactory;
