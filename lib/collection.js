'use strict';

const BaseModel = require('./base');

class CollectionModel extends BaseModel {
    /**
     * Construct a CollectionModel object
     * @method constructor
     * @param {Object} config
     * @param {Object} config.datastore       Object that will perform operations on the datastore
     * @param {Number} config.userId          The ID of the associated user
     * @param {String} config.name            The collection name
     * @param {String} [config.description]   The collection description (Optional)
     * @param {Array}  config.pipelineIds     The ids of the pipelines associated with this collection
     */
    constructor(config) {
        super('collection', config);
    }
}

module.exports = CollectionModel;
