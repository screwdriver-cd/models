'use strict';

const assert = require('chai').assert;
const mockery = require('mockery');
const sinon = require('sinon');
const schema = require('screwdriver-data-schema');

class Pipeline {}

sinon.assert.expose(assert, { prefix: '' });

describe('Pipeline Factory', () => {
    let PipelineFactory;
    let datastore;
    let scm;
    let factory;
    let userFactoryMock;
    const dateNow = 1111111111;
    const nowTime = (new Date(dateNow)).toISOString();
    const scmUri = 'github.com:12345:master';
    const scmContext = 'github:github.com';
    const testId = 'd398fb192747c9a0124e9e5b4e6e8e841cf8c71c';
    const admins = ['me'];
    const scmRepo = {
        name: 'foo/bar',
        branch: 'master',
        url: 'https://github.com/foo/bar/tree/master'
    };
    let pipelineConfig;

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
        scm = {
            decorateUrl: sinon.stub()
        };
        userFactoryMock = {
            get: sinon.stub()
        };

        // Fixing mockery issue with duplicate file names
        // by re-registering data-schema with its own implementation
        mockery.registerMock('screwdriver-data-schema', schema);
        mockery.registerMock('./pipeline', Pipeline);
        mockery.registerMock('./userFactory', {
            getInstance: sinon.stub().returns(userFactoryMock)
        });

        // eslint-disable-next-line global-require
        PipelineFactory = require('../../lib/pipelineFactory');

        pipelineConfig = {
            datastore,
            scm,
            id: testId,
            scmUri,
            scmContext,
            createTime: nowTime,
            admins
        };

        factory = new PipelineFactory(pipelineConfig);
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
        it('should return a Pipeline', () => {
            const model = factory.createClass(pipelineConfig);

            assert.instanceOf(model, Pipeline);
        });
    });

    describe('create', () => {
        let sandbox;
        const saveConfig = {
            table: 'pipelines',
            params: {
                admins,
                createTime: nowTime,
                scmUri,
                scmContext,
                scmRepo
            }
        };

        beforeEach(() => {
            sandbox = sinon.sandbox.create({
                useFakeTimers: false
            });
            sandbox.useFakeTimers(dateNow);
        });

        afterEach(() => {
            sandbox.restore();
        });

        it('creates a new pipeline in the datastore', () => {
            const expected = {
                id: testId,
                admins,
                createTime: nowTime,
                scmUri,
                scmRepo
            };

            datastore.save.resolves(expected);
            scm.decorateUrl.resolves(scmRepo);
            userFactoryMock.get.withArgs({
                username: Object.keys(admins)[0],
                scmContext
            }).resolves({
                unsealToken: sinon.stub().resolves('foo')
            });

            return factory.create({
                scmUri,
                scmContext,
                admins
            }).then((model) => {
                assert.calledWith(scm.decorateUrl, { scmUri, token: 'foo' });
                assert.calledWith(datastore.save, saveConfig);
                assert.instanceOf(model, Pipeline);
            });
        });
    });

    describe('getInstance', () => {
        let config;

        beforeEach(() => {
            config = { datastore, scm: {} };
        });

        it('should utilize BaseFactory to get an instance', () => {
            const f1 = PipelineFactory.getInstance(config);
            const f2 = PipelineFactory.getInstance(config);

            assert.instanceOf(f1, PipelineFactory);
            assert.instanceOf(f2, PipelineFactory);

            assert.equal(f1, f2);
        });

        it('should throw when config does not have everything necessary', () => {
            assert.throw(PipelineFactory.getInstance,
                Error, 'No scm plugin provided to PipelineFactory');

            assert.throw(() => {
                PipelineFactory.getInstance({ datastore });
            }, Error, 'No scm plugin provided to PipelineFactory');

            assert.throw(() => {
                PipelineFactory.getInstance({ scm: {} });
            }, Error, 'No datastore provided to PipelineFactory');
        });
    });
});
