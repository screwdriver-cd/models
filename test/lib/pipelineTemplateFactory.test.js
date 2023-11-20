'use strict';

const { assert } = require('chai');
const sinon = require('sinon');

sinon.assert.expose(assert, { prefix: '' });

describe('Pipeline Template Factory', () => {
    const namespace = 'namespace';
    const name = 'testPipelineTemplateVersion';
    let PipelineTemplateFactory;
    let PipelineTemplate;
    let datastore;
    let factory;
    const pipelineId = 1234135;

    beforeEach(() => {
        datastore = {
            save: sinon.stub(),
            get: sinon.stub(),
            scan: sinon.stub(),
            update: sinon.stub()
        };

        /* eslint-disable global-require */
        PipelineTemplate = require('../../lib/templateMeta');
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

    describe('list', async () => {
        let returnValue;
        const generatedId = 2341351;

        beforeEach(() => {
            returnValue = [
                {
                    id: generatedId + 3,
                    name,
                    namespace,
                    latestVersion: '2.1.2',
                    trustedSinceVersion: '2.1.0',
                    pipelineId
                },
                {
                    id: generatedId + 2,
                    name,
                    namespace,
                    latestVersion: '3.1.2',
                    trustedSinceVersion: '2.0.0',
                    pipelineId
                },
                {
                    id: generatedId + 1,
                    name,
                    namespace,
                    latestVersion: '1.1.2',
                    trustedSinceVersion: '1.1.2',
                    pipelineId
                }
            ];
        });
        it('should list all pipeline templates', async () => {
            datastore.scan.resolves(returnValue);
            const params = {
                pipelineId
            };

            const res = await factory.list({
                params
            });

            assert.calledWith(datastore.scan, {
                table: 'templateMeta',
                params: { pipelineId: 1234135, templateType: 'PIPELINE' }
            });
            res.forEach(model => {
                assert.instanceOf(model, PipelineTemplate);
            });
            assert.equal(res.length, 3);
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
