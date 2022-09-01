'use strict';

const iron = require('@hapi/iron');
const BaseModel = require('./base');
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
     * @param  {String}   config.scmContext     The scm context to which user belongs
     * @param  {String}   config.password       The encryption password
     */
    constructor(config) {
        super('user', config);
        this[password] = config.password;
        this.scmContext = config.scmContext;
        this.username = config.username;
    }

    /**
     * Seal token
     * @method sealToken
     * @param  {String}   token      Token to seal
     * @return {Promise}
     */
    sealToken(token) {
        // TODO: automatically update user model and datastore with new sealed token???
        return iron.seal(token, this[password], iron.defaults);
    }

    /**
     * Unseal token
     * @method unsealToken
     * @return {Promise}
     */
    unsealToken() {
        return iron.unseal(this.token, this[password], iron.defaults);
    }

    /** Fetch a user's tokens
    /* @property tokens
    /* @return {Promise}
    */
    get tokens() {
        const listConfig = {
            params: {
                userId: this.id
            }
        };

        // Lazy load factory dependency to prevent circular dependency issues
        // https://nodejs.org/api/modules.html#modules_cycles
        /* eslint-disable global-require */
        const TokenFactory = require('./tokenFactory');
        /* eslint-enable global-require */
        const factory = TokenFactory.getInstance();
        const tokens = factory.list(listConfig);

        // ES6 has weird getters and setters in classes,
        // so we redefine the pipeline property here to resolve to the
        // resulting promise and not try to recreate the factory, etc.
        Object.defineProperty(this, 'tokens', {
            enumerable: true,
            value: tokens
        });

        return tokens;
    }

    /**
     * Get permissions on a specific repo
     * @method getPermissions
     * @param  {String}     scmUri          The scmUri of the repository
     * @param  {String}     [scmContext]    The scmContext of the repository
     * @return {Promise}                    Contains the permissions for [admin, push, pull]
     *                                      Example: {admin: false, push: true, pull: true}
     */
    getPermissions(scmUri, scmContext) {
        return this.unsealToken().then(token =>
            this.scm.getPermissions({
                token,
                scmUri,
                scmContext: scmContext || this.scmContext
            })
        );
    }

    /**
     * Get a full display name
     * @method getFullDisplayName
     * @return {String}
     */
    getFullDisplayName() {
        const displayName = this.scm.getDisplayName({ scmContext: this.scmContext });

        return `${displayName}:${this.username}`;
    }

    /**
     * Get user settings
     * @method getSettings
     * @return {Promise}
     */
    getSettings() {
        return this.settings || {};
    }

    /**
     * Update user settings
     * @method updateSettings
     * @param  settings     Settings to update
     * @return {Promise}
     */
    updateSettings(settings) {
        this.settings = settings || {};

        return super.update().then(user => {
            return user.settings;
        });
    }

    /**
     * Remove user settings
     * @method removeSettings
     * @return {Promise}
     */
    removeSettings() {
        this.settings = {};

        return super.update().then(user => {
            return user.settings;
        });
    }
}

module.exports = UserModel;
