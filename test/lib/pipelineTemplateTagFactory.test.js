'use strict';

const { assert } = require('chai');
const sinon = require('sinon');

sinon.assert.expose(assert, { prefix: '' });

describe('TemplateTag Factory', () => {
    let PipelineTemplateTagFactory;
    let datastore;
    let factory;

    beforeEach(() => {
        datastore = {
            save: sinon.stub(),
            get: sinon.stub(),
            scan: sinon.stub()
        };

        // eslint-disable-next-line global-require
        PipelineTemplateTagFactory = require('../../lib/pipelineTemplateTagFactory');

        factory = new PipelineTemplateTagFactory({ datastore });
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
                PipelineTemplateTagFactory.getInstance,
                Error,
                'No datastore provided to PipelineTemplateTagFactory'
            );
        });

        it('should get an instance', () => {
            const config = { datastore };
            const f1 = PipelineTemplateTagFactory.getInstance(config);
            const f2 = PipelineTemplateTagFactory.getInstance(config);

            assert.instanceOf(f1, PipelineTemplateTagFactory);
            assert.instanceOf(f2, PipelineTemplateTagFactory);

            assert.equal(f1, f2);
        });
    });
});
