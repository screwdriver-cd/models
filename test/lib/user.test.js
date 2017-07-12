'use strict';

const assert = require('chai').assert;
const mockery = require('mockery');
const sinon = require('sinon');
const schema = require('screwdriver-data-schema');

sinon.assert.expose(assert, { prefix: '' });

describe('User Model', () => {
    const password = 'password';
    const token = 'token';
    let UserModel;
    let datastore;
    let scmMock;
    let hashaMock;
    let ironMock;
    let tokenFactoryMock;
    let user;
    let BaseModel;
    let createConfig;

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
        scmMock = {
            getPermissions: sinon.stub()
        };
        hashaMock = {
            sha1: sinon.stub()
        };
        ironMock = {
            seal: sinon.stub(),
            unseal: sinon.stub(),
            defaults: {}
        };
        tokenFactoryMock = {
            list: sinon.stub()
        };

        mockery.registerMock('screwdriver-hashr', hashaMock);
        mockery.registerMock('iron', ironMock);
        mockery.registerMock('./tokenFactory', {
            getInstance: sinon.stub().returns(tokenFactoryMock) });

        /* eslint-disable global-require */
        UserModel = require('../../lib/user');
        BaseModel = require('../../lib/base');
        /* eslint-enable global-require */

        createConfig = {
            datastore,
            id: 'd398fb192747c9a0124e9e5b4e6e8e841cf8c71c',
            username: 'me',
            scmContext: 'github:github.com',
            token,
            password,
            scm: scmMock
        };
        user = new UserModel(createConfig);
    });

    afterEach(() => {
        mockery.deregisterAll();
        mockery.resetCache();
    });

    after(() => {
        mockery.disable();
    });

    it('is constructed properly', () => {
        assert.instanceOf(user, UserModel);
        assert.instanceOf(user, BaseModel);
        schema.models.user.allKeys.forEach((key) => {
            assert.strictEqual(user[key], createConfig[key]);
        });
        // password is private
        assert.isUndefined(user.password);
    });

    describe('seal token', () => {
        const unsealedToken = 'unsealedToken';

        beforeEach(() => {
            ironMock.seal.withArgs(unsealedToken, password, ironMock.defaults)
                .yieldsAsync(null, 'werlx');
        });

        it('promises to execute seal token', () =>
            user.sealToken(unsealedToken)
                .then((sealedToken) => {
                    assert.deepEqual(sealedToken, 'werlx');
                    assert.calledWith(ironMock.seal, unsealedToken, password, ironMock.defaults);
                })
        );

        it('rejects to execute a seal token', () => {
            const expectedError = new Error('whaleIsNotSeal');

            ironMock.seal.withArgs(unsealedToken, password, ironMock.defaults)
                .yieldsAsync(expectedError);

            return user.sealToken(unsealedToken)
                .then(() => {
                    assert.fail('This should not fail the test');
                })
                .catch((err) => {
                    assert.deepEqual(err, expectedError);
                });
        });
    });

    describe('unseal token', () => {
        const sealed = token;

        beforeEach(() => {
            ironMock.unseal.withArgs(sealed, password, ironMock.defaults)
                .yieldsAsync(null, '1234');
        });

        it('promises to execute unseal token', () =>
            user.unsealToken()
                .then((unsealed) => {
                    assert.strictEqual(unsealed, '1234');
                })
        );

        it('rejects when unseal token fails', () => {
            const expectedError = new Error('TooCoolToBeSeal');

            ironMock.unseal.withArgs(sealed, password, ironMock.defaults)
                .yieldsAsync(expectedError);

            return user.unsealToken()
                .then(() => {
                    assert.fail('This should not fail the test');
                })
                .catch((err) => {
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
            ironMock.unseal.yieldsAsync(null, '12345');
            scmMock.getPermissions.resolves(repo.permissions);
        });

        it('promises to get permissions', () =>
            user.getPermissions(scmUri)
                .then((data) => {
                    assert.calledWith(scmMock.getPermissions, {
                        token: '12345',
                        scmUri
                    });
                    assert.deepEqual(data, repo.permissions);
                })
        );

        it('rejects if fails to get permissions', () => {
            const expectedError = new Error('brokeTheBreaker');

            scmMock.getPermissions.rejects(expectedError);

            return user.getPermissions(scmUri)
                .then(() => {
                    assert.fail('This should not fail the test');
                })
                .catch((err) => {
                    assert.deepEqual(err, expectedError);
                });
        });
    });

    describe('get tokens', () => {
        const paginate = {
            page: 1,
            count: 50
        };

        it('has a tokens getter', () => {
            const listConfig = {
                params: {
                    userId: createConfig.id
                },
                paginate
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
