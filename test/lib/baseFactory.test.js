'use strict';
const assert = require('chai').assert;
const mockery = require('mockery');
const sinon = require('sinon');

class Base {
    constructor(config) {
        this.scmPlugin = config.scmPlugin;
        this.datastore = config.datastore;
    }
}
class BF {}
const baseId = 'd398fb192747c9a0124e9e5b4e6e8e841cf8c71c';
const createMock = (c) => new Base(c);

sinon.assert.expose(assert, { prefix: '' });

describe('Base Factory', () => {
    let BaseFactory;
    let datastore;
    let scmPlugin;
    let hashaMock;
    let factory;
    let schema;

    before(() => {
        mockery.enable({
            useCleanCache: true,
            warnOnUnregistered: false
        });
    });

    beforeEach(() => {
        scmPlugin = {};
        datastore = {
            save: sinon.stub(),
            scan: sinon.stub(),
            get: sinon.stub()
        };
        hashaMock = {
            sha1: sinon.stub()
        };
        schema = {
            models: {
                base: {
                    tableName: 'base',
                    keys: ['foo'],
                    allKeys: ['id', 'foo', 'bar']
                }
            }
        };

        mockery.registerMock('screwdriver-data-schema', schema);
        mockery.registerMock('screwdriver-hashr', hashaMock);

        // eslint-disable-next-line global-require
        BaseFactory = require('../../lib/baseFactory');

        factory = new BaseFactory('base', { datastore, scmPlugin });
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
        it('should throw when not overridden', () => {
            assert.throws(factory.createClass, Error, 'must be implemented by extender');
        });
    });

    describe('create', () => {
        const saveConfig = {
            table: 'base',
            params: {
                id: baseId,
                data: {
                    foo: 'foo',
                    bar: false
                }
            }
        };

        beforeEach(() => {
            factory.createClass = createMock;
            hashaMock.sha1.returns(baseId);
        });

        it('creates a new "base" in the datastore', () => {
            const expected = {
                foo: 'foo',
                bar: false,
                id: baseId
            };

            datastore.save.yieldsAsync(null, expected);

            return factory.create({
                foo: 'foo',
                bar: false
            }).then(model => {
                assert.isTrue(datastore.save.calledWith(saveConfig));
                assert.instanceOf(model, Base);
                assert.deepEqual(model.datastore, datastore);
                assert.deepEqual(model.scmPlugin, scmPlugin);
            });
        });

        it('rejects when a datastore save fails', () => {
            const errorMessage = 'datastoreSaveFailureMessage';

            datastore.save.yieldsAsync(new Error(errorMessage));

            return factory.create({ foo: 'foo', bar: 'bar' })
                .then(() => {
                    assert.fail('This should not fail the test');
                })
                .catch((err) => {
                    assert.strictEqual(err.message, errorMessage);
                });
        });
    });

    describe('get', () => {
        const baseData = {
            id: baseId,
            foo: 'foo',
            bar: 'bar'
        };

        beforeEach(() => {
            factory.createClass = createMock;
            datastore.get.withArgs({
                table: 'base',
                params: {
                    id: baseId
                }
            }).yieldsAsync(null, baseData);
            hashaMock.sha1.returns(baseId);
        });

        it('calls datastore get with id and returns correct values', () =>
            factory.get(baseData.id)
                .then(model => {
                    assert.instanceOf(model, Base);
                    assert.isTrue(datastore.get.calledOnce);
                    assert.deepEqual(model.datastore, datastore);
                    assert.deepEqual(model.scmPlugin, scmPlugin);
                })
        );

        it('calls datastore get with config.id and returns correct values', () =>
            factory.get(baseData)
                .then(model => {
                    assert.instanceOf(model, Base);
                    assert.isTrue(datastore.get.calledOnce);
                    assert.deepEqual(model.datastore, datastore);
                    assert.deepEqual(model.scmPlugin, scmPlugin);
                })
        );

        it('calls datastore get with id generated from config and returns correct values', () =>
            factory.get({ foo: 'foo', bar: 'bar' })
                .then(model => {
                    assert.instanceOf(model, Base);
                    assert.isTrue(datastore.get.calledOnce);
                    assert.deepEqual(model.datastore, datastore);
                    assert.deepEqual(model.scmPlugin, scmPlugin);
                })
        );

        it('returns null when datastore miss occurs', () => {
            datastore.get.withArgs({
                table: 'base',
                params: {
                    id: baseId
                }
            }).yieldsAsync(null, null);

            return factory.get(baseData.id)
                .then(model => {
                    assert.isNull(model);
                });
        });

        it('rejects with a failure from the datastore get', () => {
            datastore.get.yieldsAsync(new Error('teehee'));

            return factory.get('doesntMatter')
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

        beforeEach(() => {
            factory.createClass = createMock;
        });

        it('calls datastore scan and returns correct values', () => {
            datastore.scan.yieldsAsync(null, returnValue);

            return factory.list({ paginate })
                .then(arr => {
                    assert.isArray(arr);
                    assert.equal(arr.length, 2);
                    arr.forEach(model => {
                        assert.instanceOf(model, Base);
                        assert.deepEqual(model.datastore, datastore);
                        assert.deepEqual(model.scmPlugin, scmPlugin);
                    });
                });
        });

        it('handles when the scan does not return an array', () => {
            datastore.scan.yieldsAsync(null, null);

            return factory.list({ paginate })
                .catch(err => {
                    assert.strictEqual(err.message, 'Unexpected response from datastore, ' +
                        'expected Array, got object');
                });
        });

        it('rejects with a failure from the datastore scan', () => {
            const errorMessage = 'genericScanError';

            datastore.scan.yieldsAsync(new Error(errorMessage));

            return factory.list({ paginate })
                .then(() => {
                    assert.fail('this should not happen');
                })
                .catch((err) => {
                    assert.strictEqual(err.message, errorMessage);
                });
        });
    });

    describe('getInstance', () => {
        let config;

        beforeEach(() => {
            config = { datastore, scmPlugin };
        });

        it('should encapsulate new, and act as a singleton', () => {
            // ClasDef, instance, config
            const f1 = BaseFactory.getInstance(BF, null, config);
            const f2 = BaseFactory.getInstance(BF, f1, config);

            assert.equal(f1, f2);
        });

        it('should not require config on second call', () => {
            const f1 = BaseFactory.getInstance(BF, null, config);
            const f2 = BaseFactory.getInstance(BF, f1);

            assert.equal(f1, f2);
        });

        it('should throw when config not supplied or does not supply all expected params', () => {
            assert.throw(() => {
                BaseFactory.getInstance(BF, null);
            }, Error, 'No datastore provided to BF');
        });
    });
});
