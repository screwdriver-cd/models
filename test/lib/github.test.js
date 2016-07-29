'use strict';
const assert = require('chai').assert;
const mockery = require('mockery');
const sinon = require('sinon');

sinon.assert.expose(assert, { prefix: '' });

describe('Github', () => {
    const scmUrl = 'git@github.com:screwdriver-cd/data-schema.git#master';
    let schemaMock;
    let userMock;
    let breakerMock;
    let github;
    let githubMock;

    /**
     * Stub for Breaker factory method
     */
    function BreakerFactory() {}

    /**
     * Stub for Github factory method
     */
    function GithubFactory() {}

    before(() => {
        mockery.enable({
            useCleanCache: true,
            warnOnUnregistered: false
        });
    });

    beforeEach(() => {
        schemaMock = {
            config: {
                regex: {
                    SCM_URL: /^git@([^:]+):([^\/]+)\/(.+?)\.git(#.+)?$/
                }
            }
        };
        userMock = {
            get: sinon.stub(),
            unsealToken: sinon.stub(),
            generateId: sinon.stub()
        };
        githubMock = {
            authenticate: sinon.stub(),
            repos: {
                get: sinon.stub()
            }
        };
        breakerMock = {
            runCommand: sinon.stub()
        };
        mockery.registerMock('screwdriver-data-schema', schemaMock);
    });

    afterEach(() => {
        mockery.deregisterAll();
        mockery.resetCache();
    });

    after(() => {
        mockery.disable();
    });

    it('getInfo returns the correct info', () => {
        // eslint-disable-next-line global-require
        github = require('../../lib/github');
        const matched = github.getInfo(scmUrl);

        assert.deepEqual(matched, {
            user: 'screwdriver-cd',
            repo: 'data-schema',
            branch: 'master'
        });
    });

    describe('getBreaker', () => {
        beforeEach(() => {
            BreakerFactory.prototype.runCommand = breakerMock.runCommand;
            mockery.registerMock('circuit-fuses', BreakerFactory);

            // eslint-disable-next-line global-require
            github = require('../../lib/github');
        });

        it('getBreaker returns cached', () => {
            const breaker1 = github.getBreaker();
            const breaker2 = github.getBreaker();

            assert.deepEqual(breaker1, breaker2);
        });
    });

    describe('run with Mocked Breaker', () => {
        const id = '4b8d9b530d2e5e297b4f470d5b0a6e1310d29c5e';
        const username = 'myself';
        const token = 'sealedToken';
        let config;
        let userData;

        beforeEach(() => {
            BreakerFactory.prototype.runCommand = breakerMock.runCommand;
            mockery.registerMock('circuit-fuses', BreakerFactory);

            // eslint-disable-next-line global-require
            github = require('../../lib/github');
            config = {
                user: userMock,
                username,
                action: 'get',
                params: {

                }
            };
            userData = {
                id,
                username,
                token
            };
        });

        it('returns error if fails to get user', (done) => {
            const err = new Error('getUserError');

            userMock.generateId.withArgs({ username: config.username }).returns(id);
            userMock.get.withArgs(id).yieldsAsync(err);
            github.run(config, (error) => {
                assert.isOk(error);
                done();
            });
        });

        it('returns error if fails to unseal token', (done) => {
            const err = new Error('unsealTokenError');

            userMock.generateId.withArgs({ username: config.username }).returns(id);
            userMock.get.withArgs(id).yieldsAsync(null, userData);
            userMock.unsealToken.withArgs(token).yieldsAsync(err);
            github.run(config, (error) => {
                assert.isOk(error);
                done();
            });
        });

        it('returns error if fails to run command', (done) => {
            const err = new Error('breakerError');

            userMock.generateId.withArgs({ username: config.username }).returns(id);
            userMock.get.withArgs(id).yieldsAsync(null, userData);
            userMock.unsealToken.withArgs(token).yieldsAsync(null, 'unsealedToken');
            breakerMock.runCommand.withArgs({
                action: 'get',
                params: {}
            }).yieldsAsync(err);
            github.run(config, (error) => {
                assert.isOk(error);
                done();
            });
        });

        it('returns correct response', (done) => {
            const response = { message: 'some response from github' };

            userMock.generateId.withArgs({ username: config.username }).returns(id);
            userMock.get.withArgs(id).yieldsAsync(null, userData);
            userMock.unsealToken.withArgs(token).yieldsAsync(null, 'unsealedToken');
            breakerMock.runCommand.yieldsAsync(null, response);
            github.run(config, (error, res) => {
                assert.isNull(error);
                assert.deepEqual(res, response);
                done();
            });
        });
    });

    describe('run without Mocked Breaker', () => {
        const id = '4b8d9b530d2e5e297b4f470d5b0a6e1310d29c5e';
        const username = 'myself';
        const token = 'sealedToken';
        let config;
        let userData;

        beforeEach(() => {
            GithubFactory.prototype = githubMock;
            mockery.registerMock('github', GithubFactory);

            // eslint-disable-next-line global-require
            github = require('../../lib/github');
            config = {
                user: userMock,
                username,
                action: 'get',
                params: {
                    user: 'myself'
                }
            };
            userData = {
                id,
                username,
                token
            };
        });

        it('calls github function correctly', (done) => {
            userMock.generateId.withArgs({ username: config.username }).returns(id);
            userMock.get.withArgs(id).yieldsAsync(null, userData);
            userMock.unsealToken.withArgs(token).yieldsAsync(null, 'unsealedToken');
            githubMock.repos.get.yieldsAsync(null, {});
            githubMock.authenticate.returns();
            github.run(config, (error, res) => {
                assert.calledWith(githubMock.repos.get, config.params);
                assert.isNull(error);
                assert.deepEqual(res, {});
                done();
            });
        });
    });
});
