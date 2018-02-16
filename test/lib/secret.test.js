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
            id: 12345,
            pipelineId: 54321,
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
                            id: 12345,
                            value: 'sealedspiderman'
                        }
                    }));
                });
        });
    });
});
