'use strict';
const assert = require('chai').assert;
const mockery = require('mockery');
const sinon = require('sinon');

sinon.assert.expose(assert, { prefix: '' });

describe('User Model', () => {
    const password = 'password';
    let UserModel;
    let datastore;
    let hashaMock;
    let ironMock;
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
        ironMock = {
            seal: sinon.stub(),
            unseal: sinon.stub(),
            defaults: {}
        };
        mockery.registerMock('screwdriver-hashr', hashaMock);
        mockery.registerMock('iron', ironMock);

        // eslint-disable-next-line global-require
        UserModel = require('../../lib/user');

        user = new UserModel(datastore, password);
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

    it('seal token', (done) => {
        const token = '1234';

        ironMock.seal.withArgs(token, password, ironMock.defaults)
            .yieldsAsync(null, 'werlx');
        user.sealToken(token, (err, sealed) => {
            assert.calledWith(ironMock.seal, token, password, ironMock.defaults);
            assert.deepEqual(sealed, 'werlx');
            done();
        });
    });

    it('unseal token', (done) => {
        const sealed = 'werlx';

        ironMock.unseal.withArgs(sealed, password, ironMock.defaults)
            .yieldsAsync(null, '1234');
        user.unsealToken(sealed, (err, unsealed) => {
            assert.calledWith(ironMock.unseal, sealed, password, ironMock.defaults);
            assert.deepEqual(unsealed, '1234');
            done();
        });
    });
});
