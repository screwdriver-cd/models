'use strict';

const assert = require('chai').assert;
const mockery = require('mockery');
const sinon = require('sinon');

sinon.assert.expose(assert, { prefix: '' });

describe('Template Factory', () => {
    const name = 'testTemplate';
    const namespace = 'namespace';
    const version = '1.3';
    const maintainer = 'foo@bar.com';
    const description = 'this is a template';
    const labels = ['test', 'beta'];
    const templateConfig = { image: 'node:6' };
    const pipelineId = 123;
    const metaData = {
        name,
        version,
        maintainer,
        description,
        labels,
        config: templateConfig,
        pipelineId
    };
    let TemplateFactory;
    let datastore;
    let templateTagFactoryMock;
    let factory;
    let Template;

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
        templateTagFactoryMock = {
            get: sinon.stub()
        };

        mockery.registerMock('./templateTagFactory', {
            getInstance: sinon.stub().returns(templateTagFactoryMock)
        });

        /* eslint-disable global-require */
        Template = require('../../lib/template');
        TemplateFactory = require('../../lib/templateFactory');
        /* eslint-enable global-require */

        factory = new TemplateFactory({ datastore });
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
        it('should return a Template', () => {
            const model = factory.createClass(metaData);

            assert.instanceOf(model, Template);
        });
    });

    describe('create', () => {
        const generatedId = 1234135;
        let expected;

        beforeEach(() => {
            expected = {
                name,
                version,
                maintainer,
                description,
                labels,
                config: templateConfig,
                pipelineId,
                id: generatedId
            };
        });

        // namespace: namespace
        // name: testTemplate
        it('creates a Template with the namespace when it is passed in explicitly', () => {
            expected.version = `${version}.0`;
            expected.namespace = namespace;
            datastore.save.resolves(expected);
            datastore.scan.resolves([]);

            return factory.create({
                name,
                namespace,
                version,
                maintainer,
                description,
                labels,
                config: templateConfig,
                pipelineId
            }).then((model) => {
                assert.instanceOf(model, Template);
                Object.keys(expected).forEach((key) => {
                    assert.strictEqual(model[key], expected[key]);
                });
            });
        });

        // name: namespace/testTemplate
        it('creates a Template with the namespace when it is passed in implicitly', () => {
            expected.version = `${version}.0`;
            expected.namespace = namespace;
            datastore.save.resolves(expected);
            datastore.scan.resolves([]);

            return factory.create({
                name: 'namespace/testTemplate',
                version,
                maintainer,
                description,
                labels,
                config: templateConfig,
                pipelineId
            }).then((model) => {
                assert.instanceOf(model, Template);
                Object.keys(expected).forEach((key) => {
                    assert.strictEqual(model[key], expected[key]);
                });
            });
        });

        // name: testTemplate
        it('creates a Template with default namespace when no namespace passed in', () => {
            expected.version = `${version}.0`;
            expected.namespace = 'default';
            datastore.save.resolves(expected);
            datastore.scan.resolves([]);

            return factory.create({
                name,
                version,
                maintainer,
                description,
                labels,
                config: templateConfig,
                pipelineId
            }).then((model) => {
                assert.instanceOf(model, Template);
                Object.keys(expected).forEach((key) => {
                    assert.strictEqual(model[key], expected[key]);
                });
            });
        });

        it('creates a Template given major/minor version and no latest templates', () => {
            expected.version = `${version}.0`;

            datastore.save.resolves(expected);
            datastore.scan.resolves([]);

            return factory.create({
                name,
                version,
                maintainer,
                description,
                labels,
                config: templateConfig,
                pipelineId
            }).then((model) => {
                assert.instanceOf(model, Template);
                Object.keys(expected).forEach((key) => {
                    assert.strictEqual(model[key], expected[key]);
                });
            });
        });

        it('creates a Template given major version and no latest templates', () => {
            expected.version = '1.0.0';

            datastore.save.resolves(expected);
            datastore.scan.resolves([]);

            return factory.create({
                name,
                version: 1,
                maintainer,
                description,
                labels,
                config: templateConfig,
                pipelineId
            }).then((model) => {
                assert.instanceOf(model, Template);
                Object.keys(expected).forEach((key) => {
                    assert.strictEqual(model[key], expected[key]);
                });
            });
        });

        it('creates a Template and auto-bumps version when latest returns something', () => {
            const latest = {
                name,
                version: `${version}.0`,
                maintainer,
                description,
                labels,
                config: templateConfig,
                pipelineId,
                id: generatedId
            };

            expected.version = `${version}.1`;

            datastore.save.resolves(expected);
            datastore.scan.resolves([latest]);

            return factory.create({
                name,
                version,
                maintainer,
                description,
                labels,
                config: templateConfig,
                pipelineId
            }).then((model) => {
                assert.instanceOf(model, Template);
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
            const f1 = TemplateFactory.getInstance(config);
            const f2 = TemplateFactory.getInstance(config);

            assert.instanceOf(f1, TemplateFactory);
            assert.instanceOf(f2, TemplateFactory);

            assert.equal(f1, f2);
        });

        it('should throw when config not supplied', () => {
            assert.throw(TemplateFactory.getInstance,
                Error, 'No datastore provided to TemplateFactory');
        });
    });

    describe('get', () => {
        let config;
        let expected;
        let returnValue;

        beforeEach(() => {
            config = {
                name,
                namespace,
                version: '1.0.2'
            };

            returnValue = [
                {
                    id: '1',
                    name,
                    namespace,
                    version: '1.0.1'
                },
                {
                    id: '3',
                    name,
                    namespace,
                    version: '1.0.3'
                },
                {
                    id: '2',
                    name,
                    namespace,
                    version: '1.0.2'
                },
                {
                    id: '4',
                    name: `${namespace}/${name}`,
                    version: '1.0.2'
                }
            ];
        });

        // namespace: namespace
        // name: testTemplate
        it('should get a template when namespace is passed in', () => {
            datastore.get.resolves(returnValue[2]);
            expected = Object.assign({}, returnValue[2]);

            return factory.get(config).then((model) => {
                assert.calledWith(datastore.get, sinon.match({
                    params: { name, namespace, version: '1.0.2' }
                }));
                assert.instanceOf(model, Template);
                Object.keys(expected).forEach((key) => {
                    assert.strictEqual(model[key], expected[key]);
                });
            });
        });

        // name: testTemplate
        // Template with "namespace: default, name: test" does not exist
        it('should get template when default namespace does not exist', () => {
            datastore.get.resolves(returnValue[3]);
            datastore.scan.resolves([]);
            expected = Object.assign({}, returnValue[3]);
            delete config.namespace;

            return factory.get(config).then((model) => {
                assert.calledWith(datastore.get, sinon.match({
                    params: { name: 'testTemplate', namespace: null, version: '1.0.2' }
                }));
                assert.instanceOf(model, Template);
                Object.keys(expected).forEach((key) => {
                    assert.strictEqual(model[key], expected[key]);
                });
            });
        });

        // name: testTemplate
        // Template with "namespace: default, name: test" exists
        it('should get template when default namespace does not exist', () => {
            datastore.get.resolves(returnValue[3]);
            datastore.scan.resolves([returnValue[3]]);
            expected = Object.assign({}, returnValue[3]);
            delete config.namespace;

            return factory.get(config).then((model) => {
                assert.calledWith(datastore.get, sinon.match({
                    params: { name: 'testTemplate', namespace: 'default', version: '1.0.2' }
                }));
                assert.instanceOf(model, Template);
                Object.keys(expected).forEach((key) => {
                    assert.strictEqual(model[key], expected[key]);
                });
            });
        });

        // name: namespace/testTemplate
        it('should get a template with implicit namespace in name', () => {
            datastore.get.resolves(returnValue[3]);
            datastore.scan.resolves([]);
            expected = Object.assign({}, returnValue[3]);
            delete config.namespace;
            config.name = 'namespace/testTemplate';

            return factory.get(config).then((model) => {
                assert.calledWith(datastore.get, sinon.match({
                    params: { name: 'namespace/testTemplate', namespace: null, version: '1.0.2' }
                }));
                assert.instanceOf(model, Template);
                Object.keys(expected).forEach((key) => {
                    assert.strictEqual(model[key], expected[key]);
                });
            });
        });
    });

    describe('list', () => {
        let config;
        let expected;
        let returnValue;

        beforeEach(() => {
            config = {
                params: {
                    name,
                    namespace,
                    version: '1.0.2'
                }
            };

            returnValue = [
                {
                    id: '1',
                    name,
                    namespace,
                    version: '1.0.1'
                },
                {
                    id: '3',
                    name,
                    namespace,
                    version: '1.0.3'
                },
                {
                    id: '2',
                    name,
                    namespace,
                    version: '1.0.2'
                },
                {
                    id: '4',
                    name: `${namespace}/${name}`,
                    version: '1.0.2'
                }
            ];
        });

        it('should list templates when namespace is passed in', () => {
            expected = [returnValue[0], returnValue[1], returnValue[2]];

            datastore.scan.resolves(expected);

            return factory.list(config).then((model) => {
                assert.instanceOf(model[0], Template);
            });
        });

        it('should list templates when no namespace is passed in', () => {
            expected = [returnValue[3]];
            datastore.scan.resolves(expected);

            delete config.namespace;

            return factory.list(config).then((model) => {
                assert.instanceOf(model[0], Template);
            });
        });
    });

    describe('getTemplate', () => {
        const templateName = 'namespace/testTemplateName';
        const templateVersion = '1.0';
        let fullTemplateName;
        let expected;
        let returnValue;

        beforeEach(() => {
            fullTemplateName = `${templateName}@${templateVersion}`;

            returnValue = [
                {
                    id: '1',
                    name: 'testTemplateName',
                    version: '1.0.1'
                },
                {
                    id: '3',
                    name: 'testTemplateName',
                    version: '1.0.3'
                },
                {
                    id: '2',
                    name: 'testTemplateName',
                    version: '1.0.2'
                },
                {
                    id: '4',
                    name: 'testTemplateName',
                    version: '2.0.1'
                }
            ];
        });

        it('should get the correct template for a given name@exactVersion 1.0.2', () => {
            fullTemplateName = `${templateName}@1.0.2`;
            expected = Object.assign({}, returnValue[2]);
            datastore.scan.onCall(0).resolves([]);
            datastore.get.resolves(returnValue[2]);

            return factory.getTemplate(fullTemplateName).then((model) => {
                assert.instanceOf(model, Template);
                Object.keys(expected).forEach((key) => {
                    assert.strictEqual(model[key], expected[key]);
                });
            });
        });

        it('should get the correct template for a given namespace/name@exactVersion 1.0.2', () => {
            fullTemplateName = `${templateName}@1.0.2`;
            expected = Object.assign({ namespace: 'namespace' }, returnValue[2]);
            returnValue[2].namespace = 'namespace';
            datastore.scan.onCall(0).resolves([returnValue[2]]);
            datastore.get.resolves(returnValue[2]);

            return factory.getTemplate(fullTemplateName).then((model) => {
                assert.calledWith(datastore.get, { params: {
                    namespace: 'namespace',
                    name: 'testTemplateName',
                    version: '1.0.2'
                },
                table: 'templates' });
                assert.instanceOf(model, Template);
                Object.keys(expected).forEach((key) => {
                    assert.strictEqual(model[key], expected[key]);
                });
            });
        });

        it('should get the correct template for a given name@version 1.0', () => {
            expected = Object.assign({}, returnValue[1]);
            datastore.scan.onCall(0).resolves([]);
            datastore.scan.onCall(1).resolves(returnValue);

            return factory.getTemplate(fullTemplateName).then((model) => {
                assert.instanceOf(model, Template);
                Object.keys(expected).forEach((key) => {
                    assert.strictEqual(model[key], expected[key]);
                });
            });
        });

        it('should get the correct template for a given namespace/name@version 1.0', () => {
            expected = Object.assign({ namespace: 'namespace' }, returnValue[1]);
            returnValue[1].namespace = 'namespace';
            datastore.scan.onCall(0).resolves([returnValue[1]]);
            datastore.scan.onCall(1).resolves(returnValue);

            return factory.getTemplate(fullTemplateName).then((model) => {
                assert.instanceOf(model, Template);
                Object.keys(expected).forEach((key) => {
                    assert.strictEqual(model[key], expected[key]);
                });
            });
        });

        it('should get the correct template for a given name@tag', () => {
            fullTemplateName = `${templateName}@latest`;
            expected = Object.assign({}, returnValue[2]);
            templateTagFactoryMock.get.resolves({ version: '1.0.2' });
            datastore.get.resolves(returnValue[2]);
            datastore.scan.onCall(0).resolves([]);

            return factory.getTemplate(fullTemplateName).then((model) => {
                assert.instanceOf(model, Template);
                Object.keys(expected).forEach((key) => {
                    assert.strictEqual(model[key], expected[key]);
                });
            });
        });

        it('should get the correct template for a given namespace/name@tag', () => {
            fullTemplateName = `${templateName}@latest`;
            expected = Object.assign({ namespace: 'namespace' }, returnValue[2]);
            returnValue[2].namespace = 'namespace';
            templateTagFactoryMock.get.resolves({ version: '1.0.2' });
            datastore.get.resolves(returnValue[2]);
            datastore.scan.onCall(0).resolves([returnValue[1]]);

            return factory.getTemplate(fullTemplateName).then((model) => {
                assert.instanceOf(model, Template);
                assert.calledWith(datastore.get, { params: {
                    namespace: 'namespace',
                    name: 'testTemplateName',
                    version: '1.0.2'
                },
                table: 'templates' });
                Object.keys(expected).forEach((key) => {
                    assert.strictEqual(model[key], expected[key]);
                });
            });
        });

        it('should return null if no template tag returned by get', () => {
            fullTemplateName = `${templateName}@latest`;
            templateTagFactoryMock.get.resolves(null);
            datastore.scan.onCall(0).resolves([]);

            return factory.getTemplate(fullTemplateName).then((model) => {
                assert.isNull(model);
            });
        });

        it('should get correct template for a given name with no version or tag', () => {
            fullTemplateName = templateName;
            expected = Object.assign({}, returnValue[0]);
            datastore.scan.onCall(0).resolves([]);
            datastore.scan.onCall(1).resolves(returnValue);

            return factory.getTemplate(fullTemplateName).then((model) => {
                assert.instanceOf(model, Template);
                Object.keys(expected).forEach((key) => {
                    assert.strictEqual(model[key], expected[key]);
                });
            });
        });

        it('should return null if no template returned by list', () => {
            datastore.scan.resolves([]);

            return factory.getTemplate(fullTemplateName).then((model) => {
                assert.strictEqual(model, null);
            });
        });
    });

    describe('getNamespaces', () => {
        let allTemplates;

        beforeEach(() => {
            allTemplates = [
                {
                    id: '1',
                    namespace: 'namespaceOne',
                    name: 'testTemplateName',
                    version: '1.0.1'
                },
                {
                    id: '3',
                    namespace: 'namespaceTwo',
                    name: 'testTemplateName',
                    version: '1.0.3'
                },
                {
                    id: '2',
                    namespace: 'namespaceThree',
                    name: 'testTemplateName',
                    version: '1.0.2'
                },
                {
                    id: '4',
                    namespace: 'namespaceFour',
                    name: 'testTemplateName',
                    version: '2.0.1'
                },
                {
                    id: '5',
                    namespace: 'namespaceDuplicate',
                    name: 'testTemplateName',
                    version: '2.0.1'
                },
                {
                    id: '6',
                    namespace: 'namespaceDuplicate',
                    name: 'testTemplateName',
                    version: '2.0.2'
                }
            ];
        });

        it('should return empty array if no namespaces found', () => {
            datastore.scan.onCall(0).resolves([]);

            return factory.getNamespaces().then((namespaces) => {
                assert.isArray(namespaces);
                assert.lengthOf(namespaces, 0);
            });
        });

        it('should return all unique namespaces', () => {
            datastore.scan.onCall(0).resolves(allTemplates);

            return factory.getNamespaces().then((namespaces) => {
                assert.isArray(namespaces);
                assert.lengthOf(namespaces, 5);
            });
        });
    });
});
