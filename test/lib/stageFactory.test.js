'use strict';

const { assert } = require('chai');
const sinon = require('sinon');

sinon.assert.expose(assert, { prefix: '' });

describe('Stage Factory', () => {
    const pipelineId = 8765;
    const name = 'deploy';
    const jobIds = [1, 2, 3];
    const metaData = {
        pipelineId,
        name,
        jobIds
    };
    const generatedId = 1234135;
    let StageFactory;
    let datastore;
    let factory;
    let Stage;

    beforeEach(() => {
        datastore = {
            save: sinon.stub(),
            get: sinon.stub(),
            scan: sinon.stub()
        };

        // eslint-disable-next-line global-require
        Stage = require('../../lib/stage');
        // eslint-disable-next-line global-require
        StageFactory = require('../../lib/stageFactory');

        factory = new StageFactory({ datastore });
    });

    afterEach(() => {
        datastore = null;
    });

    describe('createClass', () => {
        it('should return a Stage model', () => {
            const model = factory.createClass(metaData);

            assert.instanceOf(model, Stage);
        });
    });

    describe('create', () => {
        let expected;

        beforeEach(() => {
            expected = {
                id: generatedId,
                pipelineId,
                name,
                jobIds
            };
        });

        it('creates a Stage given pipelineId, name, and jobIds', () => {
            datastore.save.resolves(expected);

            return factory
                .create({
                    pipelineId,
                    name,
                    jobIds
                })
                .then(model => {
                    assert.instanceOf(model, Stage);
                    Object.keys(expected).forEach(key => {
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

        it('should throw when config not supplied', () => {
            assert.throw(StageFactory.getInstance, Error, 'No datastore provided to StageFactory');
        });

        it('should get an instance', () => {
            const f1 = StageFactory.getInstance(config);
            const f2 = StageFactory.getInstance(config);

            assert.instanceOf(f1, StageFactory);
            assert.instanceOf(f2, StageFactory);

            assert.equal(f1, f2);
        });
    });
});
