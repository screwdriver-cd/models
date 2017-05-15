'use strict';

const BaseModel = require('./base');
const nodeify = require('./nodeify');
const iron = require('iron');

// Symbols for private members
const password = Symbol('password');

class TokenModel extends BaseModel {
    /**
     * Construct a TokenModel object
     * @method constructor
     * @param  {Object}    config
     * @param  {Object}    config.datastore         Object that will perform operations on the datastore
     * @param  {Number}    config.userId            The ID of the associated user
     * @param  {String}    config.value             The token value
     * @param  {String}    config.tokenId           The token ID
     * @param  {String}    config.name              The token name
     * @param  {String}    config.description       The token description
     * @param  {Date}      config.lastUsed          The last time the token was accessed
     * @param  {String}    config.password          The encryption password
     */
    constructor(config) {
        super('token', config);
        this[password] = config.password;
    }

    /**
     * Update a token with sealed token value
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

module.exports = TokenModel;
