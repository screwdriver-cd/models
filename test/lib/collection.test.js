'use strict';

const { assert } = require('chai');
const sinon = require('sinon');
const mockery = require('mockery');
const schema = require('screwdriver-data-schema');

sinon.assert.expose(assert, { prefix: '' });

describe('Collection Model', () => {
    let datastore;
    let BaseModel;
    let CollectionModel;
    let createConfig;
    let collection;

    before(() => {
        mockery.enable({
            useCleanCache: true,
            warnOnUnregistered: false
        });
        datastore = {
            update: sinon.stub(),
            remove: sinon.stub().resolves(null)
        };

        /* eslint-disable global-require */
        BaseModel = require('../../lib/base');
        CollectionModel = require('../../lib/collection');
        /* eslint-enable global-require */
    });

    beforeEach(() => {
        datastore.update.resolves({});

        createConfig = {
            datastore,
            userId: 12345,
            id: 654,
            name: 'Screwdriver',
            description: 'Pipelines for screwdriver',
            pipelineIds: [12, 34, 56]
        };
        collection = new CollectionModel(createConfig);
    });

    after(() => {
        mockery.deregisterAll();
        mockery.disable();
    });

    it('is constructed properly', () => {
        assert.instanceOf(collection, CollectionModel);
        assert.instanceOf(collection, BaseModel);
        schema.models.collection.allKeys.forEach(key => {
            assert.strictEqual(collection[key], createConfig[key]);
        });
    });

    describe('update', () => {
        it('promises to update a collection', () => {
            const newPipelineIds = [12, 34, 56, 78];

            collection.pipelineIds = newPipelineIds;

            return collection.update().then(() => {
                assert.calledWith(datastore.update, {
                    table: 'collections',
                    params: {
                        id: 654,
                        pipelineIds: [12, 34, 56, 78]
                    }
                });
            });
        });
    });

    describe('remove', () => {
        it('removes a collection', () =>
            collection.remove().then(() => {
                assert.calledWith(datastore.remove, {
                    table: 'collections',
                    params: {
                        id: 654
                    }
                });
            }));
    });
});
