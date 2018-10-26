'use strict';

const assert = require('chai').assert;
const mockery = require('mockery');
const sinon = require('sinon');

sinon.assert.expose(assert, { prefix: '' });

describe('BuildCluster Factory', () => {
    const buildClusterId = 123;
    const name = 'sd';
    const scmContext = 'github:github.com';
    const scmOrganizations = 'screwdriver-cd';
    const isActive = true;
    const managedByScrewdriver = true;
    const maintainer = 'foo@bar.com';
    const buildClusterData = {
        id: buildClusterId,
        name,
        scmContext,
        scmOrganizations,
        managedByScrewdriver,
        maintainer,
        isActive
    };

    let BuildClusterFactory;
    let datastore;
    let factory;
    let BuildCluster;

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
        BuildCluster = require('../../lib/buildCluster');
        BuildClusterFactory = require('../../lib/buildClusterFactory');
        /* eslint-disable global-require */

        factory = new BuildClusterFactory({ datastore });
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
            const model = factory.createClass(buildClusterData);

            assert.instanceOf(model, BuildCluster);
        });
    });

    describe('create', () => {
        it('should create a BuildCluster', () => {
            datastore.save.resolves(buildClusterData);

            return factory.create({
                name,
                scmContext,
                scmOrganizations,
                managedByScrewdriver,
                maintainer,
                isActive
            }).then((model) => {
                assert.isTrue(datastore.save.calledOnce);
                assert.instanceOf(model, BuildCluster);

                Object.keys(buildClusterData).forEach((key) => {
                    assert.strictEqual(model[key], buildClusterData[key]);
                });
            });
        });

        it('should create a BuildCluster without isActive status defined', () => {
            const dataWithDefaultStatus = Object.assign({}, buildClusterData);

            dataWithDefaultStatus.isActive = true;
            datastore.save.resolves(dataWithDefaultStatus);

            return factory.create({
                name,
                scmContext,
                scmOrganizations,
                managedByScrewdriver,
                maintainer
            }).then((model) => {
                assert.isTrue(datastore.save.calledOnce);
                assert.instanceOf(model, BuildCluster);

                Object.keys(buildClusterData).forEach((key) => {
                    assert.strictEqual(model[key], dataWithDefaultStatus[key]);
                });
            });
        });
    });

    describe('get', () => {
        it('should get a buildCluster by ID', () => {
            datastore.get.resolves(buildClusterData);

            Promise.all([factory.get(buildClusterId), factory.get({ id: buildClusterId })])
                .then(([buildCluster1, buildCluster2]) => {
                    Object.keys(buildCluster1).forEach((key) => {
                        assert.strictEqual(buildCluster1[key], buildClusterData[key]);
                        assert.strictEqual(buildCluster2[key], buildClusterData[key]);
                    });
                });
        });
    });

    describe('getInstance', () => {
        let config;

        beforeEach(() => {
            config = { datastore };

            /* eslint-disable global-require */
            BuildClusterFactory = require('../../lib/buildClusterFactory');
            /* eslint-enable global-require */
        });

        it('should get an instance', () => {
            const f1 = BuildClusterFactory.getInstance(config);
            const f2 = BuildClusterFactory.getInstance(config);

            assert.instanceOf(f1, BuildClusterFactory);
            assert.instanceOf(f2, BuildClusterFactory);

            assert.equal(f1, f2);
        });

        it('should throw an error when config not supplied', () => {
            assert.throw(BuildClusterFactory.getInstance,
                Error, 'No datastore provided to BuildClusterFactory');
        });
    });
});
