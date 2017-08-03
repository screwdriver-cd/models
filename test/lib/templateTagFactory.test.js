'use strict';

const assert = require('chai').assert;
const mockery = require('mockery');
const sinon = require('sinon');

sinon.assert.expose(assert, { prefix: '' });

describe('TemplateTag Factory', () => {
    const name = 'testTemplateTag';
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

        beforeEach(() => {
            expected = {
                id: generatedId,
                name,
                tag,
                version
            };
        });

        it('creates a TemplateTag given name, tag, and version', () => {
            datastore.save.resolves(expected);

            return factory.create({
                name,
                tag,
                version
            }).then((model) => {
                assert.instanceOf(model, TemplateTag);
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
            const f1 = TemplateTagFactory.getInstance(config);
            const f2 = TemplateTagFactory.getInstance(config);

            assert.instanceOf(f1, TemplateTagFactory);
            assert.instanceOf(f2, TemplateTagFactory);

            assert.equal(f1, f2);
        });

        it('should throw when config not supplied', () => {
            assert.throw(TemplateTagFactory.getInstance,
                Error, 'No datastore provided to TemplateTagFactory');
        });
    });
});
