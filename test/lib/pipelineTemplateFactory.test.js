'use strict';

const { assert } = require('chai');
const sinon = require('sinon');

sinon.assert.expose(assert, { prefix: '' });

describe('Pipeline Template Factory', () => {
    let PipelineTemplateFactory;
    let datastore;
    let factory;

    beforeEach(() => {
        datastore = {
            save: sinon.stub(),
            get: sinon.stub(),
            scan: sinon.stub(),
            update: sinon.stub()
        };

        /* eslint-disable global-require */
        PipelineTemplateFactory = require('../../lib/pipelineTemplateFactory');

        factory = new PipelineTemplateFactory({ datastore });
    });

    afterEach(() => {
        datastore = null;
    });

    describe('getTemplateType', () => {
        it('should get an template type', () => {
            const type = factory.getTemplateType();

            assert.equal(type, 'PIPELINE');
        });
    });

    describe('getInstance', () => {
        it('should throw when config not supplied', () => {
            assert.throw(
                PipelineTemplateFactory.getInstance,
                Error,
                'No datastore provided to PipelineTemplateFactory'
            );
        });
        it('should get an instance', () => {
            const config = { datastore };
            const f1 = PipelineTemplateFactory.getInstance(config);
            const f2 = PipelineTemplateFactory.getInstance(config);

            assert.instanceOf(f1, PipelineTemplateFactory);
            assert.instanceOf(f2, PipelineTemplateFactory);

            assert.equal(f1, f2);
        });
    });
});
