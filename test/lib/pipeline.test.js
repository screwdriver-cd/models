'use strict';
const assert = require('chai').assert;
const mockery = require('mockery');
const sinon = require('sinon');
const schema = require('screwdriver-data-schema');

require('sinon-as-promised');
sinon.assert.expose(assert, { prefix: '' });

describe('Pipeline Model', () => {
    let PipelineModel;
    let datastore;
    let hashaMock;
    let pipeline;
    let BaseModel;
    let jobFactoryMock;
    let userFactoryMock;

    const dateNow = 1111111111;
    const scmUrl = 'git@github.com:screwdriver-cd/data-model.git#master';
    const testId = 'd398fb192747c9a0124e9e5b4e6e8e841cf8c71c';
    const admins = { batman: true };
    let pipelineConfig;

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

        jobFactoryMock = {
            create: sinon.stub()
        };
        userFactoryMock = {
            get: sinon.stub()
        };

        // jobModelFactory = sinon.stub().returns(jobModelMock);
        mockery.registerMock('./jobFactory', { getInstance: sinon.stub().returns(jobFactoryMock) });
        mockery.registerMock('./userFactory', {
            getInstance: sinon.stub().returns(userFactoryMock)
        });

        mockery.registerMock('screwdriver-hashr', hashaMock);

        // eslint-disable-next-line global-require
        PipelineModel = require('../../lib/pipeline');
        // eslint-disable-next-line global-require
        BaseModel = require('../../lib/base');

        pipelineConfig = {
            datastore,
            id: testId,
            scmUrl,
            configUrl: scmUrl,
            createTime: dateNow,
            admins
        };

        pipeline = new PipelineModel(pipelineConfig);
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
        assert.instanceOf(pipeline, PipelineModel);
        assert.instanceOf(pipeline, BaseModel);

        schema.models.pipeline.allKeys.forEach(key => {
            assert.strictEqual(pipeline[key], pipelineConfig[key]);
        });
    });

    describe('sync', () => {
        it('creates the main job if pipeline exists', () => {
            const mockModel = { id: 'abcd1234' };

            jobFactoryMock.create.resolves(mockModel);

            return pipeline.sync()
                .then((model) => {
                    assert.calledWith(jobFactoryMock.create, {
                        pipelineId: testId,
                        name: 'main',
                        containers: ['node:6']
                    });
                    assert.deepEqual(model, mockModel);
                });
        });

        it('returns error if datastore explodes', () => {
            const error = new Error('blah');

            jobFactoryMock.create.rejects(error);

            return pipeline.sync()
                .catch(err => {
                    assert.deepEqual(err, error);
                });
        });
    });

    describe('get admin', () => {
        it('has an admin getter', () => {
            userFactoryMock.get.resolves(null);
            // when we fetch a user it resolves to a promise
            assert.isFunction(pipeline.admin.then);
            // and a factory is called to create that promise
            assert.calledWith(userFactoryMock.get, { username: 'batman' });

            // When we call pipeline.admin again it is still a promise
            assert.isFunction(pipeline.admin.then);
            // ...but the factory was not recreated, since the promise is stored
            // as the model's pipeline property, now
            assert.calledOnce(userFactoryMock.get);
        });
    });
});
