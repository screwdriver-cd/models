'use strict';
const assert = require('chai').assert;
const mockery = require('mockery');
const sinon = require('sinon');
const schema = require('screwdriver-data-schema');

sinon.assert.expose(assert, { prefix: '' });
require('sinon-as-promised');

describe('Job Model', () => {
    let pipelineFactoryMock;
    let JobModel;
    let datastore;
    let job;
    let BaseModel;
    let config;

    before(() => {
        mockery.enable({
            useCleanCache: true,
            warnOnUnregistered: false
        });
    });

    beforeEach(() => {
        datastore = {
            update: sinon.stub()
        };
        pipelineFactoryMock = {
            get: sinon.stub().resolves({})
        };

        mockery.registerMock('./pipelineFactory', {
            getInstance: sinon.stub().returns(pipelineFactoryMock)
        });

        // eslint-disable-next-line global-require
        JobModel = require('../../lib/job');
        // eslint-disable-next-line global-require
        BaseModel = require('../../lib/base');

        config = {
            datastore,
            id: '1234',
            name: 'main',
            pipelineId: 'abcd',
            state: 'ENABLED'
        };

        job = new JobModel(config);
    });

    afterEach(() => {
        datastore = null;
        mockery.deregisterAll();
        mockery.resetCache();
    });

    after(() => {
        mockery.disable();
    });

    it('is constructed properly', () => {
        assert.instanceOf(job, BaseModel);
        assert.isFunction(job.update);

        schema.models.job.allKeys.forEach(key => {
            assert.strictEqual(job[key], config[key]);
        });
    });

    it('has a pipeline getter', () => {
        // when we fetch a pipeline it resolves to a promise
        assert.isFunction(job.pipeline.then);
        // and a factory is called to create that promise
        assert.calledWith(pipelineFactoryMock.get, config.pipelineId);

        // When we call job.pipeline again it is still a promise
        assert.isFunction(job.pipeline.then);
        // ...but the factory was not recreated, since the promise is stored
        // as the model's pipeline property, now
        assert.calledOnce(pipelineFactoryMock.get);
    });
});
