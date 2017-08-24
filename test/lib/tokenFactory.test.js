'use strict';

const assert = require('chai').assert;
const mockery = require('mockery');
const sinon = require('sinon');

sinon.assert.expose(assert, { prefix: '' });

describe('Token Factory', () => {
    const password = 'totallySecurePassword';
    const name = 'mobile_token';
    const description = 'a token for a mobile app';
    const userId = 6789;
    const tokenId = 12345;
    const randomBytes = 'some random bytes';
    const hash = 'abc123';
    const tokenData = {
        id: tokenId,
        userId,
        description,
        name,
        hash,
        lastUsed: ''
    };
    const expected = {
        userId,
        name,
        description,
        hash,
        lastUsed: ''
    };
    let TokenFactory;
    let datastore;
    let generateTokenMock;
    let factory;
    let Token;

    before(() => {
        mockery.enable({
            useCleanCache: true,
            warnOnUnregistered: false
        });
        generateTokenMock = {
            generateValue: sinon.stub(),
            hashValue: sinon.stub()
        };

        generateTokenMock.generateValue.resolves(randomBytes);
        generateTokenMock.hashValue.resolves(hash);

        mockery.registerMock('./generateToken', generateTokenMock);
    });

    beforeEach(() => {
        datastore = {
            save: sinon.stub(),
            get: sinon.stub()
        };

        /* eslint-disable global-require */
        Token = require('../../lib/token');
        TokenFactory = require('../../lib/tokenFactory');
        /* eslint-enable global-require */

        factory = new TokenFactory({ datastore, password });
    });

    afterEach(() => {
        mockery.resetCache();
    });

    after(() => {
        mockery.deregisterAll();
        mockery.disable();
    });

    describe('createClass', () => {
        it('should return a Token', () => {
            const model = factory.createClass(Object.assign({}, tokenData));

            assert.instanceOf(model, Token);
        });
    });

    describe('create', () => {
        it('should create a Token', () => {
            datastore.save.resolves(tokenData);

            return factory.create({
                userId,
                name,
                description,
                hash
            }).then((model) => {
                assert.isTrue(datastore.save.calledOnce);
                assert.calledOnce(generateTokenMock.generateValue);
                assert.calledWith(generateTokenMock.hashValue, randomBytes, password);
                assert.calledWith(datastore.save, {
                    params: expected,
                    table: 'tokens'
                });
                assert.instanceOf(model, Token);
                Object.keys(tokenData).forEach((key) => {
                    assert.strictEqual(model[key], tokenData[key]);
                });
                assert.strictEqual(model.value, randomBytes);
            });
        });
    });

    describe('get', () => {
        beforeEach(() => {
            datastore.get.resolves(tokenData);
        });

        it('should get a token by ID', () =>
            Promise.all([factory.get(tokenId), factory.get({ id: tokenId })])
                .then(([token1, token2]) => {
                    Object.keys(token1).forEach((key) => {
                        assert.strictEqual(token1[key], tokenData[key]);
                        assert.strictEqual(token2[key], tokenData[key]);
                    });
                }));

        it('should get a token by value', () =>
            factory.get({ value: randomBytes })
                .then((token) => {
                    Object.keys(token).forEach((key) => {
                        assert.strictEqual(token[key], tokenData[key]);
                    });
                    assert.calledWith(datastore.get, {
                        params: {
                            hash
                        },
                        table: 'tokens'
                    });
                }));

        it('should return null when trying to get a token by value', () => {
            datastore.get.resolves(null);

            return factory.get({ value: randomBytes })
                .then((token) => {
                    assert.isNull(token);
                    assert.calledWith(datastore.get, {
                        params: {
                            hash
                        },
                        table: 'tokens'
                    });
                });
        });
    });

    describe('getInstance', () => {
        let config;

        beforeEach(() => {
            config = { datastore };

            /* eslint-disable global-require */
            TokenFactory = require('../../lib/tokenFactory');
            /* eslint-enable global-require */
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
