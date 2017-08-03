'use strict';

const assert = require('chai').assert;
const sinon = require('sinon');
const mockery = require('mockery');
const schema = require('screwdriver-data-schema');

sinon.assert.expose(assert, { prefix: '' });

describe('TemplateTag Model', () => {
    let BaseModel;
    let TemplateTagModel;
    let datastore;
    let createConfig;
    let templateTag;

    before(() => {
        mockery.enable({
            useCleanCache: true,
            warnOnUnregistered: false
        });
    });

    beforeEach(() => {
        datastore = {
            update: sinon.stub()
        };

        // eslint-disable-next-line global-require
        BaseModel = require('../../lib/base');

        // eslint-disable-next-line global-require
        TemplateTagModel = require('../../lib/templateTag');

        createConfig = {
            datastore,
            id: 12345,
            name: 'testTemplateTag',
            tag: 'latest',
            version: '1.3'
        };
        templateTag = new TemplateTagModel(createConfig);
    });

    afterEach(() => {
        datastore = null;
        mockery.deregisterAll();
        mockery.resetCache();
    });

    after(() => {
        mockery.disable();
    });

    it('is constructed properly', () => {
        assert.instanceOf(templateTag, TemplateTagModel);
        assert.instanceOf(templateTag, BaseModel);
        schema.models.secret.allKeys.forEach((key) => {
            assert.strictEqual(templateTag[key], createConfig[key]);
        });
    });
});
