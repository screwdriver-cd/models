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
        it('creates a new job in the datastore', (done) => {
            const pipelineId = 'cf23df2207d99a74fbe169e3eba035e633b65d94';
            const jobId = 'd398fb192747c9a0124e9e5b4e6e8e841cf8c71c';
            const name = 'main';
            const state = 'ENABLED';
            const saveConfig = {
                table: 'jobs',
                params: {
                    id: jobId,
                    data: {
                        name,
                        pipelineId,
                        state
                    }
                }
            };

            hashaMock.sha1.returns(jobId);
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
    });
});
