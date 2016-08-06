'use strict';
const assert = require('chai').assert;
const mockery = require('mockery');
const sinon = require('sinon');

sinon.assert.expose(assert, { prefix: '' });
require('sinon-as-promised');

describe('Github', () => {
    const scmUrl = 'git@github.com:screwdriver-cd/data-schema.git#master';
    const id = '4b8d9b530d2e5e297b4f470d5b0a6e1310d29c5e';
    const username = 'myself';
    const token = 'sealedToken';
    let userMock;
    let helper;
    let githubMock;

    before(() => {
        mockery.enable({
            useCleanCache: true,
            warnOnUnregistered: false
        });
    });

    beforeEach(() => {
        userMock = {
            id,
            username,
            token,
            unsealToken: sinon.stub()
        };
        githubMock = {
            authenticate: sinon.stub(),
            repos: {
                get: sinon.stub()
            }
        };

        mockery.registerMock('github', sinon.stub().returns(githubMock));

        // eslint-disable-next-line global-require
        helper = require('../../lib/github');
    });

    afterEach(() => {
        mockery.deregisterAll();
        mockery.resetCache();
    });

    after(() => {
        mockery.disable();
    });

    it('getInfo returns the correct info', () => {
        const matched = helper.getInfo(scmUrl);

        assert.deepEqual(matched, {
            user: 'screwdriver-cd',
            repo: 'data-schema',
            branch: 'master'
        });
    });

    describe('getBreaker', () => {
        it('getBreaker returns cached', () => {
            const breaker1 = helper.getBreaker();
            const breaker2 = helper.getBreaker();

            assert.deepEqual(breaker1, breaker2);
        });
    });

    describe('run', () => {
        let config;

        beforeEach(() => {
            config = {
                user: userMock,
                action: 'get',
                params: {
                    user: 'myself'
                }
            };
        });

        it('calls github function correctly', () => {
            userMock.unsealToken.resolves('unsealedToken');
            githubMock.authenticate.returns();
            githubMock.repos.get.yieldsAsync(null, {});

            return helper.run(config).then(() => {
                assert.calledWith(githubMock.authenticate, {
                    type: 'oauth',
                    token: 'unsealedToken'
                });
                assert.calledWith(githubMock.repos.get, config.params);
            });
        });

        it('calls github function correctly with no params', () => {
            userMock.unsealToken.resolves('unsealedToken');
            githubMock.authenticate.returns();
            githubMock.repos.get.yieldsAsync(null, {});

            return helper.run({
                user: userMock,
                action: 'get'
            }).then(() => {
                assert.calledWith(githubMock.authenticate, {
                    type: 'oauth',
                    token: 'unsealedToken'
                });
                assert.calledWith(githubMock.repos.get, {});
            });
        });

        it('rejects when something fails', () => {
            const expectedError = new Error('doNotBreakTheSeal');

            userMock.unsealToken.rejects(expectedError);

            return helper.run({ user: userMock, action: 'get' })
                .then(() => {
                    assert.fail('This should not fail the test');
                })
                .catch((err) => {
                    assert.deepEqual(err, expectedError);
                });
        });
    });
});
