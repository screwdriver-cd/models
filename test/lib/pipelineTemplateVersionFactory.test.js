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
    let PipelineTemplateMeta;
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
        PipelineTemplateMeta = require('../../lib/pipelineTemplate');
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
        const generatedVersionId = 2341351;
        let expected;
        let returnValue;

        beforeEach(() => {
            expected = {
                id: generatedVersionId,
                name,
                version
            };
            returnValue = [
                {
                    id: generatedId + 3,
                    name,
                    version: '2.1.2'
                },
                {
                    id: generatedId + 2,
                    name,
                    version: '1.3.5'
                },
                {
                    id: generatedId + 1,
                    name,
                    version: '1.3.1'
                }
            ];
        });

        it('creates a pipeline template version given name, version and namespace', async () => {
            expected.namespace = namespace;
            const pipelineTemplateMetaMock = {
                latestVersion: '2.1.2',
                name: 'testPipelineTemplateVersion',
                namespace,
                update: sinon.stub().resolves(),
                id: generatedId
            };

            templateMetaFactoryMock.get.resolves(pipelineTemplateMetaMock);

            datastore.scan.resolves(returnValue);
            datastore.save.resolves(expected);

            const model = await factory.create(
                {
                    name,
                    namespace,
                    version
                },
                templateMetaFactoryMock
            );

            assert.calledWith(templateMetaFactoryMock.get, {
                name,
                namespace
            });
            assert.calledOnce(datastore.scan);
            assert.calledWith(datastore.scan, {
                table: 'pipelineTemplateVersions',
                params: {
                    templateId: generatedId
                },
                sort: 'descending',
                sortBy: 'createTime'
            });
            assert.calledOnce(datastore.save);
            assert.notCalled(templateMetaFactoryMock.create);
            assert.notCalled(pipelineTemplateMetaMock.update);
            assert.instanceOf(model, PipelineTemplateVersion);
            assert.equal(model.id, generatedVersionId);
            assert.equal(model.version, '1.3.6');
        });

        it('creates a pipeline template meta and version when name and namespace does not exist', async () => {
            templateMetaFactoryMock.get.resolves(null);
            const pipelineTemplateMetaMock = {
                pipelineId: 123,
                name: 'testPipelineTemplateVersion',
                namespace: 'example',
                maintainer: 'abc',
                latestVersion: null,
                update: sinon.stub().resolves()
            };

            templateMetaFactoryMock.create.resolves(pipelineTemplateMetaMock);
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
            assert.notCalled(datastore.scan);
            assert.calledOnce(datastore.save);
            assert.calledOnce(pipelineTemplateMetaMock.update);
            assert.instanceOf(model, PipelineTemplateVersion);
            assert.equal(model.id, generatedVersionId);
            assert.equal(model.version, '1.3.0');
        });

        it('creates a pipeline template version given name with namespace exists but version does not exit', async () => {
            const pipelineTemplateMetaMock = {
                latestVersion: '2.1.2',
                name,
                namespace,
                update: sinon.stub().resolves()
            };

            templateMetaFactoryMock.get.resolves(pipelineTemplateMetaMock);

            datastore.save.resolves(expected);
            datastore.scan.resolves(returnValue);
            expected.name = name;
            expected.namespace = namespace;

            const model = await factory.create(
                {
                    name,
                    namespace,
                    version: '3.1'
                },
                templateMetaFactoryMock
            );

            assert.calledWith(templateMetaFactoryMock.get, {
                name,
                namespace
            });
            assert.notCalled(templateMetaFactoryMock.create);
            assert.calledOnce(datastore.scan);
            assert.calledOnce(datastore.save);
            assert.calledOnce(pipelineTemplateMetaMock.update);
            assert.instanceOf(model, PipelineTemplateVersion);
            assert.equal(model.id, generatedVersionId);
            assert.equal(model.version, '3.1.0');
            assert.equal(pipelineTemplateMetaMock.latestVersion, '3.1.0');
        });
    });

    describe.only('list', async () => {
        const templateId = 1234135;
        const generatedVersionId = 2341351;
        let returnValue;

        beforeEach(() => {
            returnValue = [
                {
                    id: generatedVersionId + 3,
                    name,
                    version: '2.1.2',
                    templateId
                },
                {
                    id: generatedVersionId + 2,
                    name,
                    version: '1.3.5',
                    templateId
                },
                {
                    id: generatedVersionId + 1,
                    name,
                    version: '1.3.1',
                    templateId
                }
            ];
        });

        it('list all pipeline template versions for given pipeline name and namespace', async () => {
            const pipelineTemplateMetaMock = {
                name,
                namespace,
                id: templateId
            };

            templateMetaFactoryMock.get.resolves(pipelineTemplateMetaMock);
            datastore.scan.resolves(returnValue);

            const models = await factory.list(
                {
                    params: {
                        name,
                        namespace
                    }
                },
                templateMetaFactoryMock
            );

            assert.calledWith(templateMetaFactoryMock.get, {
                name,
                namespace
            });
            assert.calledWith(datastore.scan, {
                table: 'pipelineTemplateVersions',
                params: {
                    templateId
                }
            });
            assert.calledOnce(datastore.scan);
            models.forEach(model => {
                assert.instanceOf(model, PipelineTemplateVersion);
            });
        });

        it('list all pipeline template versions with sort and pagination', async () => {
            const pipelineTemplateMetaMock = {
                name,
                namespace,
                id: templateId
            };

            templateMetaFactoryMock.get.resolves(pipelineTemplateMetaMock);
            datastore.scan.resolves(returnValue);

            const models = await factory.list(
                {
                    params: {
                        name,
                        namespace
                    },
                    paginate: {
                        count: 3,
                        page: 2
                    },
                    sort: 'ascending',
                    sortBy: 'version'
                },
                templateMetaFactoryMock
            );

            assert.calledWith(templateMetaFactoryMock.get, {
                name,
                namespace
            });
            assert.calledWith(datastore.scan, {
                table: 'pipelineTemplateVersions',
                params: {
                    templateId
                },
                paginate: {
                    count: 3,
                    page: 2
                },
                sort: 'ascending',
                sortBy: 'version'
            });
            assert.calledOnce(datastore.scan);
            models.forEach(model => {
                assert.instanceOf(model, PipelineTemplateVersion);
            });
        });
    });

    describe('get', async () => {
        const templateId = 1234135;
        const generatedVersionId = 2341351;
        let returnValue;

        beforeEach(() => {
            returnValue = {
                id: generatedVersionId + 3,
                name,
                version: '2.1.2',
                templateId
            };
        });

        it('gets a pipeline template version given name, version and namespace', async () => {
            const pipelineTemplateMetaMock = {
                name,
                namespace,
                id: templateId
            };

            templateMetaFactoryMock.get.resolves(pipelineTemplateMetaMock);
            datastore.get.resolves(returnValue);

            const model = await factory.get(
                {
                    name,
                    namespace,
                    version
                },
                templateMetaFactoryMock
            );

            assert.calledWith(templateMetaFactoryMock.get, {
                name,
                namespace
            });
            assert.calledOnce(datastore.get);
            assert.instanceOf(model, PipelineTemplateVersion);
        });

        it('gets a pipeline template version given templateId', async () => {
            const pipelineTemplateMetaMock = {
                name,
                namespace,
                id: templateId
            };

            templateMetaFactoryMock.get.resolves(pipelineTemplateMetaMock);
            datastore.get.resolves(returnValue);

            const model = await factory.get(
                {
                    templateId
                },
                templateMetaFactoryMock
            );

            assert.notCalled(templateMetaFactoryMock.get);
            assert.calledOnce(datastore.get);
            assert.instanceOf(model, PipelineTemplateVersion);
        });

        it('Returns null if pipeline template does not exist', async () => {
            templateMetaFactoryMock.get.resolves(null);

            const model = await factory.get(
                {
                    name,
                    namespace
                },
                templateMetaFactoryMock
            );

            assert.calledOnce(templateMetaFactoryMock.get);
            assert.notCalled(datastore.get);
            assert.isNull(model);
        });
    });

    describe('getWithMetadata', async () => {
        const templateId = 1234135;
        const generatedVersionId = 2341351;
        let returnValue;
        const hasAllProperties = (obj, class1, class2) => {
            const allProps = Object.getOwnPropertyNames(class1.prototype).concat(
                Object.getOwnPropertyNames(class2.prototype)
            );

            return allProps.every(prop => prop in obj);
        };

        beforeEach(() => {
            returnValue = {
                id: generatedVersionId + 3,
                name,
                version: '2.1.2',
                templateId
            };
        });

        it('gets a pipeline template version and meta given name, version and namespace', async () => {
            const pipelineTemplateMetaMock = {
                name,
                namespace,
                id: templateId
            };

            templateMetaFactoryMock.get.resolves(pipelineTemplateMetaMock);
            datastore.get.resolves(returnValue);

            const model = await factory.getWithMetadata(
                {
                    name,
                    namespace,
                    version
                },
                templateMetaFactoryMock
            );

            assert.calledWith(templateMetaFactoryMock.get, {
                name,
                namespace
            });
            assert.calledOnce(datastore.get);
            assert.isTrue(hasAllProperties(model, PipelineTemplateVersion, PipelineTemplateMeta));
        });

        it('gets a pipeline template version and meta given templateId', async () => {
            const pipelineTemplateMetaMock = {
                name,
                namespace,
                id: templateId
            };

            templateMetaFactoryMock.get.resolves(pipelineTemplateMetaMock);
            datastore.get.resolves(returnValue);

            const model = await factory.getWithMetadata(
                {
                    templateId
                },
                templateMetaFactoryMock
            );

            assert.calledWith(templateMetaFactoryMock.get, {
                id: templateId
            });
            assert.calledOnce(datastore.get);
            assert.isTrue(hasAllProperties(model, PipelineTemplateVersion, PipelineTemplateMeta));
        });

        it('Returns null if pipeline template does not exist', async () => {
            templateMetaFactoryMock.get.resolves(null);

            const model = await factory.get(
                {
                    name,
                    namespace
                },
                templateMetaFactoryMock
            );

            assert.calledOnce(templateMetaFactoryMock.get);
            assert.notCalled(datastore.get);
            assert.isNull(model);
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
