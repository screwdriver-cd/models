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
    const jobData = {
        id: 'd398fb192747c9a0124e9e5b4e6e8e841cf8c71c',
        pipelineId: '151c9b11e4a9a27e9e374daca6e59df37d8cf00f',
        name: 'deploy',
        state: 'ENABLED',
        triggers: [],
        triggeredBy: ['151c9b11e4a9a27e9e374daca6e59df37d8cf00f']
    };

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

        // eslint-disable-next-line global-require
        JobModel = require('../../lib/jobmodel');

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

    describe('get', () => {
        it('calls datastore get and returns correct values', (done) => {
            datastore.get.yieldsAsync(null, jobData);
            job.get('as12345', (err, data) => {
                assert.isNull(err);
                assert.deepEqual(data, jobData);
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
                    id: '151c9b11e4a9a27e9e374daca6e59df37d8cf00f',
                    name: 'component'
                },
                {
                    id: 'd398fb192747c9a0124e9e5b4e6e8e841cf8c71c',
                    name: 'deploy'
                }
            ];

            datastore.scan.yieldsAsync(null, returnValue);
            job.list(paginate, (err, data) => {
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
            job.update(config, (err, result) => {
                assert.isNull(err);
                assert.deepEqual(result, { jobId: '1234' });
                done();
            });
        });
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
                assert.calledWith(hashaMock.sha1, `${pipelineId}${name}`);
                assert.calledWith(datastore.save, saveConfig);
                done();
            });
        });
    });
});
