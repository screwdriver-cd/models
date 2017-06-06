'use strict';

const nodeify = require('./nodeify');
const crypto = require('crypto');
const base64url = require('base64url');
const ALGORITHM = 'sha256';
const TOKEN_LENGTH = 256; // Measured in bits

/**
 * Create a token value with crypto
 * @method generateValue
 * @return {Promise}
 */
function generateValue() {
    return nodeify.withContext(crypto, 'randomBytes', [TOKEN_LENGTH / 8])
        .then(buffer => base64url(buffer.toString()));
}

/**
 * Use crypto to hash a token value
 * @param  {String} value   Token to hash
 * @return {String}         Hashed value
 */
function hashValue(value) {
    return base64url(crypto.createHash(ALGORITHM).update(value).digest());
}

module.exports = {
    generateValue,
    hashValue
};
