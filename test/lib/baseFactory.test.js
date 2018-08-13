'use strict';

const assert = require('chai').assert;
const mockery = require('mockery');
const sinon = require('sinon');

class Base {
    constructor(config) {
        this.scm = config.scm;
        this.datastore = config.datastore;
    }
}
class BF {}
const baseId = 135323;
const createMock = c => new Base(c);

sinon.assert.expose(assert, { prefix: '' });

describe('Base Factory', () => {
    let BaseFactory;
    let datastore;
    let scm;
    let factory;
    let schema;

    before(() => {
        mockery.enable({
            useCleanCache: true,
            warnOnUnregistered: false
        });
    });

    beforeEach(() => {
        scm = {};
        datastore = {
            save: sinon.stub(),
            scan: sinon.stub(),
            get: sinon.stub()
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

        // eslint-disable-next-line global-require
        BaseFactory = require('../../lib/baseFactory');

        factory = new BaseFactory('base', { datastore, scm });
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
                foo: {
                    key: 'foo',
                    notkey: 'bar'
                },
                bar: false
            }
        };

        beforeEach(() => {
            factory.createClass = createMock;
        });

        it('creates a new "base" in the datastore', () => {
            const expected = {
                foo: {
                    key: 'foo',
                    notkey: 'bar'
                },
                bar: false,
                id: baseId
            };

            datastore.save.resolves(expected);

            return factory.create({
                foo: {
                    key: 'foo',
                    notkey: 'bar'
                },
                bar: false
            }).then((model) => {
                assert.isTrue(datastore.save.calledWith(saveConfig));
                assert.instanceOf(model, Base);
                assert.deepEqual(model.datastore, datastore);
                assert.deepEqual(model.scm, scm);
            });
        });

        it('rejects when a datastore save fails', () => {
            const errorMessage = 'datastoreSaveFailureMessage';

            datastore.save.rejects(new Error(errorMessage));

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
            }).resolves(baseData);
            datastore.get.withArgs({
                table: 'base',
                params: {
                    foo: 'foo'
                }
            }).resolves(baseData);
        });

        it('calls datastore get with id and returns correct values', () =>
            factory.get(baseData.id)
                .then((model) => {
                    assert.instanceOf(model, Base);
                    assert.isTrue(datastore.get.calledOnce);
                    assert.deepEqual(model.datastore, datastore);
                    assert.deepEqual(model.scm, scm);
                })
        );

        it('calls datastore get with config.id and returns correct values', () =>
            factory.get(baseData)
                .then((model) => {
                    assert.instanceOf(model, Base);
                    assert.isTrue(datastore.get.calledOnce);
                    assert.deepEqual(model.datastore, datastore);
                    assert.deepEqual(model.scm, scm);
                })
        );

        it('converts string id to a number', () =>
            factory.get('135323')
                .then((model) => {
                    assert.instanceOf(model, Base);
                    assert.isTrue(datastore.get.calledOnce);
                    assert.deepEqual(model.datastore, datastore);
                    assert.deepEqual(model.scm, scm);
                })
        );

        it('calls datastore get with config object and returns correct values', () =>
            factory.get({ foo: 'foo', bar: 'bar' })
                .then((model) => {
                    assert.instanceOf(model, Base);
                    assert.isTrue(datastore.get.calledOnce);
                    assert.deepEqual(model.datastore, datastore);
                    assert.deepEqual(model.scm, scm);
                })
        );

        it('returns null when datastore miss occurs', () => {
            datastore.get.withArgs({
                table: 'base',
                params: {
                    id: baseId
                }
            }).resolves(null);

            return factory.get(baseData.id)
                .then((model) => {
                    assert.isNull(model);
                });
        });

        it('rejects with a failure from the datastore get', () => {
            datastore.get.rejects(new Error('teehee'));

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
                id: 123,
                name: 'deploy'
            }
        ];

        beforeEach(() => {
            factory.createClass = createMock;
            datastore.scan.resolves(returnValue);
        });

        it('calls datastore scan and returns correct values', () =>
            factory.list({ paginate })
                .then((arr) => {
                    assert.isArray(arr);
                    assert.equal(arr.length, 2);
                    arr.forEach((model) => {
                        assert.instanceOf(model, Base);
                        assert.deepEqual(model.datastore, datastore);
                        assert.deepEqual(model.scm, scm);
                    });
                })
        );

        it('does not set default values if none are passed in', () =>
            factory.list({})
                .then(() => {
                    assert.calledWith(datastore.scan, {
                        table: 'base',
                        params: {}
                    });
                })
        );

        it('sets default paginate values if some are passed in', () =>
            factory.list({ paginate: { count: 20 } })
                .then(() => {
                    assert.calledWith(datastore.scan, {
                        table: 'base',
                        params: {},
                        paginate: {
                            page: 1,
                            count: 20
                        }
                    });
                })
        );

        it('sets default paginate values if undefined is passed in', () =>
            factory.list({ paginate: { page: undefined, count: undefined } })
                .then(() => {
                    assert.calledWith(datastore.scan, {
                        table: 'base',
                        params: {},
                        paginate: {
                            page: 1,
                            count: 50
                        }
                    });
                })
        );

        it('calls datastore scan with sorting option returns correct values', () =>
            factory.list({ paginate, sort: 'ascending' })
                .then(() => {
                    assert.calledWith(datastore.scan, {
                        table: 'base',
                        params: {},
                        paginate,
                        sort: 'ascending'
                    });
                })
        );

        it('handles when the scan does not return an array', () => {
            datastore.scan.resolves(null);

            return factory.list({ paginate })
                .catch((err) => {
                    assert.strictEqual(err.message, 'Unexpected response from datastore, ' +
                        'expected Array, got object');
                });
        });

        it('rejects with a failure from the datastore scan', () => {
            const errorMessage = 'genericScanError';

            datastore.scan.rejects(new Error(errorMessage));

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
            config = { datastore, scm };
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
