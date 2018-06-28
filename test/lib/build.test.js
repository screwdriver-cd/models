'use strict';

const assert = require('chai').assert;
const mockery = require('mockery');
const sinon = require('sinon');
const schema = require('screwdriver-data-schema');

sinon.assert.expose(assert, { prefix: '' });

describe('Build Model', () => {
    const annotations = {};
    const apiUri = 'https://notify.com/some/endpoint';
    const uiUri = 'https://display.com/some/endpoint';
    const jobId = 777;
    const now = 112233445566;
    const buildId = 9876;
    const sha = 'ccc49349d3cffbd12ea9e3d41521480b4aa5de5f';
    const container = 'node:4';
    const adminUser = { username: 'batman', unsealToken: sinon.stub().resolves('foo') };
    const pipelineId = 1234;
    const configPipelineId = 1233;
    const scmUri = 'github.com:12345:master';
    const scmContext = 'github:github.com';
    const token = 'equivalentToOneQuarter';
    const url = `${uiUri}/pipelines/${pipelineId}/builds/${buildId}`;
    const TEMPORAL_JWT_TIMEOUT = 12 * 60;
    let BuildModel;
    let datastore;
    let executorMock;
    let hashaMock;
    let build;
    let config;
    let BaseModel;
    let userFactoryMock;
    let jobFactoryMock;
    let pipelineFactoryMock;
    let scmMock;
    let tokenGen;
    let pipelineMock;
    let jobMock;

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
        pipelineFactoryMock = {
            get: sinon.stub().resolves(null)
        };

        pipelineMock = {
            id: pipelineId,
            scmUri,
            scmContext,
            admin: Promise.resolve(adminUser),
            token: Promise.resolve('foo')
        };
        jobMock = {
            id: jobId,
            name: 'main',
            pipeline: Promise.resolve(pipelineMock),
            permutations: [{ annotations }]
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
        const pF = {
            getInstance: sinon.stub().returns(pipelineFactoryMock)
        };

        mockery.registerMock('./pipelineFactory', pF);
        mockery.registerMock('./userFactory', uF);
        mockery.registerMock('./jobFactory', jF);
        mockery.registerMock('screwdriver-hashr', hashaMock);

        // eslint-disable-next-line global-require
        BuildModel = require('../../lib/build');
        // eslint-disable-next-line global-require
        BaseModel = require('../../lib/base');

        config = {
            datastore,
            executor: executorMock,
            id: buildId,
            cause: 'Started by user i_made_the_request',
            container,
            createTime: now,
            jobId,
            number: now,
            status: 'QUEUED',
            sha,
            scm: scmMock,
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

        schema.models.build.allKeys.forEach((key) => {
            assert.strictEqual(build[key], config[key]);
        });

        // private keys are private
        assert.isUndefined(build.executor);
        assert.isUndefined(build.apiUri);
        assert.isUndefined(build.tokenGen);
        assert.isUndefined(build.uiUri);
    });

    describe('updateCommitStatus', () => {
        beforeEach(() => {
            jobFactoryMock.get.resolves(jobMock);
        });

        it('should update the commit status with url', () =>
            build.updateCommitStatus(pipelineMock, apiUri)
                .then(() => {
                    assert.calledWith(scmMock.updateCommitStatus, {
                        token: 'foo',
                        scmUri,
                        scmContext,
                        sha,
                        jobName: 'main',
                        buildStatus: 'QUEUED',
                        url,
                        pipelineId
                    });
                })
        );

        it('reject on error', () => {
            scmMock.updateCommitStatus.rejects(new Error('nevergonnagiveyouup'));

            return build.updateCommitStatus(pipelineMock, apiUri)
                .catch((err) => {
                    assert.instanceOf(err, Error);
                    assert.equal(err.message, 'nevergonnagiveyouup');
                });
        });
    });

    describe('update', () => {
        const step0 = { name: 'task0', startTime: 'now', endTime: 'then', code: 0 };
        const step1 = { name: 'task1', startTime: 'now' };
        const step2 = { name: 'task2' };

        beforeEach(() => {
            build.steps = [step0, step1, step2];

            executorMock.stop.resolves(null);
            jobFactoryMock.get.resolves(jobMock);
            datastore.update.resolves({});
        });

        it('promises to update a build, stop the executor, and update status to failure', () => {
            build.status = 'FAILURE';

            return build.update()
                .then(() => {
                    assert.calledWith(executorMock.stop, {
                        buildId,
                        jobId,
                        annotations,
                        blockedBy: [jobId]
                    });

                    // Completed step is not modified
                    assert.deepEqual(build.steps[0], step0);
                    // In progress step is aborted
                    assert.ok(build.steps[1].endTime);
                    assert.equal(build.steps[1].code, 130);
                    // Unstarted step is not modified
                    assert.deepEqual(build.steps[2], step2);

                    assert.calledWith(scmMock.updateCommitStatus, {
                        token: 'foo',
                        scmUri,
                        scmContext,
                        sha,
                        jobName: 'main',
                        buildStatus: 'FAILURE',
                        url,
                        pipelineId
                    });
                });
        });

        it('aborts running steps, and sets an endTime', () => {
            build.status = 'ABORTED';

            return build.update()
                .then(() => {
                    assert.calledWith(executorMock.stop, {
                        buildId,
                        jobId,
                        annotations,
                        blockedBy: [jobId]
                    });

                    // Completed step is not modified
                    assert.deepEqual(build.steps[0], step0);
                    // In progress step is aborted
                    assert.ok(build.steps[1].endTime);
                    assert.equal(build.steps[1].code, 130);
                    // Unstarted step is not modified
                    assert.deepEqual(build.steps[2], step2);

                    assert.calledWith(scmMock.updateCommitStatus, {
                        token: 'foo',
                        scmUri,
                        scmContext,
                        sha,
                        jobName: 'main',
                        buildStatus: 'ABORTED',
                        url,
                        pipelineId
                    });
                });
        });

        it('promises to update a build, but not status or executor when untouched status', () => (
            build.update()
                .then(() => {
                    assert.notCalled(scmMock.updateCommitStatus);
                    assert.notCalled(executorMock.stop);
                })
        ));

        it('promises to update a build, but not executor when status is running', () => {
            build.status = 'RUNNING';

            return build.update()
                .then(() => {
                    assert.calledWith(scmMock.updateCommitStatus, {
                        token: 'foo',
                        scmUri,
                        scmContext,
                        sha,
                        jobName: 'main',
                        buildStatus: 'RUNNING',
                        url,
                        pipelineId
                    });
                    assert.notCalled(executorMock.stop);
                });
        });

        it('promises to update, but not executor when status is unstable & not done', () => {
            config.status = 'RUNNING';
            build = new BuildModel(config);

            // RUNNING -> UNSTABLE
            build.status = 'UNSTABLE';

            return build.update()
                .then(() => {
                    assert.calledWith(scmMock.updateCommitStatus, {
                        token: 'foo',
                        scmUri,
                        scmContext,
                        sha,
                        jobName: 'main',
                        buildStatus: 'UNSTABLE',
                        url,
                        pipelineId
                    });
                    assert.notCalled(executorMock.stop);
                });
        });

        it('promises to update, and stop executor when status is unstable & done', () => {
            // UNSTABLE -> SUCCESS, status will not change, field is not dirty
            config.status = 'UNSTABLE';
            build = new BuildModel(config);

            build.steps = [step0, step1, step2];
            build.endTime = '2018-06-27T18:22:20.153Z';

            return build.update()
                .then(() => {
                    assert.notCalled(scmMock.updateCommitStatus);
                    assert.calledWith(executorMock.stop, {
                        buildId,
                        jobId,
                        annotations,
                        blockedBy: [jobId]
                    });
                });
        });
    });

    describe('stop', () => {
        beforeEach(() => {
            executorMock.stop.resolves(null);
            jobFactoryMock.get.resolves(jobMock);
        });

        it('promises to stop a build', () =>
            build.stop()
                .then(() => {
                    assert.calledWith(executorMock.stop, {
                        buildId,
                        jobId,
                        annotations,
                        blockedBy: [jobId]
                    });
                })
        );

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

    describe('isDone', () => {
        beforeEach(() => {
            build = new BuildModel(config);
        });
        it('returns true if the build is done', () => {
            build.status = 'ABORTED';
            assert.isTrue(build.isDone());
        });

        it('returns false if the build is not done', () => {
            build.status = 'RUNNING';
            assert.isFalse(build.isDone());
        });

        it('returns true if the build is UNSTABLE and has endTime', () => {
            build.status = 'UNSTABLE';
            build.endTime = '2018-06-27T18:22:20.153Z';
            assert.isTrue(build.isDone());
        });

        it('returns true if the build is UNSTABLE and no endTime', () => {
            build.status = 'UNSTABLE';
            assert.isFalse(build.isDone());
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
                    configPipelineId,
                    scmUri,
                    scmContext,
                    admin: Promise.resolve(adminUser),
                    token: Promise.resolve('foo')
                }),
                permutations: [{ annotations }],
                isPR: () => false
            });
        });

        afterEach(() => {
            sandbox.restore();
        });

        it('promises to start a build', () =>
            build.start()
                .then(() => {
                    assert.calledWith(executorMock.start, {
                        jobId,
                        annotations,
                        blockedBy: [jobId],
                        apiUri,
                        buildId,
                        container,
                        token
                    });

                    assert.calledWith(tokenGen, buildId, {
                        isPR: false,
                        jobId,
                        pipelineId,
                        configPipelineId
                    }, scmContext, TEMPORAL_JWT_TIMEOUT);

                    assert.calledWith(scmMock.updateCommitStatus, {
                        token: 'foo',
                        scmUri,
                        scmContext,
                        sha,
                        jobName: 'main',
                        buildStatus: 'QUEUED',
                        url,
                        pipelineId
                    });
                })
        );

        it('get internal blockedby job Ids and pass to executor start', () => {
            const blocking1 = {
                name: 'blocking1',
                id: 111
            };
            const blocking2 = {
                name: 'blocking2',
                id: 222
            };

            jobFactoryMock.get.resolves({
                id: jobId,
                name: 'main',
                pipeline: Promise.resolve({
                    id: pipelineId,
                    scmUri,
                    scmContext,
                    admin: Promise.resolve(adminUser),
                    token: Promise.resolve('foo'),
                    jobs: Promise.resolve([
                        { id: jobId, name: 'main' },
                        { id: blocking1.id, name: blocking1.name },
                        { id: 123, name: 'somejob' },
                        { id: blocking2.id, name: blocking2.name },
                        { id: 456, name: 'someotherjob' }])
                }),
                permutations: [{
                    annotations,
                    blockedBy: [blocking1.name, blocking2.name]
                }],
                isPR: () => false
            });

            return build.start()
                .then(() => {
                    assert.calledWith(executorMock.start, {
                        jobId,
                        blockedBy: [jobId, blocking1.id, blocking2.id],
                        annotations,
                        apiUri,
                        buildId,
                        container,
                        token
                    });
                });
        });

        it('get external blockedby job Ids and pass to executor start', () => {
            const externalPid1 = 101;
            const externalPid2 = 202;
            const externalJob1 = {
                name: 'externalJob1',
                id: 111
            };
            const externalJob2 = {
                name: 'externalJob2',
                id: 222
            };
            const pipeline1 = {
                id: externalPid1,
                jobs: Promise.resolve([
                    { id: 999, name: 'somejob' },
                    externalJob1
                ])
            };
            const pipeline2 = {
                id: externalPid2,
                jobs: Promise.resolve([
                    { id: 888, name: 'somerandomjob' },
                    externalJob2
                ])
            };
            const internalJob = {
                name: 'internalJob',
                id: 333
            };

            pipelineFactoryMock.get.withArgs(externalPid1).resolves(pipeline1);
            pipelineFactoryMock.get.withArgs(externalPid2).resolves(pipeline2);

            jobFactoryMock.get.resolves({
                id: jobId,
                name: 'main',
                pipeline: Promise.resolve({
                    id: pipelineId,
                    scmUri,
                    scmContext,
                    admin: Promise.resolve(adminUser),
                    token: Promise.resolve('foo'),
                    jobs: Promise.resolve([
                        { id: jobId, name: 'main' },
                        { id: 123, name: 'somejob' },
                        { id: internalJob.id, name: internalJob.name }])
                }),
                permutations: [{
                    annotations,
                    blockedBy: [
                        `~sd@${externalPid1}:externalJob1`,
                        `~${internalJob.name}`,
                        `~sd@${externalPid2}:externalJob2`
                    ]
                }],
                isPR: () => false
            });

            return build.start()
                .then(() => {
                    assert.calledWith(executorMock.start, {
                        jobId,
                        blockedBy: [jobId, internalJob.id, externalJob1.id, externalJob2.id],
                        annotations,
                        apiUri,
                        buildId,
                        container,
                        token
                    });
                });
        });

        it('promises to start a build with the executor specified in job annotations', () => {
            jobFactoryMock.get.resolves({
                id: jobId,
                name: 'main',
                pipeline: Promise.resolve({
                    id: pipelineId,
                    configPipelineId,
                    scmUri,
                    scmContext,
                    admin: Promise.resolve(adminUser),
                    token: Promise.resolve('foo')
                }),
                permutations: [{ annotations: { 'beta.screwdriver.cd/executor:': 'k8s-vm' } }],
                isPR: () => false
            });

            return build.start()
                .then(() => {
                    assert.calledWith(executorMock.start, {
                        jobId,
                        annotations: { 'beta.screwdriver.cd/executor:': 'k8s-vm' },
                        blockedBy: [jobId],
                        apiUri,
                        buildId,
                        container,
                        token
                    });

                    assert.calledWith(tokenGen, buildId, {
                        isPR: false,
                        jobId,
                        pipelineId,
                        configPipelineId
                    }, scmContext, TEMPORAL_JWT_TIMEOUT);

                    assert.calledWith(scmMock.updateCommitStatus, {
                        token: 'foo',
                        scmUri,
                        scmContext,
                        sha,
                        jobName: 'main',
                        buildStatus: 'QUEUED',
                        url,
                        pipelineId
                    });
                });
        });

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
            }).catch((err) => {
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

    describe('pipeline', () => {
        it('has a pipeline getter', () => {
            jobMock = {
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
            jobMock = {
                pipeline: Promise.resolve(null)
            };

            jobFactoryMock.get.resolves(jobMock);

            return build.pipeline
                .then(() => {
                    assert.fail('should not get here');
                })
                .catch((err) => {
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
                .catch((err) => {
                    assert.instanceOf(err, Error);
                    assert.strictEqual(err.message, 'Job does not exist');
                });
        });
    });
});
