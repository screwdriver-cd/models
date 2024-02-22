'use strict';

const { assert } = require('chai');
const sinon = require('sinon');
const { DELETE_STEPS_QUERY, getQueries } = require('../../lib/rawQueries');

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

    beforeEach(() => {
        datastore = {
            save: sinon.stub(),
            get: sinon.stub(),
            query: sinon.stub()
        };

        /* eslint-disable global-require */
        Step = require('../../lib/step');
        StepFactory = require('../../lib/stepFactory');
        /* eslint-disable global-require */

        factory = new StepFactory({ datastore });
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

        it('should throw an error when config not supplied', () => {
            assert.throw(StepFactory.getInstance, Error, 'No datastore provided to StepFactory');
        });

        it('should get an instance', () => {
            const f1 = StepFactory.getInstance(config);
            const f2 = StepFactory.getInstance(config);

            assert.instanceOf(f1, StepFactory);
            assert.instanceOf(f2, StepFactory);

            assert.equal(f1, f2);
        });
    });

    describe('removeSteps', () => {
        let config;
        let queryConfig;

        beforeEach(() => {
            sinon.stub(StepFactory.prototype, 'query').returns();

            config = {
                buildId: '12345'
            };

            queryConfig = {
                queries: getQueries('', DELETE_STEPS_QUERY),
                replacements: {
                    buildId: config.buildId
                },
                rawResponse: true,
                table: 'steps'
            };
        });

        it('returns latest builds for groupEventId', () => {
            datastore.query.resolves([]);

            return factory.removeSteps(config).then(() => {
                assert.calledWith(datastore.query, queryConfig);
            });
        });
    });
});
