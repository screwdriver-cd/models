'use strict';
const assert = require('chai').assert;
const mockery = require('mockery');
const sinon = require('sinon');
const schema = require('screwdriver-data-schema');

sinon.assert.expose(assert, { prefix: '' });
require('sinon-as-promised');

describe('Build Model', () => {
    const apiUri = 'https://notify.com/some/endpoint';
    const uiUri = 'https://display.com/some/endpoint';
    const jobId = '62089f642bbfd1886623964b4cff12db59869e5d';
    const now = 112233445566;
    const buildId = 'd398fb192747c9a0124e9e5b4e6e8e841cf8c71c';
    const sha = 'ccc49349d3cffbd12ea9e3d41521480b4aa5de5f';
    const container = 'node:4';
    const adminUser = { username: 'batman', unsealToken: sinon.stub().resolves('foo') };
    const pipelineId = 'cf23df2207d99a74fbe169e3eba035e633b65d94';
    const scmUrl = 'git@github.com:screwdriver-cd/models.git#master';
    const token = 'equivalentToOneQuarter';
    const url = `${uiUri}/builds/${buildId}`;
    let BuildModel;
    let datastore;
    let executorMock;
    let hashaMock;
    let build;
    let config;
    let BaseModel;
    let userFactoryMock;
    let jobFactoryMock;
    let scmMock;
    let tokenGen;

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
            stop: sinon.stub()
        };
        userFactoryMock = {
            get: sinon.stub()
        };
        jobFactoryMock = {
            get: sinon.stub()
        };
        scmMock = {
            updateCommitStatus: sinon.stub().resolves(null)
        };
        tokenGen = sinon.stub().returns(token);
        const uF = {
            getInstance: sinon.stub().returns(userFactoryMock)
        };
        const jF = {
            getInstance: sinon.stub().returns(jobFactoryMock)
        };

        mockery.registerMock('./userFactory', uF);
        mockery.registerMock('./jobFactory', jF);
        mockery.registerMock('screwdriver-hashr', hashaMock);

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
            sha,
            scmPlugin: scmMock,
            apiUri,
            tokenGen,
            uiUri
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

        schema.models.build.allKeys.forEach(key => {
            assert.strictEqual(build[key], config[key]);
        });

        // Also added a username members
        assert.strictEqual(build.username, config.username);
        // private keys are private
        assert.isUndefined(build.executor);
        assert.isUndefined(build.apiUri);
        assert.isUndefined(build.tokenGen);
        assert.isUndefined(build.uiUri);
    });

    describe('updateCommitStatus', () => {
        let pipeline;

        beforeEach(() => {
            jobFactoryMock.get.resolves({
                id: jobId,
                name: 'main',
                pipeline: Promise.resolve({
                    id: pipelineId,
                    scmUrl,
                    admin: Promise.resolve(adminUser)
                })
            });
            pipeline = {
                scmUrl,
                admin: Promise.resolve(adminUser)
            };
        });

        it('should update the commit status with url', () =>
            build.updateCommitStatus(pipeline, apiUri)
                .then(() => {
                    assert.calledWith(scmMock.updateCommitStatus, {
                        token: 'foo',
                        scmUrl,
                        sha,
                        jobName: 'main',
                        buildStatus: 'QUEUED',
                        url
                    });
                })
        );

        it('reject on error', () => {
            scmMock.updateCommitStatus.rejects(new Error('nevergonnagiveyouup'));

            return build.updateCommitStatus(pipeline, apiUri)
                .catch((err) => {
                    assert.instanceOf(err, Error);
                    assert.equal(err.message, 'nevergonnagiveyouup');
                });
        });
    });

    describe('update', () => {
        beforeEach(() => {
            jobFactoryMock.get.resolves({
                id: jobId,
                name: 'main',
                pipeline: Promise.resolve({
                    id: pipelineId,
                    scmUrl,
                    admin: Promise.resolve(adminUser)
                })
            });
        });

        it('promises to update a build and update status to failure', () => {
            datastore.update.yieldsAsync(null, {});
            build.status = 'FAILURE';

            return build.update()
                .then(() => {
                    assert.calledWith(scmMock.updateCommitStatus, {
                        token: 'foo',
                        scmUrl,
                        sha,
                        jobName: 'main',
                        buildStatus: 'FAILURE',
                        url
                    });
                });
        });

        it('promises to update a build and not update status when status is not dirty', () => {
            datastore.update.yieldsAsync(null, {});

            return build.update()
                .then(() => {
                    assert.notCalled(scmMock.updateCommitStatus);
                });
        });
    });

    describe('stop', () => {
        beforeEach(() => {
            executorMock.stop.resolves(null);
            datastore.update.yieldsAsync(null, {});

            jobFactoryMock.get.resolves({
                id: jobId,
                name: 'main',
                pipeline: Promise.resolve({
                    id: pipelineId,
                    scmUrl,
                    admin: Promise.resolve(adminUser)
                })
            });
        });

        it('promises to stop a build when it is queued', () =>
            build.stop()
                .then(() => {
                    assert.calledWith(executorMock.stop, {
                        buildId
                    });

                    assert.calledWith(scmMock.updateCommitStatus, {
                        token: 'foo',
                        scmUrl,
                        sha,
                        jobName: 'main',
                        buildStatus: 'ABORTED',
                        url
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

                    assert.calledWith(scmMock.updateCommitStatus, {
                        token: 'foo',
                        scmUrl,
                        sha,
                        jobName: 'main',
                        buildStatus: 'ABORTED',
                        url
                    });
                });
        });

        it('does nothing if build is not queued or running', () => {
            build.status = 'SUCCESS';

            return build.stop()
                .then(() => {
                    assert.notCalled(executorMock.stop);
                    assert.notCalled(datastore.update);
                    assert.notCalled(scmMock.updateCommitStatus);
                });
        });

        it('rejects on executor failure', () => {
            const expectedError = new Error('cantStopTheRock');

            executorMock.stop.rejects(expectedError);

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

        beforeEach(() => {
            sandbox = sinon.sandbox.create();
            sandbox.useFakeTimers(now);

            executorMock.start.resolves(null);

            jobFactoryMock.get.resolves({
                id: jobId,
                name: 'main',
                pipeline: Promise.resolve({
                    id: pipelineId,
                    scmUrl,
                    admin: Promise.resolve(adminUser)
                }),
                isPR: () => false
            });
        });

        it('promises to start a build', () =>
            build.start()
            .then(() => {
                assert.calledWith(executorMock.start, {
                    apiUri,
                    buildId,
                    container,
                    token
                });

                assert.calledWith(tokenGen, buildId, {
                    isPR: false,
                    jobId,
                    pipelineId
                });

                assert.calledWith(scmMock.updateCommitStatus, {
                    token: 'foo',
                    scmUrl,
                    sha,
                    jobName: 'main',
                    buildStatus: 'QUEUED',
                    url
                });
            })
        );

        it('rejects when the executor fails', () => {
            const expectedError = new Error('brokenGun');

            executorMock.start.rejects(expectedError);

            return build.start()
            .then(() => {
                assert.fail('This should not fail the test');
            })
            .catch((err) => {
                assert.deepEqual(err, expectedError);
            });
        });
    });

    describe('secrets', () => {
        beforeEach(() => {
            jobFactoryMock.get.resolves({
                id: jobId,
                name: 'main',
                secrets: Promise.resolve([
                    {
                        name: 'NORMAL',
                        value: 'value',
                        allowInPR: true
                    }
                ]),
                isPR: () => false
            });
        });

        it('returns the list of secrets', () =>
            build.secrets.then((secrets) => {
                assert.isArray(secrets);
                assert.equal(secrets.length, 1);
            })
        );

        it('throws error if job missing', () => {
            jobFactoryMock.get.resolves(null);

            return build.secrets.then(() => {
                assert.fail('nope');
            }).catch(err => {
                assert.equal('Job does not exist', err.message);
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
                pipeline: Promise.resolve({})
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
                pipeline: Promise.resolve(null)
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
