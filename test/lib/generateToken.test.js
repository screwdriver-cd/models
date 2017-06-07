'use strict';

const assert = require('chai').assert;
const sinon = require('sinon');
const generateToken = require('../../lib/generateToken');

sinon.assert.expose(assert, { prefix: '' });

describe('generateToken', () => {
    const RANDOM_BYTES = 'some random bytes';
    // Result of passing 'some random bytes' through a sha256 hash, in base64
    const HASH = 'mF0EvjvxWMrVz5ZGJcnbe0ZPooUlv_DAB9VrV6bmZmg';
    let firstValue;

    it('generates a value', () =>
        generateToken.generateValue()
            .then((value) => {
                firstValue = value;
                // Check that it's a base64 value of the right length
                assert.match(value, /[a-zA-Z0-9_-]{43}/);
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
