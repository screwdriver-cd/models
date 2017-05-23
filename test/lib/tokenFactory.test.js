'use strict';

const assert = require('chai').assert;
const mockery = require('mockery');
const sinon = require('sinon');

sinon.assert.expose(assert, { prefix: '' });
require('sinon-as-promised');

describe('Token Factory', () => {
    const name = 'mobile_token';
    const description = 'a token for a mobile app';
    const value = 'abc123';
    const userId = 6789;
    const tokenId = 12345;
    const tokenData = {
        id: tokenId,
        userId,
        description,
        name,
        value,
        lastUsed: null
    };
    let TokenFactory;
    let datastore;
    let factory;
    let Token;

    before(() => {
        mockery.enable({
            useCleanCache: true,
            warnOnUnregistered: false
        });
    });

    beforeEach(() => {
        datastore = {
            save: sinon.stub()
        };

        /* eslint-disable global-require */
        Token = require('../../lib/token');
        TokenFactory = require('../../lib/tokenFactory');
        /* eslint-enable global-require */

        factory = new TokenFactory({ datastore });
    });

    afterEach(() => {
        datastore = null;
        mockery.deregisterAll();
        mockery.resetCache();
    });

    after(() => {
        mockery.disable();
    });

    describe('createClass', () => {
        it('should return a Token', () => {
            const model = factory.createClass(tokenData);

            assert.instanceOf(model, Token);
        });
    });

    describe('create', () => {
        it('should create a Token', () => {
            const expected = {
                userId,
                name,
                description,
                value,
                lastUsed: null
            };

            datastore.save.resolves(tokenData);

            return factory.create({
                userId,
                name,
                description,
                value
            }).then((model) => {
                assert.isTrue(datastore.save.calledOnce);
                assert.calledWith(datastore.save, {
                    params: expected,
                    table: 'tokens'
                });
                assert.instanceOf(model, Token);
                Object.keys(tokenData).forEach((key) => {
                    assert.strictEqual(model[key], tokenData[key]);
                });
            });
        });
    });

    describe('getInstance', () => {
        let config;

        beforeEach(() => {
            config = { datastore };
        });

        it('should get an instance', () => {
            const f1 = TokenFactory.getInstance(config);
            const f2 = TokenFactory.getInstance(config);

            assert.instanceOf(f1, TokenFactory);
            assert.instanceOf(f2, TokenFactory);

            assert.equal(f1, f2);
        });

        it('should throw an error when config not supplied', () => {
            assert.throw(TokenFactory.getInstance,
                Error, 'No datastore provided to TokenFactory');
        });
    });
});
