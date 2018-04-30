'use strict';

const assert = require('chai').assert;
const mockery = require('mockery');
const sinon = require('sinon');

sinon.assert.expose(assert, { prefix: '' });

describe('Banners Factory', () => {
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

    let BannersFactory;
    let datastore;
    let factory;
    let Banners;

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
        Banners = require('../../lib/banners');
        BannersFactory = require('../../lib/bannersFactory');
        /* eslint-disable global-require */

        factory = new BannersFactory({ datastore });
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

            assert.instanceOf(model, Banners);
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
                assert.instanceOf(model, Banners);
                Object.keys(bannerData).forEach((key) => {
                    assert.strictEqual(model[key], bannerData[key]);
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
            BannersFactory = require('../../lib/bannersFactory');
            /* eslint-enable global-require */
        });

        it('should get an instance', () => {
            const f1 = BannersFactory.getInstance(config);
            const f2 = BannersFactory.getInstance(config);

            assert.instanceOf(f1, BannersFactory);
            assert.instanceOf(f2, BannersFactory);

            assert.equal(f1, f2);
        });

        it('should throw an error when config not supplied', () => {
            assert.throw(BannersFactory.getInstance,
                Error, 'No datastore provided to BannersFactory');
        });
    });
});
