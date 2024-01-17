'use strict';

const { assert } = require('chai');
const mockery = require('mockery');
const schema = require('screwdriver-data-schema');
const sinon = require('sinon');
const { STATUS_QUERY, LATEST_BUILD_QUERY, getQueries } = require('../../lib/rawQueries');
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
    let stageFactoryMock;
    let stageBuildFactoryMock;
    let buildClusterFactoryMock;
    let scmMock;
    let factory;
    let jobFactory;
    let stepFactory;
    let stageFactory;
    let stageBuildFactory;
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
    const scmContext = 'github:github.com';
    const sdBuildClusters = [
        {
            name: 'sd1',
            managedByScrewdriver: true,
            isActive: true,
            scmContext,
            scmOrganizations: [],
            weightage: 100
        },
        {
            name: 'sd2',
            managedByScrewdriver: true,
            isActive: false,
            scmContext,
            scmOrganizations: [],
            weightage: 0
        },
        {
            name: 'iOS',
            managedByScrewdriver: false,
            isActive: true,
            scmContext,
            scmOrganizations: ['screwdriver'],
            weightage: 0
        },
        {
            name: 'aws.us-west-2',
            managedByScrewdriver: true,
            isActive: true,
            scmContext,
            scmOrganizations: ['screwdriver'],
            weightage: 0
        }
    ];
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
            scan: sinon.stub(),
            query: sinon.stub()
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
        stageFactoryMock = {
            get: sinon.stub().resolves({})
        };
        stageBuildFactoryMock = {
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
        stageFactory = {
            getInstance: sinon.stub().returns(stageFactoryMock)
        };
        stageBuildFactory = {
            getInstance: sinon.stub().returns(stageBuildFactoryMock)
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
        mockery.registerMock('./stageFactory', stageFactory);
        mockery.registerMock('./stageBuildFactory', stageBuildFactory);
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
        const isoTime = new Date(dateNow).toISOString();
        const container = 'node:4';
        const environment = { CLUSTER_FOO: 'bar', NODE_ENV: 'test', NODE_VERSION: '4' };
        const permutations = [
            {
                commands: [
                    { command: 'npm install', name: 'init' },
                    { command: 'npm test', name: 'test' }
                ],
                environment: { NODE_ENV: 'test', NODE_VERSION: '4' },
                image: 'node:4'
            },
            {
                commands: [
                    { command: 'npm install', name: 'init' },
                    { command: 'npm test', name: 'test' }
                ],
                environment: { NODE_ENV: 'test', NODE_VERSION: '5' },
                image: 'node:5'
            },
            {
                commands: [
                    { command: 'npm install', name: 'init' },
                    { command: 'npm test', name: 'test' }
                ],
                environment: { NODE_ENV: 'test', NODE_VERSION: '6' },
                image: 'node:6'
            }
        ];
        const permutationsWithProvider = [
            {
                commands: [
                    { command: 'npm install', name: 'init' },
                    { command: 'npm test', name: 'test' }
                ],
                environment: { NODE_ENV: 'test', NODE_VERSION: '4' },
                image: 'node:4',
                provider: {
                    name: 'aws',
                    executor: 'sls',
                    buildRegion: 'us-west-2',
                    accountId: '123456789012'
                }
            },
            {
                commands: [
                    { command: 'npm install', name: 'init' },
                    { command: 'npm test', name: 'test' }
                ],
                environment: { NODE_ENV: 'test', NODE_VERSION: '5' },
                image: 'node:5'
            },
            {
                commands: [
                    { command: 'npm install', name: 'init' },
                    { command: 'npm test', name: 'test' }
                ],
                environment: { NODE_ENV: 'test', NODE_VERSION: '6' },
                image: 'node:6'
            }
        ];
        const permutationsWithAnnotations = [
            {
                annotations: {
                    'screwdriver.cd/buildCluster': 'iOS'
                },
                commands: [
                    { command: 'npm install', name: 'init' },
                    { command: 'npm test', name: 'test' }
                ],
                environment: { NODE_ENV: 'test', NODE_VERSION: '4' },
                image: 'node:4'
            }
        ];

        const permutations1 = [
            {
                annotations: {
                    'screwdriver.cd/buildCluster': 'aws.us-west-2',
                    'screwdriver.cd/executor': 'k8s-arm64'
                },
                commands: [
                    { command: 'npm install', name: 'init' },
                    { command: 'npm test', name: 'test' }
                ],
                environment: { NODE_ENV: 'test', NODE_VERSION: '4' },
                image: 'node:4'
            }
        ];

        const permutations2 = [
            {
                annotations: {
                    'screwdriver.cd/buildCluster': 'aws.us-west-2'
                },
                commands: [
                    { command: 'npm install', name: 'init' },
                    { command: 'npm test', name: 'test' }
                ],
                environment: { NODE_ENV: 'test', NODE_VERSION: '4' },
                image: 'node:4'
            }
        ];
        const permutations3 = [
            {
                annotations: {
                    'screwdriver.cd/buildCluster': 'aws.us-east-2'
                },
                commands: [
                    { command: 'npm install', name: 'init' },
                    { command: 'npm test', name: 'test' }
                ],
                environment: { NODE_ENV: 'test', NODE_VERSION: '4' },
                image: 'node:4'
            }
        ];
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
        let jobMock;

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

            jobMock = {
                permutations,
                pipeline: Promise.resolve({ scmUri, scmRepo, scmContext }),
                name: 'main'
            };
            jobFactoryMock.get.resolves(jobMock);
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

            userFactoryMock.get.resolves(user);
            delete saveConfig.params.commit;

            return factory
                .create({
                    garbage,
                    username,
                    jobId,
                    eventId,
                    sha,
                    parentBuildId: 12345,
                    meta
                })
                .then(() => {
                    assert.callCount(stepFactoryMock.create, steps.length);
                    assert.calledWith(datastore.save, saveConfig);
                });
        });

        it('does not set buildClusterName if multiBuildClusterEnabled is false', () => {
            const user = { unsealToken: sinon.stub().resolves('foo') };

            jobMock = {
                permutations: permutationsWithAnnotations,
                pipeline: Promise.resolve({ name: 'screwdriver/ui', scmUri, scmRepo, scmContext }),
                name: 'main'
            };
            factory.multiBuildClusterEnabled = false;
            jobFactoryMock.get.resolves(jobMock);
            userFactoryMock.get.resolves(user);
            delete saveConfig.params.commit;

            return factory
                .create({
                    username,
                    jobId,
                    eventId,
                    sha,
                    parentBuildId: 12345,
                    meta
                })
                .then(() => {
                    assert.callCount(stepFactoryMock.create, steps.length);
                    assert.calledWith(datastore.save, saveConfig);
                });
        });

        it('picks from Screwdriver build cluster if no annotation passed in', () => {
            const user = { unsealToken: sinon.stub().resolves('foo') };

            buildClusterFactoryMock.list.resolves(sdBuildClusters);
            userFactoryMock.get.resolves(user);
            delete saveConfig.params.commit;
            saveConfig.params.buildClusterName = 'sd1';

            return factory
                .create({
                    username,
                    jobId,
                    eventId,
                    sha,
                    parentBuildId: 12345,
                    meta
                })
                .then(() => {
                    assert.callCount(stepFactoryMock.create, steps.length);
                    assert.calledWith(datastore.save, saveConfig);
                });
        });

        it('picks build cluster based on annotations passed in', () => {
            const user = { unsealToken: sinon.stub().resolves('foo') };

            jobMock = {
                permutations: permutationsWithAnnotations,
                pipeline: Promise.resolve({ name: 'screwdriver/ui', scmUri, scmRepo, scmContext }),
                name: 'main'
            };
            jobFactoryMock.get.resolves(jobMock);
            userFactoryMock.get.resolves(user);
            buildClusterFactoryMock.list.resolves(sdBuildClusters);
            delete saveConfig.params.commit;
            saveConfig.params.buildClusterName = 'iOS';

            return factory
                .create({
                    username,
                    jobId,
                    eventId,
                    sha,
                    parentBuildId: 12345,
                    meta
                })
                .then(() => {
                    assert.callCount(stepFactoryMock.create, steps.length);
                    assert.calledWith(datastore.save, saveConfig);
                });
        });

        it('picks random Screwdriver build cluster if annotation passed in is inactive', () => {
            const user = { unsealToken: sinon.stub().resolves('foo') };

            jobMock = {
                permutations: [
                    {
                        annotations: {
                            'screwdriver.cd/buildCluster': 'sd2'
                        },
                        commands: [
                            { command: 'npm install', name: 'init' },
                            { command: 'npm test', name: 'test' }
                        ],
                        environment: { NODE_ENV: 'test', NODE_VERSION: '4' },
                        image: 'node:4'
                    }
                ],
                pipeline: Promise.resolve({ name: 'screwdriver/ui', scmUri, scmRepo, scmContext }),
                name: 'main'
            };
            buildClusterFactoryMock.list.resolves(sdBuildClusters);
            jobFactoryMock.get.resolves(jobMock);
            userFactoryMock.get.resolves(user);
            delete saveConfig.params.commit;
            saveConfig.params.buildClusterName = 'sd1';

            return factory
                .create({
                    username,
                    jobId,
                    eventId,
                    sha,
                    parentBuildId: 12345,
                    meta
                })
                .then(() => {
                    assert.callCount(stepFactoryMock.create, steps.length);
                    assert.calledWith(datastore.save, saveConfig);
                });
        });

        it('picks job build cluster even if pipeline level cluster annotations is passed in', () => {
            const user = { unsealToken: sinon.stub().resolves('foo') };

            jobMock = {
                permutations: [
                    {
                        annotations: {
                            'screwdriver.cd/buildCluster': 'iOS'
                        },
                        commands: [
                            { command: 'npm install', name: 'init' },
                            { command: 'npm test', name: 'test' }
                        ],
                        environment: { NODE_ENV: 'test', NODE_VERSION: '4' },
                        image: 'node:4'
                    }
                ],
                pipeline: Promise.resolve({
                    name: 'screwdriver/ui',
                    scmUri,
                    scmRepo,
                    scmContext,
                    annotations: {
                        'screwdriver.cd/buildCluster': 'sd1',
                        'screwdriver.cd/prChain': 'fork'
                    }
                }),
                name: 'main'
            };
            jobFactoryMock.get.resolves(jobMock);
            userFactoryMock.get.resolves(user);
            buildClusterFactoryMock.list.resolves(sdBuildClusters);
            delete saveConfig.params.commit;
            saveConfig.params.buildClusterName = 'iOS';

            return factory
                .create({
                    username,
                    jobId,
                    eventId,
                    sha,
                    parentBuildId: 12345,
                    meta
                })
                .then(() => {
                    assert.callCount(stepFactoryMock.create, steps.length);
                    assert.calledWith(datastore.save, saveConfig);
                });
        });

        it('throws err if the pipeline is unauthorized to use the build cluster', () => {
            const user = { unsealToken: sinon.stub().resolves('foo') };

            jobMock = {
                permutations: permutationsWithAnnotations,
                pipeline: Promise.resolve({ name: 'test/ui', scmUri, scmRepo, scmContext }),
                name: 'main'
            };
            jobFactoryMock.get.resolves(jobMock);
            userFactoryMock.get.resolves(user);
            buildClusterFactoryMock.list.resolves(sdBuildClusters);
            delete saveConfig.params.commit;
            saveConfig.params.buildClusterName = 'iOS';

            return factory
                .create({
                    username,
                    jobId,
                    eventId,
                    sha,
                    parentBuildId: 12345,
                    meta
                })
                .catch(err => {
                    assert.instanceOf(err, Error);
                    assert.strictEqual(err.message, 'This pipeline is not authorized to use this build cluster.');
                });
        });

        it('picks build cluster based on annotations passed in', () => {
            const user = { unsealToken: sinon.stub().resolves('foo') };

            jobMock = {
                permutations: permutationsWithAnnotations,
                pipeline: Promise.resolve({ name: 'screwdriver/ui', scmUri, scmRepo, scmContext }),
                name: 'main'
            };
            jobFactoryMock.get.resolves(jobMock);
            userFactoryMock.get.resolves(user);
            buildClusterFactoryMock.list.resolves(sdBuildClusters);
            delete saveConfig.params.commit;
            saveConfig.params.buildClusterName = 'iOS';

            return factory
                .create({
                    username,
                    jobId,
                    eventId,
                    sha,
                    parentBuildId: 12345,
                    meta
                })
                .then(() => {
                    assert.callCount(stepFactoryMock.create, steps.length);
                    assert.calledWith(datastore.save, saveConfig);
                });
        });

        it('throws err if the build cluster specified does not exist', () => {
            const user = { unsealToken: sinon.stub().resolves('foo') };

            jobMock = {
                permutations: permutationsWithAnnotations,
                pipeline: Promise.resolve({ name: 'screwdriver/ui', scmUri, scmRepo, scmContext }),
                name: 'main'
            };
            buildClusterFactoryMock.get.resolves(null);
            jobFactoryMock.get.resolves(jobMock);
            userFactoryMock.get.resolves(user);
            delete saveConfig.params.commit;

            return factory
                .create({
                    username,
                    jobId,
                    eventId,
                    sha,
                    parentBuildId: 12345,
                    meta
                })
                .catch(err => {
                    assert.instanceOf(err, Error);
                    assert.strictEqual(
                        err.message,
                        'Cluster specified in screwdriver.cd/buildCluster iOS ' +
                            `for scmContext ${scmContext} and group default does not exist.`
                    );
                });
        });

        it('sets build cluster as providerName.region.executor.accountId if provider config is present', () => {
            const user = { unsealToken: sinon.stub().resolves('foo') };
            const sdBuildClustersCopy = sdBuildClusters.slice();

            jobMock = {
                permutations: permutationsWithProvider,
                pipeline: Promise.resolve({ name: 'screwdriver-cd/ui', scmUri, scmRepo, scmContext }),
                name: 'main'
            };
            sdBuildClustersCopy.push({
                name: 'aws.us-west-2.sls.123456789012',
                scmContext,
                scmOrganizations: ['screwdriver-cd'],
                weightage: 100,
                isActive: true,
                managedByScrewdriver: false,
                group: 'aws.sls'
            });
            buildClusterFactoryMock.list.resolves(sdBuildClustersCopy);
            jobFactoryMock.get.resolves(jobMock);
            userFactoryMock.get.resolves(user);
            delete saveConfig.params.commit;
            saveConfig.params.buildClusterName = 'aws.us-west-2.sls.123456789012';

            return factory
                .create({
                    username,
                    jobId,
                    eventId,
                    sha,
                    parentBuildId: 12345,
                    meta
                })
                .then(() => {
                    assert.callCount(stepFactoryMock.create, steps.length);
                    assert.calledWith(datastore.save, saveConfig);
                });
        });
        it('throws err if pipeline scmOrganization is not allowed to use buildCluster', () => {
            const user = { unsealToken: sinon.stub().resolves('foo') };
            const sdBuildClustersCopy = sdBuildClusters.slice();

            jobMock = {
                permutations: permutationsWithProvider,
                pipeline: Promise.resolve({ name: 'screwdriver-cd/ui', scmUri, scmRepo, scmContext }),
                name: 'main'
            };
            sdBuildClustersCopy.push({
                name: 'aws.us-west-2.sls.123456789012',
                scmContext,
                scmOrganizations: ['some-cd'],
                weightage: 100,
                isActive: true,
                managedByScrewdriver: false,
                group: 'aws.sls'
            });
            buildClusterFactoryMock.list.resolves(sdBuildClustersCopy);
            jobFactoryMock.get.resolves(jobMock);
            userFactoryMock.get.resolves(user);
            delete saveConfig.params.commit;

            return factory
                .create({
                    username,
                    jobId,
                    eventId,
                    sha,
                    parentBuildId: 12345,
                    meta
                })
                .then(() => {
                    assert.fail('should not reach here');
                })
                .catch(err => {
                    assert.instanceOf(err, Error);
                    assert.strictEqual(err.message, 'This pipeline is not authorized to use this build cluster.');
                });
        });
        it('picks build cluster from default group if buildClusterName not provided', () => {
            const user = { unsealToken: sinon.stub().resolves('foo') };
            const sdBuildClustersCopy = sdBuildClusters.slice();

            sdBuildClustersCopy.push({
                name: 'aws.us-east-2',
                scmContext,
                scmOrganizations: ['screwdriver-cd'],
                weightage: 100,
                isActive: true,
                managedByScrewdriver: true,
                group: 'aws'
            });
            buildClusterFactoryMock.list.resolves(sdBuildClustersCopy);
            userFactoryMock.get.resolves(user);
            delete saveConfig.params.commit;
            saveConfig.params.buildClusterName = 'sd1';

            return factory
                .create({
                    username,
                    jobId,
                    eventId,
                    sha,
                    parentBuildId: 12345,
                    meta
                })
                .then(() => {
                    assert.callCount(stepFactoryMock.create, steps.length);
                    assert.calledWith(datastore.save, saveConfig);
                });
        });

        it('picks build cluster from aws group if buildClusterName is provided', () => {
            const user = { unsealToken: sinon.stub().resolves('foo') };
            const sdBuildClustersCopy = sdBuildClusters.slice();

            jobMock = {
                permutations: permutations3,
                pipeline: Promise.resolve({ name: 'screwdriver-cd/ui', scmUri, scmRepo, scmContext }),
                name: 'main'
            };
            sdBuildClustersCopy.push({
                name: 'aws.us-east-2',
                scmContext,
                scmOrganizations: ['screwdriver-cd'],
                weightage: 90,
                isActive: true,
                managedByScrewdriver: true,
                group: 'aws'
            });
            sdBuildClustersCopy.push({
                name: 'aws.us-east-1',
                scmContext,
                scmOrganizations: ['screwdriver-cd'],
                weightage: 10,
                isActive: true,
                managedByScrewdriver: true,
                group: 'aws'
            });
            buildClusterFactoryMock.list.resolves(sdBuildClustersCopy);
            jobFactoryMock.get.resolves(jobMock);
            userFactoryMock.get.resolves(user);
            delete saveConfig.params.commit;
            saveConfig.params.buildClusterName = 'aws.us-east-2';

            return factory
                .create({
                    username,
                    jobId,
                    eventId,
                    sha,
                    parentBuildId: 12345,
                    meta
                })
                .then(() => {
                    assert.callCount(stepFactoryMock.create, steps.length);
                    assert.calledWith(datastore.save, saveConfig);
                });
        });

        it('uses username as displayName if displayLabel is not set', () => {
            scmMock.getDisplayName.returns(null);
            saveConfig.params.cause = 'Started by user i_made_the_request';
            delete saveConfig.params.commit;
            delete saveConfig.params.parentBuildId;

            return factory
                .create({
                    username,
                    jobId,
                    eventId,
                    sha,
                    meta
                })
                .then(() => assert.calledWith(datastore.save, saveConfig));
        });

        it('creates a new build in the datastore, looking up sha', () => {
            const user = { unsealToken: sinon.stub().resolves('foo') };
            const causeMessage = `Started by ${displayName}`;

            userFactoryMock.get.resolves(user);

            return factory
                .create({
                    username,
                    causeMessage,
                    scmContext,
                    jobId,
                    eventId,
                    prRef,
                    parentBuildId: 12345,
                    meta
                })
                .then(model => {
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

            userFactoryMock.get.resolves(user);

            return factory
                .create({
                    username,
                    causeMessage,
                    scmContext,
                    jobId,
                    eventId,
                    prRef,
                    parentBuildId: 12345,
                    meta
                })
                .then(model => {
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

            userFactoryMock.get.resolves(user);
            saveConfig.params.status = 'CREATED';

            return factory
                .create({
                    username,
                    jobId,
                    eventId,
                    parentBuildId: 12345,
                    start: false,
                    meta
                })
                .then(() => {
                    assert.notCalled(startStub);
                    assert.calledWith(datastore.save, saveConfig);
                });
        });

        it('adds a teardown command if one exists', () => {
            const user = { unsealToken: sinon.stub().resolves('foo') };
            const teardown = {
                name: 'sd-teardown',
                command: 'echo "hello"'
            };

            userFactoryMock.get.resolves(user);
            bookendMock.getTeardownCommands.resolves([teardown]);
            bookendMock.getSetupCommands.resolves([]);

            const expectedSteps = steps.slice(0, 2).concat(steps.slice(3));

            expectedSteps.push(teardown);

            return factory.create({ username, jobId, eventId, prRef }).then(model => {
                assert.instanceOf(model, Build);
                sinon.assert.callOrder(
                    ...expectedSteps.map(step => stepFactoryMock.create.withArgs({ buildId: model.id, ...step }))
                );
            });
        });

        it('creates a new build in the datastore, without looking up sha', () => {
            delete saveConfig.params.commit;
            delete saveConfig.params.parentBuildId;

            return factory.create({ username, jobId, eventId, sha, meta }).then(model => {
                assert.calledWith(datastore.save, saveConfig);
                assert.instanceOf(model, Build);
                assert.calledOnce(jobFactory.getInstance);
                assert.calledWith(jobFactoryMock.get, jobId);
                assert.calledOnce(startStub);
            });
        });

        it('properly handles rejection due to missing job model', () => {
            jobFactoryMock.get.resolves(null);

            return factory.create({ username, jobId, eventId }).catch(err => {
                assert.instanceOf(err, Error);
                assert.strictEqual(err.message, 'Job does not exist');
            });
        });

        it('properly handles rejection due to missing user model', () => {
            userFactoryMock.get.resolves(null);

            return factory.create({ username, jobId, eventId }).catch(err => {
                assert.instanceOf(err, Error);
                assert.strictEqual(err.message, 'User does not exist');
            });
        });

        it('properly handles rejection due to missing pipeline model', () => {
            jobMock = {
                permutations,
                pipeline: Promise.resolve(null),
                name: 'main'
            };
            userFactoryMock.get.resolves({});
            jobFactoryMock.get.resolves(jobMock);

            return factory.create({ username, jobId, eventId }).catch(err => {
                assert.instanceOf(err, Error);
                assert.strictEqual(err.message, 'Pipeline does not exist');
            });
        });

        it('creates a new build with a custom docker registry', () => {
            factory = new BuildFactory({
                datastore,
                dockerRegistry: 'registry.com:1234',
                executor,
                scm: scmMock,
                uiUri,
                bookend: bookendMock
            });

            return factory.create({ username, jobId, eventId, sha }).then(model => {
                assert.strictEqual(model.container, 'registry.com:1234/library/node:4');
            });
        });

        it('combines environment from input config', () => {
            const user = { unsealToken: sinon.stub().resolves('foo') };

            userFactoryMock.get.resolves(user);
            saveConfig.params.status = 'CREATED';

            return factory
                .create({
                    username,
                    jobId,
                    eventId,
                    parentBuildId: 12345,
                    start: false,
                    environment: { EXTRA: true },
                    meta
                })
                .then(() => {
                    assert.notCalled(startStub);
                    saveConfig.params.environment = {
                        CLUSTER_FOO: 'bar',
                        EXTRA: true,
                        NODE_ENV: 'test',
                        NODE_VERSION: '4'
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

            jobMock = {
                permutations,
                pipeline: Promise.resolve(pipelineMock),
                name: 'main'
            };
            userFactoryMock.get.resolves({});
            jobFactoryMock.get.resolves(jobMock);

            return factory
                .create({
                    username,
                    jobId,
                    eventId,
                    sha,
                    configPipelineSha,
                    meta
                })
                .then(() => {
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

        it('passes buildKeyName from provider config to the bookend config', () => {
            const bookendKey = {
                cluster: 'aws',
                env: 'us-west-2',
                executor: 'sls'
            };
            const pipelineMock = {
                name: 'screwdriver-cd/ui',
                scmUri,
                scmRepo,
                scmContext,
                configPipelineId: 2,
                configPipeline: Promise.resolve({ spooky: 'ghost' })
            };
            const sdBuildClustersCopy = sdBuildClusters.slice();

            jobMock = {
                permutations: permutationsWithProvider,
                pipeline: Promise.resolve(pipelineMock),
                name: 'main'
            };
            sdBuildClustersCopy.push({
                name: 'aws.us-west-2.sls.123456789012',
                scmContext,
                scmOrganizations: ['screwdriver-cd'],
                weightage: 100,
                isActive: true,
                managedByScrewdriver: false,
                group: 'aws.sls'
            });
            buildClusterFactoryMock.list.resolves(sdBuildClustersCopy);
            userFactoryMock.get.resolves({});
            jobFactoryMock.get.resolves(jobMock);
            delete saveConfig.params.commit;
            saveConfig.params.buildClusterName = 'aws.us-west-2.sls.123456789012';

            return factory
                .create({
                    username,
                    jobId,
                    eventId,
                    sha,
                    configPipelineSha,
                    meta
                })
                .then(() => {
                    assert.calledWith(
                        bookendMock.getSetupCommands,
                        {
                            pipeline: pipelineMock,
                            job: jobMock,
                            build: sinon.match.object,
                            configPipeline: { spooky: 'ghost' },
                            configPipelineSha
                        },
                        bookendKey
                    );
                    assert.calledWith(
                        bookendMock.getTeardownCommands,
                        {
                            pipeline: pipelineMock,
                            job: jobMock,
                            build: sinon.match.object,
                            configPipeline: { spooky: 'ghost' },
                            configPipelineSha
                        },
                        bookendKey
                    );
                });
        });
        it('passes buildKeyName from buildClusterName and executorName to the bookend config', () => {
            const bookendKey = {
                cluster: 'aws',
                env: 'us-west-2',
                executor: 'k8s-arm64'
            };
            const pMock = { name: 'screwdriver/ui', scmUri, scmRepo, scmContext };
            const user = { unsealToken: sinon.stub().resolves('foo') };

            jobMock = {
                permutations: permutations1,
                pipeline: Promise.resolve(pMock),
                name: 'main'
            };
            jobFactoryMock.get.resolves(jobMock);
            userFactoryMock.get.resolves(user);
            buildClusterFactoryMock.list.resolves(sdBuildClusters);
            delete saveConfig.params.commit;
            saveConfig.params.buildClusterName = 'aws.us-west-2';

            return factory
                .create({
                    username,
                    jobId,
                    eventId,
                    sha,
                    parentBuildId: 12345,
                    meta
                })
                .then(() => {
                    assert.callCount(stepFactoryMock.create, steps.length);
                    assert.calledWith(datastore.save, saveConfig);
                    assert.calledWith(
                        bookendMock.getSetupCommands,
                        {
                            pipeline: pMock,
                            job: jobMock,
                            build: sinon.match.object
                        },
                        bookendKey
                    );
                    assert.calledWith(
                        bookendMock.getTeardownCommands,
                        {
                            pipeline: pMock,
                            job: jobMock,
                            build: sinon.match.object
                        },
                        bookendKey
                    );
                });
        });
        it('passes buildKeyName from buildClusterName and default for executor to the bookend config', () => {
            const bookendKey = {
                cluster: 'aws',
                env: 'us-west-2',
                executor: 'default'
            };
            const pMock = { name: 'screwdriver/ui', scmUri, scmRepo, scmContext };

            jobMock = {
                permutations: permutations2,
                pipeline: Promise.resolve(pMock),
                name: 'main'
            };

            const user = { unsealToken: sinon.stub().resolves('foo') };

            jobFactoryMock.get.resolves(jobMock);
            userFactoryMock.get.resolves(user);
            buildClusterFactoryMock.list.resolves(sdBuildClusters);
            delete saveConfig.params.commit;
            saveConfig.params.buildClusterName = 'aws.us-west-2';

            return factory
                .create({
                    username,
                    jobId,
                    eventId,
                    sha,
                    parentBuildId: 12345,
                    meta
                })
                .then(() => {
                    assert.callCount(stepFactoryMock.create, steps.length);
                    assert.calledWith(datastore.save, saveConfig);
                    assert.calledWith(
                        bookendMock.getSetupCommands,
                        {
                            pipeline: pMock,
                            job: jobMock,
                            build: sinon.match.object
                        },
                        bookendKey
                    );
                    assert.calledWith(
                        bookendMock.getTeardownCommands,
                        {
                            pipeline: pMock,
                            job: jobMock,
                            build: sinon.match.object
                        },
                        bookendKey
                    );
                });
        });
        it('creates stageBuild if current job is stage setup', () => {
            const user = { unsealToken: sinon.stub().resolves('foo') };

            jobMock = {
                permutations,
                pipeline: Promise.resolve({ id: 555, scmUri, scmRepo, scmContext }),
                name: 'stage@deploy:setup'
            };
            const stageMock = {
                id: 888
            };
            const stageConfig = { pipelineId: 555, name: 'deploy' };
            const stageBuildConfig = { stageId: stageMock.id, eventId: 123456, status: 'CREATED' };

            jobFactoryMock.get.resolves(jobMock);
            userFactoryMock.get.resolves(user);
            saveConfig.params.status = 'CREATED';
            stageFactoryMock.get.resolves(stageMock);

            return factory
                .create({
                    username,
                    jobId,
                    eventId,
                    parentBuildId: 12345,
                    start: false,
                    meta
                })
                .then(() => {
                    assert.notCalled(startStub);
                    assert.calledWith(datastore.save, saveConfig);
                    assert.calledWith(stageFactoryMock.get, stageConfig);
                    assert.calledWith(stageBuildFactoryMock.create, stageBuildConfig);
                });
        });
    });

    describe('list', () => {
        it('should list builds sorted by createTime', () => {
            datastore.scan.resolves([]);

            return factory.list({}).then(() => {
                assert.calledWithMatch(datastore.scan, { sortBy: 'createTime' });
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
            assert.throw(BuildFactory.getInstance, Error, 'No executor provided to BuildFactory');

            assert.throw(
                () => {
                    BuildFactory.getInstance({ executor, scm: {}, uiUri, bookend: bookendMock });
                },
                Error,
                'No datastore provided to BuildFactory'
            );

            assert.throw(
                () => {
                    BuildFactory.getInstance({ executor, datastore, uiUri, bookend: bookendMock });
                },
                Error,
                'No scm plugin provided to BuildFactory'
            );

            assert.throw(
                () => {
                    BuildFactory.getInstance({ executor, scm: {}, datastore, bookend: bookendMock });
                },
                Error,
                'No uiUri provided to BuildFactory'
            );

            assert.throw(
                () => {
                    BuildFactory.getInstance({ executor, scm: {}, datastore, uiUri });
                },
                Error,
                'No bookend plugin provided to BuildFactory'
            );
        });
    });

    describe('getBuildStatuses', () => {
        let config;
        let expected;
        let returnValue;
        let queryConfig;

        beforeEach(() => {
            sinon.stub(BuildFactory.prototype, 'query').returns();

            config = {
                jobIds: [1, 2, 3, 4],
                offset: 1,
                numBuilds: 5
            };

            returnValue = [
                [
                    {
                        jobId: 1,
                        jobName: 'name',
                        status: 'SUCCESS',
                        id: 1
                    },
                    {
                        jobId: 1,
                        jobName: 'name',
                        status: 'ABORTED',
                        id: 2
                    },
                    {
                        jobId: 2,
                        jobName: 'name',
                        status: 'SUCCESS',
                        id: 3
                    },
                    {
                        jobId: 3,
                        jobName: 'name',
                        status: 'SUCCESS',
                        id: 4
                    },
                    {
                        jobId: 2,
                        jobName: 'name',
                        status: 'SUCCESS',
                        id: 5
                    },
                    {
                        jobId: 1,
                        jobName: 'name',
                        status: 'SUCCESS',
                        id: 6
                    }
                ],
                []
            ];

            expected = [
                {
                    jobId: 1,
                    builds: [
                        {
                            jobId: 1,
                            jobName: 'name',
                            status: 'SUCCESS',
                            id: 1
                        },
                        {
                            jobId: 1,
                            jobName: 'name',
                            status: 'ABORTED',
                            id: 2
                        },
                        {
                            jobId: 1,
                            jobName: 'name',
                            status: 'SUCCESS',
                            id: 6
                        }
                    ]
                },
                {
                    jobId: 2,
                    builds: [
                        {
                            jobId: 2,
                            jobName: 'name',
                            status: 'SUCCESS',
                            id: 3
                        },
                        {
                            jobId: 2,
                            jobName: 'name',
                            status: 'SUCCESS',
                            id: 5
                        }
                    ]
                },
                {
                    jobId: 3,
                    builds: [
                        {
                            jobId: 3,
                            jobName: 'name',
                            status: 'SUCCESS',
                            id: 4
                        }
                    ]
                },
                {
                    jobId: 4,
                    builds: []
                }
            ];

            queryConfig = {
                queries: getQueries('', STATUS_QUERY),
                replacements: {
                    jobIds: config.jobIds,
                    offset: 1,
                    maxRank: 6
                },
                rawResponse: true,
                table: 'builds'
            };
        });

        it('return build statuses for jobs', () => {
            datastore.query.resolves(returnValue);

            return factory.getBuildStatuses(config).then(buildStatuses => {
                assert.calledWith(datastore.query, queryConfig);

                let i = 0;

                buildStatuses.forEach(b => {
                    let j = 0;

                    assert.deepEqual(b.jobId, expected[i].jobId);
                    assert.deepEqual(b.builds.length, expected[i].builds.length);

                    b.builds.forEach(s => {
                        assert.deepEqual(s, expected[i].builds[j]);

                        j += 1;
                    });

                    i += 1;
                });
            });
        });

        it('queries with default config params', () => {
            datastore.query.resolves([[], []]);

            delete config.numBuilds;
            delete config.offset;

            queryConfig.replacements.offset = 0;
            queryConfig.replacements.maxRank = 1;

            return factory.getBuildStatuses(config).then(() => {
                assert.calledWith(datastore.query, queryConfig);
            });
        });
    });

    describe('getLatestBuilds', () => {
        let config;
        let returnValue;
        let queryConfig;

        beforeEach(() => {
            sinon.stub(BuildFactory.prototype, 'query').returns();

            config = {
                groupEventId: '12345'
            };

            returnValue = [
                {
                    jobId: 1,
                    status: 'SUCCESS',
                    id: 1
                },
                {
                    jobId: 1,
                    status: 'ABORTED',
                    id: 2
                }
            ];

            queryConfig = {
                queries: getQueries('', LATEST_BUILD_QUERY),
                replacements: {
                    groupEventId: config.groupEventId
                },
                rawResponse: false,
                table: 'builds'
            };
        });

        it('returns latest builds for groupEventId', () => {
            datastore.query.resolves(returnValue);

            return factory.getLatestBuilds(config).then(latestBuilds => {
                assert.calledWith(datastore.query, queryConfig);
                latestBuilds.forEach(b => {
                    assert.instanceOf(b, Build);
                });
            });
        });
    });
});
