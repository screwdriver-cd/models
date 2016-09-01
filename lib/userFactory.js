'use strict';

const BaseFactory = require('./baseFactory');
const User = require('./user');
const iron = require('iron');
const nodeify = require('./nodeify');
const hoek = require('hoek');
// Get symbols for private fields
const password = Symbol();

let instance;
/**
 * Seal token
 * @method sealToken
 * @param  {String}   token      Token to seal
 * @return {Promise}
 */
const sealToken = (token, pw) =>
    nodeify.withContext(iron, 'seal', [token, pw, iron.defaults]);

class UserFactory extends BaseFactory {
    /**
     * Construct a UserFactory object
     * @method constructor
     * @param  {Object}    config
     * @param  {Object}    config.datastore     Object that will perform operations on the datastore
     * @param  {String}    config.password      Password for encryption operations
     */
    constructor(config) {
        super('user', config);
        this[password] = config.password;
    }

    /**
     * Instantiate a User class
     * @method createClass
     * @param  config
     * @return {User}
     */
    createClass(config) {
        const c = hoek.applyToDefaults(config, { password: this[password] });

        return new User(c);
    }

    /**
     * Create a user model
     * Need to seal the user token before saving
     * @method create
     * @param  {Object}  config
     * @param  {String}  config.username    Users handle
     * @param  {String}  config.token       Unsealed token
     * @return {Promise}
     */
    create(config) {
        return sealToken(config.token, this[password]).then(token => {
            const modelConfig = hoek.applyToDefaults(config, { token, password: this[password] });

            return super.create(modelConfig);
        });
    }

    /**
     * Get an instance of the UserFactory
     * @method getInstance
     * @param  {Object}     config
     * @param  {Datastore}  config.datastore    A datastore instance
     * @param  {Datastore}  config.scmPlugin    A scm plugin instance
     * @return {UserFactory}
     */
    static getInstance(config) {
        if (!instance && (!config || !config.scmPlugin)) {
            throw new Error('No scm plugin provided to UserFactory');
        }
        instance = BaseFactory.getInstance(UserFactory, instance, config);

        return instance;
    }
}

module.exports = UserFactory;
