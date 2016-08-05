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

        it('returns a promise from the datastore get', () => {
            datastore.get.yieldsAsync(null, baseData);

            return base.get('bz098765')
                .then((data) => {
                    assert.deepEqual(data, baseData);
                });
        });

        it('rejects with a failure from the datastore get', () => {
            datastore.get.yieldsAsync(new Error('teehee'));

            return base.get('doesntMatter')
                .then(() => {
                    assert.fail('this shall not pass');
                })
                .catch((err) => {
                    assert.strictEqual(err.message, 'teehee');
                });
        });
    });

    describe('list', () => {
        const paginate = {
            page: 1,
            count: 2
        };
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

        it('calls datastore scan and returns correct values', (done) => {
            datastore.scan.yieldsAsync(null, returnValue);
            base.list({ paginate }, (err, data) => {
                assert.isNull(err);
                assert.deepEqual(data, returnValue);
                done();
            });
        });

        it('promises to call datastore scan and return the correct value', () => {
            datastore.scan.yieldsAsync(null, returnValue);

            return base.list({ paginate })
                .then((data) => {
                    assert.deepEqual(data, returnValue);
                });
        });

        it('rejects with a failure from the datastore scan', () => {
            const errorMessage = 'genericScanError';

            datastore.scan.yieldsAsync(new Error(errorMessage));

            return base.list({ paginate })
                .then(() => {
                    assert.fail('this should not happen');
                })
                .catch((err) => {
                    assert.strictEqual(err.message, errorMessage);
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

        it('promises to call datastore update', () => {
            datastore.update.yieldsAsync(null, { baseId: '1234' });

            return base.update(config)
                .then((data) => {
                    assert.deepEqual(data, { baseId: '1234' });
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
});
