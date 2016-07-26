'use strict';
const assert = require('chai').assert;
const mockery = require('mockery');
const sinon = require('sinon');

sinon.assert.expose(assert, { prefix: '' });

describe('User Model', () => {
    let UserModel;
    let datastore;
    let hashaMock;
    let user;

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
        hashaMock = {
            sha1: sinon.stub()
        };
        mockery.registerMock('screwdriver-hashr', hashaMock);

        // eslint-disable-next-line global-require
        UserModel = require('../../lib/user');

        user = new UserModel(datastore);
    });

    afterEach(() => {
        datastore = null;
        mockery.deregisterAll();
        mockery.resetCache();
    });

    after(() => {
        mockery.disable();
    });

    it('extends base class', () => {
        assert.isFunction(user.get);
        assert.isFunction(user.update);
        assert.isFunction(user.list);
    });

    describe('create', () => {
        let config;
        let datastoreConfig;
        const username = 'me';
        const testId = 'd398fb192747c9a0124e9e5b4e6e8e841cf8c71c';

        beforeEach(() => {
            hashaMock.sha1.withArgs({ username }).returns(testId);

            config = {
                username: 'me',
                token: 'abcd'
            };

            datastoreConfig = {
                table: 'users',
                params: {
                    id: testId,
                    data: config
                }
            };
        });

        it('returns error when the datastore fails to save', (done) => {
            const testError = new Error('datastoreSaveError');

            datastore.save.withArgs(datastoreConfig).yieldsAsync(testError);
            user.create(config, (error) => {
                assert.isOk(error);
                assert.equal(error.message, 'datastoreSaveError');
                done();
            });
        });

        it('and correct user data', (done) => {
            datastore.save.yieldsAsync(null);

            user.create(config, (error) => {
                assert.isNull(error);
                assert.calledWith(datastore.save, datastoreConfig);
                done();
            });
        });
    });
});
