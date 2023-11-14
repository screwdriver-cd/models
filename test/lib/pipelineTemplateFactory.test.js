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
});
