'use strict';

const { assert } = require('chai');
const sinon = require('sinon');
const mockery = require('mockery');
const schema = require('screwdriver-data-schema');

sinon.assert.expose(assert, { prefix: '' });

describe('Step Model', () => {
    let datastore;
    let BaseModel;
    let StepModel;
    let createConfig;
    let step;

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
        StepModel = require('../../lib/step');
        /* eslint-enable global-require */
    });

    beforeEach(() => {
        datastore.update.resolves({});

        createConfig = {
            datastore,
            id: 51,
            message: 'Screwdriver step message'
        };
        step = new StepModel(createConfig);
    });

    after(() => {
        mockery.deregisterAll();
        mockery.disable();
    });

    it('is constructed properly', () => {
        assert.instanceOf(step, StepModel);
        assert.instanceOf(step, BaseModel);
        schema.models.collection.allKeys.forEach(key => {
            assert.strictEqual(step[key], createConfig[key]);
        });
    });

    describe('update', () => {
        it('promises to update a step', () => {
            step.lines = 123;

            return step.update().then(() => {
                assert.calledWith(datastore.update, {
                    table: 'steps',
                    params: {
                        id: 51,
                        lines: 123
                    }
                });
            });
        });
    });

    describe('remove', () => {
        it('removes a step', () =>
            step.remove().then(() => {
                assert.calledWith(datastore.remove, {
                    table: 'steps',
                    params: {
                        id: 51
                    }
                });
            }));
    });
});
