'use strict';
const assert = require('chai').assert;
const mockery = require('mockery');
const sinon = require('sinon');

sinon.assert.expose(assert, { prefix: '' });

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
            save: sinon.stub()
        };
        hashaMock = {
            sha1: sinon.stub()
        };
        mockery.registerMock('screwdriver-hashr', hashaMock);

        // eslint-disable-next-line global-require
        PipelineModel = require('../../lib/pipeline');

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

    it('extends base class', () => {
        assert.isFunction(pipeline.get);
        assert.isFunction(pipeline.update);
        assert.isFunction(pipeline.list);
    });

    describe('create', () => {
        let sandbox;
        let config;
        const dateNow = 1111111111;
        const scmUrl = 'git@github.com:screwdriver-cd/data-model.git#master';
        const testId = 'd398fb192747c9a0124e9e5b4e6e8e841cf8c71c';

        beforeEach(() => {
            sandbox = sinon.sandbox.create({
                useFakeTimers: false
            });
            hashaMock.sha1.withArgs({
                scmUrl
            }).returns(testId);

            config = {
                table: 'pipelines',
                params: {
                    id: 'd398fb192747c9a0124e9e5b4e6e8e841cf8c71c',
                    data: {
                        createTime: dateNow,
                        scmUrl,
                        configUrl: scmUrl
                    }
                }
            };
        });

        afterEach(() => {
            sandbox.restore();
        });

        it('returns error when the datastore fails to save', (done) => {
            const testError = new Error('datastoreSaveError');

            datastore.save.yieldsAsync(testError);

            pipeline.create({ scmUrl }, (error) => {
                assert.isOk(error);
                assert.equal(error.message, 'datastoreSaveError');
                done();
            });
        });

        it('and correct pipeline data', (done) => {
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
        const pipelineId = 'd398fb192747c9a0124e9e5b4e6e8e841cf8c71c';
        const jobId = 'e398fb192747c9a0124e9e5b4e6e8e841cf8c71c';
        const jobName = 'main';

        it('creates the main job if pipeline exists', (done) => {
            hashaMock.sha1.withArgs({
                scmUrl
            }).returns(pipelineId);
            hashaMock.sha1.withArgs({
                pipelineId,
                name: jobName
            }).returns(jobId);
            datastore.get.yieldsAsync(null, {
                id: pipelineId
            });
            datastore.save.yieldsAsync(null);
            pipeline.sync({ scmUrl }, () => {
                assert.calledWith(datastore.save, {
                    table: 'jobs',
                    params: {
                        id: jobId,
                        data: {
                            name: 'main',
                            pipelineId,
                            state: 'ENABLED'
                        }
                    }
                });
                assert.calledWith(hashaMock.sha1, {
                    pipelineId,
                    name: 'main'
                });
                done();
            });
        });

        it('returns error if datastore explodes', (done) => {
            const err = new Error('blah');

            datastore.get.yieldsAsync(err);
            pipeline.sync({ scmUrl }, (error) => {
                assert.isOk(error);
                done();
            });
        });

        it('returns null if pipeline does not exist', (done) => {
            datastore.get.yieldsAsync(null, null);
            pipeline.sync({ scmUrl }, (error, data) => {
                assert.isNull(error);
                assert.isNull(data);
                done();
            });
        });
    });
});
