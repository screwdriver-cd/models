'use strict';

const assert = require('chai').assert;
const sinon = require('sinon');
const mockery = require('mockery');
const schema = require('screwdriver-data-schema');

sinon.assert.expose(assert, { prefix: '' });

describe('Token Model', () => {
    const password = 'password';
    let datastore;
    let generateTokenMock;
    let BaseModel;
    let TokenModel;
    let createConfig;
    let token;

    before(() => {
        mockery.enable({
            useCleanCache: true,
            warnOnUnregistered: false
        });
        datastore = {
            update: sinon.stub()
        };
        generateTokenMock = {
            generateValue: sinon.stub(),
            hashValue: sinon.stub()
        };
        mockery.registerMock('./generateToken', generateTokenMock);

        // Lazy load Token Model so it registers the mocks
        /* eslint-disable global-require */
        BaseModel = require('../../lib/base');
        TokenModel = require('../../lib/token');
        /* eslint-enable global-require */
    });

    beforeEach(() => {
        datastore.update.resolves({});

        createConfig = {
            datastore,
            userId: 12345,
            hash: '1a2b3c',
            id: 6789,
            name: 'Mobile client auth token',
            description: 'For the mobile app',
            lastUsed: '2017-05-10T01:49:59.327Z',
            password
        };
        token = new TokenModel(createConfig);
    });

    after(() => {
        mockery.deregisterAll();
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
        it('promises to update a token', () => {
            const newTimestamp = '2017-05-13T02:01:17.588Z';

            token.lastUsed = newTimestamp;

            return token.update()
            .then(() => {
                assert.calledWith(datastore.update, {
                    table: 'tokens',
                    params: {
                        id: 6789,
                        lastUsed: newTimestamp
                    }
                });
            });
        });
    });

    describe('regenerate', () => {
        it('generates a new token value and returns it once', () => {
            const newValue = 'a new value';
            const newHash = 'a new hash';

            generateTokenMock.generateValue.resolves(newValue);
            generateTokenMock.hashValue.returns(newHash);

            return token.regenerate()
                .then((model) => {
                    assert.calledOnce(generateTokenMock.generateValue);
                    assert.calledWith(generateTokenMock.hashValue, newValue);
                    assert.strictEqual(model.value, newValue);
                    assert.strictEqual(model.hash, newHash);
                });
        });
    });
});
