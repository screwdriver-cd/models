'use strict';

const assert = require('chai').assert;
const mockery = require('mockery');
const schema = require('screwdriver-data-schema');
const sinon = require('sinon');
let startStub;

sinon.assert.expose(assert, { prefix: '' });

class Build {
    constructor(config) {
        this.jobId = config.id;
        this.number = config.number;
        this.container = config.container;
        this.executor = config.executor;
        this.apiUri = config.apiUri;
        this.tokenGen = config.tokenGen;
        this.uiUri = config.uiUri;
        this.steps = config.steps;

        this.start = startStub.resolves(this);
    }
}

describe('Build Factory', () => {
    let bookendMock;
    let BuildFactory;
    let datastore;
    let executor;
    let jobFactoryMock;
    let userFactoryMock;
    let scmMock;
    let factory;
    let jobFactory;
    const apiUri = 'https://notify.com/some/endpoint';
    const tokenGen = sinon.stub();
    const uiUri = 'http://display.com/some/endpoint';

    before(() => {
        mockery.enable({
            useCleanCache: true,
            warnOnUnregistered: false
        });
    });

    beforeEach(() => {
        bookendMock = {
            getSetupCommands: sinon.stub(),
            getTeardownCommands: sinon.stub()
        };
        executor = {};
        datastore = {
            save: sinon.stub(),
            scan: sinon.stub()
        };
        jobFactoryMock = {
            get: sinon.stub()
        };
        userFactoryMock = {
            get: sinon.stub()
        };
        scmMock = {
            getCommitSha: sinon.stub(),
            decorateCommit: sinon.stub(),
            getCheckoutCommand: sinon.stub(),
            getDisplayName: sinon.stub()
        };
        jobFactory = {
            getInstance: sinon.stub().returns(jobFactoryMock)
        };
        startStub = sinon.stub();

        // Fixing mockery issue with duplicate file names
        // by re-registering data-schema with its own implementation
        mockery.registerMock('screwdriver-data-schema', schema);

        mockery.registerMock('screwdriver-build-bookend', bookendMock);

        mockery.registerMock('./jobFactory', jobFactory);
        mockery.registerMock('./userFactory', {
            getInstance: sinon.stub().returns(userFactoryMock)
        });
        mockery.registerMock('./build', Build);

        // eslint-disable-next-line global-require
        BuildFactory = require('../../lib/buildFactory');

        factory = new BuildFactory({
            datastore,
            executor,
            scm: scmMock,
            uiUri,
            bookend: bookendMock
        });
        factory.apiUri = apiUri;
        factory.tokenGen = tokenGen;
    });

    afterEach(() => {
        datastore = null;
        mockery.deregisterAll();
        mockery.resetCache();
    });

    after(() => {
        mockery.disable();
    });

    describe('constructor', () => {
        it('constructs with a designated docker registry', () => {
            factory = new BuildFactory({
                datastore,
                dockerRegistry: 'registry.com:1234',
                executor,
                scm: scmMock,
                uiUri,
                bookend: bookendMock
            });

            assert.strictEqual(factory.dockerRegistry, 'registry.com:1234');
        });
    });

    describe('createClass', () => {
        it('should return a Build', () => {
            const model = factory.createClass({});

            assert.instanceOf(model, Build);
            assert.deepEqual(model.executor, executor);
            assert.strictEqual(model.apiUri, apiUri);
            assert.deepEqual(model.tokenGen, tokenGen);
            assert.strictEqual(model.uiUri, uiUri);
        });
    });

    describe('create', () => {
        let sandbox;
        const jobId = 12345;
        const eventId = 123456;
        const sha = 'ccc49349d3cffbd12ea9e3d41521480b4aa5de5f';
        const scmUri = 'github.com:12345:master';
        const scmRepo = {
            name: 'screwdriver-cd/models'
        };
        const scmContext = 'github:github.com';
        const displayName = 'github';
        const prRef = 'pull/3/merge';
        const username = 'i_made_the_request';
        const dateNow = Date.now();
        const isoTime = (new Date(dateNow)).toISOString();
        const container = 'node:4';
        const steps = [
            { name: 'sd-setup-launcher' },
            { name: 'sd-setup-scm', command: 'git clone' },
            { command: 'npm install', name: 'init' },
            { command: 'npm test', name: 'test' }
        ];
        const environment = { NODE_ENV: 'test', NODE_VERSION: '4' };
        const permutations = [{
            commands: [
                { command: 'npm install', name: 'init' },
                { command: 'npm test', name: 'test' }
            ],
            environment: { NODE_ENV: 'test', NODE_VERSION: '4' },
            image: 'node:4'
        }, {
            commands: [
                { command: 'npm install', name: 'init' },
                { command: 'npm test', name: 'test' }
            ],
            environment: { NODE_ENV: 'test', NODE_VERSION: '5' },
            image: 'node:5'
        }, {
            commands: [
                { command: 'npm install', name: 'init' },
                { command: 'npm test', name: 'test' }
            ],
            environment: { NODE_ENV: 'test', NODE_VERSION: '6' },
            image: 'node:6'
        }];

        let commit;

        let saveConfig;

        beforeEach(() => {
            scmMock.getCommitSha.resolves(sha);
            scmMock.decorateCommit.resolves(commit);
            scmMock.getDisplayName.returns(displayName);
            bookendMock.getSetupCommands.resolves([steps[1]]);
            bookendMock.getTeardownCommands.resolves([]);
            datastore.save.resolves({});

            sandbox = sinon.sandbox.create({
                useFakeTimers: false
            });
            sandbox.useFakeTimers(dateNow);

            jobFactoryMock.get.resolves({
                permutations
            });

            commit = {
                url: 'foo',
                message: 'bar',
                author: {
                    name: 'Batman',
                    username: 'batman',
                    url: 'stuff',
                    avatar: 'moreStuff'
                }
            };

            saveConfig = {
                table: 'builds',
                params: {
                    eventId,
                    parentBuildId: 12345,
                    cause: 'Started by user github:i_made_the_request',
                    commit,
                    createTime: isoTime,
                    number: dateNow,
                    status: 'QUEUED',
                    container,
                    environment,
                    steps,
                    jobId,
                    sha
                }
            };
        });

        afterEach(() => {
            sandbox.restore();
        });

        it('ignores extraneous parameters', () => {
            const garbage = 'garbageData';
            const user = { unsealToken: sinon.stub().resolves('foo') };
            const jobMock = {
                permutations,
                pipeline: Promise.resolve({ scmUri, scmRepo, scmContext })
            };

            jobFactoryMock.get.resolves(jobMock);
            userFactoryMock.get.resolves(user);
            delete saveConfig.params.commit;

            return factory.create({
                garbage, username, jobId, eventId, sha, parentBuildId: 12345
            }).then(() => assert.calledWith(datastore.save, saveConfig));
        });

        it('use username as displayName if displayLabel is not set', () => {
            scmMock.getDisplayName.returns(null);
            saveConfig.params.cause = 'Started by user i_made_the_request';
            delete saveConfig.params.commit;
            delete saveConfig.params.parentBuildId;

            return factory.create({ username, jobId, eventId, sha }).then(() =>
                assert.calledWith(datastore.save, saveConfig));
        });

        it('creates a new build in the datastore, looking up sha', () => {
            const user = { unsealToken: sinon.stub().resolves('foo') };
            const jobMock = {
                permutations,
                pipeline: Promise.resolve({ scmUri, scmRepo, scmContext })
            };

            jobFactoryMock.get.resolves(jobMock);
            userFactoryMock.get.resolves(user);

            return factory.create({
                username, scmContext, jobId, eventId, prRef, parentBuildId: 12345
            }).then((model) => {
                assert.instanceOf(model, Build);
                assert.calledOnce(jobFactory.getInstance);
                assert.calledWith(jobFactoryMock.get, jobId);
                assert.calledWith(userFactoryMock.get, { username, scmContext });
                assert.calledWith(scmMock.getCommitSha, {
                    token: 'foo',
                    scmUri,
                    scmContext
                });
                assert.calledWith(scmMock.decorateCommit, {
                    token: 'foo',
                    sha,
                    scmUri,
                    scmContext
                });
                assert.calledWith(bookendMock.getSetupCommands, {
                    pipeline: { scmUri, scmRepo, scmContext },
                    job: jobMock,
                    build: sinon.match.object
                });
                assert.calledWith(bookendMock.getTeardownCommands, {
                    pipeline: { scmUri, scmRepo, scmContext },
                    job: jobMock,
                    build: sinon.match.object
                });
                assert.calledOnce(startStub);
                assert.calledWith(datastore.save, saveConfig);
            });
        });

        it('creates a new build without starting', () => {
            const user = { unsealToken: sinon.stub().resolves('foo') };
            const jobMock = {
                permutations,
                pipeline: Promise.resolve({ scmUri, scmRepo, scmContext })
            };

            jobFactoryMock.get.resolves(jobMock);
            userFactoryMock.get.resolves(user);

            return factory.create({
                username, jobId, eventId, parentBuildId: 12345, start: false
            }).then(() => {
                assert.notCalled(startStub);
            });
        });

        it('adds a teardown command if one exists', () => {
            const user = { unsealToken: sinon.stub().resolves('foo') };
            const jobMock = {
                permutations,
                pipeline: Promise.resolve({ scmUri, scmRepo, scmContext })
            };
            const teardown = {
                name: 'sd-teardown',
                command: 'echo "hello"'
            };

            jobFactoryMock.get.resolves(jobMock);
            userFactoryMock.get.resolves(user);
            bookendMock.getTeardownCommands.resolves([teardown]);
            bookendMock.getSetupCommands.resolves([]);

            const expectedSteps = steps.slice(0, 1).concat(steps.slice(2));

            expectedSteps.push(teardown);

            return factory.create({ username, jobId, eventId, prRef }).then((model) => {
                assert.instanceOf(model, Build);
                assert.deepEqual(model.steps, expectedSteps);
            });
        });

        it('creates a new build in the datastore, without looking up sha', () => {
            const jobMock = {
                permutations,
                pipeline: Promise.resolve({ scmUri, scmRepo, scmContext })
            };

            jobFactoryMock.get.resolves(jobMock);
            delete saveConfig.params.commit;
            delete saveConfig.params.parentBuildId;

            return factory.create({ username, jobId, eventId, sha }).then((model) => {
                assert.calledWith(datastore.save, saveConfig);
                assert.instanceOf(model, Build);
                assert.calledOnce(jobFactory.getInstance);
                assert.calledWith(jobFactoryMock.get, jobId);
                assert.calledOnce(startStub);
            });
        });

        it('properly handles rejection due to missing job model', () => {
            jobFactoryMock.get.resolves(null);

            return factory.create({ username, jobId, eventId }).catch((err) => {
                assert.instanceOf(err, Error);
                assert.strictEqual(err.message, 'Job does not exist');
            });
        });

        it('properly handles rejection due to missing user model', () => {
            userFactoryMock.get.resolves(null);

            return factory.create({ username, jobId, eventId }).catch((err) => {
                assert.instanceOf(err, Error);
                assert.strictEqual(err.message, 'User does not exist');
            });
        });

        it('properly handles rejection due to missing pipeline model', () => {
            const jobMock = {
                permutations,
                pipeline: Promise.resolve(null)
            };

            userFactoryMock.get.resolves({});
            jobFactoryMock.get.resolves(jobMock);

            return factory.create({ username, jobId, eventId }).catch((err) => {
                assert.instanceOf(err, Error);
                assert.strictEqual(err.message, 'Pipeline does not exist');
            });
        });

        it('creates a new build with a custom docker registry', () => {
            const jobMock = {
                permutations,
                pipeline: Promise.resolve({ scmUri, scmRepo, scmContext })
            };

            factory = new BuildFactory({
                datastore,
                dockerRegistry: 'registry.com:1234',
                executor,
                scm: scmMock,
                uiUri,
                bookend: bookendMock
            });

            jobFactoryMock.get.resolves(jobMock);

            return factory.create({ username, jobId, eventId, sha }).then((model) => {
                assert.strictEqual(model.container, 'registry.com:1234/library/node:4');
            });
        });
    });

    describe('getInstance', () => {
        let config;

        beforeEach(() => {
            config = { datastore, executor, scm: {}, uiUri, bookend: bookendMock };
        });

        it('should utilize BaseFactory to get an instance', () => {
            const f1 = BuildFactory.getInstance(config);
            const f2 = BuildFactory.getInstance(config);

            assert.instanceOf(f1, BuildFactory);
            assert.instanceOf(f2, BuildFactory);

            assert.equal(f1, f2);
        });

        it('should throw when config does not have everything necessary', () => {
            assert.throw(BuildFactory.getInstance,
                Error, 'No executor provided to BuildFactory');

            assert.throw(() => {
                BuildFactory.getInstance({ executor, scm: {}, uiUri, bookend: bookendMock });
            }, Error, 'No datastore provided to BuildFactory');

            assert.throw(() => {
                BuildFactory.getInstance({ executor, datastore, uiUri, bookend: bookendMock });
            }, Error, 'No scm plugin provided to BuildFactory');

            assert.throw(() => {
                BuildFactory.getInstance({ executor, scm: {}, datastore, bookend: bookendMock });
            }, Error, 'No uiUri provided to BuildFactory');

            assert.throw(() => {
                BuildFactory.getInstance({ executor, scm: {}, datastore, uiUri });
            }, Error, 'No bookend plugin provided to BuildFactory');
        });
    });
});
