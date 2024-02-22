'use strict';

const { assert } = require('chai');
const sinon = require('sinon');
const schema = require('screwdriver-data-schema');

sinon.assert.expose(assert, { prefix: '' });

describe('CommandTag Model', () => {
    let BaseModel;
    let CommandTagModel;
    let datastore;
    let createConfig;
    let commandTag;

    beforeEach(() => {
        datastore = {
            update: sinon.stub()
        };

        // eslint-disable-next-line global-require
        BaseModel = require('../../lib/base');

        // eslint-disable-next-line global-require
        CommandTagModel = require('../../lib/commandTag');

        createConfig = {
            datastore,
            id: 12345,
            namespace: 'testCommandTagNS',
            name: 'testCommandTag',
            tag: 'latest',
            version: '1.3.5'
        };
        commandTag = new CommandTagModel(createConfig);
    });

    afterEach(() => {
        datastore = null;
    });

    it('is constructed properly', () => {
        assert.instanceOf(commandTag, CommandTagModel);
        assert.instanceOf(commandTag, BaseModel);
        schema.models.commandTag.allKeys.forEach(key => {
            assert.strictEqual(commandTag[key], createConfig[key]);
        });
    });
});
