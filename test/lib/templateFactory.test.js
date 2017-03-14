'use strict';

const assert = require('chai').assert;
const mockery = require('mockery');
const sinon = require('sinon');

sinon.assert.expose(assert, { prefix: '' });

describe('Template Factory', () => {
    const name = 'testTemplate';
    const version = '1.3';
    const maintainer = 'foo@bar.com';
    const description = 'this is a template';
    const labels = ['test', 'beta'];
    const templateConfig = { image: 'node:6' };
    const scmUri = 'github.com:123:master';
    const metaData = {
        name,
        version,
        maintainer,
        description,
        labels,
        config: templateConfig,
        scmUri
    };
    let TemplateFactory;
    let datastore;
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

        // eslint-disable-next-line global-require
        Template = require('../../lib/template');
        // eslint-disable-next-line global-require
        TemplateFactory = require('../../lib/templateFactory');

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
        it('should create a Template', () => {
            const generatedId = 1234135;
            const expected = {
                name,
                version,
                maintainer,
                description,
                labels,
                config: templateConfig,
                scmUri,
                id: generatedId
            };

            datastore.save.resolves(expected);

            return factory.create({
                name,
                version,
                maintainer,
                description,
                labels,
                config: templateConfig,
                scmUri
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

    describe('getTemplate', () => {
        let config;
        let expected;
        let returnValue;

        beforeEach(() => {
            config = {
                name: 'testTemplateName',
                version: '1.0'
            };

            returnValue = [
                {
                    id: '151c9b11e4a9a27e9e374daca6e59df37d8cf00f',
                    name: 'testTemplateName',
                    version: '1.0.1',
                    labels: ['testLabel', 'otherLabel']
                },
                {
                    id: 'd398fb192747c9a0124e9e5b4e6e8e841cf8c71c',
                    name: 'testTemplateName',
                    version: '1.0.3',
                    labels: ['otherLabel']
                },
                {
                    id: '151c9b11e4a9a27e9e374daca6e59df37d8cf00f',
                    name: 'testTemplateName',
                    version: '1.0.2',
                    labels: ['testLabel', 'otherLabel']
                },
                {
                    id: '151c9b11e4a9a27e9e374daca6e59df37d8cf00f',
                    name: 'testTemplateName',
                    version: '2.0.1',
                    labels: ['testLabel', 'otherLabel']
                }
            ];
        });

        it('should get the correct template for a given config with label', () => {
            expected = Object.assign({}, returnValue[2]);
            config.label = 'testLabel';
            datastore.scan.resolves(returnValue);

            return factory.getTemplate(config).then((model) => {
                assert.instanceOf(model, Template);
                Object.keys(expected).forEach((key) => {
                    assert.strictEqual(model[key], expected[key]);
                });
            });
        });

        it('should get the correct template for a given config without label', () => {
            expected = Object.assign({}, returnValue[1]);
            datastore.scan.resolves(returnValue);

            return factory.getTemplate(config).then((model) => {
                assert.instanceOf(model, Template);
                Object.keys(expected).forEach((key) => {
                    assert.strictEqual(model[key], expected[key]);
                });
            });
        });

        it('should return undefined if no template returned by list ', () => {
            datastore.scan.resolves([]);

            return factory.getTemplate(config).then((model) => {
                assert.equal(model, undefined);
            });
        });
    });
});
