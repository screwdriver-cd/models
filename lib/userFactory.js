'use strict';

const iron = require('@hapi/iron');
const BaseFactory = require('./baseFactory');
const User = require('./user');
// Get symbols for private fields
const password = Symbol('password');

let instance;
/**
 * Seal token
 * @method sealToken
 * @param  {String}   token      Token to seal
 * @return {Promise}
 */
const sealToken = (token, pw) => iron.seal(token, pw, iron.defaults);

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
     * @param  {Object}     config
     * @return {User}
     */
    createClass(config) {
        const c = config;

        c.password = this[password];

        return new User(c);
    }

    /**
     * Create a user model
     * Need to seal the user token before saving
     * @method create
     * @param  {Object}  config
     * @param  {String}  config.username    Users handle
     * @param  {String}  config.token       Unsealed token
     * @param  {String}  config.scmContext  The scm context to which user belongs
     * @return {Promise}
     */
    create(config) {
        return sealToken(config.token, this[password]).then(token => {
            const modelConfig = config;

            modelConfig.token = token;
            modelConfig.password = this[password];

            return super.create(modelConfig);
        });
    }

    /**
     * Get a user model by name, id, or personal access token
     * @method get
     * @param   {Mixed}     config
     * @param   {String}    [config.username]       Username of the user to look up
     * @param   {String}    [config.scmContext]     Scm context to look up
     * @param   {String}    [config.accessToken]    Access token of the user to look up
     * @return  {Promise}
     */
    get(config) {
        if (!config.accessToken) {
            return super.get(config);
        }

        // Lazy load factory dependency to prevent circular dependency issues
        // https://nodejs.org/api/modules.html#modules_cycles
        /* eslint-disable global-require */
        const TokenFactory = require('./tokenFactory');
        /* eslint-enable global-require */
        const tokenFactory = TokenFactory.getInstance();

        return tokenFactory.get({ value: config.accessToken }).then(token => {
            if (!token) {
                return token;
            }

            token.lastUsed = new Date().toISOString();

            return token.update().then(() => this.get(token.userId));
        });
    }

    /**
     * Get an instance of the UserFactory
     * @method getInstance
     * @param  {Object}     config
     * @param  {Datastore}  config.datastore    A datastore instance
     * @param  {Scm}        config.scm          A scm instance
     * @return {UserFactory}
     */
    static getInstance(config) {
        if (!instance && (!config || !config.scm)) {
            throw new Error('No scm plugin provided to UserFactory');
        }
        instance = BaseFactory.getInstance(UserFactory, instance, config);

        return instance;
    }
}

module.exports = UserFactory;
