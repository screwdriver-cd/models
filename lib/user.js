'use strict';

const BaseModel = require('./base');
const iron = require('iron');
const nodeify = require('./nodeify');
// Get symbols for private fields
const password = Symbol('password');

class UserModel extends BaseModel {

    /**
     * Construct a UserModel object
     * @method constructor
     * @param  {Object}   config                Config object to create the user with
     * @param  {Object}   config.datastore      Object that will perform operations on the datastore
     * @param  {String}   config.username       The username
     * @param  {String}   config.token          The user's github token
     * @param  {String}   config.password       The encryption password
     */
    constructor(config) {
        super('user', config);
        this[password] = config.password;
    }

    /**
     * Seal token
     * @method sealToken
     * @param  {String}   token      Token to seal
     * @return {Promise}
     */
    sealToken(token) {
        // TODO: automatically update user model and datastore with new sealed token???
        return nodeify.withContext(iron, 'seal', [token, this[password], iron.defaults]);
    }

    /**
     * Unseal token
     * @method unsealToken
     * @return {Promise}
     */
    unsealToken() {
        return nodeify.withContext(iron, 'unseal',
            [this.token, this[password], iron.defaults]);
    }

    /**
     * Get permissions on a specific repo
     * @method getPermissions
     * @param  {String}     scmUri          The scmUri of the repository
     * @return {Promise}                    Contains the permissions for [admin, push, pull]
     *                                      Example: {admin: false, push: true, pull: true}
     */
    getPermissions(scmUri) {
        return this.unsealToken()
            .then(token => this.scm.getPermissions({
                token,
                scmUri
            }));
    }
}

module.exports = UserModel;
