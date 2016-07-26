'use strict';
const BaseModel = require('./base');

class PlatformModel extends BaseModel {
    /**
     * Construct a PlatformModel object
     * @method constructor
     * @param  {Object}    datastore         Object that will perform operations on the datastore
     */
    constructor(datastore) {
        super('platform', datastore);
    }

    /**
     * Create a platform
     * @method create
     * @param  {Object}   config                Config object to create the platform with
     * @param  {String}   config.name           The name of the platform
     * @param  {String}   config.version        The version of the platform
     * @param  {Function} callback              fn(err, data) where data is the newly created object
     */
    create(config, callback) {
        const id = this.generateId(config);
        const platformConfig = {
            table: this.table,
            params: {
                id,
                data: config
            }
        };

        return this.datastore.save(platformConfig, callback);
    }
}

module.exports = PlatformModel;
