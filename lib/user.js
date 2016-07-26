'use strict';
const BaseModel = require('./base');
const iron = require('iron');

class UserModel extends BaseModel {
    /**
     * Construct a UserModel object
     * @method constructor
     * @param  {Object}    datastore         Object that will perform operations on the datastore
     * @param  {String}    password          Login password
     */
    constructor(datastore, password) {
        super('user', datastore);
        this.password = password;
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
        const id = this.generateId(config);
        const userConfig = {
            table: this.table,
            params: {
                id,
                data: config
            }
        };

        return this.datastore.save(userConfig, callback);
    }

    /**
     * Seal token
     * @param  {String}   token      User's github token
     * @param  {Function} callback   fn(err, sealed) where sealed is the sealed token
     */
    sealToken(token, callback) {
        return iron.seal(token, this.password, iron.defaults, callback);
    }

    /**
     * Unseal token
     * @param  {String}   sealed      Sealed token
     * @param  {Function} callback    fn(err, unsealed) where unsealed is the unsealed token
     */
    unsealToken(sealed, callback) {
        return iron.unseal(sealed, this.password, iron.defaults, callback);
    }
}

module.exports = UserModel;
