'use strict';

const { assert } = require('chai');
const mockery = require('mockery');
const sinon = require('sinon');

sinon.assert.expose(assert, { prefix: '' });

describe('Step Factory', () => {
    const stepId = 1;
    const buildId = 123;
    const name = 'echo';
    const command = 'echo hi';
    const stepData = {
        id: stepId,
        buildId,
        name,
        command
    };

    let StepFactory;
    let datastore;
    let factory;
    let Step;

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
        Step = require('../../lib/step');
        StepFactory = require('../../lib/stepFactory');
        /* eslint-disable global-require */

        factory = new StepFactory({ datastore });
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
            const model = factory.createClass(stepData);

            assert.instanceOf(model, Step);
        });
    });

    describe('create', () => {
        it('should create a Step', () => {
            datastore.save.resolves(stepData);

            return factory
                .create({
                    buildId,
                    name,
                    command
                })
                .then(model => {
                    assert.isTrue(datastore.save.calledOnce);
                    assert.instanceOf(model, Step);

                    Object.keys(stepData).forEach(key => {
                        assert.strictEqual(model[key], stepData[key]);
                    });
                });
        });
    });

    describe('get', () => {
        it('should get a step by ID', () => {
            datastore.get.resolves(stepData);

            Promise.all([factory.get(stepId), factory.get({ id: stepId })]).then(([step1, step2]) => {
                Object.keys(step1).forEach(key => {
                    assert.strictEqual(step1[key], stepData[key]);
                    assert.strictEqual(step2[key], stepData[key]);
                });
            });
        });
    });

    describe('getInstance', () => {
        let config;

        beforeEach(() => {
            config = { datastore };

            /* eslint-disable global-require */
            StepFactory = require('../../lib/stepFactory');
            /* eslint-enable global-require */
        });

        it('should get an instance', () => {
            const f1 = StepFactory.getInstance(config);
            const f2 = StepFactory.getInstance(config);

            assert.instanceOf(f1, StepFactory);
            assert.instanceOf(f2, StepFactory);

            assert.equal(f1, f2);
        });

        it('should throw an error when config not supplied', () => {
            assert.throw(StepFactory.getInstance, Error, 'No datastore provided to StepFactory');
        });
    });
});
