'use strict';

const { assert } = require('chai');
const sinon = require('sinon');

sinon.assert.expose(assert, { prefix: '' });

describe('PipelineTemplateVersion Factory', () => {
    const namespace = 'namespace';
    const name = 'testPipelineTemplateName';
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
    let pipelineTemplateTagFactoryMock;

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
        pipelineTemplateTagFactoryMock = {
            get: sinon.stub()
        };

        // eslint-disable-next-line global-require
        PipelineTemplateVersion = require('../../lib/pipelineTemplateVersion');
        // eslint-disable-next-line global-require
        PipelineTemplateVersionFactory = require('../../lib/pipelineTemplateVersionFactory');

        factory = new PipelineTemplateVersionFactory({ datastore });
    });

    afterEach(() => {
        datastore = null;
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

    describe('list', async () => {
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
                    name,
                    namespace
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
                    templateId
                }
            });
            models.forEach(model => {
                assert.instanceOf(model, PipelineTemplateVersion);
            });
        });

        it('list all pipeline template versions for given templateId', async () => {
            datastore.scan.resolves(returnValue);
            const models = await factory.list(
                {
                    params: {
                        templateId
                    }
                },
                templateMetaFactoryMock
            );

            assert.notCalled(templateMetaFactoryMock.get);
            assert.calledOnce(datastore.scan);
            assert.calledWith(datastore.scan, {
                table: 'pipelineTemplateVersions',
                params: {
                    templateId
                }
            });
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

    describe('getTemplate with a resolved version', () => {
        const templateId = 1234135;
        const metadataFields = ['pipelineId', 'namespace', 'name', 'maintainer', 'latestVersion'];
        const pipelineTemplateMetaMock = {
            id: templateId,
            pipelineId: 123,
            namespace,
            name,
            maintainer: 'test-user@email.com',
            latestVersion: '2.0.0',
            trustedSinceVersion: '1.0.0'
        };
        let versionRecords;

        beforeEach(() => {
            versionRecords = [
                { id: 1, templateId, version: '1.2.3' },
                { id: 2, templateId, version: '1.2.20' },
                { id: 3, templateId, version: '1.3.1' },
                { id: 4, templateId, version: '2.0.0' },
                { id: 5, templateId, version: '10.0.0' }
            ];
            templateMetaFactoryMock.get.resolves(pipelineTemplateMetaMock);
        });

        it('gets an exact version with template metadata', async () => {
            datastore.get.resolves(versionRecords[0]);

            const model = await factory.getTemplate(
                `${namespace}/${name}@1.2.3`,
                templateMetaFactoryMock,
                pipelineTemplateTagFactoryMock
            );

            assert.calledOnce(templateMetaFactoryMock.get);
            assert.calledWith(templateMetaFactoryMock.get, { namespace, name });
            assert.calledOnce(datastore.get);
            assert.calledWith(datastore.get, {
                table: 'pipelineTemplateVersions',
                params: { templateId, version: '1.2.3' }
            });
            assert.notCalled(pipelineTemplateTagFactoryMock.get);
            assert.notCalled(datastore.scan);
            assert.instanceOf(model, PipelineTemplateVersion);
            metadataFields.forEach(fieldName => {
                assert.strictEqual(model[fieldName], pipelineTemplateMetaMock[fieldName]);
            });
            assert.notProperty(model, 'trustedSinceVersion');
        });

        it('resolves a tag to an exact version with template metadata', async () => {
            pipelineTemplateTagFactoryMock.get.resolves({ version: '2.0.0' });
            datastore.get.resolves(versionRecords[3]);

            const model = await factory.getTemplate(
                `${namespace}/${name}@${tag}`,
                templateMetaFactoryMock,
                pipelineTemplateTagFactoryMock
            );

            assert.calledOnce(templateMetaFactoryMock.get);
            assert.calledOnce(pipelineTemplateTagFactoryMock.get);
            assert.calledWith(pipelineTemplateTagFactoryMock.get, { namespace, name, tag });
            assert.calledOnce(datastore.get);
            assert.calledWith(datastore.get, {
                table: 'pipelineTemplateVersions',
                params: { templateId, version: '2.0.0' }
            });
            assert.notCalled(datastore.scan);
            assert.instanceOf(model, PipelineTemplateVersion);
            metadataFields.forEach(fieldName => {
                assert.strictEqual(model[fieldName], pipelineTemplateMetaMock[fieldName]);
            });
            assert.notProperty(model, 'trustedSinceVersion');
        });

        it('resolves a major version with template metadata', async () => {
            datastore.scan.resolves(versionRecords);

            const model = await factory.getTemplate(
                `${namespace}/${name}@1`,
                templateMetaFactoryMock,
                pipelineTemplateTagFactoryMock
            );

            assert.calledOnce(templateMetaFactoryMock.get);
            assert.calledOnce(datastore.scan);
            assert.calledWith(datastore.scan, {
                table: 'pipelineTemplateVersions',
                params: { templateId }
            });
            assert.notCalled(pipelineTemplateTagFactoryMock.get);
            assert.notCalled(datastore.get);
            assert.instanceOf(model, PipelineTemplateVersion);
            assert.strictEqual(model.version, '1.3.1');
            metadataFields.forEach(fieldName => {
                assert.strictEqual(model[fieldName], pipelineTemplateMetaMock[fieldName]);
            });
            assert.notProperty(model, 'trustedSinceVersion');
        });

        it('resolves a minor version with template metadata', async () => {
            datastore.scan.resolves(versionRecords);

            const model = await factory.getTemplate(
                `${namespace}/${name}@1.2`,
                templateMetaFactoryMock,
                pipelineTemplateTagFactoryMock
            );

            assert.calledOnce(templateMetaFactoryMock.get);
            assert.calledOnce(datastore.scan);
            assert.notCalled(pipelineTemplateTagFactoryMock.get);
            assert.notCalled(datastore.get);
            assert.instanceOf(model, PipelineTemplateVersion);
            assert.strictEqual(model.version, '1.2.20');
            metadataFields.forEach(fieldName => {
                assert.strictEqual(model[fieldName], pipelineTemplateMetaMock[fieldName]);
            });
            assert.notProperty(model, 'trustedSinceVersion');
        });
    });

    describe('getTemplate with no resolved version', () => {
        const templateId = 1234135;
        const pipelineTemplateMetaMock = {
            id: templateId,
            namespace,
            name
        };

        beforeEach(() => {
            templateMetaFactoryMock.get.resolves(pipelineTemplateMetaMock);
        });

        it('returns null without version lookup when template metadata does not exist', async () => {
            templateMetaFactoryMock.get.resolves(null);

            const model = await factory.getTemplate(
                `${namespace}/${name}@1.2.3`,
                templateMetaFactoryMock,
                pipelineTemplateTagFactoryMock
            );

            assert.isNull(model);
            assert.calledOnce(templateMetaFactoryMock.get);
            assert.notCalled(pipelineTemplateTagFactoryMock.get);
            assert.notCalled(datastore.get);
            assert.notCalled(datastore.scan);
        });

        it('returns null when an exact version does not exist', async () => {
            datastore.get.resolves(null);

            const model = await factory.getTemplate(
                `${namespace}/${name}@1.2.3`,
                templateMetaFactoryMock,
                pipelineTemplateTagFactoryMock
            );

            assert.isNull(model);
            assert.calledOnce(templateMetaFactoryMock.get);
            assert.calledOnce(datastore.get);
            assert.notCalled(pipelineTemplateTagFactoryMock.get);
            assert.notCalled(datastore.scan);
        });

        it('returns null without version lookup when a tag does not exist', async () => {
            pipelineTemplateTagFactoryMock.get.resolves(null);

            const model = await factory.getTemplate(
                `${namespace}/${name}@${tag}`,
                templateMetaFactoryMock,
                pipelineTemplateTagFactoryMock
            );

            assert.isNull(model);
            assert.calledOnce(templateMetaFactoryMock.get);
            assert.calledOnce(pipelineTemplateTagFactoryMock.get);
            assert.notCalled(datastore.get);
            assert.notCalled(datastore.scan);
        });

        it('returns null when no partial version matches', async () => {
            datastore.scan.resolves([{ id: 4, templateId, version: '2.0.0' }]);

            const model = await factory.getTemplate(
                `${namespace}/${name}@1.2`,
                templateMetaFactoryMock,
                pipelineTemplateTagFactoryMock
            );

            assert.isNull(model);
            assert.calledOnce(templateMetaFactoryMock.get);
            assert.calledOnce(datastore.scan);
            assert.notCalled(pipelineTemplateTagFactoryMock.get);
            assert.notCalled(datastore.get);
        });

        it('returns null without version lookup when version is omitted', async () => {
            const model = await factory.getTemplate(
                `${namespace}/${name}`,
                templateMetaFactoryMock,
                pipelineTemplateTagFactoryMock
            );

            assert.isNull(model);
            assert.calledOnce(templateMetaFactoryMock.get);
            assert.notCalled(pipelineTemplateTagFactoryMock.get);
            assert.notCalled(datastore.get);
            assert.notCalled(datastore.scan);
        });
    });

    describe('getWithMetadata', async () => {
        const templateId = 1234135;
        const generatedVersionId = 2341351;
        let templateVersionMock;

        const pipelineTemplateMetaMock = {
            id: templateId,
            name,
            namespace,
            maintainer: 'test-user@email.com',
            pipelineId: 123,
            latestVersion: '2.1.2',
            trustedSinceVersion: '2.1.0'
        };

        const pipelineTemplateMetaToBeCopied = Object.keys(pipelineTemplateMetaMock)
            .filter(key => ['pipelineId', 'namespace', 'name', 'maintainer', 'latestVersion'].includes(key))
            .reduce((subset, key) => {
                subset[key] = pipelineTemplateMetaMock[key];

                return subset;
            }, {});

        beforeEach(() => {
            templateVersionMock = {
                id: generatedVersionId + 3,
                version: '2.1.2',
                templateId,
                config: {},
                createTime: '2024-03-26T23:41:55.567Z',
                description: 'Some description'
            };
        });

        it('gets a pipeline template version and meta given name, version and namespace', async () => {
            templateMetaFactoryMock.get.resolves(pipelineTemplateMetaMock);
            datastore.get.resolves(templateVersionMock);

            const expectedTemplateVersionWithMetadata = { ...templateVersionMock, ...pipelineTemplateMetaToBeCopied };

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

            assert.instanceOf(model, PipelineTemplateVersion);
            Object.keys(key => {
                assert.equal(model[key], expectedTemplateVersionWithMetadata[key]);
            });
        });

        it('gets a pipeline template version and meta given templateId', async () => {
            templateMetaFactoryMock.get.resolves(pipelineTemplateMetaMock);
            datastore.get.resolves(templateVersionMock);
            const expectedTemplateVersionWithMetadata = { ...pipelineTemplateMetaToBeCopied, ...templateVersionMock };

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
            assert.instanceOf(model, PipelineTemplateVersion);
            Object.keys(key => {
                assert.equal(model[key], expectedTemplateVersionWithMetadata[key]);
            });
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

        it('Returns null if pipeline template version does not exist', async () => {
            templateMetaFactoryMock.get.resolves(pipelineTemplateMetaMock);
            datastore.get.resolves(null);

            const model = await factory.get(
                {
                    name,
                    namespace
                },
                templateMetaFactoryMock
            );

            assert.calledOnce(templateMetaFactoryMock.get);
            assert.calledOnce(datastore.get);
            assert.isNull(model);
        });
    });

    describe('getInstance', () => {
        let config;

        beforeEach(() => {
            config = { datastore };
        });

        it('should throw when config not supplied', () => {
            assert.throw(
                PipelineTemplateVersionFactory.getInstance,
                Error,
                'No datastore provided to PipelineTemplateVersionFactory'
            );
        });

        it('should get an instance', () => {
            const f1 = PipelineTemplateVersionFactory.getInstance(config);
            const f2 = PipelineTemplateVersionFactory.getInstance(config);

            assert.instanceOf(f1, PipelineTemplateVersionFactory);
            assert.instanceOf(f2, PipelineTemplateVersionFactory);

            assert.equal(f1, f2);
        });
    });
});
