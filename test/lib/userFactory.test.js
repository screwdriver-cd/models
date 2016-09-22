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

            ironMock.seal.yieldsAsync(null, sealedToken);
            hashaMock.sha1.returns(generatedId);
            datastore.save.resolves(expected);

            return factory.create({
                username: 'batman',
                token: 'hero'
            }).then(model => {
                assert.calledWith(ironMock.seal, 'hero', password, 'defaults');
                assert.instanceOf(model, User);
                Object.keys(expected).forEach(key => {
                    assert.strictEqual(model[key], expected[key]);
                });
            });
        });
    });

    describe('getInstance', () => {
        let config;

        beforeEach(() => {
            config = { datastore, scmPlugin: {} };
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
                UserFactory.getInstance({ scmPlugin: {} });
            }, Error, 'No datastore provided to UserFactory');
        });
    });
});
