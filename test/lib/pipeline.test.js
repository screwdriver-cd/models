'use strict';
const assert = require('chai').assert;
const mockery = require('mockery');
const sinon = require('sinon');

require('sinon-as-promised');
sinon.assert.expose(assert, { prefix: '' });

describe('Pipeline Model', () => {
    let PipelineModel;
    let datastore;
    let hashaMock;
    let pipeline;
    let BaseModel;
    let jobFactoryMock;

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
        // jobModelFactory = sinon.stub().returns(jobModelMock);
        mockery.registerMock('./jobFactory', sinon.stub().returns(jobFactoryMock));

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

        Object.keys(pipelineConfig).forEach(key => {
            assert.strictEqual(pipeline[key], pipelineConfig[key]);
        });
    });

    describe('sync', () => {
        it('creates the main job if pipeline exists', () => {
            const mockModel = { id: 'abcd1234' };

            jobFactoryMock.create.resolves(mockModel);

            pipeline.sync()
                .then((model) => {
                    assert.calledWith(jobFactoryMock.create, {
                        pipelineId: testId,
                        name: 'main'
                    });
                    assert.deepEqual(model, mockModel);
                });
        });

        it('returns error if datastore explodes', () => {
            const error = new Error('blah');

            jobFactoryMock.create.rejects(error);

            pipeline.sync()
                .catch(err => {
                    assert.deepEqual(err, error);
                });
        });
    });

    describe('formatScmUrl', () => {
        const url = 'git@github.com:screwdriver-cd/HASHR.git';
        const scmUrlBranch = 'git@github.com:screwdriver-cd/HASHR.git#Foo';
        const formattedScmUrl = 'git@github.com:screwdriver-cd/hashr.git#master';
        const formattedScmUrlBranch = 'git@github.com:screwdriver-cd/hashr.git#Foo';

        it('adds master branch when there is no branch specified', (done) => {
            const result = pipeline.formatScmUrl(url);

            assert.equal(result, formattedScmUrl, 'scmUrl is not formatted correctly');
            done();
        });

        it('does not add master branch when there is a branch specified', (done) => {
            const result = pipeline.formatScmUrl(scmUrlBranch);

            assert.equal(result, formattedScmUrlBranch, 'scmUrl is not formatted correctly');
            done();
        });
    });

    describe('get admin', () => {
        it('returns admin of pipeline', () => {
            assert.equal(pipeline.admin, 'batman');
        });
    });
});
