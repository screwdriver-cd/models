'use strict';
const hashr = require('screwdriver-hashr');
const BaseModel = require('./base');

class UserModel extends BaseModel {
    /**
     * Construct a UserModel object
     * @method constructor
     * @param  {Object}    datastore         Object that will perform operations on the datastore
     */
    constructor(datastore) {
        super(datastore);
        this.table = 'users';
    }

    /**
     * Create a user
     * @method create
     * @param  {Object}   config                Config object to create the user with
     * @param  {String}   config.username       The username
     * @param  {String}   config.token          The user's github token
     * @param  {Function} callback              fn(err, data) where data is the new object created
     */
    create(config, callback) {
        const id = hashr.sha1(config.username);
        const userConfig = {
            table: this.table,
            params: {
                id,
                data: config
            }
        };

        return this.datastore.save(userConfig, callback);
    }
}

module.exports = UserModel;
