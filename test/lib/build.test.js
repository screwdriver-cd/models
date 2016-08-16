'use strict';
const assert = require('chai').assert;
const mockery = require('mockery');
const sinon = require('sinon');
const schema = require('screwdriver-data-schema');

sinon.assert.expose(assert, { prefix: '' });

describe('Build Model', () => {
    const apiUri = 'https://notify.com/some/endpoint';
    const jobId = '62089f642bbfd1886623964b4cff12db59869e5d';
    const now = 112233445566;
    const buildId = 'd398fb192747c9a0124e9e5b4e6e8e841cf8c71c';
    const sha = 'ccc49349d3cffbd12ea9e3d41521480b4aa5de5f';
    const container = 'node:4';
    const adminUser = { username: 'batman' };
    const pipelineId = 'cf23df2207d99a74fbe169e3eba035e633b65d94';
    const scmUrl = 'git@github.com:screwdriver-cd/models.git#master';
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
            scan: sinon.stub(),
            update: sinon.stub()
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

        schema.models.build.allKeys.forEach(key => {
            assert.strictEqual(build[key], config[key]);
        });

        // Also added a username members
        assert.strictEqual(build.username, config.username);
        // executor is private
        assert.isUndefined(build.executor);
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

    describe('update', () => {
        beforeEach(() => {
            githubMock.getBreaker.returns(breakerMock);
            breakerMock.runCommand.yieldsAsync(null, null);

            jobFactoryMock.get.resolves({
                id: jobId,
                name: 'main',
                pipeline: new Promise(resolve => resolve({
                    id: pipelineId,
                    scmUrl,
                    admin: new Promise(r => r(adminUser))
                }))
            });

            githubMock.getInfo.returns({
                user: 'screwdriver-cd',
                repo: 'models'
            });
            githubMock.run.resolves(null);
        });

        it('promises to update a build and update status to failure', () => {
            datastore.update.yieldsAsync(null, {});
            build.status = 'FAILURE';

            return build.update()
                .then(() => {
                    assert.calledWith(githubMock.run, {
                        user: adminUser,
                        action: 'createStatus',
                        params: {
                            user: 'screwdriver-cd',
                            repo: 'models',
                            sha,
                            state: 'failure',
                            context: 'screwdriver'
                        }
                    });
                });
        });

        it('promises to update a build and update status to success', () => {
            datastore.update.yieldsAsync(null, {});
            build.status = 'SUCCESS';

            return build.update()
                .then(() => {
                    assert.calledWith(githubMock.run, {
                        user: adminUser,
                        action: 'createStatus',
                        params: {
                            user: 'screwdriver-cd',
                            repo: 'models',
                            sha,
                            state: 'success',
                            context: 'screwdriver'
                        }
                    });
                });
        });

        it('promises to update a build and not update status when status is not dirty', () => {
            datastore.update.yieldsAsync(null, {});

            return build.update()
                .then(() => {
                    assert.notCalled(githubMock.run);
                });
        });
    });

    describe('stop', () => {
        beforeEach(() => {
            executorMock.stop.yieldsAsync(null);
            githubMock.getBreaker.returns(breakerMock);
            breakerMock.runCommand.yieldsAsync(null, null);

            jobFactoryMock.get.resolves({
                id: jobId,
                name: 'main',
                pipeline: new Promise(resolve => resolve({
                    id: pipelineId,
                    scmUrl,
                    admin: new Promise(r => r(adminUser))
                }))
            });

            githubMock.getInfo.returns({
                user: 'screwdriver-cd',
                repo: 'models'
            });
            githubMock.run.resolves(null);
        });

        it('promises to stop a build when it is queued', () =>
            build.stop()
            .then(() => {
                assert.calledWith(executorMock.stop, {
                    buildId
                });

                assert.calledWith(githubMock.run, {
                    user: adminUser,
                    action: 'createStatus',
                    params: {
                        user: 'screwdriver-cd',
                        repo: 'models',
                        sha,
                        state: 'failure',
                        context: 'screwdriver'
                    }
                });
            })
        );

        it('promises to stop a build when it is running', () => {
            build.status = 'RUNNING';

            return build.stop()
                .then(() => {
                    assert.calledWith(executorMock.stop, {
                        buildId
                    });

                    assert.calledWith(githubMock.run, {
                        user: adminUser,
                        action: 'createStatus',
                        params: {
                            user: 'screwdriver-cd',
                            repo: 'models',
                            sha,
                            state: 'failure',
                            context: 'screwdriver'
                        }
                    });
                });
        });

        it('does nothing if build is not queued or running', () => {
            build.status = 'SUCCESS';

            return build.stop()
                .then(() => {
                    assert.notCalled(executorMock.stop);
                    assert.notCalled(githubMock.run);
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
                    admin: new Promise(r => r(adminUser))
                }))
            });

            tokenGen = sinon.stub().returns(token);

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

    describe('job', () => {
        it('has a job getter', () => {
            jobFactoryMock.get.resolves(null);
            // when we fetch a job it resolves to a promise
            assert.isFunction(build.job.then);
            // and a factory is called to create that promise
            assert.calledWith(jobFactoryMock.get, jobId);

            // When we call build.job again it is still a promise
            assert.isFunction(build.job.then);
            // ...but the factory was not recreated, since the promise is stored
            // as the model's pipeline property, now
            assert.calledOnce(jobFactoryMock.get);
        });
    });

    describe('user', () => {
        it('has a user getter', () => {
            userFactoryMock.get.resolves(null);
            // when we fetch a user it resolves to a promise
            assert.isFunction(build.user.then);
            // and a factory is called to create that promise
            assert.calledWith(userFactoryMock.get, { username: config.username });

            // When we call build.user again it is still a promise
            assert.isFunction(build.user.then);
            // ...but the factory was not recreated, since the promise is stored
            // as the model's pipeline property, now
            assert.calledOnce(userFactoryMock.get);
        });
    });

    describe('pipeline', () => {
        it('has a pipeline getter', () => {
            const jobMock = {
                pipeline: new Promise(r => r({}))
            };

            jobFactoryMock.get.resolves(jobMock);
            // when we fetch a pipeline it resolves to a promise
            assert.isFunction(build.pipeline.then);
            // job resolves that promise
            assert.calledWith(jobFactoryMock.get, jobId);

            // When we call build.pipeline again it is still a promise
            assert.isFunction(build.pipeline.then);
            // ...but the job need not be bothered
            // as the model's pipeline property, now
            assert.calledOnce(jobFactoryMock.get);
        });

        it('rejects if pipeline is null', () => {
            const jobMock = {
                pipeline: new Promise(r => r(null))
            };

            jobFactoryMock.get.resolves(jobMock);

            return build.pipeline
                .then(() => {
                    assert.fail('should not get here');
                })
                .catch(err => {
                    assert.instanceOf(err, Error);
                    assert.strictEqual(err.message, 'Pipeline does not exist');
                });
        });

        it('rejects if job is null', () => {
            jobFactoryMock.get.resolves(null);

            return build.pipeline
                .then(() => {
                    assert.fail('should not get here');
                })
                .catch(err => {
                    assert.instanceOf(err, Error);
                    assert.strictEqual(err.message, 'Job does not exist');
                });
        });
    });
});
