'use strict';

const assert = require('chai').assert;
const sinon = require('sinon');
const mockery = require('mockery');
const schema = require('screwdriver-data-schema');

sinon.assert.expose(assert, { prefix: '' });

describe('CommandTag Model', () => {
    let BaseModel;
    let CommandTagModel;
    let datastore;
    let createConfig;
    let commandTag;

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
        CommandTagModel = require('../../lib/commandTag');

        createConfig = {
            datastore,
            id: 12345,
            namespace: 'testCommandTagNS',
            command: 'testCommandTag',
            tag: 'latest',
            version: '1.3'
        };
        commandTag = new CommandTagModel(createConfig);
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
        assert.instanceOf(commandTag, CommandTagModel);
        assert.instanceOf(commandTag, BaseModel);
        schema.models.commandTag.allKeys.forEach((key) => {
            assert.strictEqual(commandTag[key], createConfig[key]);
        });
    });
});
