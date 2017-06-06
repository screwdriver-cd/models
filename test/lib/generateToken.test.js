'use strict';

const assert = require('chai').assert;
const sinon = require('sinon');
const generateToken = require('../../lib/generateToken');

sinon.assert.expose(assert, { prefix: '' });

describe('generateToken', () => {
    const RANDOM_BYTES = 'some random bytes';
    // Result of passing 'some random bytes' through a sha256 hash, in hex
    const HASH = '985d04be3bf158cad5cf964625c9db7b464fa28525bff0c007d56b57a6e66668';
    let firstValue;

    it('generates a value', () =>
        generateToken.generateValue()
            .then((value) => {
                firstValue = value;
                // Check that it's a hex value of the right length
                assert.match(value, /[a-f0-9]{64}/);
            }));

    it('generates a different value on a second call', () => {
        generateToken.generateValue()
            .then((value) => {
                assert.notEqual(value, firstValue);
            });
    });

    it('hashes a value', () => {
        assert.strictEqual(generateToken.hashValue(RANDOM_BYTES), HASH);
    });

    it('hashes a different value to a different hash', () => {
        assert.notEqual(generateToken.hashValue('some different bytes'), HASH);
    });
});
