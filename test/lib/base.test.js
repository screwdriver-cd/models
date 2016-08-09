'use strict';
const assert = require('chai').assert;
const mockery = require('mockery');
const sinon = require('sinon');

sinon.assert.expose(assert, { prefix: '' });

describe('Base Model', () => {
    let BaseModel;
    let datastore;
    let modelMock;
    let base;
    let config;

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
                    allKeys: ['id', 'foo', 'bar']
                }
            }
        };
        mockery.registerMock('screwdriver-data-schema', modelMock);

        // eslint-disable-next-line global-require
        BaseModel = require('../../lib/base');

        config = {
            datastore,
            id: 'as12345',
            foo: 'foo',
            bar: 'bar'
        };

        base = new BaseModel('base', config);
    });

    afterEach(() => {
        datastore = null;
        mockery.deregisterAll();
        mockery.resetCache();
    });

    after(() => {
        mockery.disable();
    });

    describe('constructor', () => {
        it('constructs properly', () => {
            assert.instanceOf(base, BaseModel);
            Object.keys(config).forEach(key => {
                assert.strictEqual(base[key], config[key]);
            });
        });
    });

    describe('update', () => {
        it('promises to call datastore update', () => {
            datastore.update.yieldsAsync(null, { baseId: '1234' });

            return base.update(config)
                .then(model => {
                    assert.deepEqual(model, base);
                    assert.isTrue(datastore.update.calledWith({
                        table: 'base',
                        params: {
                            id: 'as12345',
                            data: {
                                foo: 'foo',
                                bar: 'bar'
                            }
                        }
                    }));
                });
        });

        it('rejects with a failure from the datastore update', () => {
            const errorMessage = 'iLessThanThreeMocha';

            datastore.update.yieldsAsync(new Error(errorMessage));

            return base.update(config)
                .then(() => {
                    assert.fail('this should not fail the test case');
                })
                .catch((err) => {
                    assert.strictEqual(err.message, errorMessage);
                });
        });
    });

    describe('toString', () => {
        it('should give a string representation of the model', () => {
            assert.strictEqual(base.toString(), '{"id":"as12345","foo":"foo","bar":"bar"}');
        });
    });

    describe('toJson', () => {
        it('should give an object representation of the model data', () => {
            assert.deepEqual(base.toJson(), { id: 'as12345', foo: 'foo', bar: 'bar' });
        });
    });
});
