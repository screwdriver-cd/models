'use strict';

const BaseModel = require('./base');

class TokenModel extends BaseModel {
    /**
     * Construct a TokenModel object
     * @method constructor
     * @param  {Object}    config
     * @param  {Object}    config.datastore         Object that will perform operations on the datastore
     * @param  {Number}    config.userId            The ID of the associated user
     * @param  {String}    config.value             Hashed token value
     * @param  {String}    config.name              The token name
     * @param  {String}    config.description       The token description
     * @param  {String}    config.lastUsed          The last time the token was used (ISO String)
     */
    constructor(config) {
        super('token', config);
    }
}

module.exports = TokenModel;
