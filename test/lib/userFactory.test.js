'use strict';
const assert = require('chai').assert;
const mockery = require('mockery');
const sinon = require('sinon');

sinon.assert.expose(assert, { prefix: '' });

describe('User Factory', () => {
    let UserFactory;
    let datastore;
    let hashaMock;
    let ironMock;
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

        mockery.registerMock('screwdriver-hashr', hashaMock);
        mockery.registerMock('iron', ironMock);

        // eslint-disable-next-line global-require
        User = require('../../lib/user');
        // eslint-disable-next-line global-require
        UserFactory = require('../../lib/userFactory');

        factory = new UserFactory({ datastore });
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

            ironMock.seal.yieldsAsync(null, sealedToken);
            hashaMock.sha1.returns(generatedId);
            datastore.save.yieldsAsync(null, expected);

            return factory.create({
                username: 'batman',
                token: 'hero',
                password: 'hello'
            }).then(model => {
                assert.calledWith(ironMock.seal, 'hero', 'hello', 'defaults');
                assert.instanceOf(model, User);
                Object.keys(expected).forEach(key => {
                    assert.strictEqual(model[key], expected[key]);
                });
            });
        });
    });

    describe('getInstance', () => {
        it('should encapsulate new, and act as a singleton', () => {
            const f1 = UserFactory.getInstance({ datastore });
            const f2 = UserFactory.getInstance({ datastore });

            assert.equal(f1, f2);
        });

        it('should not require config on second call', () => {
            const f1 = UserFactory.getInstance({ datastore });
            const f2 = UserFactory.getInstance();

            assert.equal(f1, f2);
        });

        it('should throw when config not supplied', () => {
            assert.throw(UserFactory.getInstance, Error, 'No datastore provided to UserFactory');
        });
    });
});
