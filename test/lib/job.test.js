'use strict';
const assert = require('chai').assert;
const mockery = require('mockery');
const sinon = require('sinon');

sinon.assert.expose(assert, { prefix: '' });

describe('Job Model', () => {
    let JobModel;
    let datastore;
    let hashaMock;
    let job;

    before(() => {
        mockery.enable({
            useCleanCache: true,
            warnOnUnregistered: false
        });
    });

    beforeEach(() => {
        datastore = {
            save: sinon.stub()
        };
        hashaMock = {
            sha1: sinon.stub()
        };
        mockery.registerMock('screwdriver-hashr', hashaMock);

        // eslint-disable-next-line global-require
        JobModel = require('../../lib/job');

        job = new JobModel(datastore);
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
        assert.isFunction(job.get);
        assert.isFunction(job.update);
        assert.isFunction(job.list);
    });

    describe('create', () => {
        const jobId = 'd398fb192747c9a0124e9e5b4e6e8e841cf8c71c';
        const pipelineId = 'cf23df2207d99a74fbe169e3eba035e633b65d94';
        const name = 'main';
        const saveConfig = {
            table: 'jobs',
            params: {
                id: jobId,
                data: {
                    name,
                    pipelineId,
                    state: 'ENABLED'
                }
            }
        };

        beforeEach(() => {
            hashaMock.sha1.returns(jobId);
        });

        it('creates a new job in the datastore', (done) => {
            datastore.save.yieldsAsync(null);
            job.create({
                pipelineId,
                name
            }, (err) => {
                assert.isNull(err);
                assert.calledWith(hashaMock.sha1, {
                    pipelineId, name
                });
                assert.calledWith(datastore.save, saveConfig);
                done();
            });
        });

        it('promises to create a new job', () => {
            hashaMock.sha1.returns(jobId);
            datastore.save.yieldsAsync(null, { expected: 'toReturnThis' });

            return job.create({ pipelineId, name })
                .then((data) => {
                    assert.calledWith(hashaMock.sha1, {
                        pipelineId, name
                    });
                    assert.calledWith(datastore.save, saveConfig);
                    assert.deepEqual(data, { expected: 'toReturnThis' });
                });
        });

        it('rejects when a datastore save fails', () => {
            const errorMessage = 'datastoreSaveFailureMessage';

            datastore.save.yieldsAsync(new Error(errorMessage));

            return job.create({ pipelineId, name })
                .then(() => {
                    assert.fail('This should not fail the test');
                })
                .catch((err) => {
                    assert.strictEqual(err.message, errorMessage);
                });
        });
    });
});
