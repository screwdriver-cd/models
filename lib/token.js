'use strict';

const BaseModel = require('./base');
const generateToken = require('./generateToken');

const password = Symbol('password');

class TokenModel extends BaseModel {
    /**
     * Construct a TokenModel object
     * @method constructor
     * @param  {Object}    config
     * @param  {Object}    config.datastore         Object that will perform operations on the datastore
     * @param  {Number}    config.userId            The ID of the associated user
     * @param  {String}    config.hash              Hashed token value
     * @param  {String}    config.name              The token name
     * @param  {String}    config.description       The token description
     * @param  {String}    config.lastUsed          The last time the token was used (ISO String)
     * @param  {String}    config.password          Password used as a salt by PBKDF2
     */
    constructor(config) {
        super('token', config);
        this[password] = config.password;
    }

    /**
     * Refresh a token value, and return the value once
     * @method refresh
     * @return {Promise}
     */
    refresh() {
        let value;

        return generateToken.generateValue()
            .then((bytes) => {
                value = bytes;
                this.hash = generateToken.hashValue(bytes, this[password]);

                return this.update();
            }).then((model) => {
                model.value = value;

                return model;
            });
    }

    /**
     * Get the token as JSON, including value if it exists
     * @method toJson
     * @return {Object}
     */
    toJson() {
        const output = super.toJson();

        if (this.value) {
            output.value = this.value;
        }

        delete output.hash;

        return output;
    }
}

module.exports = TokenModel;
