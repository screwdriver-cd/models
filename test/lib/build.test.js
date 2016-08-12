'use strict';
const assert = require('chai').assert;
const mockery = require('mockery');
const sinon = require('sinon');

sinon.assert.expose(assert, { prefix: '' });

describe('Build Model', () => {
    const apiUri = 'https://notify.com/some/endpoint';
    const jobId = '62089f642bbfd1886623964b4cff12db59869e5d';
    const now = 112233445566;
    const buildId = 'd398fb192747c9a0124e9e5b4e6e8e841cf8c71c';
    const sha = 'ccc49349d3cffbd12ea9e3d41521480b4aa5de5f';
    const container = 'node:4';
    let BuildModel;
    let datastore;
    let executorMock;
    let hashaMock;
    let build;
    let githubMock;
    let config;
    let BaseModel;
    let breakerMock;
    let userFactoryMock;
    let jobFactoryMock;

    before(() => {
        mockery.enable({
            useCleanCache: true,
            warnOnUnregistered: false
        });
    });

    beforeEach(() => {
        datastore = {
            get: sinon.stub(),
            save: sinon.stub(),
            scan: sinon.stub()
        };
        hashaMock = {
            sha1: sinon.stub()
        };
        executorMock = {
            start: sinon.stub(),
            stream: sinon.stub(),
            stop: sinon.stub()
        };
        githubMock = {
            getBreaker: sinon.stub(),
            getInfo: sinon.stub(),
            run: sinon.stub()
        };
        breakerMock = {
            runCommand: sinon.stub()
        };
        userFactoryMock = {
            get: sinon.stub()
        };
        jobFactoryMock = {
            get: sinon.stub()
        };
        const uF = {
            getInstance: sinon.stub().returns(userFactoryMock)
        };
        const jF = {
            getInstance: sinon.stub().returns(jobFactoryMock)
        };

        mockery.registerMock('./userFactory', uF);
        mockery.registerMock('./jobFactory', jF);
        mockery.registerMock('screwdriver-hashr', hashaMock);
        mockery.registerMock('./github', githubMock);

        // eslint-disable-next-line global-require
        BuildModel = require('../../lib/build');
        // eslint-disable-next-line global-require
        BaseModel = require('../../lib/base');

        config = {
            datastore,
            username: 'me',
            executor: executorMock,
            id: buildId,
            cause: 'Started by user i_made_the_request',
            container,
            createTime: now,
            jobId,
            number: now,
            status: 'QUEUED',
            sha
        };
        build = new BuildModel(config);
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
        assert.instanceOf(build, BaseModel);
        assert.isFunction(build.start);
        assert.isFunction(build.stop);
        assert.isFunction(build.stream);

        Object.keys(config).forEach(key => {
            assert.strictEqual(build[key], config[key]);
        });
    });

    describe('stream', () => {
        it('promises to call executor stream', () => {
            const expectedData = 'someDataFromStream';

            executorMock.stream.yieldsAsync(null, expectedData);

            return build.stream()
                .then((data) => {
                    assert.strictEqual(data, expectedData);
                    assert.calledWith(executorMock.stream, {
                        buildId
                    });
                });
        });

        it('rejects when exectuor stream fails', () => {
            const expectedError = new Error('Youseemtobeusinganunblockerorproxy');

            executorMock.stream.yieldsAsync(expectedError);

            return build.stream({ buildId })
                .then(() => {
                    assert.fail('This should not fail the test');
                })
                .catch((err) => {
                    assert.deepEqual(err, expectedError);
                });
        });
    });

    describe('stop', () => {
        it('calls executor stop with correct values', () => {
            executorMock.stop.yieldsAsync(null);

            return build.stop()
                .then(() => {
                    assert.calledWith(executorMock.stop, {
                        buildId
                    });
                });
        });

        it('rejects on executor failure', () => {
            const expectedError = new Error('cantStopTheRock');

            executorMock.stop.yieldsAsync(expectedError);

            return build.stop()
                .then(() => {
                    assert.fail('This should not fail the test');
                })
                .catch((err) => {
                    assert.deepEqual(err, expectedError);
                });
        });
    });

    describe('start', () => {
        let sandbox;
        let tokenGen;
        const adminUser = { username: 'batman' };
        const pipelineId = 'cf23df2207d99a74fbe169e3eba035e633b65d94';
        const scmUrl = 'git@github.com:screwdriver-cd/models.git#master';
        const token = 'equivalentToOneQuarter';

        beforeEach(() => {
            sandbox = sinon.sandbox.create();
            sandbox.useFakeTimers(now);

            executorMock.start.yieldsAsync(null);
            githubMock.getBreaker.returns(breakerMock);
            breakerMock.runCommand.yieldsAsync(null, null);

            jobFactoryMock.get.resolves({
                id: jobId,
                name: 'main',
                pipeline: new Promise(resolve => resolve({
                    id: pipelineId,
                    scmUrl,
                    admin: 'batman'
                }))
            });

            tokenGen = sinon.stub().returns(token);

            userFactoryMock.get.withArgs(adminUser).resolves(adminUser);
            githubMock.getInfo.returns({
                user: 'screwdriver-cd',
                repo: 'models'
            });
            githubMock.run.resolves(null);
        });

        it('promises to start a build', () =>
            build.start({
                apiUri,
                tokenGen
            })
            .then(() => {
                assert.calledWith(tokenGen, buildId);

                assert.calledWith(executorMock.start, {
                    apiUri,
                    buildId,
                    container,
                    token
                });

                assert.calledWith(githubMock.run, {
                    user: adminUser,
                    action: 'createStatus',
                    params: {
                        user: 'screwdriver-cd',
                        repo: 'models',
                        sha,
                        state: 'pending',
                        context: 'screwdriver'
                    }
                });
            })
        );

        it('rejects when the executor fails', () => {
            const expectedError = new Error('brokenGun');

            executorMock.start.yieldsAsync(expectedError);

            return build.start({
                apiUri,
                tokenGen
            })
            .then(() => {
                assert.fail('This should not fail the test');
            })
            .catch((err) => {
                assert.deepEqual(err, expectedError);
            });
        });
    });
});
