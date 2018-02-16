'use strict';

const assert = require('chai').assert;
const mockery = require('mockery');
const sinon = require('sinon');

sinon.assert.expose(assert, { prefix: '' });

describe('Secret Factory', () => {
    const password = 'totallySecurePassword';
    const pipelineId = 4321;
    const allowInPR = true;
    const name = 'npm_token';
    const sealed = 'erwijx342';
    const unsealed = 'batman';
    const secretData = {
        id: 12345,
        pipelineId,
        name,
        value: sealed,
        allowInPR: true
    };
    let SecretFactory;
    let datastore;
    let ironMock;
    let factory;
    let Secret;

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
        ironMock = {
            seal: sinon.stub(),
            unseal: sinon.stub(),
            defaults: 'defaults'
        };

        mockery.registerMock('iron', ironMock);

        // eslint-disable-next-line global-require
        Secret = require('../../lib/secret');
        // eslint-disable-next-line global-require
        SecretFactory = require('../../lib/secretFactory');

        factory = new SecretFactory({ datastore, password });
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
        it('should return a Secret', () => {
            const model = factory.createClass(secretData);

            assert.instanceOf(model, Secret);
        });
    });

    describe('create', () => {
        it('should create a Secret', () => {
            const generatedId = 1234135;
            const expected = {
                pipelineId,
                name,
                value: sealed,
                allowInPR,
                id: generatedId
            };

            ironMock.seal.yieldsAsync(null, sealed);
            datastore.save.resolves(expected);

            return factory.create({
                pipelineId,
                name,
                value: unsealed,
                allowInPR
            }).then((model) => {
                assert.calledWith(ironMock.seal, unsealed, password, 'defaults');
                assert.instanceOf(model, Secret);
                Object.keys(expected).forEach((key) => {
                    assert.strictEqual(model[key], expected[key]);
                });
            });
        });
    });

    describe('get', () => {
        const id = 12345;
        const expected = {
            pipelineId,
            name,
            value: unsealed,
            allowInPR,
            id
        };

        beforeEach(() => {
            datastore.get.withArgs({
                table: 'secrets',
                params: {
                    id
                }
            }).resolves(secretData);
            datastore.get.withArgs({
                table: 'secrets',
                params: {
                    pipelineId,
                    name
                }
            }).resolves(secretData);
            ironMock.unseal.yieldsAsync(null, unsealed);
        });

        it('calls datastore get with id and returns correct values', () =>
            factory.get(id)
                .then((model) => {
                    assert.calledWith(ironMock.unseal, sealed, password, 'defaults');
                    assert.instanceOf(model, Secret);
                    assert.isTrue(datastore.get.calledOnce);
                    Object.keys(expected).forEach((key) => {
                        assert.strictEqual(model[key], expected[key]);
                    });
                })
        );

        it('calls datastore get with config.id and returns correct values', () =>
            factory.get({ id })
                .then((model) => {
                    assert.calledWith(ironMock.unseal, sealed, password, 'defaults');
                    assert.instanceOf(model, Secret);
                    assert.isTrue(datastore.get.calledOnce);
                    Object.keys(expected).forEach((key) => {
                        assert.strictEqual(model[key], expected[key]);
                    });
                })
        );

        it('calls datastore get with id generated from config and returns correct values', () =>
            factory.get({ pipelineId, name })
                .then((model) => {
                    assert.calledWith(ironMock.unseal, sealed, password, 'defaults');
                    assert.instanceOf(model, Secret);
                    assert.isTrue(datastore.get.calledOnce);
                    Object.keys(expected).forEach((key) => {
                        assert.strictEqual(model[key], expected[key]);
                    });
                })
        );

        it('skip unseal when secret not found', () => {
            datastore.get.withArgs({
                table: 'secrets',
                params: {
                    id
                }
            }).resolves(null);

            return factory.get(id)
                .then((model) => {
                    assert.isTrue(datastore.get.calledOnce);
                    assert.notCalled(ironMock.unseal);
                    assert.isNull(model);
                });
        });
    });

    describe('list', () => {
        const paginate = {
            page: 1,
            count: 2
        };
        const datastoreReturnValue = [{
            id: 1234512,
            pipelineId: 4321,
            name: 'secret1',
            value: 'sealedsecret1value',
            allowInPR: true
        }, {
            id: 5315423,
            pipelineId: 4321,
            name: 'secret2',
            value: 'sealedsecret2value',
            allowInPR: false
        }];

        const returnValue = [{
            id: 1234512,
            pipelineId: 4321,
            name: 'secret1',
            value: 'batman',
            allowInPR: true
        }, {
            id: 5315423,
            pipelineId: 4321,
            name: 'secret2',
            value: 'superman',
            allowInPR: false
        }];

        it('calls datastore scan and returns correct values', () => {
            datastore.scan.resolves(datastoreReturnValue);
            ironMock.unseal.withArgs('sealedsecret1value', password).yieldsAsync(null, 'batman');
            ironMock.unseal.withArgs('sealedsecret2value', password).yieldsAsync(null, 'superman');

            return factory.list({ paginate })
                .then((arr) => {
                    assert.isArray(arr);
                    assert.equal(arr.length, 2);
                    assert.deepEqual(arr, returnValue);
                    arr.forEach((model) => {
                        assert.instanceOf(model, Secret);
                    });
                });
        });
    });

    describe('getInstance', () => {
        let config;

        beforeEach(() => {
            config = { datastore };
        });

        it('should get an instance', () => {
            const f1 = SecretFactory.getInstance(config);
            const f2 = SecretFactory.getInstance(config);

            assert.instanceOf(f1, SecretFactory);
            assert.instanceOf(f2, SecretFactory);

            assert.equal(f1, f2);
        });

        it('should throw when config not supplied', () => {
            assert.throw(SecretFactory.getInstance,
                Error, 'No datastore provided to SecretFactory');
        });
    });
});
