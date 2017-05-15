'use strict';

const assert = require('chai').assert;
const mockery = require('mockery');
const sinon = require('sinon');

sinon.assert.expose(assert, { prefix: '' });

describe('Token Factory', () => {
    const password = 'super_secure_password';
    const name = 'mobile_token';
    const description = 'a token for a mobile app';
    const sealed = 'abcd';
    const unsealed = 'efgh';
    const userId = 6789;
    const tokenId = 12345;
    const tokenData = {
        id: tokenId,
        userId,
        description,
        name,
        value: sealed,
        lastUsed: null
    };
    let TokenFactory;
    let datastore;
    let ironMock;
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
            save: sinon.stub(),
            scan: sinon.stub(),
            get: sinon.stub()
        };
        ironMock = {
            seal: sinon.stub(),
            unseal: sinon.stub(),
            defaults: 'defaults'
        };

        mockery.registerMock('iron', ironMock);

        /* eslint-disable global-require */
        Token = require('../../lib/token');
        TokenFactory = require('../../lib/tokenFactory');
        /* eslint-enable global-require */

        factory = new TokenFactory({ datastore, password });
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
            const generatedId = 1234135;
            const expected = {
                id: generatedId,
                userId,
                name,
                description,
                value: sealed,
                lastUsed: null
            };

            ironMock.seal.yieldsAsync(null, sealed);
            datastore.save.resolves(expected);

            return factory.create({
                value: unsealed,
                userId,
                name,
                description
            }).then((model) => {
                assert.calledWith(ironMock.seal, unsealed, password, 'defaults');
                assert.isTrue(datastore.save.calledOnce);
                assert.instanceOf(model, Token);
                Object.keys(expected).forEach((key) => {
                    assert.strictEqual(model[key], expected[key]);
                });
            });
        });
    });

    describe('list', () => {
        const paginate = {
            page: 1,
            count: 3
        };
        const params = {
            userId: 4321
        };
        const datastoreReturnValue = [{
            id: 123,
            userId: 4321,
            name: 'token1',
            description: 'token number 1',
            value: 'sealedToken1',
            lastUsed: null
        }, {
            id: 456,
            userId: 4321,
            name: 'token2',
            description: 'token number 2',
            value: 'sealedToken2',
            lastUsed: '2017-05-11T22:48:16.827Z'
        }];

        const returnValue = [{
            id: 123,
            userId: 4321,
            name: 'token1',
            description: 'token number 1',
            value: 'unsealedToken1',
            lastUsed: null
        }, {
            id: 456,
            userId: 4321,
            name: 'token2',
            description: 'token number 2',
            value: 'unsealedToken2',
            lastUsed: '2017-05-11T22:48:16.827Z'
        }];

        it('calls datastore scan and returns correct values', () => {
            datastore.scan.resolves(datastoreReturnValue);
            ironMock.unseal.withArgs('sealedToken1', password).yieldsAsync(null, 'unsealedToken1');
            ironMock.unseal.withArgs('sealedToken2', password).yieldsAsync(null, 'unsealedToken2');

            return factory.list({ paginate, params })
                .then((arr) => {
                    assert.isTrue(datastore.scan.calledOnce);
                    assert.isArray(arr);
                    assert.equal(arr.length, 2);
                    assert.deepEqual(arr, returnValue);
                    arr.forEach((model) => {
                        assert.instanceOf(model, Token);
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
