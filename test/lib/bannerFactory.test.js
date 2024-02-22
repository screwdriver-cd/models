'use strict';

const { assert } = require('chai');
const sinon = require('sinon');

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
        isActive
    };

    let BannerFactory;
    let datastore;
    let factory;
    let Banner;

    beforeEach(() => {
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

    describe('createClass', () => {
        it('should return a Collection', () => {
            const model = factory.createClass(bannerData);

            assert.instanceOf(model, Banner);
        });
    });

    describe('create', () => {
        it('should create a Banner', () => {
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
