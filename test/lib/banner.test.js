'use strict';

const { assert } = require('chai');
const sinon = require('sinon');
const mockery = require('mockery');
const schema = require('screwdriver-data-schema');

sinon.assert.expose(assert, { prefix: '' });

describe('Banner Model', () => {
    let datastore;
    let BaseModel;
    let BannerModel;
    let createConfig;
    let banner;

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
        BannerModel = require('../../lib/banner');
        /* eslint-enable global-require */
    });

    beforeEach(() => {
        datastore.update.resolves({});

        createConfig = {
            datastore,
            id: 51,
            message: 'Screwdriver banner message'
        };
        banner = new BannerModel(createConfig);
    });

    after(() => {
        mockery.deregisterAll();
        mockery.disable();
    });

    it('is constructed properly', () => {
        assert.instanceOf(banner, BannerModel);
        assert.instanceOf(banner, BaseModel);
        schema.models.collection.allKeys.forEach(key => {
            assert.strictEqual(banner[key], createConfig[key]);
        });
    });

    describe('update', () => {
        it('promises to update a banner', () => {
            const newMessage = 'test banner message';

            banner.message = newMessage;

            return banner.update().then(() => {
                assert.calledWith(datastore.update, {
                    table: 'banners',
                    params: {
                        id: 51,
                        message: 'test banner message'
                    }
                });
            });
        });
    });

    describe('remove', () => {
        it('removes a banner', () =>
            banner.remove().then(() => {
                assert.calledWith(datastore.remove, {
                    table: 'banners',
                    params: {
                        id: 51
                    }
                });
            }));
    });
});
