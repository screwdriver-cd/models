'use strict';

const { assert } = require('chai');
const sinon = require('sinon');
const rewiremock = require('rewiremock/node');

sinon.assert.expose(assert, { prefix: '' });

describe('Banner Factory', () => {
    const bannerId = 123;
    const message = 'Test banner';
    const type = 'info';
    const isActive = true;
    const bannerData = {
        id: bannerId,
        message,
        type,
        isActive,
        scope: 'GLOBAL',
        scopeId: null
    };

    let BannerFactory;
    let datastore;
    let factory;
    let Banner;
    let pipelineFactoryMock;

    beforeEach(() => {
        pipelineFactoryMock = {
            get: sinon.stub()
        };
        rewiremock('../../lib/pipelineFactory').with({
            getInstance: sinon.stub().returns(pipelineFactoryMock)
        });
        rewiremock.enable();

        datastore = {
            save: sinon.stub(),
            get: sinon.stub()
        };
        /* eslint-disable global-require */
        Banner = require('../../lib/banner');
        BannerFactory = require('../../lib/bannerFactory');
        /* eslint-disable global-require */

        factory = new BannerFactory({ datastore });
    });

    afterEach(() => {
        rewiremock.disable();
    });

    describe('createClass', () => {
        it('should return a Collection', () => {
            const model = factory.createClass(bannerData);

            assert.instanceOf(model, Banner);
        });
    });

    describe('create', () => {
        it('should create a Banner with GLOBAL scope', () => {
            datastore.save.resolves(bannerData);

            return factory
                .create({
                    message,
                    type,
                    isActive
                })
                .then(model => {
                    assert.isTrue(datastore.save.calledOnce);
                    assert.instanceOf(model, Banner);

                    Object.keys(bannerData).forEach(key => {
                        assert.strictEqual(model[key], bannerData[key]);
                    });
                });
        });

        it('should create a Banner without type defined', () => {
            const dataWithDefaultType = { ...bannerData };

            dataWithDefaultType.type = 'info';
            datastore.save.resolves(dataWithDefaultType);

            return factory
                .create({
                    message,
                    isActive
                })
                .then(model => {
                    assert.isTrue(datastore.save.calledOnce);
                    assert.instanceOf(model, Banner);

                    Object.keys(bannerData).forEach(key => {
                        assert.strictEqual(model[key], dataWithDefaultType[key]);
                    });
                });
        });

        it('should create a Banner without isActive status defined', () => {
            const dataWithDefaultStatus = { ...bannerData };

            dataWithDefaultStatus.isActive = false;
            datastore.save.resolves(dataWithDefaultStatus);

            return factory
                .create({
                    message,
                    type
                })
                .then(model => {
                    assert.isTrue(datastore.save.calledOnce);
                    assert.instanceOf(model, Banner);

                    Object.keys(bannerData).forEach(key => {
                        assert.strictEqual(model[key], dataWithDefaultStatus[key]);
                    });
                });
        });

        it('should create a Banner without type and isActive status defined', () => {
            const dataWithDefaults = { ...bannerData };

            dataWithDefaults.isActive = false;
            dataWithDefaults.type = 'info';
            datastore.save.resolves(dataWithDefaults);

            return factory
                .create({
                    message
                })
                .then(model => {
                    assert.isTrue(datastore.save.calledOnce);
                    assert.instanceOf(model, Banner);

                    Object.keys(bannerData).forEach(key => {
                        assert.strictEqual(model[key], dataWithDefaults[key]);
                    });
                });
        });

        it('should throw error when creating a Banner with invalid scopeId', () => {
            return factory
                .create({
                    message,
                    type,
                    isActive,
                    scope: 'PIPELINE'
                })
                .then(() => {
                    assert.fail('nope');
                })
                .catch(err => {
                    assert.equal('scopeId is required when scope is PIPELINE', err.message);
                });
        });

        it('should throw error when pipeline ID does not exist', () => {
            const dataWithDefaults = { ...bannerData };

            dataWithDefaults.scope = 'PIPELINE';
            dataWithDefaults.scopeId = '1234';
            datastore.save.resolves(dataWithDefaults);
            pipelineFactoryMock.get.returns(null);

            return factory
                .create({
                    message,
                    type,
                    isActive,
                    scope: 'PIPELINE',
                    scopeId: '1234'
                })
                .then(() => {
                    assert.fail('nope');
                })
                .catch(err => {
                    assert.isTrue(pipelineFactoryMock.get.calledOnce);
                    assert.equal('Pipeline 1234 does not exist', err.message);
                });
        });

        it('should create banner with scope: PIPELINE and scopeId: 1234', () => {
            const dataWithDefaults = { ...bannerData };

            dataWithDefaults.scope = 'PIPELINE';
            dataWithDefaults.scopeId = '1234';
            datastore.save.resolves(dataWithDefaults);
            pipelineFactoryMock.get.returns({ id: '1234' });

            return factory
                .create({
                    message,
                    type,
                    isActive,
                    scope: 'PIPELINE',
                    scopeId: '1234'
                })
                .then(model => {
                    assert.isTrue(datastore.save.calledOnce);
                    assert.isTrue(pipelineFactoryMock.get.calledOnce);
                    assert.instanceOf(model, Banner);

                    Object.keys(bannerData).forEach(key => {
                        assert.strictEqual(model[key], dataWithDefaults[key]);
                    });
                })
                .catch(() => {
                    assert.fail('should not have failed');
                });
        });
    });

    describe('get', () => {
        it('should get a banner by ID', () => {
            datastore.get.resolves(bannerData);

            Promise.all([factory.get(bannerId), factory.get({ id: bannerId })]).then(([banner1, banner2]) => {
                Object.keys(banner1).forEach(key => {
                    assert.strictEqual(banner1[key], bannerData[key]);
                    assert.strictEqual(banner2[key], bannerData[key]);
                });
            });
        });
    });

    describe('getInstance', () => {
        let config;

        beforeEach(() => {
            config = { datastore };

            /* eslint-disable global-require */
            BannerFactory = require('../../lib/bannerFactory');
            /* eslint-enable global-require */
        });

        it('should throw an error when config not supplied', () => {
            assert.throws(() => BannerFactory.getInstance(), 'No datastore provided to BannerFactory');
        });

        it('should get an instance', () => {
            const f1 = BannerFactory.getInstance(config);
            const f2 = BannerFactory.getInstance(config);

            assert.instanceOf(f1, BannerFactory);
            assert.instanceOf(f2, BannerFactory);

            assert.equal(f1, f2);
        });
    });
});
