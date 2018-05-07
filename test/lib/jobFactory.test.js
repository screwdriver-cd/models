'use strict';

const assert = require('chai').assert;
const mockery = require('mockery');
const sinon = require('sinon');
const schema = require('screwdriver-data-schema');

class Job {
    constructor(config) {
        this.apiUri = config.apiUri;
        this.executor = config.executor;
        this.tokenGen = config.tokenGen;
    }
}

sinon.assert.expose(assert, { prefix: '' });

describe('Job Factory', () => {
    let JobFactory;
    let datastore;
    let factory;
    let executor;
    let pipelineFactoryMock;
    let apiUri;
    const tokenGen = sinon.stub();

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
        pipelineFactoryMock = {
            get: sinon.stub().resolves({ id: 9999 })
        };
        executor = {
            startPeriodic: sinon.stub().resolves()
        };
        apiUri = 'https://notify.com/some/endpoint';

        // Fixing mockery issue with duplicate file names
        // by re-registering data-schema with its own implementation
        mockery.registerMock('screwdriver-data-schema', schema);
        mockery.registerMock('./job', Job);

        mockery.registerMock('./pipelineFactory', {
            getInstance: sinon.stub().returns(pipelineFactoryMock)
        });

        // eslint-disable-next-line global-require
        JobFactory = require('../../lib/jobFactory');

        factory = new JobFactory({ datastore, executor });
        factory.apiUri = apiUri;
        factory.tokenGen = tokenGen;
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
                pipelineId: 1234,
                state: 'ENABLED',
                id: 'abcd'
            });

            assert.instanceOf(model, Job);
            assert.deepEqual(model.executor, executor);
            assert.strictEqual(model.apiUri, apiUri);
            assert.deepEqual(model.tokenGen, tokenGen);
        });
    });

    describe('create', () => {
        const jobId = 123;
        const pipelineId = 9999;
        const name = 'main';
        const saveConfig = {
            table: 'jobs',
            params: {
                name,
                pipelineId,
                state: 'ENABLED',
                archived: false
            }
        };
        const permutations = [{
            commands: [
                { command: 'npm install', name: 'init' },
                { command: 'npm test', name: 'test' }
            ],
            image: 'node:4'
        }];

        it('creates a new job in the datastore', () => {
            const expected = {
                name,
                pipelineId,
                state: 'ENABLED',
                archived: false,
                id: jobId,
                permutations
            };

            datastore.save.resolves(expected);
            saveConfig.params.permutations = permutations;

            return factory.create({
                pipelineId,
                name,
                permutations
            }).then((model) => {
                assert.calledWith(datastore.save, saveConfig);
                assert.instanceOf(model, Job);
            });
        });

        it('calls executor to create a periodic job', () => {
            const tokenGenFunc = () => 'bar';
            const periodicPermutations = [
                Object.assign(
                    { annotations: { 'screwdriver.cd/buildPeriodically': 'H * * * *' } }
                    , permutations[0])
            ];

            factory.tokenGen = tokenGenFunc;

            const expected = {
                name,
                pipelineId,
                state: 'ENABLED',
                archived: false,
                id: jobId,
                permutations: periodicPermutations
            };

            datastore.save.resolves(expected);
            saveConfig.params.permutations = periodicPermutations;

            return factory.create({
                pipelineId,
                name,
                permutations: periodicPermutations
            }).then((model) => {
                assert.calledWith(datastore.save, saveConfig);
                assert.instanceOf(model, Job);
                assert.calledWith(pipelineFactoryMock.get, pipelineId);
                assert.calledWith(executor.startPeriodic, {
                    pipeline: { id: 9999 },
                    job: model,
                    tokenGen: tokenGenFunc,
                    apiUri
                });
            });
        });
    });

    describe('getInstance', () => {
        let config;

        beforeEach(() => {
            config = { datastore, scm: {} };
        });

        it('should utilize BaseFactory to get an instance', () => {
            const f1 = JobFactory.getInstance(config);
            const f2 = JobFactory.getInstance(config);

            assert.instanceOf(f1, JobFactory);
            assert.instanceOf(f2, JobFactory);

            assert.equal(f1, f2);
        });

        it('should throw when config not supplied', () => {
            assert.throw(JobFactory.getInstance, Error, 'No datastore provided to JobFactory');
        });
    });
});
