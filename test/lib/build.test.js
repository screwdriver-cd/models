'use strict';
const assert = require('chai').assert;
const mockery = require('mockery');
const sinon = require('sinon');

sinon.assert.expose(assert, { prefix: '' });

/**
 * Stub for Executor K8s factory method
 * @method executorFactoryStub
 */
function executorFactoryStub() {}

describe('Build Model', () => {
    let BuildModel;
    let datastore;
    let executorMock;
    let hashaMock;
    let build;

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
        hashaMock = {
            sha1: sinon.stub()
        };
        executorMock = {
            start: sinon.stub(),
            stream: sinon.stub()
        };
        executorFactoryStub.prototype = executorMock;
        mockery.registerMock('screwdriver-hashr', hashaMock);

        // eslint-disable-next-line global-require
        BuildModel = require('../../lib/build');

        build = new BuildModel(datastore, executorMock);
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
        assert.isFunction(build.get);
        assert.isFunction(build.update);
        assert.isFunction(build.list);
    });

    describe('stream', () => {
        it('calls executor stream with correct values', () => {
            const streamStub = sinon.stub();
            const buildId = 'as12345';

            build.stream({ buildId }, streamStub);
            assert.calledWith(executorMock.stream, {
                buildId
            }, streamStub);
        });
    });

    describe('create', () => {
        const container = 'node:6';
        const jobId = '62089f642bbfd1886623964b4cff12db59869e5d';
        const jobName = 'main';
        const now = 112233445566;
        const pipelineId = 'cf23df2207d99a74fbe169e3eba035e633b65d94';
        const testId = 'd398fb192747c9a0124e9e5b4e6e8e841cf8c71c';
        let sandbox;
        const jobsTableConfig = {
            table: 'jobs',
            params: {
                id: jobId
            }
        };
        const pipelinesTableConfig = {
            table: 'pipelines',
            params: {
                id: pipelineId
            }
        };

        beforeEach(() => {
            sandbox = sinon.sandbox.create();

            hashaMock.sha1.returns(testId);
            datastore.get.yieldsAsync(null, {});
            datastore.save.yieldsAsync(null, {});
            executorMock.start.yieldsAsync(null);
        });

        it('executes things in order', (done) => {
            build.create({
                jobId,
                container
            }, () => {
                assert.isOk(datastore.save.calledBefore(executorMock.start));
                done();
            });
        });

        it('creates a new build model and saves it to the datastore', (done) => {
            const saveConfig = {
                table: 'builds',
                params: {
                    id: testId,
                    data: {
                        cause: 'Started by user',
                        container: 'node:4',
                        createTime: now,
                        jobId,
                        number: now,
                        status: 'QUEUED'
                    }
                }
            };

            sandbox.useFakeTimers(now);

            build.create({
                jobId
            }, (err, data) => {
                assert.isNull(err);
                assert.deepEqual(data, {
                    cause: 'Started by user',
                    container: 'node:4',
                    createTime: now,
                    id: testId,
                    jobId,
                    number: now,
                    status: 'QUEUED'
                });

                assert.calledWith(hashaMock.sha1, {
                    jobId,
                    number: now
                });
                assert.calledWith(datastore.save, saveConfig);
                done();
            });

            process.nextTick(sandbox.clock.tick);
        });

        it('creates a build by executing the executor', (done) => {
            datastore.get.withArgs(jobsTableConfig).yieldsAsync(null, {
                pipelineId,
                name: jobName
            });
            datastore.get.withArgs(pipelinesTableConfig).yieldsAsync(null, { scmUrl: 'scmUrl' });

            build.create({
                jobId,
                container
            }, (err) => {
                assert.isNull(err);
                assert.calledWith(executorMock.start, {
                    buildId: testId,
                    container,
                    jobId,
                    jobName,
                    pipelineId,
                    scmUrl: 'scmUrl'
                });
                done();
            });
        });

        it('fails to save the build data to the datastore', (done) => {
            const errorMessage = 'datstoreSaveFailure';

            datastore.save.yieldsAsync(new Error(errorMessage));
            build.create({
                jobId,
                container
            }, (err) => {
                assert.strictEqual(err.message, errorMessage);
                done();
            });
        });

        it('fails to lookup the pipeline ID', (done) => {
            const errorMessage = 'LOL';

            datastore.get.yieldsAsync(new Error(errorMessage));
            build.create({
                jobId,
                container
            }, (err) => {
                assert.strictEqual(err.message, errorMessage);
                done();
            });
        });

        it('fails to lookup scm url', (done) => {
            const errorMessage = 'scmUrlError';

            datastore.get.withArgs(jobsTableConfig).yieldsAsync(null, { pipelineId });
            datastore.get.withArgs(pipelinesTableConfig).yieldsAsync(new Error(errorMessage));
            build.create({
                jobId,
                container
            }, (err) => {
                assert.strictEqual(err.message, errorMessage);
                done();
            });
        });

        it('fails to execute the build', (done) => {
            const errorMessage = 'executorStartError';

            datastore.get.withArgs(jobsTableConfig).yieldsAsync(null, { pipelineId: 'pipelineId' });
            datastore.get.withArgs(pipelinesTableConfig).yieldsAsync(null, { scmUrl: 'scmUrl' });
            executorMock.start.yieldsAsync(new Error(errorMessage));

            build.create({
                jobId,
                container
            }, (err) => {
                assert.strictEqual(err.message, errorMessage);
                done();
            });
        });
    });
});
