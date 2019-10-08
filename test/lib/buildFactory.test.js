'use strict';

const assert = require('chai').assert;
const mockery = require('mockery');
const hoek = require('hoek');
const schema = require('screwdriver-data-schema');
const sinon = require('sinon');
let startStub;
let getStepsStub;

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
        this.clusterEnv = config.clusterEnv || {};
        this.start = startStub.resolves(this);
        this.getSteps = getStepsStub;
    }
}

describe('Build Factory', () => {
    let bookendMock;
    let BuildFactory;
    let datastore;
    let executor;
    let jobFactoryMock;
    let userFactoryMock;
    let stepFactoryMock;
    let buildClusterFactoryMock;
    let scmMock;
    let factory;
    let jobFactory;
    let stepFactory;
    let buildClusterFactory;
    const apiUri = 'https://notify.com/some/endpoint';
    const tokenGen = sinon.stub();
    const uiUri = 'http://display.com/some/endpoint';
    const clusterEnv = { CLUSTER_FOO: 'bar' };
    const steps = [
        { name: 'sd-setup-launcher' },
        { name: 'sd-setup-scm', command: 'git clone' },
        { command: 'npm install', name: 'init' },
        { command: 'npm test', name: 'test' }
    ];
    const scmContext = 'github: github.com';
    const sdBuildClusters = [{
        name: 'sd1',
        managedByScrewdriver: true,
        isActive: true,
        scmContext,
        scmOrganizations: [],
        weightage: 100
    }];
    const externalBuildCluster = {
        name: 'iOS',
        managedByScrewdriver: false,
        isActive: true,
        scmContext,
        scmOrganizations: ['screwdriver']
    };

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
            get: sinon.stub(),
            save: sinon.stub(),
            scan: sinon.stub()
        };
        jobFactoryMock = {
            get: sinon.stub()
        };
        userFactoryMock = {
            get: sinon.stub()
        };
        stepFactoryMock = {
            create: sinon.stub().resolves({})
        };
        buildClusterFactoryMock = {
            list: sinon.stub().resolves([]),
            get: sinon.stub().resolves(externalBuildCluster)
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
        stepFactory = {
            getInstance: sinon.stub().returns(stepFactoryMock)
        };
        buildClusterFactory = {
            getInstance: sinon.stub().returns(buildClusterFactoryMock)
        };
        startStub = sinon.stub();
        getStepsStub = sinon.stub();

        // Fixing mockery issue with duplicate file names
        // by re-registering data-schema with its own implementation
        mockery.registerMock('screwdriver-data-schema', schema);

        mockery.registerMock('screwdriver-build-bookend', bookendMock);

        mockery.registerMock('./jobFactory', jobFactory);
        mockery.registerMock('./stepFactory', stepFactory);
        mockery.registerMock('./userFactory', {
            getInstance: sinon.stub().returns(userFactoryMock)
        });
        mockery.registerMock('./buildClusterFactory', buildClusterFactory);
        mockery.registerMock('./build', Build);

        // eslint-disable-next-line global-require
        BuildFactory = require('../../lib/buildFactory');

        factory = new BuildFactory({
            datastore,
            executor,
            scm: scmMock,
            uiUri,
            bookend: bookendMock,
            clusterEnv,
            multiBuildClusterEnabled: true
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
        const configPipelineSha = '63aa3d3058bc0886a8bf42567858e61a7310133c';
        const scmUri = 'github.com:12345:master';
        const scmRepo = {
            name: 'screwdriver-cd/models'
        };
        const displayName = 'github';
        const prRef = 'pull/3/merge';
        const username = 'i_made_the_request';
        const dateNow = Date.now();
        const isoTime = (new Date(dateNow)).toISOString();
        const container = 'node:4';
        const environment = { CLUSTER_FOO: 'bar', NODE_ENV: 'test', NODE_VERSION: '4' };
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
        const permutationsWithAnnotations = [{
            annotations: {
                'screwdriver.cd/buildCluster': 'iOS'
            },
            commands: [
                { command: 'npm install', name: 'init' },
                { command: 'npm test', name: 'test' }
            ],
            environment: { NODE_ENV: 'test', NODE_VERSION: '4' },
            image: 'node:4'
        }];

        const commit = {
            url: 'foo',
            message: 'bar',
            author: {
                name: 'Batman',
                username: 'batman',
                url: 'stuff',
                avatar: 'moreStuff'
            }
        };

        const meta = {
            foo: 'bar',
            one: 1
        };

        steps.unshift({
            name: 'sd-setup-init',
            startTime: isoTime
        });

        let saveConfig;

        beforeEach(() => {
            scmMock.getCommitSha.resolves(sha);
            scmMock.decorateCommit.resolves(commit);
            scmMock.getDisplayName.returns(displayName);
            bookendMock.getSetupCommands.resolves([steps[2]]);
            bookendMock.getTeardownCommands.resolves([]);
            datastore.save.resolves({});

            sandbox = sinon.createSandbox({
                useFakeTimers: false
            });
            sandbox.useFakeTimers(dateNow);

            jobFactoryMock.get.resolves({
                permutations
            });

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
                    sha,
                    meta,
                    stats: {}
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
                garbage, username, jobId, eventId, sha, parentBuildId: 12345, meta
            }).then(() => {
                assert.callCount(stepFactoryMock.create, steps.length);
                assert.calledWith(datastore.save, saveConfig);
            });
        });

        it('do not set buildClusterName if multiBuildClusterEnabled is false', () => {
            const user = { unsealToken: sinon.stub().resolves('foo') };
            const jobMock = {
                permutations: permutationsWithAnnotations,
                pipeline: Promise.resolve({ name: 'screwdriver/ui', scmUri, scmRepo, scmContext })
            };

            factory.multiBuildClusterEnabled = false;
            jobFactoryMock.get.resolves(jobMock);
            userFactoryMock.get.resolves(user);
            delete saveConfig.params.commit;

            return factory.create({
                username, jobId, eventId, sha, parentBuildId: 12345, meta
            }).then(() => {
                assert.callCount(stepFactoryMock.create, steps.length);
                assert.calledWith(datastore.save, saveConfig);
            });
        });

        it('pick from screwdriver build cluster if no annotation passed in', () => {
            const user = { unsealToken: sinon.stub().resolves('foo') };
            const jobMock = {
                permutations,
                pipeline: Promise.resolve({ scmUri, scmRepo, scmContext })
            };

            buildClusterFactoryMock.list.resolves(sdBuildClusters);
            jobFactoryMock.get.resolves(jobMock);
            userFactoryMock.get.resolves(user);
            delete saveConfig.params.commit;
            saveConfig.params.buildClusterName = 'sd1';

            return factory.create({
                username, jobId, eventId, sha, parentBuildId: 12345, meta
            }).then(() => {
                assert.callCount(stepFactoryMock.create, steps.length);
                assert.calledWith(datastore.save, saveConfig);
            });
        });

        it('pick build cluster based on annotations passed in', () => {
            const user = { unsealToken: sinon.stub().resolves('foo') };
            const jobMock = {
                permutations: permutationsWithAnnotations,
                pipeline: Promise.resolve({ name: 'screwdriver/ui', scmUri, scmRepo, scmContext })
            };

            jobFactoryMock.get.resolves(jobMock);
            userFactoryMock.get.resolves(user);
            delete saveConfig.params.commit;
            saveConfig.params.buildClusterName = 'iOS';

            return factory.create({
                username, jobId, eventId, sha, parentBuildId: 12345, meta
            }).then(() => {
                assert.callCount(stepFactoryMock.create, steps.length);
                assert.calledWith(datastore.save, saveConfig);
            });
        });

        it('throws err if the pipeline is unauthorized to use the build cluster', () => {
            const user = { unsealToken: sinon.stub().resolves('foo') };
            const jobMock = {
                permutations: permutationsWithAnnotations,
                pipeline: Promise.resolve({ name: 'test/ui', scmUri, scmRepo, scmContext })
            };

            jobFactoryMock.get.resolves(jobMock);
            userFactoryMock.get.resolves(user);
            delete saveConfig.params.commit;
            saveConfig.params.buildClusterName = 'iOS';

            return factory.create({
                username, jobId, eventId, sha, parentBuildId: 12345, meta
            }).catch((err) => {
                assert.instanceOf(err, Error);
                assert.strictEqual(err.message,
                    'This pipeline is not authorized to use this build cluster.');
            });
        });

        it('throws err if the build cluster specified does not exist', () => {
            const user = { unsealToken: sinon.stub().resolves('foo') };
            const jobMock = {
                permutations: permutationsWithAnnotations,
                pipeline: Promise.resolve({ name: 'screwdriver/ui', scmUri, scmRepo, scmContext })
            };

            buildClusterFactoryMock.get.resolves(null);
            jobFactoryMock.get.resolves(jobMock);
            userFactoryMock.get.resolves(user);
            delete saveConfig.params.commit;

            return factory.create({
                username, jobId, eventId, sha, parentBuildId: 12345, meta
            }).catch((err) => {
                assert.instanceOf(err, Error);
                assert.strictEqual(err.message,
                    'Cluster specified in screwdriver.cd/buildCluster iOS does not exist.');
            });
        });

        it('use username as displayName if displayLabel is not set', () => {
            const jobMock = {
                permutations,
                pipeline: Promise.resolve({ scmUri, scmRepo, scmContext })
            };

            jobFactoryMock.get.resolves(jobMock);
            scmMock.getDisplayName.returns(null);
            saveConfig.params.cause = 'Started by user i_made_the_request';
            delete saveConfig.params.commit;
            delete saveConfig.params.parentBuildId;

            return factory.create({
                username, jobId, eventId, sha, meta
            }).then(() => assert.calledWith(datastore.save, saveConfig));
        });

        it('creates a new build in the datastore, looking up sha', () => {
            const user = { unsealToken: sinon.stub().resolves('foo') };
            const causeMessage = `Started by ${displayName}`;
            const jobMock = {
                permutations,
                pipeline: Promise.resolve({ scmUri, scmRepo, scmContext })
            };

            jobFactoryMock.get.resolves(jobMock);
            userFactoryMock.get.resolves(user);

            return factory.create({
                username,
                causeMessage,
                scmContext,
                jobId,
                eventId,
                prRef,
                parentBuildId: 12345,
                meta
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
                assert.calledWith(startStub, { causeMessage: 'Started by github' });
                assert.calledWith(datastore.save, saveConfig);
            });
        });

        it('creates a new build in the datastore with causeMessage', () => {
            const user = { unsealToken: sinon.stub().resolves('foo') };
            const causeMessage = '[force start] Push out hotfix';
            const jobMock = {
                permutations,
                pipeline: Promise.resolve({ scmUri, scmRepo, scmContext })
            };

            jobFactoryMock.get.resolves(jobMock);
            userFactoryMock.get.resolves(user);

            return factory.create({
                username,
                causeMessage,
                scmContext,
                jobId,
                eventId,
                prRef,
                parentBuildId: 12345,
                meta
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
                assert.calledWith(startStub, { causeMessage });
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
            saveConfig.params.status = 'CREATED';

            return factory.create({
                username, jobId, eventId, parentBuildId: 12345, start: false, meta
            }).then(() => {
                assert.notCalled(startStub);
                assert.calledWith(datastore.save, saveConfig);
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

            const expectedSteps = steps.slice(0, 2).concat(steps.slice(3));

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

            return factory.create({ username, jobId, eventId, sha, meta }).then((model) => {
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

        it('combines environment from input config', () => {
            const user = { unsealToken: sinon.stub().resolves('foo') };
            const jobMock = {
                permutations,
                pipeline: Promise.resolve({ scmUri, scmRepo, scmContext })
            };

            jobFactoryMock.get.resolves(jobMock);
            userFactoryMock.get.resolves(user);
            saveConfig.params.status = 'CREATED';

            return factory.create({
                username,
                jobId,
                eventId,
                parentBuildId: 12345,
                start: false,
                environment: { EXTRA: true },
                meta
            }).then(() => {
                assert.notCalled(startStub);
                saveConfig.params.environment = {
                    CLUSTER_FOO: 'bar', EXTRA: true, NODE_ENV: 'test', NODE_VERSION: '4'
                };
                assert.calledWith(datastore.save, saveConfig);
                delete saveConfig.params.environment.EXTRA;
            });
        });

        it('passes in config pipeline to the bookend config', () => {
            const pipelineMock = {
                configPipelineId: 2,
                configPipeline: Promise.resolve({ spooky: 'ghost' })
            };
            const jobMock = {
                permutations,
                pipeline: Promise.resolve(pipelineMock)
            };

            userFactoryMock.get.resolves({});
            jobFactoryMock.get.resolves(jobMock);

            return factory.create({
                username,
                jobId,
                eventId,
                sha,
                configPipelineSha,
                meta
            }).then(() => {
                assert.calledWith(bookendMock.getSetupCommands, {
                    pipeline: pipelineMock,
                    job: jobMock,
                    build: sinon.match.object,
                    configPipeline: { spooky: 'ghost' },
                    configPipelineSha
                });
                assert.calledWith(bookendMock.getTeardownCommands, {
                    pipeline: pipelineMock,
                    job: jobMock,
                    build: sinon.match.object,
                    configPipeline: { spooky: 'ghost' },
                    configPipelineSha
                });
            });
        });
    });

    describe('get', () => {
        const buildId = 123;
        const buildData = {
            steps
        };
        const stepsData = steps.map(step => Object.assign({ code: 0 }, step));
        const stepsMock = stepsData.map((step) => {
            const mock = hoek.clone(step);

            mock.toJson = sinon.stub().returns(step);

            return mock;
        });

        it('should get a build by ID without step models', () => {
            getStepsStub.resolves([]);
            datastore.get.resolves(buildData);

            return factory.get(buildId)
                .then(build => assert.deepEqual(build.steps, steps));
        });

        it('should get a build by ID with merged step data', () => {
            getStepsStub.resolves(stepsMock);
            datastore.get.resolves(buildData);

            return factory.get(buildId)
                .then(build => assert.deepEqual(build.steps, stepsData));
        });

        it('should not throw when build does not exist', () => {
            datastore.get.resolves(null);

            return factory.get(buildId)
                .then(build => assert.deepEqual(build, null));
        });
    });

    describe('list', () => {
        const buildData = {
            steps
        };
        const stepsData = steps.map(step => Object.assign({ code: 0 }, step));
        const stepsMock = stepsData.map((step) => {
            const mock = hoek.clone(step);

            mock.toJson = sinon.stub().returns(step);

            return mock;
        });

        it('should list builds without step models', () => {
            getStepsStub.resolves([]);
            datastore.scan.resolves([buildData, buildData]);

            return factory.list({})
                .then((builds) => {
                    builds.map(build => assert.deepEqual(build.steps, steps));
                    assert.calledWithMatch(datastore.scan, { sortBy: 'createTime' });
                });
        });

        it('should list builds with merged step data if config.fetchSteps is true', () => {
            getStepsStub.resolves(stepsMock);
            datastore.scan.resolves([buildData, buildData]);

            return factory.list({ fetchSteps: true })
                .then(builds => builds.map(build => assert.deepEqual(build.steps, stepsData)));
        });

        it('should not list builds with merged step data by default', () => {
            getStepsStub.resolves(stepsMock);
            datastore.scan.resolves([buildData, buildData]);

            return factory.list({})
                .then(builds => builds.map(build => assert.deepEqual(build.steps, steps)));
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
