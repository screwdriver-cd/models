'use strict';

const BaseModel = require('./base');
const nodeify = require('./nodeify');
const iron = require('iron');
// Get symbols for private fields
const password = Symbol('password');

class SecretModel extends BaseModel {
    /**
     * Construct a SecretModel object
     * @method constructor
     * @param  {Object}   config                Config object to create the secret with
     * @param  {Object}   config.datastore      Object that will perform operations on the datastore
     * @param  {String}   config.pipelineId     Pipeline Id
     * @param  {String}   config.name           Secret name
     * @param  {String}   config.value          Secret value
     * @param  {Boolean}  config.allowInPR      Whether this secret can be shown in PR builds
     * @param  {String}   config.password       The encryption password
     */
    constructor(config) {
        super('secret', config);
        this[password] = config.password;
    }

    /**
     * Update a secret with sealed secret value
     * @method update
     * @return {Promise}
     */
    update() {
        return nodeify.withContext(iron, 'seal', [this.value, this[password], iron.defaults])
            .then((sealed) => {
                this.value = sealed;

                return super.update();
            });
    }
}

module.exports = SecretModel;
