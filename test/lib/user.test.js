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

        it('promises to create the user data', () => {
            datastore.save.yieldsAsync(null, 'dataFromDatastore');

            return user.create(config)
                .then((data) => {
                    assert.strictEqual(data, 'dataFromDatastore');
                });
        });

        it('rejects when datastore save fails', () => {
            const expectedError = new Error('datastoreSaveFail');

            datastore.save.yieldsAsync(expectedError);

            return user.create(config)
                .then(() => {
                    assert.fail('this should not fail the test');
                })
                .catch((err) => {
                    assert.deepEqual(err, expectedError);
                });
        });
    });

    describe('seal token', () => {
        const token = '1234';

        beforeEach(() => {
            ironMock.seal.withArgs(token, password, ironMock.defaults)
                .yieldsAsync(null, 'werlx');
        });

        it('properly executes seal token', (done) => {
            user.sealToken(token, (err, sealed) => {
                assert.calledWith(ironMock.seal, token, password, ironMock.defaults);
                assert.deepEqual(sealed, 'werlx');
                done();
            });
        });

        it('promises to execute seal token', () =>
            user.sealToken(token)
                .then((sealedToken) => {
                    assert.deepEqual(sealedToken, 'werlx');
                    assert.calledWith(ironMock.seal, token, password, ironMock.defaults);
                })
        );

        it('rejects to execute a seal token', () => {
            const expectedError = new Error('whaleIsNotSeal');

            ironMock.seal.withArgs(token, password, ironMock.defaults)
                .yieldsAsync(expectedError);

            return user.sealToken(token)
                .then(() => {
                    assert.fail('This should not fail the test');
                })
                .catch((err) => {
                    assert.deepEqual(err, expectedError);
                });
        });
    });

    describe('unseal token', () => {
        const sealed = 'werlx';

        beforeEach(() => {
            ironMock.unseal.withArgs(sealed, password, ironMock.defaults)
                .yieldsAsync(null, '1234');
        });

        it('properly unseal token', (done) => {
            user.unsealToken(sealed, (err, unsealed) => {
                assert.calledWith(ironMock.unseal, sealed, password, ironMock.defaults);
                assert.deepEqual(unsealed, '1234');
                done();
            });
        });

        it('promises to execute unseal token', () =>
            user.unsealToken(sealed)
                .then((unsealed) => {
                    assert.strictEqual(unsealed, '1234');
                })
        );

        it('rejects when unseal token fails', () => {
            const expectedError = new Error('TooCoolToBeSeal');

            ironMock.unseal.withArgs(sealed, password, ironMock.defaults)
                .yieldsAsync(expectedError);

            return user.unsealToken(sealed)
                .then(() => {
                    assert.fail('This should not fail the test');
                })
                .catch((err) => {
                    assert.deepEqual(err, expectedError);
                });
        });
    });

    describe('getPermissions', () => {
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
        const token = 'sealedToken';
        const unsealed = 'unsealedToken';
        const userObj = {
            id: '1234',
            user: 'me',
            token
        };

        beforeEach(() => {
            datastore.get.yieldsAsync(null, userObj);
            ironMock.unseal.withArgs(token, password, ironMock.defaults)
                .yieldsAsync(null, unsealed);
            breakerRunMock.yieldsAsync(null, repo);
        });

        it('successfully gets permission', (done) => {
            const breakerParams = {
                token: unsealed,
                action: 'get',
                params: {
                    user: 'screwdriver-cd',
                    repo: 'models'
                }
            };

            user.getPermissions(config, (err, res) => {
                assert.calledWith(ironMock.unseal, token, password, ironMock.defaults);
                assert.calledWith(breakerRunMock, breakerParams);
                assert.deepEqual(res, repo.permissions);
                done();
            });
        });

        it('returns error if fails to get permission', (done) => {
            const err = new Error('error');

            breakerRunMock.yieldsAsync(err);
            user.getPermissions(config, (error) => {
                assert.isOk(error);
                done();
            });
        });

        it('promises to get permissions', () =>
            user.getPermissions(config)
                .then((data) => {
                    assert.deepEqual(data, repo.permissions);
                })
        );

        it('rejects if fails to get permissions', () => {
            const expectedError = new Error('brokeTheBreaker');

            breakerRunMock.yieldsAsync(expectedError);

            return user.getPermissions(config)
                .then(() => {
                    assert.fail('This should not fail the test');
                })
                .catch((err) => {
                    assert.deepEqual(err, expectedError);
                });
        });
    });
});
