'use strict';

const { assert } = require('chai');
const sinon = require('sinon');
const mockery = require('mockery');
const schema = require('screwdriver-data-schema');

sinon.assert.expose(assert, { prefix: '' });

describe('Stage Model', () => {
    let BaseModel;
    let StageModel;
    let datastore;
    let createConfig;
    let stage;

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
        StageModel = require('../../lib/stage');

        createConfig = {
            datastore,
            id: 1111,
            pipelineId: 12345,
            name: 'deploy'
        };
        stage = new StageModel(createConfig);
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
        assert.instanceOf(stage, StageModel);
        assert.instanceOf(stage, BaseModel);
        schema.models.stage.allKeys.forEach(key => {
            assert.strictEqual(stage[key], createConfig[key]);
        });
    });
});
