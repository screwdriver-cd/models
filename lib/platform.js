'use strict';
const hashr = require('screwdriver-hashr');
const BaseModel = require('./base');

class PlatformModel extends BaseModel {
    /**
     * Construct a PlatformModel object
     * @method constructor
     * @param  {Object}    datastore         Object that will perform operations on the datastore
     */
    constructor(datastore) {
        super(datastore);
        this.table = 'platforms';
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
        const id = hashr.sha1({
            name: config.name,
            version: config.version
        });
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
