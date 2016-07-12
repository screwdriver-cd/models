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

describe('Pipeline Model', () => {
    let PipelineModel;
    let datastore;
    let hashaMock;
    let pipeline;

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
        mockery.registerMock('screwdriver-hashr', hashaMock);
        mockery.registerMock('screwdriver-executor-k8s', executorFactoryStub);

        // eslint-disable-next-line global-require
        PipelineModel = require('../../lib/pipelinemodel');

        pipeline = new PipelineModel(datastore);
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
        const result = new PipelineModel(datastore);

        assert.isOk(result);
    });

    it('has the correct API', () => {
        const result = new PipelineModel(datastore);

        assert.property(result, 'create');
        assert.property(result, 'get');
        assert.property(result, 'list');
        assert.property(result, 'update');
        assert.property(result, 'sync');
    });

    describe('get', () => {
        it('calls datastore get and returns correct values', (done) => {
            datastore.get.yieldsAsync(null, { id: 'as12345', data: 'stuff' });
            pipeline.get('as12345', (err, data) => {
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
                    id: '1321shewp',
                    scmUrl: 'git@github.com/repo1.git#master'
                },
                {
                    id: '0842wpoe',
                    scmUrl: 'git@github.com/repo2.git#master'
                }
            ];

            datastore.scan.yieldsAsync(null, returnValue);
            pipeline.list(paginate, (err, data) => {
                assert.isNull(err);
                assert.deepEqual(data, returnValue);
                done();
            });
        });
    });

    describe('update', () => {
        const config = {
            id: 'as12345',
            scmUrl: 'git@github.com/stuff.git#master'
        };

        it('calls datastore update and returns the new object', (done) => {
            datastore.update.yieldsAsync(null, { scmUrl: 'git@github.com/stuff.git#master' });
            pipeline.update(config, (err, result) => {
                assert.isNull(err);
                assert.deepEqual(result, { scmUrl: 'git@github.com/stuff.git#master' });
                done();
            });
        });
    });

    describe('create', () => {
        let sandbox;
        let config;
        const dateNow = 1111111111;
        const scmUrl = 'git@github.com:screwdriver-cd/data-model.git#master';
        const testId = 'd398fb192747c9a0124e9e5b4e6e8e841cf8c71c';
        const platformName = 'generic@1';

        beforeEach(() => {
            sandbox = sinon.sandbox.create({
                useFakeTimers: false
            });
            hashaMock.sha1.withArgs(scmUrl).returns(testId);

            config = {
                table: 'pipelines',
                params: {
                    id: 'd398fb192747c9a0124e9e5b4e6e8e841cf8c71c',
                    data: {
                        createTime: dateNow,
                        scmUrl,
                        configUrl: scmUrl,
                        platform: platformName
                    }
                }
            };
        });

        afterEach(() => {
            sandbox.restore();
        });

        it('returns error when the scmUrl already exists', (done) => {
            datastore.get.yieldsAsync(null, { id: testId, scmUrl });
            pipeline.create({ scmUrl }, (error) => {
                assert.isOk(error);
                assert.equal(error.message, 'scmUrl needs to be unique');
                done();
            });
        });

        it('returns error when the datastore fails to save', (done) => {
            datastore.get.yieldsAsync(null, null);
            const testError = new Error('datastoreSaveError');

            datastore.save.yieldsAsync(testError);

            pipeline.create({ scmUrl }, (error) => {
                assert.isOk(error);
                assert.equal(error.message, 'datastoreSaveError');
                done();
            });
        });

        it('and correct pipeline data', (done) => {
            datastore.get.yieldsAsync(null, null);
            sandbox.useFakeTimers(dateNow);
            datastore.save.yieldsAsync(null);

            pipeline.create({ scmUrl }, () => {
                assert.calledWith(datastore.save, config);
                done();
            });

            process.nextTick(() => {
                sandbox.clock.tick();
            });
        });
    });

    describe('sync', () => {
        const scmUrl = 'git@github.com:screwdriver-cd/data-model.git#master';
        const testId = 'd398fb192747c9a0124e9e5b4e6e8e841cf8c71c';
        const testJobId = 'e398fb192747c9a0124e9e5b4e6e8e841cf8c71c';
        const jobName = 'main';

        it('creates the main job if pipeline exists', (done) => {
            hashaMock.sha1.withArgs(`${scmUrl}`).returns(testId);
            hashaMock.sha1.withArgs(`${testId}${jobName}`).returns(testJobId);
            datastore.get.yieldsAsync(null);
            datastore.save.yieldsAsync(null);
            pipeline.sync({ scmUrl }, () => {
                assert.calledWith(datastore.save, {
                    table: 'jobs',
                    params: {
                        id: testJobId,
                        data: {
                            name: 'main',
                            pipelineId: testId,
                            state: 'ENABLED',
                            triggers: [],
                            triggeredBy: []
                        }
                    }
                });
                assert.calledWith(hashaMock.sha1, `${testId}main`);
                done();
            });
        });

        it('returns error if pipeline does not exist', (done) => {
            const err = new Error('blah');

            datastore.get.yieldsAsync(err);
            pipeline.sync({ scmUrl }, (error) => {
                assert.isOk(error);
                done();
            });
        });
    });
});
