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
});
