'use strict';

const { assert } = require('chai');
const sinon = require('sinon');
const mockery = require('mockery');
const schema = require('screwdriver-data-schema');

sinon.assert.expose(assert, { prefix: '' });

describe('Trigger Model', () => {
    let BaseModel;
    let TriggerModel;
    let datastore;
    let createConfig;
    let trigger;

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
        TriggerModel = require('../../lib/trigger');

        createConfig = {
            datastore,
            id: 1111,
            src: '~sd@12345:component',
            dest: '~sd@5678:main'
        };
        trigger = new TriggerModel(createConfig);
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
        assert.instanceOf(trigger, TriggerModel);
        assert.instanceOf(trigger, BaseModel);
        schema.models.secret.allKeys.forEach(key => {
            assert.strictEqual(trigger[key], createConfig[key]);
        });
    });
});
