'use strict';

const assert = require('chai').assert;
const mockery = require('mockery');
const sinon = require('sinon');

sinon.assert.expose(assert, { prefix: '' });

describe('Collection Factory', () => {
    const name = 'Favorites';
    const description = 'Collection of favorite pipelines';
    const userId = 1;
    const collectionId = 123;
    const pipelineIds = [12, 34, 56];
    const collectionData = {
        id: collectionId,
        userId,
        name,
        description,
        pipelineIds
    };
    const expected = {
        userId,
        name,
        description,
        pipelineIds
    };

    let CollectionFactory;
    let datastore;
    let factory;
    let Collection;

    before(() => {
        mockery.enable({
            useCleanCache: true,
            warnOnUnregistered: false
        });
    });

    beforeEach(() => {
        datastore = {
            save: sinon.stub(),
            get: sinon.stub()
        };

        /* eslint-disable global-require */
        Collection = require('../../lib/collection');
        CollectionFactory = require('../../lib/collectionFactory');
        /* eslint-disable global-require */

        factory = new CollectionFactory({ datastore });
    });

    afterEach(() => {
        mockery.resetCache();
    });

    after(() => {
        mockery.deregisterAll();
        mockery.disable();
    });

    describe('createClass', () => {
        it('should return a Collection', () => {
            const model = factory.createClass(collectionData);

            assert.instanceOf(model, Collection);
        });
    });

    describe('create', () => {
        it('should create a Collection', () => {
            datastore.save.resolves(collectionData);

            return factory.create({
                userId,
                name,
                description,
                pipelineIds
            }).then((model) => {
                assert.isTrue(datastore.save.calledOnce);
                assert.calledWith(datastore.save, {
                    params: expected,
                    table: 'collections'
                });
                assert.instanceOf(model, Collection);
                Object.keys(collectionData).forEach((key) => {
                    assert.strictEqual(model[key], collectionData[key]);
                });
            });
        });

        it('should create a Collection without pipelineIds', () => {
            const dataWithoutPipelineIds = Object.assign({}, collectionData);

            dataWithoutPipelineIds.pipelineIds = [];
            datastore.save.resolves(dataWithoutPipelineIds);

            return factory.create({
                userId,
                name,
                description
            }).then((model) => {
                assert.isTrue(datastore.save.calledOnce);
                assert.calledWith(datastore.save, {
                    params: {
                        userId,
                        name,
                        description,
                        pipelineIds: [] // The collectionFactory should add this field
                    },
                    table: 'collections'
                });
                assert.instanceOf(model, Collection);
                assert.deepEqual(model, dataWithoutPipelineIds);
            });
        });
    });

    describe('get', () => {
        it('should get a collection by ID', () => {
            datastore.get.resolves(collectionData);

            Promise.all([factory.get(collectionId), factory.get({ id: collectionId })])
                .then(([collection1, collection2]) => {
                    Object.keys(collection1).forEach((key) => {
                        assert.strictEqual(collection1[key], collectionData[key]);
                        assert.strictEqual(collection2[key], collectionData[key]);
                    });
                });
        });
    });

    describe('getInstance', () => {
        let config;

        beforeEach(() => {
            config = { datastore };

            /* eslint-disable global-require */
            CollectionFactory = require('../../lib/collectionFactory');
            /* eslint-enable global-require */
        });

        it('should get an instance', () => {
            const f1 = CollectionFactory.getInstance(config);
            const f2 = CollectionFactory.getInstance(config);

            assert.instanceOf(f1, CollectionFactory);
            assert.instanceOf(f2, CollectionFactory);

            assert.equal(f1, f2);
        });

        it('should throw an error when config not supplied', () => {
            assert.throw(CollectionFactory.getInstance,
                Error, 'No datastore provided to CollectionFactory');
        });
    });
});
