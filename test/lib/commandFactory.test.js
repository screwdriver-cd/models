'use strict';

const { assert } = require('chai');
const mockery = require('mockery');
const sinon = require('sinon');

sinon.assert.expose(assert, { prefix: '' });

describe('Command Factory', () => {
    const namespace = 'testCommandNS';
    const name = 'testCommand';
    const version = '1.3';
    const maintainer = 'foo@bar.com';
    const description = 'this is a command';
    const usage = 'sd-cmd exec foo/bar@1 -d <domain> -h <host>';
    const format = 'habitat';
    const habitat = {
        mode: 'remote',
        package: 'core/git/2.14.1',
        command: 'git'
    };
    const pipelineId = '8765';
    const metaData = {
        namespace,
        name,
        version,
        maintainer,
        description,
        usage,
        format,
        habitat,
        pipelineId
    };
    let CommandFactory;
    let datastore;
    let commandTagFactoryMock;
    let factory;
    let Command;

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
        commandTagFactoryMock = {
            get: sinon.stub()
        };

        mockery.registerMock('./commandTagFactory', {
            getInstance: sinon.stub().returns(commandTagFactoryMock)
        });

        /* eslint-disable global-require */
        Command = require('../../lib/command');
        CommandFactory = require('../../lib/commandFactory');
        /* eslint-enable global-require */

        factory = new CommandFactory({ datastore });
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
        it('should return a Command', () => {
            const model = factory.createClass(metaData);

            assert.instanceOf(model, Command);
        });
    });

    describe('create', () => {
        const generatedId = 1234135;
        let expected;

        beforeEach(() => {
            expected = {
                namespace,
                name,
                version,
                maintainer,
                description,
                format,
                habitat,
                id: generatedId,
                pipelineId,
                trusted: false
            };
        });

        it('creates a Command given major/minor version and no latest commands', () => {
            expected.version = `${version}.0`;

            datastore.save.resolves(expected);
            datastore.scan.resolves([]);

            return factory
                .create({
                    namespace,
                    name,
                    version,
                    maintainer,
                    description,
                    format,
                    habitat,
                    pipelineId
                })
                .then(model => {
                    assert.instanceOf(model, Command);
                    Object.keys(expected).forEach(key => {
                        assert.strictEqual(model[key], expected[key]);
                    });
                });
        });

        it('creates a Command given major version and no latest commands', () => {
            expected.version = '1.0.0';

            datastore.save.resolves(expected);
            datastore.scan.resolves([]);

            return factory
                .create({
                    namespace,
                    name,
                    version: 1,
                    maintainer,
                    description,
                    format,
                    habitat,
                    pipelineId
                })
                .then(model => {
                    assert.instanceOf(model, Command);
                    Object.keys(expected).forEach(key => {
                        assert.strictEqual(model[key], expected[key]);
                    });
                });
        });

        it('creates a Command and auto-bumps version when latest returns something', () => {
            const latest = {
                namespace,
                name,
                version: `${version}.0`,
                maintainer,
                description,
                format,
                habitat,
                id: generatedId,
                pipelineId
            };

            expected.version = `${version}.1`;

            datastore.save.resolves(expected);
            datastore.scan.resolves([latest]);
            datastore.update.resolves(latest);

            return factory
                .create({
                    namespace,
                    name,
                    version,
                    maintainer,
                    description,
                    format,
                    habitat,
                    pipelineId
                })
                .then(model => {
                    assert.instanceOf(model, Command);
                    assert.calledWith(datastore.update, {
                        table: 'commands',
                        params: {
                            id: 1234135,
                            latest: false
                        }
                    });
                    Object.keys(expected).forEach(key => {
                        assert.strictEqual(model[key], expected[key]);
                    });
                });
        });

        it('creates a trusted Command if latest Command was trusted', () => {
            const latest = {
                namespace,
                name,
                version: `${version}.0`,
                maintainer,
                description,
                format,
                habitat,
                id: generatedId,
                pipelineId,
                trusted: true
            };

            expected.version = `${version}.1`;
            expected.trusted = true;

            datastore.save.resolves(expected);
            datastore.scan.resolves([latest]);
            datastore.update.resolves(latest);

            return factory
                .create({
                    namespace,
                    name,
                    version,
                    maintainer,
                    description,
                    format,
                    habitat,
                    pipelineId
                })
                .then(model => {
                    assert.instanceOf(model, Command);
                    assert.calledWith(datastore.update, {
                        table: 'commands',
                        params: {
                            id: 1234135,
                            latest: false
                        }
                    });
                    Object.keys(expected).forEach(key => {
                        assert.strictEqual(model[key], expected[key]);
                    });
                });
        });

        it('creates a trusted Command and bump major version when latest Command was trusted', () => {
            const latest = {
                namespace,
                name,
                version: `${version}.1`,
                maintainer,
                description,
                format,
                habitat,
                id: generatedId,
                pipelineId,
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
                    namespace,
                    name,
                    version: newVersion,
                    maintainer,
                    description,
                    format,
                    habitat,
                    pipelineId
                })
                .then(model => {
                    assert.instanceOf(model, Command);
                    assert.calledWith(datastore.update, {
                        table: 'commands',
                        params: {
                            id: 1234135,
                            latest: false
                        }
                    });
                    Object.keys(expected).forEach(key => {
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
            const f1 = CommandFactory.getInstance(config);
            const f2 = CommandFactory.getInstance(config);

            assert.instanceOf(f1, CommandFactory);
            assert.instanceOf(f2, CommandFactory);

            assert.equal(f1, f2);
        });

        it('should throw when config not supplied', () => {
            assert.throw(CommandFactory.getInstance, Error, 'No datastore provided to CommandFactory');
        });
    });

    describe('getCommand', () => {
        const commandNamespace = 'testCommandNS';
        const commandName = 'testCommand';
        const commandVersion = '1.0';
        let fullCommandName;
        let expected;
        let returnValue;

        beforeEach(() => {
            fullCommandName = `${commandNamespace}/${commandName}@${commandVersion}`;

            returnValue = [
                {
                    id: '1',
                    namespace: 'testCommandNS',
                    name: 'testCommand',
                    version: '1.0.1'
                },
                {
                    id: '3',
                    namespace: 'testCommandNS',
                    name: 'testCommand',
                    version: '1.0.3'
                },
                {
                    id: '2',
                    namespace: 'testCommandNS',
                    name: 'testCommand',
                    version: '1.0.2'
                },
                {
                    id: '4',
                    namespace: 'testCommandNS',
                    name: 'testCommand',
                    version: '2.0.1'
                },
                {
                    id: '5',
                    namespace: 'testCommandNS',
                    name: 'testCommand',
                    version: '1.0.20'
                }
            ];
        });

        it('should get the correct command for a given namespace/name@exactVersion 1.0.2', () => {
            fullCommandName = `${commandNamespace}/${commandName}@1.0.2`;
            expected = { ...returnValue[2] };
            datastore.get.resolves(returnValue[2]);

            return factory.getCommand(fullCommandName).then(model => {
                assert.instanceOf(model, Command);
                Object.keys(expected).forEach(key => {
                    assert.strictEqual(model[key], expected[key]);
                });
            });
        });

        it('should get the correct command for a given namespace/name@version 1.0', () => {
            expected = { ...returnValue[4] };
            datastore.scan.resolves(returnValue);

            return factory.getCommand(fullCommandName).then(model => {
                assert.instanceOf(model, Command);
                Object.keys(expected).forEach(key => {
                    assert.strictEqual(model[key], expected[key]);
                });
            });
        });

        it('should get the correct command for a given namespace/name@tag', () => {
            fullCommandName = `${commandNamespace}/${commandName}@latest`;
            expected = { ...returnValue[2] };
            commandTagFactoryMock.get.resolves({ version: '1.0.2' });
            datastore.get.resolves(returnValue[2]);

            return factory.getCommand(fullCommandName).then(model => {
                assert.instanceOf(model, Command);
                Object.keys(expected).forEach(key => {
                    assert.strictEqual(model[key], expected[key]);
                });
            });
        });

        it('should return null if no command tag returned by get', () => {
            fullCommandName = `${commandNamespace}/${commandName}@latest`;
            commandTagFactoryMock.get.resolves(null);

            return factory.getCommand(fullCommandName).then(model => {
                assert.isNull(model);
            });
        });

        it('should get the correct command for a given namespace with no version or tag', () => {
            fullCommandName = `${commandNamespace}/${commandName}`;
            expected = { ...returnValue[0] };
            datastore.scan.resolves(returnValue);

            return factory.getCommand(fullCommandName).then(model => {
                assert.instanceOf(model, Command);
                Object.keys(expected).forEach(key => {
                    assert.strictEqual(model[key], expected[key]);
                });
            });
        });

        it('should return null if no command returned by list', () => {
            datastore.scan.resolves([]);

            return factory.getCommand(fullCommandName).then(model => {
                assert.strictEqual(model, null);
            });
        });
    });
});
