'use strict';

const assert = require('chai').assert;
const mockery = require('mockery');
const sinon = require('sinon');

sinon.assert.expose(assert, { prefix: '' });

describe('User Factory', () => {
    const password = 'totallySecurePassword';
    let UserFactory;
    let datastore;
    let hashaMock;
    let ironMock;
    let tokenFactoryMock;
    let factory;
    let User;

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
        hashaMock = {
            sha1: sinon.stub()
        };
        ironMock = {
            seal: sinon.stub(),
            defaults: 'defaults'
        };
        tokenFactoryMock = {
            get: sinon.stub()
        };

        mockery.registerMock('screwdriver-hashr', hashaMock);
        mockery.registerMock('iron', ironMock);
        mockery.registerMock('./tokenFactory', {
            getInstance: sinon.stub().returns(tokenFactoryMock)
        });

        // eslint-disable-next-line global-require
        User = require('../../lib/user');
        // eslint-disable-next-line global-require
        UserFactory = require('../../lib/userFactory');

        factory = new UserFactory({ datastore, password });
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
        it('should return a User', () => {
            const model = factory.createClass({
                id: 'abc123',
                username: 'batman',
                token: 'hero'
            });

            assert.instanceOf(model, User);
        });
    });

    describe('create', () => {
        it('should create a User', () => {
            const generatedId = 'aabbccdd';
            const sealedToken = 'flipper';
            const expected = {
                username: 'batman',
                token: sealedToken,
                id: generatedId
            };

            ironMock.seal.resolves(sealedToken);
            hashaMock.sha1.returns(generatedId);
            datastore.save.resolves(expected);

            return factory.create({
                username: 'batman',
                token: 'hero'
            }).then((model) => {
                assert.calledWith(ironMock.seal, 'hero', password, 'defaults');
                assert.instanceOf(model, User);
                Object.keys(expected).forEach((key) => {
                    assert.strictEqual(model[key], expected[key]);
                });
            });
        });
    });

    describe('get a user by access token', () => {
        const accessToken = 'an access token goes here';
        const now = 1111;
        const tokenMock = {
            userId: 123,
            lastUsed: null,
            update: sinon.stub()
        };
        let sandbox;

        beforeEach(() => {
            sandbox = sinon.createSandbox();
            sandbox.useFakeTimers(now);
            tokenFactoryMock.get.resolves(tokenMock);
            tokenMock.update.resolves(tokenMock);
        });

        afterEach(() => {
            sandbox.restore();
        });

        it('should return a user and update the last used field of the token', () => {
            const expected = {
                id: 123,
                username: 'frodo'
            };

            datastore.get.resolves(expected);

            return factory.get({ accessToken })
                .then((user) => {
                    assert.isOk(user);
                    assert.calledWith(tokenFactoryMock.get, { value: accessToken });
                    assert.calledOnce(tokenMock.update);
                    assert.equal(tokenMock.lastUsed, (new Date(now)).toISOString());
                });
        });

        it('should return null if the user doesn\'t exist', () => {
            datastore.get.resolves(null);

            return factory.get({ accessToken })
                .then(user => assert.isNull(user));
        });

        it('should return null if the token doesn\'t exist', () => {
            tokenFactoryMock.get.resolves(null);

            return factory.get({ accessToken })
                .then(user => assert.isNull(user));
        });
    });

    describe('getInstance', () => {
        let config;

        beforeEach(() => {
            config = { datastore, scm: {} };
        });

        it('should utilize BaseFactory to get an instance', () => {
            const f1 = UserFactory.getInstance(config);
            const f2 = UserFactory.getInstance(config);

            assert.instanceOf(f1, UserFactory);
            assert.instanceOf(f2, UserFactory);

            assert.equal(f1, f2);
        });

        it('should throw when config does not have everything necessary', () => {
            assert.throw(UserFactory.getInstance,
                Error, 'No scm plugin provided to UserFactory');

            assert.throw(() => {
                UserFactory.getInstance({ datastore });
            }, Error, 'No scm plugin provided to UserFactory');

            assert.throw(() => {
                UserFactory.getInstance({ scm: {} });
            }, Error, 'No datastore provided to UserFactory');
        });
    });
});
