'use strict';

const assert = require('chai').assert;
const mockery = require('mockery');
const sinon = require('sinon');

sinon.assert.expose(assert, { prefix: '' });

describe('CommandTag Factory', () => {
    const namespace = 'testCommandTagNS';
    const command = 'testCommandTag';
    const version = '1.3';
    const tag = 'latest';
    const metaData = {
        namespace,
        command,
        tag,
        version
    };
    let CommandTagFactory;
    let datastore;
    let factory;
    let CommandTag;

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
        CommandTag = require('../../lib/commandTag');
        // eslint-disable-next-line global-require
        CommandTagFactory = require('../../lib/commandTagFactory');

        factory = new CommandTagFactory({ datastore });
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
        it('should return a CommandTag model', () => {
            const model = factory.createClass(metaData);

            assert.instanceOf(model, CommandTag);
        });
    });

    describe('create', () => {
        const generatedId = 1234135;
        let expected;

        beforeEach(() => {
            expected = {
                id: generatedId,
                namespace,
                command,
                tag,
                version
            };
        });

        it('creates a CommandTag given namespace, command, tag, and version', () => {
            datastore.save.resolves(expected);

            return factory.create({
                namespace,
                command,
                tag,
                version
            }).then((model) => {
                assert.instanceOf(model, CommandTag);
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
            const f1 = CommandTagFactory.getInstance(config);
            const f2 = CommandTagFactory.getInstance(config);

            assert.instanceOf(f1, CommandTagFactory);
            assert.instanceOf(f2, CommandTagFactory);

            assert.equal(f1, f2);
        });

        it('should throw when config not supplied', () => {
            assert.throw(CommandTagFactory.getInstance,
                Error, 'No datastore provided to CommandTagFactory');
        });
    });
});
