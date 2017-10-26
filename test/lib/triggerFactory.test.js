'use strict';

const assert = require('chai').assert;
const mockery = require('mockery');
const sinon = require('sinon');

sinon.assert.expose(assert, { prefix: '' });

describe('Trigger Factory', () => {
    const src = '~sd@12345:component';
    const dest = '~sd@5678:main';
    const metaData = {
        src,
        dest
    };
    let TriggerFactory;
    let datastore;
    let factory;
    let Trigger;

    before(() => {
        mockery.enable({
            useCleanCache: true,
            warnOnUnregistered: false
        });
    });

    beforeEach(() => {
        datastore = {
            save: sinon.stub(),
            get: sinon.stub(),
            scan: sinon.stub()
        };

        // eslint-disable-next-line global-require
        Trigger = require('../../lib/trigger');
        // eslint-disable-next-line global-require
        TriggerFactory = require('../../lib/triggerFactory');

        factory = new TriggerFactory({ datastore });
    });

    afterEach(() => {
        datastore = null;
        mockery.deregisterAll();
        mockery.resetCache();
    });

    after(() => {
        mockery.disable();
    });

    describe('createClass', () => {
        it('should return a Trigger model', () => {
            const model = factory.createClass(metaData);

            assert.instanceOf(model, Trigger);
        });
    });

    describe('create', () => {
        const generatedId = 1234135;
        let expected;

        beforeEach(() => {
            expected = {
                id: generatedId,
                src,
                dest
            };
        });

        it('creates a Trigger given pipelineId, jobName, and trigger', () => {
            datastore.save.resolves(expected);

            return factory.create({
                src,
                dest
            }).then((model) => {
                assert.instanceOf(model, Trigger);
                Object.keys(expected).forEach((key) => {
                    assert.strictEqual(model[key], expected[key]);
                });
            });
        });
    });

    describe('getInstance', () => {
        let config;

        beforeEach(() => {
            config = { datastore };
        });

        it('should get an instance', () => {
            const f1 = TriggerFactory.getInstance(config);
            const f2 = TriggerFactory.getInstance(config);

            assert.instanceOf(f1, TriggerFactory);
            assert.instanceOf(f2, TriggerFactory);

            assert.equal(f1, f2);
        });

        it('should throw when config not supplied', () => {
            assert.throw(TriggerFactory.getInstance,
                Error, 'No datastore provided to TriggerFactory');
        });
    });
});
