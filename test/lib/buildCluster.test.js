'use strict';

const assert = require('chai').assert;
const sinon = require('sinon');
const mockery = require('mockery');
const schema = require('screwdriver-data-schema');

sinon.assert.expose(assert, { prefix: '' });

describe('BuildCluster Model', () => {
    let datastore;
    let BaseModel;
    let BuildClusterModel;
    let createConfig;
    let buildCluster;

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
        BuildClusterModel = require('../../lib/buildCluster');
        /* eslint-enable global-require */
    });

    beforeEach(() => {
        datastore.update.resolves({});

        createConfig = {
            datastore,
            id: 51,
            name: 'sd',
            scmContexts: ['github:github.com'],
            scmOrganizations: ['screwdriver-cd'],
            managedByScrewdriver: true
        };
        buildCluster = new BuildClusterModel(createConfig);
    });

    after(() => {
        mockery.deregisterAll();
        mockery.disable();
    });

    it('is constructed properly', () => {
        assert.instanceOf(buildCluster, BuildClusterModel);
        assert.instanceOf(buildCluster, BaseModel);
        schema.models.collection.allKeys.forEach((key) => {
            assert.strictEqual(buildCluster[key], createConfig[key]);
        });
    });

    describe('update', () => {
        it('promises to update a buildCluster', () => {
            const scmOrganizations = ['screwdriver-cd-test'];

            buildCluster.scmOrganizations = scmOrganizations;

            return buildCluster.update({ })
                .then(() => {
                    assert.calledWith(datastore.update, {
                        table: 'buildClusters',
                        params: {
                            id: 51,
                            scmOrganizations
                        }
                    });
                });
        });
    });

    describe('remove', () => {
        it('removes a buildCluster', () =>
            buildCluster.remove()
                .then(() => {
                    assert.calledWith(datastore.remove, {
                        table: 'buildClusters',
                        params: {
                            id: 51
                        }
                    });
                }));
    });
});
