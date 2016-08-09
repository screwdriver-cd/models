'use strict';
const assert = require('chai').assert;
const mockery = require('mockery');
const sinon = require('sinon');

class Foo {}
const pipelineId = 'cf23df2207d99a74fbe169e3eba035e633b65d94';
const jobId = 'd398fb192747c9a0124e9e5b4e6e8e841cf8c71c';
const name = 'main';
const createMock = () => new Foo();

sinon.assert.expose(assert, { prefix: '' });

describe('Base Factory', () => {
    let BaseFactory;
    let datastore;
    let hashaMock;
    let factory;

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

        mockery.registerMock('screwdriver-hashr', hashaMock);

        // eslint-disable-next-line global-require
        BaseFactory = require('../../lib/baseFactory');

        factory = new BaseFactory('job', { datastore });
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
            table: 'jobs',
            params: {
                id: jobId,
                data: {
                    name,
                    pipelineId
                }
            }
        };

        beforeEach(() => {
            factory.createClass = createMock;
            hashaMock.sha1.returns(jobId);
        });

        it('creates a new job in the datastore', () => {
            const expected = {
                name,
                pipelineId,
                id: jobId
            };

            datastore.save.yieldsAsync(null, expected);

            return factory.create({
                pipelineId,
                name
            }).then(model => {
                assert.isTrue(datastore.save.calledWith(saveConfig));
                assert.instanceOf(model, Foo);
            });
        });

        it('rejects when a datastore save fails', () => {
            const errorMessage = 'datastoreSaveFailureMessage';

            datastore.save.yieldsAsync(new Error(errorMessage));

            return factory.create({ pipelineId, name })
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
            id: jobId,
            pipelineId,
            name
        };

        beforeEach(() => {
            factory.createClass = createMock;
            datastore.get.withArgs({
                table: 'jobs',
                params: {
                    id: jobId
                }
            }).yieldsAsync(null, baseData);
            hashaMock.sha1.returns(jobId);
        });

        it('calls datastore get with id and returns correct values', () =>
            factory.get(baseData.id)
                .then(model => {
                    assert.instanceOf(model, Foo);
                    assert.isTrue(datastore.get.calledOnce);
                })
        );

        it('calls datastore get with config.id and returns correct values', () =>
            factory.get(baseData)
                .then(model => {
                    assert.instanceOf(model, Foo);
                    assert.isTrue(datastore.get.calledOnce);
                })
        );

        it('calls datastore get with id generated from config and returns correct values', () =>
            factory.get({ pipelineId, name })
                .then(model => {
                    assert.instanceOf(model, Foo);
                    assert.isTrue(datastore.get.calledOnce);
                })
        );

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
                        assert.instanceOf(model, Foo);
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
});
