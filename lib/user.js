'use strict';
const BaseModel = require('./base');
const iron = require('iron');
const async = require('async');
const github = require('github');

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

    /**
     * Get permissions on a specific repo
     * @param  {String}  config.username        Username
     * @param  {String}  config.scmUrl          The scmUrl of the repository
     * @return {Function} callback              fn(err, permissions) where permissions is an object
     *                                          that contains the permissions for [admin, push, pull]
     *                                          Example: {admin: false, push: true, pull: true}
     */
    getPermissions(config, callback) {
        const id = this.generateId({ username: config.username });

        async.waterfall([
            (next) => {
                this.get(id, next);
            },
            (user, next) => {
                this.unsealToken(user.token, next);
            },
            (unsealed, next) => {
                const matched = config.scmUrl.match(/^git@([^:]+):([^\/]+)\/(.+?)\.git(\/.+)?$/);

                github.authenticate({
                    type: 'oauth',
                    token: unsealed
                });
                github.repos.get({
                    user: matched[2],
                    repo: matched[3]
                }, next);
            }
        ], (err, repo) => {
            if (err) {
                return callback(err);
            }

            return callback(null, repo.permissions);
        });
    }
}

module.exports = UserModel;
