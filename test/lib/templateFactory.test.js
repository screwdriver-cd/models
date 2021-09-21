'use strict';

const { assert } = require('chai');
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
    let jobFactoryMock;
    let buildFactoryMock;

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
            scan: sinon.stub(),
            update: sinon.stub()
        };
        templateTagFactoryMock = {
            get: sinon.stub()
        };
        jobFactoryMock = {
            list: sinon.stub()
        };
        buildFactoryMock = {
            list: sinon.stub()
        };

        mockery.registerMock('./templateTagFactory', {
            getInstance: sinon.stub().returns(templateTagFactoryMock)
        });
        mockery.registerMock('./jobFactory', {
            getInstance: sinon.stub().returns(jobFactoryMock)
        });
        mockery.registerMock('./buildFactory', {
            getInstance: sinon.stub().returns(buildFactoryMock)
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

    describe('getFullNameAndVersion', () => {
        it('versionOrTag is exact version', () => {
            const template = factory.getFullNameAndVersion('foo/bar@1.2.3');

            assert.equal(template.templateName, 'foo/bar');
            assert.equal(template.versionOrTag, '1.2.3');
            assert.isOk(template.isExactVersion);
            assert.isOk(template.isVersion);
            assert.isNotOk(template.isTag);
        });

        it('versionOrTag is not exact version', () => {
            const template = factory.getFullNameAndVersion('foo/bar@1.2');

            assert.equal(template.templateName, 'foo/bar');
            assert.equal(template.versionOrTag, '1.2');
            assert.isNotOk(template.isExactVersion);
            assert.isOk(template.isVersion);
            assert.isNotOk(template.isTag);
        });

        it('versionOrTag is tag', () => {
            const template = factory.getFullNameAndVersion('foo/bar@stable');

            assert.equal(template.templateName, 'foo/bar');
            assert.equal(template.versionOrTag, 'stable');
            assert.isNotOk(template.isExactVersion);
            assert.isNotOk(template.isVersion);
            assert.isOk(template.isTag);
        });

        it('versionOrTag is empty', () => {
            const template = factory.getFullNameAndVersion('foo/bar');

            assert.equal(template.templateName, 'foo/bar');
            assert.isUndefined(template.versionOrTag);
            assert.isNotOk(template.isExactVersion);
            assert.isNotOk(template.isVersion);
            assert.isNotOk(template.isTag);
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
                id: generatedId,
                trusted: false,
                latest: true
            };
        });

        // namespace: namespace
        // name: testTemplate
        it('creates a Template with the namespace when it is passed in explicitly', () => {
            expected.version = `${version}.0`;
            expected.namespace = namespace;
            expected.name = name;
            datastore.save.resolves(expected);
            datastore.scan.resolves([]);

            return factory
                .create({
                    name,
                    namespace,
                    version,
                    maintainer,
                    description,
                    labels,
                    config: templateConfig,
                    pipelineId
                })
                .then(model => {
                    assert.instanceOf(model, Template);

                    Object.keys(expected).forEach(key => {
                        assert.deepEqual(model[key], expected[key]);
                    });
                });
        });

        // name: namespace/testTemplate
        it('creates a Template with the namespace when it is passed in implicitly', () => {
            expected.version = `${version}.0`;
            expected.namespace = namespace;
            datastore.save.resolves(expected);
            datastore.scan.resolves([]);

            return factory
                .create({
                    name: 'namespace/testTemplate',
                    version,
                    maintainer,
                    description,
                    labels,
                    config: templateConfig,
                    pipelineId
                })
                .then(model => {
                    assert.instanceOf(model, Template);
                    Object.keys(expected).forEach(key => {
                        assert.deepEqual(model[key], expected[key]);
                    });
                });
        });

        // name: testTemplate
        it('creates a Template with default namespace when no namespace passed in', () => {
            expected.version = `${version}.0`;
            expected.namespace = 'default';
            datastore.save.resolves(expected);
            datastore.scan.resolves([]);

            return factory
                .create({
                    name,
                    version,
                    maintainer,
                    description,
                    labels,
                    config: templateConfig,
                    pipelineId
                })
                .then(model => {
                    assert.instanceOf(model, Template);
                    Object.keys(expected).forEach(key => {
                        assert.deepEqual(model[key], expected[key]);
                    });
                });
        });

        it('creates a Template given major/minor version and no latest templates', () => {
            expected.version = `${version}.0`;

            datastore.save.resolves(expected);
            datastore.scan.resolves([]);

            return factory
                .create({
                    name,
                    version,
                    maintainer,
                    description,
                    labels,
                    config: templateConfig,
                    pipelineId
                })
                .then(model => {
                    assert.instanceOf(model, Template);
                    Object.keys(expected).forEach(key => {
                        assert.deepEqual(model[key], expected[key]);
                    });
                });
        });

        it('creates a Template given lower major/minor version and no target templates', () => {
            expected.version = `2.3.0`;
            expected.latest = false;
            const latest = {
                name,
                version: `3.0.0`,
                maintainer,
                description,
                labels,
                config: templateConfig,
                pipelineId,
                latest: true,
                id: generatedId
            };

            datastore.save.resolves(expected);
            datastore.scan.resolves([latest]);

            return factory
                .create({
                    name,
                    version: '2.3',
                    maintainer,
                    description,
                    labels,
                    config: templateConfig,
                    pipelineId
                })
                .then(model => {
                    assert.instanceOf(model, Template);
                    Object.keys(expected).forEach(key => {
                        assert.deepEqual(model[key], expected[key]);
                    });
                });
        });

        it('creates a Template given major version and no latest templates', () => {
            expected.version = '1.0.0';

            datastore.save.resolves(expected);
            datastore.scan.resolves([]);

            return factory
                .create({
                    name,
                    version: 1,
                    maintainer,
                    description,
                    labels,
                    config: templateConfig,
                    pipelineId
                })
                .then(model => {
                    assert.instanceOf(model, Template);
                    Object.keys(expected).forEach(key => {
                        assert.deepEqual(model[key], expected[key]);
                    });
                });
        });

        it('creates a Template given lower major version and no target templates', () => {
            expected.version = '2.0.0';
            expected.latest = false;
            const latest = {
                name,
                version: `3.0.0`,
                maintainer,
                description,
                labels,
                config: templateConfig,
                pipelineId,
                latest: true,
                id: generatedId
            };

            datastore.save.resolves(expected);
            datastore.scan.resolves([latest]);

            return factory
                .create({
                    name,
                    version: '2.0',
                    maintainer,
                    description,
                    labels,
                    config: templateConfig,
                    pipelineId
                })
                .then(model => {
                    assert.instanceOf(model, Template);
                    Object.keys(expected).forEach(key => {
                        assert.deepEqual(model[key], expected[key]);
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
            datastore.update.resolves(latest);

            return factory
                .create({
                    name,
                    version,
                    maintainer,
                    description,
                    labels,
                    config: templateConfig,
                    pipelineId
                })
                .then(model => {
                    assert.instanceOf(model, Template);
                    assert.calledWith(datastore.update, {
                        table: 'templates',
                        params: {
                            id: 1234135,
                            latest: false
                        }
                    });
                    Object.keys(expected).forEach(key => {
                        assert.deepEqual(model[key], expected[key]);
                    });
                });
        });

        it('creates a Template and auto-bumps version when target version exists', () => {
            const latest = {
                name,
                version: `3.0.0`,
                maintainer,
                description,
                labels,
                config: templateConfig,
                pipelineId,
                latest: true,
                id: generatedId
            };

            const target = [
                {
                    name,
                    version: `2.1.2`,
                    maintainer,
                    description,
                    labels,
                    config: templateConfig,
                    pipelineId,
                    latest: false,
                    id: generatedId + 2
                },
                {
                    name,
                    version: `2.1.1`,
                    maintainer,
                    description,
                    labels,
                    config: templateConfig,
                    pipelineId,
                    latest: false,
                    id: generatedId + 1
                },
                {
                    name,
                    version: `2.1.0`,
                    maintainer,
                    description,
                    labels,
                    config: templateConfig,
                    pipelineId,
                    latest: false,
                    id: generatedId
                }
            ];

            expected.version = `2.1.3`;
            expected.latest = false;

            datastore.save.resolves(expected);
            datastore.scan.onFirstCall().resolves([latest]);
            datastore.scan.onSecondCall().resolves(target);
            datastore.update.resolves(latest);

            return factory
                .create({
                    name,
                    version: '2.1',
                    maintainer,
                    description,
                    labels,
                    config: templateConfig,
                    pipelineId
                })
                .then(model => {
                    assert.instanceOf(model, Template);
                    assert.notCalled(datastore.update);
                    Object.keys(expected).forEach(key => {
                        assert.deepEqual(model[key], expected[key]);
                    });
                });
        });

        it('creates a trusted Template if latest Template was trusted', () => {
            const latest = {
                name,
                version: `${version}.0`,
                maintainer,
                description,
                labels,
                config: templateConfig,
                pipelineId,
                id: generatedId,
                trusted: true
            };

            expected.version = `${version}.1`;
            expected.trusted = true;

            datastore.save.resolves(expected);
            datastore.scan.resolves([latest]);
            datastore.update.resolves(latest);

            return factory
                .create({
                    name,
                    version,
                    maintainer,
                    description,
                    labels,
                    config: templateConfig,
                    pipelineId
                })
                .then(model => {
                    assert.instanceOf(model, Template);
                    assert.calledWith(datastore.update, {
                        table: 'templates',
                        params: {
                            id: 1234135,
                            latest: false
                        }
                    });
                    Object.keys(expected).forEach(key => {
                        assert.deepEqual(model[key], expected[key]);
                    });
                });
        });

        it('creates a trusted Template and bump major version when latest Template was trusted', () => {
            const latest = {
                name,
                version: `${version}.1`,
                maintainer,
                description,
                labels,
                config: templateConfig,
                pipelineId,
                id: generatedId,
                trusted: true
            };
            const newVersion = '2.0';

            expected.version = `${newVersion}.0`;
            expected.trusted = true;

            datastore.save.resolves(expected);
            datastore.scan.resolves([latest]);
            datastore.update.resolves(latest);

            return factory
                .create({
                    name,
                    version: newVersion,
                    maintainer,
                    description,
                    labels,
                    config: templateConfig,
                    pipelineId
                })
                .then(model => {
                    assert.instanceOf(model, Template);
                    assert.calledWith(datastore.update, {
                        table: 'templates',
                        params: {
                            id: 1234135,
                            latest: false
                        }
                    });
                    Object.keys(expected).forEach(key => {
                        assert.deepEqual(model[key], expected[key]);
                    });
                });
        });

        it('creates a trusted Template and bump patch version when latest Template was trusted', () => {
            const latest = {
                name,
                version: `3.1.0`,
                maintainer,
                description,
                labels,
                config: templateConfig,
                pipelineId,
                id: generatedId,
                trusted: true
            };

            const target = [
                {
                    name,
                    version: `2.1.2`,
                    maintainer,
                    description,
                    labels,
                    config: templateConfig,
                    pipelineId,
                    latest: false,
                    id: generatedId + 2
                },
                {
                    name,
                    version: `2.1.1`,
                    maintainer,
                    description,
                    labels,
                    config: templateConfig,
                    pipelineId,
                    latest: false,
                    id: generatedId + 1
                },
                {
                    name,
                    version: `2.1.0`,
                    maintainer,
                    description,
                    labels,
                    config: templateConfig,
                    pipelineId,
                    latest: false,
                    id: generatedId
                }
            ];

            const newVersion = '2.1';

            expected.version = `${newVersion}.3`;
            expected.trusted = true;
            expected.latest = false;

            datastore.save.resolves(expected);
            datastore.scan.onFirstCall().resolves([latest]);
            datastore.scan.onSecondCall().resolves(target);
            datastore.update.resolves(latest);

            return factory
                .create({
                    name,
                    version: '2.1',
                    maintainer,
                    description,
                    labels,
                    config: templateConfig,
                    pipelineId
                })
                .then(model => {
                    assert.instanceOf(model, Template);
                    assert.notCalled(datastore.update);
                    Object.keys(expected).forEach(key => {
                        assert.deepEqual(model[key], expected[key]);
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
            assert.throw(TemplateFactory.getInstance, Error, 'No datastore provided to TemplateFactory');
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
            expected = { ...returnValue[2] };

            return factory.get(config).then(model => {
                assert.calledWith(
                    datastore.get,
                    sinon.match({
                        params: { name, namespace, version: '1.0.2' }
                    })
                );
                assert.instanceOf(model, Template);
                Object.keys(expected).forEach(key => {
                    assert.strictEqual(model[key], expected[key]);
                });
            });
        });

        // name: testTemplate
        // Template with "namespace: default, name: test" does not exist
        it('should get template when default namespace does not exist', () => {
            datastore.get.resolves(returnValue[3]);
            datastore.scan.resolves([]);
            expected = { ...returnValue[3] };
            delete config.namespace;

            return factory.get(config).then(model => {
                assert.calledWith(
                    datastore.get,
                    sinon.match({
                        params: { name: 'testTemplate', namespace: null, version: '1.0.2' }
                    })
                );
                assert.instanceOf(model, Template);
                Object.keys(expected).forEach(key => {
                    assert.strictEqual(model[key], expected[key]);
                });
            });
        });

        // name: testTemplate
        // Template with "namespace: default, name: test" exists
        it('should get template when default namespace does not exist', () => {
            datastore.get.resolves(returnValue[3]);
            datastore.scan.resolves([returnValue[3]]);
            expected = { ...returnValue[3] };
            delete config.namespace;

            return factory.get(config).then(model => {
                assert.calledWith(
                    datastore.get,
                    sinon.match({
                        params: { name: 'testTemplate', namespace: 'default', version: '1.0.2' }
                    })
                );
                assert.instanceOf(model, Template);
                Object.keys(expected).forEach(key => {
                    assert.strictEqual(model[key], expected[key]);
                });
            });
        });

        // name: namespace/testTemplate
        it('should get a template with implicit namespace in name', () => {
            datastore.get.resolves(returnValue[3]);
            datastore.scan.resolves([]);
            expected = { ...returnValue[3] };
            delete config.namespace;
            config.name = 'namespace/testTemplate';

            return factory.get(config).then(model => {
                assert.calledWith(
                    datastore.get,
                    sinon.match({
                        params: { name: 'namespace/testTemplate', namespace: null, version: '1.0.2' }
                    })
                );
                assert.instanceOf(model, Template);
                Object.keys(expected).forEach(key => {
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

            return factory.list(config).then(model => {
                assert.instanceOf(model[0], Template);
            });
        });

        it('should list templates when no namespace is passed in', () => {
            expected = [returnValue[3]];
            datastore.scan.resolves(expected);

            delete config.namespace;

            return factory.list(config).then(model => {
                assert.instanceOf(model[0], Template);
            });
        });
    });

    describe('listWithMetrics', () => {
        let config;
        let expected;
        let returnValue;
        let jobsCount;
        let buildsCount;

        beforeEach(() => {
            config = {
                params: {
                    name,
                    namespace,
                    version: '1.0.2'
                }
            };

            jobsCount = [
                {
                    templateId: 1,
                    count: 3
                },
                {
                    templateId: 2,
                    count: 0
                },
                {
                    templateId: 3,
                    count: 0
                },
                {
                    templateId: 4,
                    count: 2
                },
                {
                    templateId: 5,
                    count: 7
                }
            ];

            buildsCount = [
                {
                    templateId: 1,
                    count: 4
                },
                {
                    templateId: 2,
                    count: 0
                },
                {
                    templateId: 3,
                    count: 0
                },
                {
                    templateId: 4,
                    count: 3
                },
                {
                    templateId: 9,
                    count: 100
                }
            ];

            returnValue = [
                {
                    id: 1,
                    name,
                    namespace,
                    version: '1.0.1',
                    metrics: {
                        jobs: {
                            count: 3
                        },
                        builds: {
                            count: 4
                        }
                    }
                },
                {
                    id: 3,
                    name,
                    namespace,
                    version: '1.0.3',
                    metrics: {
                        jobs: {
                            count: 0
                        },
                        builds: {
                            count: 0
                        }
                    }
                },
                {
                    id: 2,
                    name,
                    namespace,
                    version: '1.0.2',
                    metrics: {
                        jobs: {
                            count: 0
                        },
                        builds: {
                            count: 0
                        }
                    }
                },
                {
                    id: 4,
                    name: `${namespace}/${name}`,
                    version: '1.0.2',
                    metrics: {
                        jobs: {
                            count: 2
                        },
                        builds: {
                            count: 3
                        }
                    }
                }
            ];
        });

        it('should list templates with metrics when namespace is passed in', () => {
            expected = [returnValue[0], returnValue[1], returnValue[2]];
            datastore.scan.resolves(expected);
            buildFactoryMock.list.resolves(buildsCount);
            jobFactoryMock.list.resolves(jobsCount);

            return factory.listWithMetrics(config).then(templates => {
                let i = 0;

                templates.forEach(t => {
                    assert.deepEqual(t.id, expected[i].id);
                    assert.deepEqual(t.metrics.jobs.count, expected[i].metrics.jobs.count);
                    assert.deepEqual(t.metrics.builds.count, expected[i].metrics.builds.count);
                    i += 1;
                });
            });
        });

        it('should list templates with metrics when no namespace is passed in', () => {
            expected = [returnValue[3]];
            datastore.scan.resolves(expected);
            buildFactoryMock.list.resolves(buildsCount);
            jobFactoryMock.list.resolves(jobsCount);

            delete config.namespace;

            return factory.listWithMetrics(config).then(templates => {
                assert.deepEqual(templates.length, 1);
                assert.deepEqual(templates[0].metrics.jobs.count, expected[0].metrics.jobs.count);
                assert.deepEqual(templates[0].metrics.builds.count, expected[0].metrics.builds.count);
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
                },
                {
                    id: '5',
                    name: 'testTemplateName',
                    version: '1.0.20'
                }
            ];
        });

        it('should get the correct template for a given name@exactVersion 1.0.2', () => {
            fullTemplateName = `${templateName}@1.0.2`;
            expected = { ...returnValue[2] };
            datastore.scan.onCall(0).resolves([]);
            datastore.get.resolves(returnValue[2]);

            return factory.getTemplate(fullTemplateName).then(model => {
                assert.instanceOf(model, Template);
                Object.keys(expected).forEach(key => {
                    assert.strictEqual(model[key], expected[key]);
                });
            });
        });

        it('should get the correct template for a given namespace/name@exactVersion 1.0.2', () => {
            fullTemplateName = `${templateName}@1.0.2`;
            expected = { namespace: 'namespace', ...returnValue[2] };
            returnValue[2].namespace = 'namespace';
            datastore.scan.onCall(0).resolves([returnValue[2]]);
            datastore.get.resolves(returnValue[2]);

            return factory.getTemplate(fullTemplateName).then(model => {
                assert.calledWith(datastore.get, {
                    params: {
                        namespace: 'namespace',
                        name: 'testTemplateName',
                        version: '1.0.2'
                    },
                    table: 'templates'
                });
                assert.instanceOf(model, Template);
                Object.keys(expected).forEach(key => {
                    assert.strictEqual(model[key], expected[key]);
                });
            });
        });

        it('should get the correct template for a given name@version 1.0', () => {
            expected = { ...returnValue[4] };
            datastore.scan.onCall(0).resolves([]);
            datastore.scan.onCall(1).resolves(returnValue);

            return factory.getTemplate(fullTemplateName).then(model => {
                assert.instanceOf(model, Template);
                Object.keys(expected).forEach(key => {
                    assert.strictEqual(model[key], expected[key]);
                });
            });
        });

        it('should get the correct template for a given namespace/name@version 1.0', () => {
            expected = { namespace: 'namespace', ...returnValue[4] };
            returnValue[4].namespace = 'namespace';
            datastore.scan.onCall(0).resolves([returnValue[4]]);
            datastore.scan.onCall(1).resolves(returnValue);

            return factory.getTemplate(fullTemplateName).then(model => {
                assert.instanceOf(model, Template);
                Object.keys(expected).forEach(key => {
                    assert.strictEqual(model[key], expected[key]);
                });
            });
        });

        it('should get the correct template for a given name@tag', () => {
            fullTemplateName = `${templateName}@latest`;
            expected = { ...returnValue[2] };
            templateTagFactoryMock.get.resolves({ version: '1.0.2' });
            datastore.get.resolves(returnValue[2]);
            datastore.scan.onCall(0).resolves([]);

            return factory.getTemplate(fullTemplateName).then(model => {
                assert.instanceOf(model, Template);
                Object.keys(expected).forEach(key => {
                    assert.strictEqual(model[key], expected[key]);
                });
            });
        });

        it('should get the correct template for a given namespace/name@tag', () => {
            fullTemplateName = `${templateName}@latest`;
            expected = { namespace: 'namespace', ...returnValue[2] };
            returnValue[2].namespace = 'namespace';
            templateTagFactoryMock.get.resolves({ version: '1.0.2' });
            datastore.get.resolves(returnValue[2]);
            datastore.scan.onCall(0).resolves([returnValue[1]]);

            return factory.getTemplate(fullTemplateName).then(model => {
                assert.instanceOf(model, Template);
                assert.calledWith(datastore.get, {
                    params: {
                        namespace: 'namespace',
                        name: 'testTemplateName',
                        version: '1.0.2'
                    },
                    table: 'templates'
                });
                Object.keys(expected).forEach(key => {
                    assert.strictEqual(model[key], expected[key]);
                });
            });
        });

        it('should return null if no template tag returned by get', () => {
            fullTemplateName = `${templateName}@latest`;
            templateTagFactoryMock.get.resolves(null);
            datastore.scan.onCall(0).resolves([]);

            return factory.getTemplate(fullTemplateName).then(model => {
                assert.isNull(model);
            });
        });

        it('should get correct template for a given name with no version or tag', () => {
            fullTemplateName = templateName;
            expected = { ...returnValue[0] };
            datastore.scan.onCall(0).resolves([]);
            datastore.scan.onCall(1).resolves(returnValue);

            return factory.getTemplate(fullTemplateName).then(model => {
                assert.instanceOf(model, Template);
                Object.keys(expected).forEach(key => {
                    assert.strictEqual(model[key], expected[key]);
                });
            });
        });

        it('should return null if no template returned by list', () => {
            datastore.scan.resolves([]);

            return factory.getTemplate(fullTemplateName).then(model => {
                assert.strictEqual(model, null);
            });
        });
    });
});
