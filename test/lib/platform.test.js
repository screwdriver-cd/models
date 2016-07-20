'use strict';
const assert = require('chai').assert;
const mockery = require('mockery');
const sinon = require('sinon');

sinon.assert.expose(assert, { prefix: '' });

/**
 * Stub for Executor K8s factory method
 * @method executorFactoryStub
 */
function executorFactoryStub() {}

describe('Platform Model', () => {
    let PlatformModel;
    let datastore;
    let hashaMock;
    let platform;

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
        mockery.registerMock('screwdriver-executor-k8s', executorFactoryStub);

        // eslint-disable-next-line global-require
        PlatformModel = require('../../lib/platform');

        platform = new PlatformModel(datastore);
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
        assert.isFunction(platform.get);
        assert.isFunction(platform.update);
        assert.isFunction(platform.list);
    });

    describe('create', () => {
        let config;
        let datastoreConfig;
        const testId = 'd398fb192747c9a0124e9e5b4e6e8e841cf8c71c';

        beforeEach(() => {
            hashaMock.sha1.withArgs({
                name: 'generic',
                version: '1'
            }).returns(testId);

            config = {
                name: 'generic',
                version: '1',
                scmUrl: 'git@github.com:screwdriver-cd/data-model.git#master'
            };

            datastoreConfig = {
                table: 'platforms',
                params: {
                    id: testId,
                    data: config
                }
            };
        });

        it('returns error when the datastore fails to save', (done) => {
            const testError = new Error('datastoreSaveError');

            datastore.save.withArgs(datastoreConfig).yieldsAsync(testError);
            platform.create(config, (error) => {
                assert.isOk(error);
                assert.equal(error.message, 'datastoreSaveError');
                done();
            });
        });

        it('and correct platform data', (done) => {
            datastore.save.yieldsAsync(null);

            platform.create(config, (error) => {
                assert.isNull(error);
                assert.calledWith(datastore.save, datastoreConfig);
                done();
            });
        });
    });
});
