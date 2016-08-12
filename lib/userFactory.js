'use strict';

const BaseFactory = require('./baseFactory');
const User = require('./user');
const iron = require('iron');
const nodeify = require('./nodeify');
const hoek = require('hoek');
let instance;
/**
 * Seal token
 * @method sealToken
 * @param  {String}   token      Token to seal
 * @return {Promise}
 */
const sealToken = (token, password) =>
    nodeify.withContext(iron, 'seal', [token, password, iron.defaults]);

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
        this.password = config.password;
    }

    /**
     * Instantiate a User class
     * @method createClass
     * @param  config
     * @return {User}
     */
    createClass(config) {
        const c = hoek.applyToDefaults(config, { password: this.password });

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
        return sealToken(config.token, this.password).then(token => {
            const modelConfig = hoek.applyToDefaults(config, { token, password: this.password });

            return super.create(modelConfig);
        });
    }

    /**
     * Get an instance of the UserFactory
     * @method getInstance
     * @param  {Object}     config
     * @param  {Datastore}  config.datastore
     * @return {UserFactory}
     */
    static getInstance(config) {
        if (!instance) {
            if (!config || !config.datastore) {
                throw new Error('No datastore provided to UserFactory');
            }

            instance = new UserFactory(config);
        }

        return instance;
    }
}

module.exports = UserFactory;
