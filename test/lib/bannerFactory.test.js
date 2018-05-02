'use strict';

const assert = require('chai').assert;
const mockery = require('mockery');
const sinon = require('sinon');

sinon.assert.expose(assert, { prefix: '' });

describe.only('Banner Factory', () => {
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
    const expected = {
        message,
        type,
        isActive
    };

    let BannerFactory;
    let datastore;
    let factory;
    let Banner;

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
        Banner = require('../../lib/banner');
        BannerFactory = require('../../lib/bannerFactory');
        /* eslint-disable global-require */

        factory = new BannerFactory({ datastore });
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
            const model = factory.createClass(bannerData);

            assert.instanceOf(model, Banner);
        });
    });

    describe('create', () => {
        it('should create a Banner', () => {
            datastore.save.resolves(bannerData);

            return factory.create({
                message,
                type,
                isActive
            }).then((model) => {
                assert.isTrue(datastore.save.calledOnce);
                assert.calledWith(datastore.save, {
                    params: expected,
                    table: 'banners'
                });
                assert.instanceOf(model, Banner);
                Object.keys(bannerData).forEach((key) => {
                    assert.strictEqual(model[key], bannerData[key]);
                });
            });
        });

        it('should create a Banner without type defined', () => {
            const dataWithDefaultType = Object.assign({}, bannerData);

            dataWithDefaultType.type = 'info';
            datastore.save.resolves(dataWithDefaultType);

            return factory.create({
                message,
                isActive
            }).then((model) => {
                assert.isTrue(datastore.save.calledOnce);
                assert.calledWith(datastore.save, {
                    params: {
                        message,
                        type, // The bannerFactory should default this
                        isActive
                    },
                    table: 'banners'
                });
                assert.instanceOf(model, Banner);
                Object.keys(bannerData).forEach((key) => {
                    assert.strictEqual(model[key], dataWithDefaultType[key]);
                });
            });
        });

        it('should create a Banner without isActive status defined', () => {
            const dataWithDefaultStatus = Object.assign({}, bannerData);

            dataWithDefaultStatus.isActive = true;
            datastore.save.resolves(dataWithDefaultStatus);

            return factory.create({
                message,
                type
            }).then((model) => {
                assert.isTrue(datastore.save.calledOnce);
                assert.calledWith(datastore.save, {
                    params: {
                        message,
                        type,
                        isActive // The bannerFactory should default this
                    },
                    table: 'banners'
                });
                assert.instanceOf(model, Banner);
                Object.keys(bannerData).forEach((key) => {
                    assert.strictEqual(model[key], dataWithDefaultStatus[key]);
                });
            });
        });

        it('should create a Banner without type and isActive status defined', () => {
            const dataWithDefaults = Object.assign({}, bannerData);

            dataWithDefaults.isActive = true;
            dataWithDefaults.type = 'info';
            datastore.save.resolves(dataWithDefaults);

            return factory.create({
                message
            }).then((model) => {
                assert.isTrue(datastore.save.calledOnce);
                assert.calledWith(datastore.save, {
                    params: {
                        message,
                        type, // The bannerFactory should default this
                        isActive // The bannerFactory should default this
                    },
                    table: 'banners'
                });
                assert.instanceOf(model, Banner);
                Object.keys(bannerData).forEach((key) => {
                    assert.strictEqual(model[key], dataWithDefaults[key]);
                });
            });
        });
    });

    describe('get', () => {
        it('should get a banner by ID', () => {
            datastore.get.resolves(bannerData);

            Promise.all([factory.get(bannerId), factory.get({ id: bannerId })])
                .then(([banner1, banner2]) => {
                    Object.keys(banner1).forEach((key) => {
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

        it('should get an instance', () => {
            const f1 = BannerFactory.getInstance(config);
            const f2 = BannerFactory.getInstance(config);

            assert.instanceOf(f1, BannerFactory);
            assert.instanceOf(f2, BannerFactory);

            assert.equal(f1, f2);
        });

        it('should throw an error when config not supplied', () => {
            assert.throw(BannerFactory.getInstance,
                Error, 'No datastore provided to BannerFactory');
        });
    });
});
