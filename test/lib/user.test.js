'use strict';

const { assert } = require('chai');
const rewiremock = require('rewiremock/node');
const sinon = require('sinon');
const schema = require('screwdriver-data-schema');

sinon.assert.expose(assert, { prefix: '' });

describe('User Model', () => {
    const password = 'password';
    const token = 'token';
    const scmContext = 'github:github.com';
    const scmRepo = {
        branch: 'master',
        url: 'https://github.com/org/name/tree/master',
        name: 'org/name'
    };
    const settings = { displayJobNameLength: 25 };
    let UserModel;
    let datastore;
    let scmMock;
    let ironMock;
    let tokenFactoryMock;
    let user;
    let BaseModel;
    let createConfig;

    beforeEach(() => {
        datastore = {
            get: sinon.stub(),
            save: sinon.stub(),
            update: sinon.stub()
        };
        scmMock = {
            getPermissions: sinon.stub(),
            getDisplayName: sinon.stub()
        };
        ironMock = {
            seal: sinon.stub(),
            unseal: sinon.stub(),
            defaults: {}
        };
        tokenFactoryMock = {
            list: sinon.stub()
        };

        rewiremock('@hapi/iron').with(ironMock);
        rewiremock('../../lib/tokenFactory').with({
            getInstance: sinon.stub().returns(tokenFactoryMock)
        });
        rewiremock.enable();

        /* eslint-disable global-require */
        UserModel = require('../../lib/user');
        BaseModel = require('../../lib/base');
        /* eslint-enable global-require */

        createConfig = {
            datastore,
            id: 123,
            username: 'me',
            scmContext,
            token,
            password,
            scm: scmMock
        };
        user = new UserModel(createConfig);
    });

    afterEach(() => {
        rewiremock.disable();
    });

    it('is constructed properly', () => {
        rewiremock.disable();
        /* eslint-disable global-require */
        UserModel = require('../../lib/user');
        BaseModel = require('../../lib/base');
        /* eslint-enable global-require */
        user = new UserModel(createConfig);
        assert.instanceOf(user, UserModel);
        assert.instanceOf(user, BaseModel);
        schema.models.user.allKeys.forEach(key => {
            assert.strictEqual(user[key], createConfig[key]);
        });
        // password is private
        assert.isUndefined(user.password);
    });

    describe('seal token', () => {
        const unsealedToken = 'unsealedToken';

        beforeEach(() => {
            ironMock.seal.withArgs(unsealedToken, password, ironMock.defaults).resolves('werlx');
        });

        it('promises to execute seal token', () =>
            user.sealToken(unsealedToken).then(sealedToken => {
                assert.deepEqual(sealedToken, 'werlx');
                assert.calledWith(ironMock.seal, unsealedToken, password, ironMock.defaults);
            }));

        it('rejects to execute a seal token', () => {
            const expectedError = new Error('whaleIsNotSeal');

            ironMock.seal.withArgs(unsealedToken, password, ironMock.defaults).rejects(expectedError);

            return user
                .sealToken(unsealedToken)
                .then(() => {
                    assert.fail('This should not fail the test');
                })
                .catch(err => {
                    assert.deepEqual(err, expectedError);
                });
        });
    });

    describe('unseal token', () => {
        const sealed = token;

        beforeEach(() => {
            ironMock.unseal.withArgs(sealed, password, ironMock.defaults).resolves('1234');
        });

        it('promises to execute unseal token', () =>
            user.unsealToken().then(unsealed => {
                assert.strictEqual(unsealed, '1234');
            }));

        it('rejects when unseal token fails', () => {
            const expectedError = new Error('TooCoolToBeSeal');

            ironMock.unseal.withArgs(sealed, password, ironMock.defaults).rejects(expectedError);

            return user
                .unsealToken()
                .then(() => {
                    assert.fail('This should not fail the test');
                })
                .catch(err => {
                    assert.deepEqual(err, expectedError);
                });
        });
    });

    describe('getPermissions', () => {
        const scmUri = 'github.com:12345:master';
        const repo = {
            permissions: {
                admin: true,
                push: false,
                pull: false
            }
        };

        beforeEach(() => {
            ironMock.unseal.resolves('12345');
            scmMock.getPermissions.resolves(repo.permissions);
        });

        it('promises to get permissions', () =>
            user.getPermissions(scmUri, scmContext, scmRepo).then(data => {
                assert.calledWith(scmMock.getPermissions, {
                    token: '12345',
                    scmUri,
                    scmContext,
                    scmRepo
                });
                assert.deepEqual(data, repo.permissions);
            }));

        it('rejects if fails to get permissions', () => {
            const expectedError = new Error('brokeTheBreaker');

            scmMock.getPermissions.rejects(expectedError);

            return user
                .getPermissions(scmUri)
                .then(() => {
                    assert.fail('This should not fail the test');
                })
                .catch(err => {
                    assert.deepEqual(err, expectedError);
                });
        });
    });

    describe('getFullDisplayName', () => {
        it('get full display name', () => {
            scmMock.getDisplayName.withArgs({ scmContext }).returns('github.com');

            const userDisplayName = user.getFullDisplayName();

            assert.deepEqual(userDisplayName, 'github.com:me');
        });
    });

    describe('getSettings', () => {
        it('gets default user settings', () => {
            const data = user.getSettings();

            assert.deepEqual(data, {});
        });

        it('gets user settings', () => {
            datastore.update.resolves({});
            user.settings = settings;

            return user.update().then(() => {
                const data = user.getSettings();

                assert.deepEqual(data, settings);
            });
        });
    });

    describe('updateSettings', () => {
        beforeEach(() => {
            user.settings = {};
        });

        it('updates default user settings', () => {
            datastore.update.resolves({});

            return user.updateSettings().then(data => {
                assert.deepEqual(data, {});
            });
        });

        it('updates user settings', () => {
            datastore.update.resolves({ metricsDowntimeJobs: ['prod', 'beta'] });

            return user.updateSettings(settings).then(data => {
                assert.deepEqual(data, settings);
            });
        });
    });

    describe('removeSettings', () => {
        beforeEach(() => {
            user.settings = {
                1: {
                    showPRJobs: true
                },
                11: {
                    showPRJobs: false
                },
                displayJobNameLength: 25
            };
        });

        it('Remove user settings', () => {
            datastore.update.resolves({});

            return user.removeSettings().then(data => {
                assert.deepEqual(data, {});
            });
        });
    });

    describe('get tokens', () => {
        it('has a tokens getter', () => {
            const listConfig = {
                params: {
                    userId: createConfig.id
                }
            };

            tokenFactoryMock.list.resolves(null);
            // when we fetch tokens it resolves to a promise
            assert.isFunction(user.tokens.then);
            // and a factory is called to create that promise
            assert.calledWith(tokenFactoryMock.list, listConfig);

            // When we call user.tokens again it is still a promise
            assert.isFunction(user.tokens.then);
            // ...but the factory was not recreated, since the promise is stored
            // as the model's tokens property, now
            assert.calledOnce(tokenFactoryMock.list);
        });
    });
});
