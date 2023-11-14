'use strict';

const { assert } = require('chai');
const mockery = require('mockery');
const sinon = require('sinon');

sinon.assert.expose(assert, { prefix: '' });

describe('PipelineTemplateVersion Factory', () => {
    const namespace = 'namespace';
    const name = 'testPipelineTemplateVersion';
    const version = '1.3';
    const tag = 'latest';
    const metaData = {
        name,
        tag,
        version
    };
    let PipelineTemplateVersionFactory;
    let datastore;
    let factory;
    let PipelineTemplateVersion;
    let templateMetaFactoryMock;

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

        templateMetaFactoryMock = {
            get: sinon.stub(),
            create: sinon.stub()
        };

        // eslint-disable-next-line global-require
        PipelineTemplateVersion = require('../../lib/pipelineTemplateVersion');
        // eslint-disable-next-line global-require
        PipelineTemplateVersionFactory = require('../../lib/pipelineTemplateVersionFactory');

        factory = new PipelineTemplateVersionFactory({ datastore });
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
        it('should return a PipelineTemplateVersion model', () => {
            const model = factory.createClass(metaData);

            assert.instanceOf(model, PipelineTemplateVersion);
        });
    });

    describe('create', async () => {
        const generatedId = 1234135;
        let expected;
        let returnValue;

        beforeEach(() => {
            expected = {
                id: generatedId,
                name,
                version
            };
            returnValue = [
                {
                    id: generatedId,
                    name,
                    version
                }
            ];
        });

        it('creates a pipeline template version given name, version and namespace', async () => {
            expected.namespace = 'default';
            templateMetaFactoryMock.get.resolves({
                latestVersion: '1.3',
                name: 'testPipelineTemplateVersion',
                namespace: 'default',
                update: sinon.stub().resolves()
            });

            datastore.scan.resolves(returnValue);
            datastore.save.resolves(expected);

            const model = await factory.create(
                {
                    name,
                    namespace: 'default',
                    version
                },
                templateMetaFactoryMock
            );

            assert.calledWith(templateMetaFactoryMock.get, {
                name,
                namespace: 'default'
            });
            assert.instanceOf(model, PipelineTemplateVersion);
            assert.equal(model.id, generatedId);
            assert.equal(model.version, '1.3.1');
        });

        it('creates a pipeline template meta and version when name and namespace does not exist', async () => {
            templateMetaFactoryMock.get.resolves(null);
            templateMetaFactoryMock.create.resolves({
                pipelineId: 123,
                name: 'testPipelineTemplateVersion',
                namespace: 'example',
                maintainer: 'abc',
                latestVersion: '1.3',
                update: sinon.stub().resolves()
            });
            datastore.scan.resolves([]);
            datastore.save.resolves(expected);

            const model = await factory.create(
                {
                    name,
                    namespace: 'example',
                    version
                },
                templateMetaFactoryMock
            );

            assert.calledWith(templateMetaFactoryMock.get, {
                name,
                namespace: 'example'
            });
            assert.calledOnce(templateMetaFactoryMock.create);
            assert.instanceOf(model, PipelineTemplateVersion);
            assert.equal(model.id, generatedId);
            assert.equal(model.version, '1.3.1');
        });

        it('creates a pipeline template version given name with namespace exists and version is exact', async () => {
            templateMetaFactoryMock.get.resolves({
                latestVersion: '1.3.2',
                name,
                namespace,
                update: sinon.stub().resolves()
            });

            datastore.save.resolves(expected);
            datastore.get.resolves({
                version: '1.3.2',
                name,
                namespace
            });
            expected.name = name;
            expected.namespace = namespace;

            const model = await factory.create(
                {
                    name,
                    namespace,
                    version: '1.3.2'
                },
                templateMetaFactoryMock
            );

            assert.calledWith(templateMetaFactoryMock.get, {
                name,
                namespace
            });
            assert.notCalled(templateMetaFactoryMock.create);
            assert.instanceOf(model, PipelineTemplateVersion);
            assert.equal(model.id, generatedId);
            assert.equal(model.version, '1.3.2');
        });
    });

    describe('getInstance', () => {
        let config;

        beforeEach(() => {
            config = { datastore };
        });

        it('should get an instance', () => {
            const f1 = PipelineTemplateVersionFactory.getInstance(config);
            const f2 = PipelineTemplateVersionFactory.getInstance(config);

            assert.instanceOf(f1, PipelineTemplateVersionFactory);
            assert.instanceOf(f2, PipelineTemplateVersionFactory);

            assert.equal(f1, f2);
        });

        it('should throw when config not supplied', () => {
            assert.throw(
                PipelineTemplateVersionFactory.getInstance,
                Error,
                'No datastore provided to PipelineTemplateVersionFactory'
            );
        });
    });
});
