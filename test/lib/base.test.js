'use strict';
const assert = require('chai').assert;
const mockery = require('mockery');
const sinon = require('sinon');

sinon.assert.expose(assert, { prefix: '' });

describe('Base Model', () => {
    let BaseModel;
    let datastore;
    let modelMock;
    let hashaMock;
    let base;
    const baseData = {
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
            update: sinon.stub()
        };

        modelMock = {
            models: {
                base: {
                    tableName: 'base',
                    keys: ['foo', 'bar']
                }
            }
        };
        hashaMock = {
            sha1: sinon.stub()
        };
        mockery.registerMock('screwdriver-hashr', hashaMock);
        mockery.registerMock('screwdriver-data-schema', modelMock);

        // eslint-disable-next-line global-require
        BaseModel = require('../../lib/base');

        base = new BaseModel('base', datastore);
    });

    afterEach(() => {
        datastore = null;
        mockery.deregisterAll();
        mockery.resetCache();
    });

    after(() => {
        mockery.disable();
    });

    describe('generateId', () => {
        it('generates a fancy ID', () => {
            hashaMock.sha1.withArgs({
                foo: '1234',
                bar: '2345'
            }).returns('OK');
            assert.equal(base.generateId({
                foo: '1234',
                bar: '2345',
                zap: '4444'
            }), 'OK');
        });
    });

    describe('get', () => {
        it('calls datastore get and returns correct values', (done) => {
            datastore.get.yieldsAsync(null, baseData);
            base.get('as12345', (err, data) => {
                assert.isNull(err);
                assert.deepEqual(data, baseData);
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
            base.list(paginate, (err, data) => {
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
            datastore.update.yieldsAsync(null, { baseId: '1234' });
            base.update(config, (err, result) => {
                assert.isNull(err);
                assert.deepEqual(result, { baseId: '1234' });
                done();
            });
        });
    });
});
