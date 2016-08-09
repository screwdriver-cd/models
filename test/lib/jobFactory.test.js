'use strict';
const assert = require('chai').assert;
const mockery = require('mockery');
const sinon = require('sinon');
const schema = require('screwdriver-data-schema');

class Job {}

sinon.assert.expose(assert, { prefix: '' });

describe('Job Factory', () => {
    let JobFactory;
    let datastore;
    let hashaMock;
    let factory;

    before(() => {
        mockery.enable({
            useCleanCache: true,
            warnOnUnregistered: false
        });
    });

    beforeEach(() => {
        datastore = {
            save: sinon.stub(),
            scan: sinon.stub(),
            get: sinon.stub()
        };
        hashaMock = {
            sha1: sinon.stub()
        };

        // Fixing mockery issue with duplicate file names
        // by re-registering data-schema with its own implementation
        mockery.registerMock('screwdriver-data-schema', schema);
        mockery.registerMock('screwdriver-hashr', hashaMock);
        mockery.registerMock('./job', Job);

        // eslint-disable-next-line global-require
        JobFactory = require('../../lib/jobFactory');

        factory = new JobFactory({ datastore });
    });

    afterEach(() => {
        datastore = null;
        mockery.deregisterAll();
        mockery.resetCache();
    });

    after(() => {
        mockery.disable();
    });

    describe('createClass', () => {
        it('should return a Job', () => {
            const model = factory.createClass({
                name: 'main',
                pipelineId: '1234',
                state: 'ENABLED',
                id: 'abcd'
            });

            assert.instanceOf(model, Job);
        });
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

        it('creates a new job in the datastore', () => {
            const expected = {
                name,
                pipelineId,
                state: 'ENABLED',
                id: jobId
            };

            datastore.save.yieldsAsync(null, expected);

            return factory.create({
                pipelineId,
                name
            }).then(model => {
                assert.isTrue(datastore.save.calledWith(saveConfig));
                assert.instanceOf(model, Job);
            });
        });
    });

    describe('getInstance', () => {
        it('should encapsulate new, and act as a singleton', () => {
            const f1 = JobFactory.getInstance({ datastore });
            const f2 = JobFactory.getInstance({ datastore });

            assert.equal(f1, f2);
        });
    });
});
