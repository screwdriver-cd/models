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
            scan: sinon.stub(),
            update: sinon.stub(),
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
        mockery.registerMock('screwdriver-executor-k8s', executorFactoryStub);

        // eslint-disable-next-line global-require
        BuildModel = require('../../lib/buildmodel');

        build = new BuildModel(datastore);
    });

    afterEach(() => {
        datastore = null;
        mockery.deregisterAll();
        mockery.resetCache();
    });

    after(() => {
        mockery.disable();
    });

    it('constructs', () => {
        const result = new BuildModel(datastore);

        assert.isOk(result);
    });

    it('has the correct API', () => {
        const result = new BuildModel(datastore);

        assert.property(result, 'create');
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

    describe('get', () => {
        it('calls datastore get and returns correct values', (done) => {
            datastore.get.yieldsAsync(null, { id: 'as12345', data: 'stuff' });
            build.get('as12345', (err, data) => {
                assert.isNull(err);
                assert.deepEqual(data, {
                    id: 'as12345',
                    data: 'stuff'
                });
                done();
            });
        });
    });

    describe('list', () => {
        const paginate = {
            page: 1,
            count: 2
        };

        it('calls datastore scan and returns correct values', (done) => {
            const returnValue = [
                {
                    id: 'a1234',
                    data: 'stuff1'
                },
                {
                    id: 'a1234',
                    data: 'stuff2'
                }
            ];

            datastore.scan.yieldsAsync(null, returnValue);
            build.list(paginate, (err, data) => {
                assert.isNull(err);
                assert.deepEqual(data, returnValue);
                done();
            });
        });
    });

    describe('update', () => {
        const config = {
            id: 'as12345',
            data: 'stuff'
        };

        it('calls datastore update and returns the new object', (done) => {
            datastore.update.yieldsAsync(null, { jobId: '1234' });
            build.update(config, (err, result) => {
                assert.isNull(err);
                assert.deepEqual(result, { jobId: '1234' });
                done();
            });
        });
    });

    describe('create', () => {
        const container = 'node:4';
        const jobId = '62089f642bbfd1886623964b4cff12db59869e5d';
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
                        container,
                        createTime: now,
                        jobId,
                        runNumber: now,
                        status: 'QUEUED'
                    }
                }
            };

            sandbox.useFakeTimers(now);

            build.create({
                jobId,
                container
            }, (err, data) => {
                assert.isNull(err);
                assert.deepEqual(data, {
                    cause: 'Started by user',
                    container,
                    createTime: now,
                    id: testId,
                    jobId,
                    runNumber: now,
                    status: 'QUEUED'
                });

                assert.calledWith(hashaMock.sha1, {
                    jobId,
                    runNumber: now
                });
                assert.calledWith(datastore.save, saveConfig);
                done();
            });

            process.nextTick(sandbox.clock.tick);
        });

        it('creates a build by executing the executor', (done) => {
            datastore.get.withArgs(jobsTableConfig).yieldsAsync(null, { pipelineId });
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
