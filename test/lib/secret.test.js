'use strict';

const assert = require('chai').assert;
const sinon = require('sinon');
const mockery = require('mockery');
const schema = require('screwdriver-data-schema');

sinon.assert.expose(assert, { prefix: '' });

describe('Secret Model', () => {
    const password = 'password';
    let BaseModel;
    let SecretModel;
    let ironMock;
    let datastore;
    let createConfig;
    let secret;

    before(() => {
        mockery.enable({
            useCleanCache: true,
            warnOnUnregistered: false
        });
    });

    beforeEach(() => {
        datastore = {
            update: sinon.stub()
        };
        ironMock = {
            seal: sinon.stub(),
            unseal: sinon.stub(),
            defaults: {}
        };

        mockery.registerMock('iron', ironMock);

        // eslint-disable-next-line global-require
        BaseModel = require('../../lib/base');

        // eslint-disable-next-line global-require
        SecretModel = require('../../lib/secret');

        createConfig = {
            datastore,
            id: 'd398fb192747c9a0124e9e5b4e6e8e841cf8c71c',
            pipelineId: 'e124fb192747c9a0124e9e5b4e6e8e841cf8c71c',
            name: 'secret',
            value: 'batman',
            allowInPR: true,
            password
        };
        secret = new SecretModel(createConfig);
    });

    afterEach(() => {
        datastore = null;
        mockery.deregisterAll();
        mockery.resetCache();
    });

    after(() => {
        mockery.disable();
    });

    it('is constructed properly', () => {
        assert.instanceOf(secret, SecretModel);
        assert.instanceOf(secret, BaseModel);
        schema.models.secret.allKeys.forEach((key) => {
            assert.strictEqual(secret[key], createConfig[key]);
        });
    });

    describe('update', () => {
        beforeEach(() => {
            ironMock.seal.yieldsAsync(null, 'sealedspiderman');
        });

        it('promises to update a secret and seal the value before datastore saves it', () => {
            datastore.update.resolves({});

            secret.value = 'spiderman';

            return secret.update()
                .then(() => {
                    assert.calledWith(ironMock.seal, 'spiderman', password, ironMock.defaults);
                    assert.isTrue(datastore.update.calledWith({
                        table: 'secrets',
                        params: {
                            id: 'd398fb192747c9a0124e9e5b4e6e8e841cf8c71c',
                            data: {
                                value: 'sealedspiderman'
                            }
                        }
                    }));
                });
        });
    });
});
