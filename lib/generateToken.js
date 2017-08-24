'use strict';

const base64url = require('base64url');
const crypto = require('crypto');
const nodeify = require('./nodeify');

// Config for pbkdf2
// 100,000 iterations is still fast enough to be performant (84ms to run the unit test) while also
// creating enough of a delay to stop brute force attacks
// For more info, see https://www.owasp.org/index.php/Password_Storage_Cheat_Sheet
const ALGORITHM = 'sha512';
const ITERATIONS = 100000;

// Token length and hash length, measured in bytes
const TOKEN_LENGTH = 32;
const HASH_LENGTH = 64;

/**
 * Create a token value with crypto
 * @method generateValue
 * @return {Promise}
 */
function generateValue() {
    return nodeify.withContext(crypto, 'randomBytes', [TOKEN_LENGTH])
        .then(base64url);
}

/**
 * Use crypto to hash a token value
 * @param  {String} value   Token to hash
 * @param  {String} salt    Salt value for PBKDF2
 * @return {Promise}
 */
function hashValue(value, salt) {
    return nodeify.withContext(crypto, 'pbkdf2', [value, salt, ITERATIONS, HASH_LENGTH, ALGORITHM])
        .then(base64url);
}

module.exports = {
    generateValue,
    hashValue
};
