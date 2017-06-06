'use strict';

const nodeify = require('./nodeify');
const crypto = require('crypto');
const ALGORITHM = 'sha256';
const ENCODING = 'hex';
const TOKEN_LENGTH = 256; // Measured in bits

/**
 * Create a token value with crypto
 * @method generateValue
 * @return {Promise}
 */
function generateValue() {
    return nodeify.withContext(crypto, 'randomBytes', [TOKEN_LENGTH / 8])
        .then(buffer => buffer.toString(ENCODING));
}

/**
 * Use crypto to hash a token value
 * @param  {String} value   Token to hash
 * @return {String}         Hashed value
 */
function hashValue(value) {
    return crypto.createHash(ALGORITHM).update(value).digest(ENCODING);
}

module.exports = {
    generateValue,
    hashValue
};
