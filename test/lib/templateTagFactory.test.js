'use strict';

const { assert } = require('chai');
const mockery = require('mockery');
const sinon = require('sinon');

sinon.assert.expose(assert, { prefix: '' });

describe('TemplateTag Factory', () => {
    const namespace = 'namespace';
    const name = 'testTemplateTag';
    const fullTemplateName = `${namespace}/${name}`;
    const version = '1.3';
    const tag = 'latest';
    const metaData = {
        name,
        tag,
        version
    };
    let TemplateTagFactory;
    let datastore;
    let factory;
    let TemplateTag;

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

        // eslint-disable-next-line global-require
        TemplateTag = require('../../lib/templateTag');
        // eslint-disable-next-line global-require
        TemplateTagFactory = require('../../lib/templateTagFactory');

        factory = new TemplateTagFactory({ datastore });
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
        it('should return a TemplateTag model', () => {
            const model = factory.createClass(metaData);

            assert.instanceOf(model, TemplateTag);
        });
    });

    describe('create', () => {
        const generatedId = 1234135;
        let expected;
        let returnValue;

        beforeEach(() => {
            expected = {
                id: generatedId,
                name,
                tag,
                version
            };
            returnValue = [
                {
                    id: generatedId,
                    name,
                    tag,
                    version
                }
            ];
        });

        // namespace should be default since a template exists with that name and namespace
        // name: testTemplateTag
        it('creates a Template Tag given name, tag, and version and defaults namespace', () => {
            expected.namespace = 'default';
            datastore.scan.resolves(returnValue);
            datastore.save.resolves(expected);

            return factory
                .create({
                    name,
                    tag,
                    version
                })
                .then(model => {
                    assert.instanceOf(model, TemplateTag);
                    Object.keys(expected).forEach(key => {
                        assert.strictEqual(model[key], expected[key]);
                    });
                });
        });

        // namespace should not be default since a template does not exist with that name and namespace
        // name: testTemplateTag
        it('creates a Template Tag given name, tag, and version and no namespace', () => {
            datastore.scan.resolves([]);
            datastore.save.resolves(expected);

            return factory
                .create({
                    name,
                    tag,
                    version
                })
                .then(model => {
                    assert.instanceOf(model, TemplateTag);
                    Object.keys(expected).forEach(key => {
                        assert.strictEqual(model[key], expected[key]);
                    });
                });
        });

        // name: namespace/testTemplateTag
        // eslint-disable-next-line max-len
        it('creates a Template Tag given name with namespace, tag, and version and namespace does not exist', () => {
            datastore.save.resolves(expected);
            datastore.scan.resolves([]);
            expected.name = name;
            expected.namespace = namespace;

            return factory
                .create({
                    name: fullTemplateName,
                    tag,
                    version
                })
                .then(model => {
                    assert.instanceOf(model, TemplateTag);
                    Object.keys(expected).forEach(key => {
                        assert.strictEqual(model[key], expected[key]);
                    });
                });
        });

        // eslint-disable-next-line max-len
        it('creates a Template Tag given name with namespace, tag, and version and namespace exists', () => {
            datastore.save.resolves(expected);
            datastore.scan.resolves([
                {
                    name,
                    namespace
                }
            ]);
            expected.namespace = namespace;

            return factory
                .create({
                    name: fullTemplateName,
                    tag,
                    version
                })
                .then(model => {
                    assert.instanceOf(model, TemplateTag);
                    Object.keys(expected).forEach(key => {
                        assert.strictEqual(model[key], expected[key]);
                    });
                });
        });

        it('creates a Template Tag given namespace, name, tag, and version', () => {
            datastore.save.resolves(expected);

            return factory
                .create({
                    name,
                    namespace,
                    tag,
                    version
                })
                .then(model => {
                    assert.instanceOf(model, TemplateTag);
                    Object.keys(expected).forEach(key => {
                        assert.strictEqual(model[key], expected[key]);
                    });
                });
        });
    });

    describe('get', () => {
        let config;
        let expected;
        let returnValue;

        beforeEach(() => {
            returnValue = [
                {
                    id: 123,
                    name,
                    tag,
                    version
                }
            ];
            config = {
                name,
                tag
            };
        });

        it('gets a Template Tag given tag and name without implicit namespace', () => {
            datastore.scan.resolves(returnValue);
            datastore.get.resolves(returnValue);
            expected = { ...expected };

            return factory.get(config).then(model => {
                assert.calledWith(datastore.get, {
                    table: 'templateTags',
                    params: { name, namespace: 'default', tag, templateType: 'JOB' }
                });
                assert.instanceOf(model, TemplateTag);
                Object.keys(expected).forEach(key => {
                    assert.strictEqual(model[key], expected[key]);
                });
            });
        });

        it('gets a Template Tag given name and tag with non-existent implicit namespace', () => {
            datastore.scan.resolves([]);
            datastore.get.resolves(returnValue);
            expected = { ...expected };
            config.name = fullTemplateName;

            return factory.get(config).then(model => {
                assert.calledWith(datastore.get, {
                    table: 'templateTags',
                    params: { name: fullTemplateName, namespace: null, tag, templateType: 'JOB' }
                });
                assert.instanceOf(model, TemplateTag);
                Object.keys(expected).forEach(key => {
                    assert.strictEqual(model[key], expected[key]);
                });
            });
        });

        it('gets a Template Tag given tag and name with existent implicit namespace', () => {
            datastore.scan.resolves(returnValue);
            datastore.get.resolves(returnValue);
            expected = { ...expected };
            config.name = fullTemplateName;

            return factory.get(config).then(model => {
                assert.calledWith(datastore.get, {
                    table: 'templateTags',
                    params: { name, namespace, tag, templateType: 'JOB' }
                });
                assert.instanceOf(model, TemplateTag);
                Object.keys(expected).forEach(key => {
                    assert.strictEqual(model[key], expected[key]);
                });
            });
        });

        it('gets a Template Tag given a name and namespace', () => {
            datastore.scan.resolves(returnValue);
            datastore.get.resolves(returnValue);
            expected = { ...expected };
            config.namespace = namespace;

            return factory.get(config).then(model => {
                assert.calledWith(datastore.get, {
                    table: 'templateTags',
                    params: { name, namespace, tag, templateType: 'JOB' }
                });
                assert.instanceOf(model, TemplateTag);
                Object.keys(expected).forEach(key => {
                    assert.strictEqual(model[key], expected[key]);
                });
            });
        });
    });

    describe('list', () => {
        let config;
        let expected;

        beforeEach(() => {
            expected = [
                {
                    id: 123,
                    name,
                    tag,
                    version
                }
            ];
            config = {
                params: {
                    name
                }
            };
        });

        // name: testTemplateTag
        // Template with default namespace and name exists
        it('lists a Template Tag given a name when namespace is default', () => {
            datastore.scan.resolves(expected);

            return factory.list(config).then(model => {
                assert.instanceOf(model[0], TemplateTag);
                assert.callCount(datastore.scan, 2);
                assert.calledWith(datastore.scan.firstCall, {
                    table: 'templateTags',
                    params: { name, namespace: 'default', templateType: 'JOB' }
                });
                assert.calledWith(datastore.scan.secondCall, {
                    table: 'templateTags',
                    params: { name, namespace: 'default', templateType: 'JOB' }
                });
            });
        });

        // name: testTemplateTag
        // Template with default namespace and name does not exist
        it('lists a Template Tag given a name when namespace does not exist', () => {
            datastore.scan.onCall(0).resolves([]);
            datastore.scan.onCall(1).resolves(expected);

            return factory.list(config).then(model => {
                assert.instanceOf(model[0], TemplateTag);

                assert.callCount(datastore.scan, 2);
                assert.calledWith(datastore.scan.firstCall, {
                    table: 'templateTags',
                    params: { name, namespace: 'default', templateType: 'JOB' }
                });
                assert.calledWith(datastore.scan.secondCall, {
                    table: 'templateTags',
                    params: { name, templateType: 'JOB' }
                });
            });
        });

        // name: namespace/testTemplateTag
        it('lists a Template Tag given a name when namespace exists', () => {
            datastore.scan.resolves(expected);
            config.params.name = fullTemplateName;

            return factory.list(config).then(model => {
                assert.instanceOf(model[0], TemplateTag);
                assert.calledWith(datastore.scan, {
                    table: 'templateTags',
                    params: { name, namespace, templateType: 'JOB' }
                });
            });
        });

        it('lists a Template Tag given a name and namespace', () => {
            datastore.scan.resolves(expected);
            config.params.namespace = namespace;

            return factory.list(config).then(model => {
                assert.instanceOf(model[0], TemplateTag);
                assert.calledWith(datastore.scan, {
                    table: 'templateTags',
                    params: { name, namespace, templateType: 'JOB' }
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
            const f1 = TemplateTagFactory.getInstance(config);
            const f2 = TemplateTagFactory.getInstance(config);

            assert.instanceOf(f1, TemplateTagFactory);
            assert.instanceOf(f2, TemplateTagFactory);

            assert.equal(f1, f2);
        });

        it('should throw when config not supplied', () => {
            assert.throw(TemplateTagFactory.getInstance, Error, 'No datastore provided to TemplateTagFactory');
        });
    });
});
