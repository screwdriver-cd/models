'use strict';
const assert = require('chai').assert;
const sinon = require('sinon');
const schema = require('screwdriver-data-schema');
const SecretModel = require('../../lib/secret');
const BaseModel = require('../../lib/base');

sinon.assert.expose(assert, { prefix: '' });

describe('Secret Model', () => {
    it('is constructed properly', () => {
        const createConfig = {
            datastore: {},
            id: 'd398fb192747c9a0124e9e5b4e6e8e841cf8c71c',
            pipelineId: 'e124fb192747c9a0124e9e5b4e6e8e841cf8c71c',
            name: 'secret',
            value: 'batman',
            allowInPR: true
        };
        const secret = new SecretModel(createConfig);

        assert.instanceOf(secret, SecretModel);
        assert.instanceOf(secret, BaseModel);
        schema.models.secret.allKeys.forEach(key => {
            assert.strictEqual(secret[key], createConfig[key]);
        });
    });
});
