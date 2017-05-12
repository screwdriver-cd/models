'use strict';

const assert = require('chai').assert;
const sinon = require('sinon');
const mockery = require('mockery');
const schema = require('screwdriver-data-schema');

sinon.assert.expose(assert, { prefix: '' });

describe('Token Model', () => {
    const password = 'password';
    let BaseModel;
    let TokenModel;
    let ironMock;
    let datastore;
    let createConfig;
    let token;

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
        datastore.update.resolves({});

        ironMock = {
            seal: sinon.stub(),
            unseal: sinon.stub(),
            defaults: {}
        };
        mockery.registerMock('iron', ironMock);

        /* eslint-disable global-require */
        BaseModel = require('../../lib/base');
        TokenModel = require('../../lib/token');
        /* eslint-enable global-require */

        createConfig = {
            datastore,
            userId: 12345,
            value: 'A_SECRET_TOKEN_VALUE',
            id: 6789,
            name: 'Mobile client auth token',
            description: 'For the mobile app',
            lastUsed: '2017-05-10T01:49:59.327Z',
            password
        };
        token = new TokenModel(createConfig);
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
        assert.instanceOf(token, TokenModel);
        assert.instanceOf(token, BaseModel);
        schema.models.token.allKeys.forEach((key) => {
            assert.strictEqual(token[key], createConfig[key]);
        });
    });

    describe('update', () => {
        beforeEach(() => {
            ironMock.seal.yieldsAsync(null, 'sealed');
        });

        it('promises to update a token and seal the value before datastore saves it', () => {
            const newTimestamp = '2017-05-13T02:01:17.588Z';

            token.value = 'unsealed';
            token.lastUsed = newTimestamp;

            return token.update()
                .then(() => {
                    assert.calledWith(ironMock.seal, 'unsealed', password, ironMock.defaults);

                    assert.isTrue(datastore.update.calledWith({
                        table: 'tokens',
                        params: {
                            id: 6789,
                            value: 'sealed',
                            lastUsed: newTimestamp
                        }
                    }));
                });
        });
    });
});
