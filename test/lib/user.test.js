'use strict';
const assert = require('chai').assert;
const mockery = require('mockery');
const sinon = require('sinon');
const Joi = require('joi');

sinon.assert.expose(assert, { prefix: '' });

/**
 * Stub for Github method
 * @method GithubMock
 */
function GithubMock() {}

/**
 * Stub for circuit-fuses wrapper
 * @method BreakerMock
 */
function BreakerMock() {}

describe('User Model', () => {
    const password = 'password';
    let UserModel;
    let datastore;
    let githubMock;
    let hashaMock;
    let schemaMock;
    let ironMock;
    let user;
    let breakerRunMock;

    before(() => {
        mockery.enable({
            useCleanCache: true,
            warnOnUnregistered: false
        });
    });

    beforeEach(() => {
        datastore = {
            get: sinon.stub(),
            save: sinon.stub()
        };
        githubMock = {
            authenticate: sinon.stub(),
            repos: {
                get: sinon.stub()
            }
        };
        hashaMock = {
            sha1: sinon.stub()
        };
        ironMock = {
            seal: sinon.stub(),
            unseal: sinon.stub(),
            defaults: {}
        };
        schemaMock = {
            models: {
                user: {
                    base: {
                        id: Joi.string(),
                        username: Joi.string(),
                        token: Joi.string()
                    },
                    keys: ['username'],
                    tableName: 'users'
                }
            },
            config: {
                regex: {
                    SCM_URL: /^git@([^:]+):([^\/]+)\/(.+?)\.git(#.+)?$/
                }
            }
        };
        breakerRunMock = sinon.stub();

        BreakerMock.prototype.runCommand = breakerRunMock;
        GithubMock.prototype.authenticate = githubMock.authenticate;
        GithubMock.prototype.repos = githubMock.repos;

        mockery.registerMock('screwdriver-hashr', hashaMock);
        mockery.registerMock('iron', ironMock);
        mockery.registerMock('github', GithubMock);
        mockery.registerMock('screwdriver-data-schema', schemaMock);
        mockery.registerMock('circuit-fuses', BreakerMock);

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

    describe('getPermissions', () => {
        const token = 'sealedToken';
        const unsealed = 'unsealedToken';

        it('successfully gets permission', (done) => {
            const userObj = {
                id: '1234',
                user: 'me',
                token
            };
            const config = {
                username: 'me',
                scmUrl: 'git@github.com:screwdriver-cd/models.git'
            };
            const repo = {
                permissions: {
                    admin: true,
                    push: false,
                    pull: false
                }
            };
            const breakerParams = {
                token: unsealed,
                action: 'get',
                params: {
                    user: 'screwdriver-cd',
                    repo: 'models'
                }
            };

            datastore.get.yieldsAsync(null, userObj);
            ironMock.unseal.withArgs(token, password, ironMock.defaults)
                .yieldsAsync(null, unsealed);
            breakerRunMock.yieldsAsync(null, repo);
            user.getPermissions(config, (err, res) => {
                assert.calledWith(ironMock.unseal, token, password, ironMock.defaults);
                assert.calledWith(breakerRunMock, breakerParams);
                assert.deepEqual(res, repo.permissions);
                done();
            });
        });

        it('returns error if fails to get permission', (done) => {
            const userObj = {
                id: '1234',
                user: 'me',
                token
            };
            const config = {
                username: 'me',
                scmUrl: 'git@github.com:screwdriver-cd/models.git'
            };
            const err = new Error('error');

            datastore.get.yieldsAsync(null, userObj);
            ironMock.unseal.withArgs(token, password, ironMock.defaults)
                .yieldsAsync(null, 'unsealedToken');
            breakerRunMock.yieldsAsync(err);
            user.getPermissions(config, (error) => {
                assert.isOk(error);
                done();
            });
        });
    });
});
