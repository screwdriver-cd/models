'use strict';
const BaseModel = require('./base');
const iron = require('iron');
const async = require('async');
const Github = require('github');
const schema = require('screwdriver-data-schema');
const Breaker = require('circuit-fuses');
const github = new Github();

/**
 * Github command to run
 * @method githubCommand
 * @param  {Object}   options            An object that tells what command & params to run
 * @param  {String}   options.token      Github token
 * @param  {String}   options.action     Github method. For example: get
 * @param  {Object}   options.params     Parameters to run with
 * @param  {Function} callback           Callback function from github API
 */
function githubCommand(options, callback) {
    github.authenticate({
        type: 'oauth',
        token: options.token
    });
    github.repos[options.action](options.params, callback);
}

const githubBreaker = new Breaker(githubCommand);

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
     * @method sealToken
     * @param  {String}   token      User's github token
     * @param  {Function} callback   fn(err, sealed) where sealed is the sealed token
     */
    sealToken(token, callback) {
        return iron.seal(token, this.password, iron.defaults, callback);
    }

    /**
     * Unseal token
     * @method unsealToken
     * @param  {String}   sealed      Sealed token
     * @param  {Function} callback    fn(err, unsealed) where unsealed is the unsealed token
     */
    unsealToken(sealed, callback) {
        return iron.unseal(sealed, this.password, iron.defaults, callback);
    }

    /**
     * Get permissions on a specific repo
     * @method getPermissions
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
                const matched = (schema.config.regex.SCM_URL).exec(config.scmUrl);

                githubBreaker.runCommand({
                    token: unsealed,
                    action: 'get',
                    params: {
                        user: matched[2],
                        repo: matched[3]
                    }
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
