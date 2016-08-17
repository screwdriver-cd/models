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
    let hashaMock;
    let factory;
    const dateNow = 1111111111;
    const scmUrl = 'git@github.com:screwdriver-cd/data-model.git#master';
    const testId = 'd398fb192747c9a0124e9e5b4e6e8e841cf8c71c';
    const admins = ['me'];
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
        hashaMock = {
            sha1: sinon.stub()
        };

        // Fixing mockery issue with duplicate file names
        // by re-registering data-schema with its own implementation
        mockery.registerMock('screwdriver-data-schema', schema);
        mockery.registerMock('screwdriver-hashr', hashaMock);
        mockery.registerMock('./pipeline', Pipeline);

        // eslint-disable-next-line global-require
        PipelineFactory = require('../../lib/pipelineFactory');

        pipelineConfig = {
            datastore,
            id: testId,
            scmUrl,
            configUrl: scmUrl,
            createTime: dateNow,
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
                id: testId,
                data: {
                    admins,
                    createTime: dateNow,
                    scmUrl,
                    configUrl: scmUrl
                }
            }
        };

        beforeEach(() => {
            sandbox = sinon.sandbox.create({
                useFakeTimers: false
            });
            sandbox.useFakeTimers(dateNow);

            hashaMock.sha1.returns(testId);
        });

        afterEach(() => {
            sandbox.restore();
        });

        it('creates a new pipeline in the datastore', () => {
            const expected = {
                id: testId,
                admins,
                createTime: dateNow,
                scmUrl,
                configUrl: scmUrl
            };

            datastore.save.yieldsAsync(null, expected);

            return factory.create({
                scmUrl,
                admins
            }).then(model => {
                assert.isTrue(datastore.save.calledWith(saveConfig));
                assert.instanceOf(model, Pipeline);
            });
        });
    });

    describe('getInstance', () => {
        let config;

        beforeEach(() => {
            config = { datastore, scmPlugin: {} };
        });

        it('should utilize BaseFactory to get an instance', () => {
            const f1 = PipelineFactory.getInstance(config);
            const f2 = PipelineFactory.getInstance(config);

            assert.instanceOf(f1, PipelineFactory);
            assert.instanceOf(f2, PipelineFactory);

            assert.equal(f1, f2);
        });

        it('should throw when config not supplied', () => {
            assert.throw(PipelineFactory.getInstance,
                Error, 'No datastore provided to PipelineFactory');
        });
    });
});
