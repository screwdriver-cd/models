'use strict';

const BaseFactory = require('./baseFactory');
const Secret = require('./secret');
const iron = require('iron');
const nodeify = require('./nodeify');
const hoek = require('hoek');
// Get symbols for private fields
const password = Symbol();

let instance;

/**
 * Seal secret value
 * @method sealSecret
 * @param  {String}         secretvalue     Secret value to seal
 * @param  {String}         pw              Password to seal with
 * @return {Promise}
 */
function sealSecret(secretvalue, pw) {
    return nodeify.withContext(iron, 'seal', [secretvalue, pw, iron.defaults]);
}

/**
 * Unseal secret value and return the secret with the unsealed value
 * @param  {SecretModel}        secret  Secret to unseal
 * @param  {String}             pw      Password to unseal with[description]
 * @return {Promise}
 */
function unsealSecret(secret, pw) {
    return nodeify.withContext(iron, 'unseal', [secret.value, pw, iron.defaults])
        .then(unsealed => {
            secret.value = unsealed;

            return secret;
        });
}

class SecretFactory extends BaseFactory {
    /**
     * Construct a SecretFactory object
     * @method constructor
     * @param  {Object}    config
     * @param  {Object}    config.datastore     Object that will perform operations on the datastore
     * @param  {String}    config.password      Password for encryption operations
     */
    constructor(config) {
        super('secret', config);
        this[password] = config.password;
    }

    /**
     * Instantiate a Secret class
     * @method createClass
     * @param  config
     * @return {Secret}
     */
    createClass(config) {
        const c = hoek.applyToDefaults(config, { password: this[password] });

        return new Secret(c);
    }

    /**
     * Create a secret model
     * Need to seal the secret before saving
     * @method create
     * @param  {Object}     config
     * @param  {String}     config.pipelineId      Pipeline Id
     * @param  {String}     config.name            Secret name
     * @param  {String}     config.value           Secret value
     * @param  {Boolean}    config.allowInPR       Whether this secret can be shown in PR builds
     * @return {Promise}
     */
    create(config) {
        return sealSecret(config.value, this[password])
            .then(sealed => super.create(hoek.applyToDefaults(config, { value: sealed })));
    }

    /**
     * Get a secret based on id
     * @method get
     * @param  {Mixed}   config    The configuration from which an id is generated or the actual id
     * @return {Promise}
     */
    get(config) {
        return super.get(config)
            .then(secret => unsealSecret(secret, this[password]));
    }

    /**
     * List secrets with pagination and filter options
     * @method list
     * @param  {Object}   config                  Config object
     * @param  {Object}   config.params           Parameters to filter on
     * @param  {Object}   config.paginate         Pagination parameters
     * @param  {Number}   config.paginate.count   Number of items per page
     * @param  {Number}   config.paginate.page    Specific page of the set to return
     * @return {Promise}
     */
    list(config) {
        return super.list(config).then(secrets =>
            Promise.all(secrets.map(secret => unsealSecret(secret, this[password]))));
    }

    /**
     * Get an instance of the SecretFactory
     * @method getInstance
     * @param  {Object}     config
     * @param  {Datastore}  config.datastore    A datastore instance
     * @param  {String}     config.password     Password for encryption operations
     * @return {SecretFactory}
     */
    static getInstance(config) {
        instance = BaseFactory.getInstance(SecretFactory, instance, config);

        return instance;
    }
}

module.exports = SecretFactory;
