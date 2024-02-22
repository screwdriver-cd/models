'use strict';

const { assert } = require('chai');
const sinon = require('sinon');
const schema = require('screwdriver-data-schema');

sinon.assert.expose(assert, { prefix: '' });

describe('Template Model', () => {
    let BaseModel;
    let TemplateModel;
    let datastore;
    let createConfig;
    let template;

    beforeEach(() => {
        datastore = {
            update: sinon.stub()
        };

        // eslint-disable-next-line global-require
        BaseModel = require('../../lib/base');

        // eslint-disable-next-line global-require
        TemplateModel = require('../../lib/template');

        createConfig = {
            datastore,
            id: 12345,
            name: 'testTemplate',
            version: '1.3',
            maintainer: 'foo@bar.com',
            description: 'this is a template',
            labels: ['test', 'beta'],
            config: { image: 'node:6' },
            pipelineId: 123
        };
        template = new TemplateModel(createConfig);
    });

    afterEach(() => {
        datastore = null;
    });

    it('is constructed properly', () => {
        assert.instanceOf(template, TemplateModel);
        assert.instanceOf(template, BaseModel);
        schema.models.secret.allKeys.forEach(key => {
            assert.strictEqual(template[key], createConfig[key]);
        });
    });
});
