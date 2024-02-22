'use strict';

const { assert } = require('chai');
const rewiremock = require('rewiremock/node');
const sinon = require('sinon');
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

    beforeEach(() => {
        datastore = {
            update: sinon.stub()
        };
        ironMock = {
            seal: sinon.stub(),
            unseal: sinon.stub(),
            defaults: {}
        };

        // eslint-disable-next-line global-require
        BaseModel = require('../../lib/base');

        SecretModel = rewiremock.proxy('../../lib/secret', {
            '@hapi/iron': ironMock
        });

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
    });

    it('is constructed properly', () => {
        assert.instanceOf(secret, SecretModel);
        assert.instanceOf(secret, BaseModel);
        schema.models.secret.allKeys.forEach(key => {
            assert.strictEqual(secret[key], createConfig[key]);
        });
    });

    describe('update', () => {
        beforeEach(() => {
            ironMock.seal.resolves('sealedspiderman');
        });

        it('promises to update a secret and seal the value before datastore saves it', () => {
            datastore.update.resolves({});

            secret.value = 'spiderman';

            return secret.update().then(() => {
                assert.calledWith(ironMock.seal, 'spiderman', password, ironMock.defaults);
                assert.isTrue(
                    datastore.update.calledWith({
                        table: 'secrets',
                        params: {
                            id: 12345,
                            value: 'sealedspiderman'
                        }
                    })
                );
            });
        });
    });
});
