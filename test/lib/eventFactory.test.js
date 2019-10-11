'use strict';

const assert = require('chai').assert;
const sinon = require('sinon');
const mockery = require('mockery');
const rewire = require('rewire');
const PARSED_YAML = require('../data/parserWithWorkflowGraph');

sinon.assert.expose(assert, { prefix: '' });

describe('Event Factory', () => {
    const dateNow = 1234567;
    const nowTime = (new Date(dateNow)).toISOString();
    let EventFactory;
    let datastore;
    let eventFactory;
    let pipelineFactoryMock;
    let buildFactoryMock;
    let jobFactoryMock;
    let pipelineMock;
    let scm;
    let Event;

    before(() => {
        mockery.enable({
            useCleanCache: true,
            warnOnUnregistered: false
        });
    });

    beforeEach(() => {
        datastore = {
            save: sinon.stub()
        };
        pipelineFactoryMock = {
            get: sinon.stub(),
            scm: {
                getCommitSha: sinon.stub().resolves('configpipelinesha')
            }
        };
        buildFactoryMock = {
            create: sinon.stub()
        };
        jobFactoryMock = {
            create: sinon.stub(),
            list: sinon.stub()
        };
        scm = {
            decorateAuthor: sinon.stub(),
            decorateCommit: sinon.stub(),
            getDisplayName: sinon.stub()
        };

        mockery.registerMock('./pipelineFactory', {
            getInstance: sinon.stub().returns(pipelineFactoryMock)
        });
        mockery.registerMock('./jobFactory', {
            getInstance: sinon.stub().returns(jobFactoryMock)
        });
        mockery.registerMock('./buildFactory', {
            getInstance: sinon.stub().returns(buildFactoryMock)
        });

        // eslint-disable-next-line global-require
        Event = require('../../lib/event');
        // eslint-disable-next-line global-require
        EventFactory = require('../../lib/eventFactory');

        eventFactory = new EventFactory({ datastore, scm });
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
        it('should return an Event', () => {
            const model = eventFactory.createClass({
                id: 'abc123'
            });

            assert.instanceOf(model, Event);
        });
    });

    describe('create', () => {
        let sandbox;

        beforeEach(() => {
            sandbox = sinon.createSandbox({
                useFakeTimers: false
            });
            sandbox.useFakeTimers(dateNow);
        });

        afterEach(() => {
            sandbox.restore();
        });

        const pipelineId = 8765;
        const sha = 'ccc49349d3cffbd12ea9e3d41521480b4aa5de5f';
        const displayName = 'github';
        // const lastEventId = 'xzy1234';
        const scmContext = 'github:github.com';
        const creator = {
            avatar: 'https://avatars.githubusercontent.com/u/2042?v=3',
            name: 'St John',
            url: 'https://github.com/stjohn',
            username: 'stjohn'
        };
        const commit = {
            author: {
                avatar: 'https://avatars.githubusercontent.com/u/1234567?v=3',
                name: 'Batman',
                url: 'https://internal-ghe.mycompany.com/imbatman',
                username: 'imbatman'
            },
            committer: {
                avatar: 'https://avatars.githubusercontent.com/u/1234567?v=3',
                name: 'Batman',
                url: 'https://internal-ghe.mycompany.com/imbatman',
                username: 'imbatman'
            },
            message: 'some commit message that is here',
            url: 'https://link.to/commitDiff'
        };
        let config;
        let expected;
        let jobsMock;
        let syncedPipelineMock;
        let afterSyncedPRPipelineMock;

        beforeEach(() => {
            config = {
                pipelineId,
                sha,
                username: 'stjohn',
                parentBuildId: 12345,
                scmContext,
                prInfo: {
                    url: 'https://github.com/screwdriver-cd/screwdriver/pull/1063',
                    ref: 'branch'
                }
            };
            expected = {
                pipelineId,
                sha,
                type: 'pipeline',
                workflowGraph: {
                    nodes: [
                        { name: '~pr' },
                        { name: '~commit' },
                        { name: 'main' },
                        { name: 'disabledJob' },
                        { name: 'publish' },
                        { name: '~sd@123:main' },
                        { name: '~commit:branch' },
                        { name: '~commit:/^.*$/' },
                        { name: '~pr:branch' },
                        { name: '~pr:/^.*$/' }
                    ],
                    edges: [
                        { src: '~sd@123:main', dest: 'main' },
                        { src: '~pr', dest: 'main' },
                        { src: '~commit', dest: 'main' },
                        { src: 'main', dest: 'disabledJob' },
                        { src: '~pr', dest: 'publish' },
                        { src: '~commit', dest: 'only-commit' },
                        { src: '~commit:branch', dest: 'main' },
                        { src: '~commit:branch', dest: 'commit-branch' },
                        { src: '~commit:/^.*$/', dest: 'commit-wild' },
                        { src: '~pr:branch', dest: 'main' },
                        { src: '~pr:branch', dest: 'pr-branch' },
                        { src: '~pr:/^.*$/', dest: 'pr-wild' }
                    ]
                },
                causeMessage: 'Started by github:stjohn',
                createTime: nowTime,
                creator,
                commit,
                meta: {}
            };

            syncedPipelineMock = {
                id: pipelineId,
                scmUri: 'github.com:1234:branch',
                scmContext,
                token: Promise.resolve('foo'),
                lastEventId: null,
                workflowGraph: {
                    nodes: [
                        { name: '~pr' },
                        { name: '~commit' },
                        { name: 'main' },
                        { name: 'disabledJob' },
                        { name: 'publish' },
                        { name: '~sd@123:main' },
                        { name: '~commit:branch' },
                        { name: '~commit:/^.*$/' },
                        { name: '~pr:branch' },
                        { name: '~pr:/^.*$/' }
                    ],
                    edges: [
                        { src: '~sd@123:main', dest: 'main' },
                        { src: '~pr', dest: 'main' },
                        { src: '~commit', dest: 'main' },
                        { src: 'main', dest: 'disabledJob' },
                        { src: '~pr', dest: 'publish' },
                        { src: '~commit', dest: 'only-commit' },
                        { src: '~commit:branch', dest: 'main' },
                        { src: '~commit:branch', dest: 'commit-branch' },
                        { src: '~commit:/^.*$/', dest: 'commit-wild' },
                        { src: '~pr:branch', dest: 'main' },
                        { src: '~pr:branch', dest: 'pr-branch' },
                        { src: '~pr:/^.*$/', dest: 'pr-wild' }
                    ]
                },
                getConfiguration: sinon.stub().resolves(PARSED_YAML),
                update: sinon.stub().resolves(syncedPipelineMock),
                jobs: Promise.resolve([]),
                syncPRs: sinon.stub().resolves(syncedPipelineMock),
                getJobs: sinon.stub().resolves([]),
                branch: Promise.resolve('branch')
            };

            afterSyncedPRPipelineMock = Object.assign({}, syncedPipelineMock);
            syncedPipelineMock.syncPR = sinon.stub().resolves(afterSyncedPRPipelineMock);

            pipelineMock = {
                sync: sinon.stub().resolves(syncedPipelineMock),
                update: sinon.stub().resolves(syncedPipelineMock),
                branch: sinon.stub().resolves('branch'),
                syncPRs: sinon.stub().resolves([])
            };

            pipelineFactoryMock.get.withArgs(pipelineId).resolves(pipelineMock);
            scm.decorateAuthor.resolves(creator);
            scm.decorateCommit.resolves(commit);
            scm.getDisplayName.returns(displayName);
            datastore.save.resolves({ id: 'xzy1234' });
        });

        describe('with new workflow', () => {
            beforeEach(() => {
                jobsMock = [{
                    id: 1,
                    pipelineId: 8765,
                    name: 'main',
                    permutations: [{
                        requires: ['~commit', '~pr', '~sd@123:main', '~commit:branch', '~pr:branch']
                    }],
                    state: 'ENABLED'
                }, {
                    id: 2,
                    pipelineId: 8765,
                    name: 'disabledjob',
                    permutations: [{
                        requires: ['main']
                    }],
                    state: 'DISABLED'
                }, {
                    id: 4,
                    pipelineId: 8765,
                    name: 'publish',
                    permutations: [{
                        requires: ['~pr']
                    }],
                    state: 'ENABLED'
                }, {
                    id: 5,
                    pipelineId: 8765,
                    name: 'commit-branch',
                    permutations: [{
                        requires: ['~commit:branch']
                    }],
                    state: 'ENABLED'
                }, {
                    id: 6,
                    pipelineId: 8765,
                    name: 'only-commit',
                    permutations: [{
                        requires: ['~commit']
                    }],
                    state: 'ENABLED'
                }, {
                    id: 7,
                    pipelineId: 8765,
                    name: 'commit-wild',
                    permutations: [{
                        requires: ['~commit:/^.*$/']
                    }],
                    state: 'ENABLED'
                }, {
                    id: 8,
                    pipelineId: 8765,
                    name: 'pr-branch',
                    permutations: [{
                        requires: ['~pr:branch']
                    }],
                    state: 'ENABLED'
                }, {
                    id: 9,
                    pipelineId: 8765,
                    name: 'pr-wild',
                    permutations: [{
                        requires: ['~pr:/^.*$/']
                    }],
                    state: 'ENABLED'
                }, {
                    id: 10,
                    pipelineId: 8765,
                    name: 'PR-1:main',
                    permutations: [{
                        requires: ['~pr']
                    }],
                    state: 'ENABLED'
                }];

                syncedPipelineMock.getJobs = sinon.stub().resolves(jobsMock);
                buildFactoryMock.create.resolves('a build object');
            });

            it('should call syncPRs when chainPR changed false to true', () => {
                pipelineFactoryMock.get.withArgs(pipelineId).resolves(pipelineMock);
                pipelineMock.chainPR = false;
                syncedPipelineMock.chainPR = true;

                return eventFactory.create(config).then(() => {
                    assert.calledOnce(syncedPipelineMock.syncPRs);
                });
            });

            it('should call syncPRs when chainPR changed undefined to true', () => {
                pipelineFactoryMock.get.withArgs(pipelineId).resolves(pipelineMock);
                syncedPipelineMock.chainPR = true;

                return eventFactory.create(config).then(() => {
                    assert.calledOnce(syncedPipelineMock.syncPRs);
                });
            });

            it('should not call syncPRs when chainPR is not change', () => {
                pipelineFactoryMock.get.withArgs(pipelineId).resolves(pipelineMock);
                pipelineMock.chainPR = true;
                syncedPipelineMock.chainPR = true;

                return eventFactory.create(config).then(() => {
                    assert.notCalled(syncedPipelineMock.syncPRs);
                });
            });

            it('should start existing unarchived pr jobs without creating duplicates', () => {
                jobsMock = [{
                    id: 1,
                    pipelineId: 8765,
                    name: 'main',
                    permutations: [{
                        requires: ['~pr']
                    }],
                    state: 'ENABLED'
                }, {
                    id: 5,
                    pipelineId: 8765,
                    name: 'PR-1:main',
                    permutations: [{
                        requires: ['~pr']
                    }],
                    state: 'ENABLED'
                }, {
                    id: 6,
                    pipelineId: 8765,
                    name: 'PR-1:outdated',
                    permutations: [{
                        requires: ['~pr']
                    }],
                    state: 'ENABLED',
                    archived: true
                },
                {
                    id: 7,
                    pipelineId: 8765,
                    name: 'PR-2:main',
                    permutations: [{
                        requires: ['~pr']
                    }],
                    state: 'ENABLED'
                },
                {
                    id: 3,
                    name: 'publish',
                    permutations: [{
                        requires: ['~pr']
                    }],
                    state: 'ENABLED'
                },
                {
                    id: 6,
                    name: 'PR-1:publish',
                    permutations: [{
                        requires: ['~pr']
                    }],
                    state: 'DISABLED'
                }];

                afterSyncedPRPipelineMock.getJobs.resolves(jobsMock);
                afterSyncedPRPipelineMock.update = sinon.stub().resolves(afterSyncedPRPipelineMock);
                syncedPipelineMock.update = sinon.stub().resolves(syncedPipelineMock);

                config.startFrom = '~pr';
                config.prRef = 'branch';
                config.prNum = 1;
                config.prTitle = 'Update the README with new information';
                config.webhooks = true;

                return eventFactory.create(config).then((model) => {
                    assert.instanceOf(model, Event);
                    assert.notCalled(jobFactoryMock.create);
                    assert.calledOnce(buildFactoryMock.create);
                    assert.calledWith(buildFactoryMock.create.firstCall, sinon.match({
                        parentBuildId: 12345,
                        eventId: model.id,
                        jobId: 5,
                        prRef: 'branch',
                        prTitle: 'Update the README with new information',
                        meta: {
                            commit: {
                                ...commit,
                                changedFiles: ''
                            }
                        }
                    }));
                    assert.calledOnce(syncedPipelineMock.syncPR);
                    assert.calledWith(syncedPipelineMock.syncPR.firstCall, 1);
                });
            });

            // eslint-disable-next-line max-len
            it('should start existing unarchived branch pr jobs without creating duplicates', () => {
                jobsMock = [{
                    id: 1,
                    pipelineId: 8765,
                    name: 'main',
                    permutations: [{
                        requires: ['~pr:branch']
                    }],
                    state: 'ENABLED'
                }, {
                    id: 5,
                    pipelineId: 8765,
                    name: 'PR-1:main',
                    permutations: [{
                        requires: ['~pr:branch']
                    }],
                    state: 'ENABLED'
                }, {
                    id: 6,
                    pipelineId: 8765,
                    name: 'PR-1:outdated',
                    permutations: [{
                        requires: ['~pr:branch']
                    }],
                    state: 'ENABLED',
                    archived: true
                },
                {
                    id: 7,
                    pipelineId: 8765,
                    name: 'PR-2:main',
                    permutations: [{
                        requires: ['~pr:branch']
                    }],
                    state: 'ENABLED'
                },
                {
                    id: 8,
                    pipelineId: 8765,
                    name: 'pr-branch',
                    permutations: [{
                        requires: ['~pr:branch']
                    }],
                    state: 'ENABLED'
                },
                {
                    id: 9,
                    pipelineId: 8765,
                    name: 'PR-1:pr-branch',
                    permutations: [{
                        requires: ['~pr:branch']
                    }],
                    state: 'DISABLED'
                }
                ];

                afterSyncedPRPipelineMock.getJobs.resolves(jobsMock);
                afterSyncedPRPipelineMock.getConfiguration = sinon.stub().resolves({
                    jobs: jobsMock,
                    workflowGraph: syncedPipelineMock.workflowGraph
                });
                afterSyncedPRPipelineMock.update = sinon.stub().resolves(afterSyncedPRPipelineMock);
                syncedPipelineMock.update = sinon.stub().resolves(syncedPipelineMock);

                config.startFrom = '~pr:branch';
                config.prRef = 'branch-pr';
                config.prNum = 1;
                config.prInfo.ref = 'branch-pr';
                config.prTitle = 'Update the README with new information';
                config.webhooks = true;

                return eventFactory.create(config).then((model) => {
                    assert.instanceOf(model, Event);
                    assert.notCalled(jobFactoryMock.create);
                    assert.calledOnce(buildFactoryMock.create);
                    assert.calledWith(buildFactoryMock.create.firstCall, sinon.match({
                        parentBuildId: 12345,
                        eventId: model.id,
                        jobId: 5,
                        prRef: 'branch-pr',
                        prTitle: 'Update the README with new information',
                        meta: {
                            commit: {
                                ...commit,
                                changedFiles: ''
                            }
                        }
                    }));
                    assert.calledOnce(syncedPipelineMock.syncPR);
                    assert.calledWith(syncedPipelineMock.syncPR.firstCall, 1);
                });
            });

            // eslint-disable-next-line max-len
            it('should start existing pipeline\'s branch pr jobs without creating duplicates', () => {
                jobsMock = [{
                    id: 1,
                    pipelineId: 8765,
                    name: 'PR-1:main',
                    permutations: [{
                        requires: ['~pr', '~pr:branch']
                    }],
                    state: 'ENABLED'
                }, {
                    id: 2,
                    pipelineId: 8765,
                    name: 'PR-1:pr-branch',
                    permutations: [{
                        requires: ['~pr:branch']
                    }],
                    state: 'ENABLED'
                }
                ];

                afterSyncedPRPipelineMock.getJobs.resolves(jobsMock);
                afterSyncedPRPipelineMock.getConfiguration = sinon.stub().resolves({
                    jobs: jobsMock,
                    workflowGraph: syncedPipelineMock.workflowGraph
                });
                afterSyncedPRPipelineMock.update = sinon.stub().resolves(afterSyncedPRPipelineMock);
                syncedPipelineMock.update = sinon.stub().resolves(syncedPipelineMock);

                config.startFrom = '~pr';
                config.prRef = 'branch-pr';
                config.prNum = 1;
                config.prInfo.ref = 'branch-pr';
                config.prTitle = 'Update the README with new information';
                config.webhooks = true;

                return eventFactory.create(config).then((model) => {
                    assert.instanceOf(model, Event);
                    assert.notCalled(jobFactoryMock.create);
                    assert.calledTwice(buildFactoryMock.create);
                    assert.calledWith(buildFactoryMock.create.firstCall, sinon.match({
                        parentBuildId: 12345,
                        eventId: model.id,
                        jobId: 1,
                        prRef: 'branch-pr',
                        prTitle: 'Update the README with new information',
                        meta: {
                            commit: {
                                ...commit,
                                changedFiles: ''
                            }
                        }
                    }));
                    assert.calledWith(buildFactoryMock.create.secondCall, sinon.match({
                        parentBuildId: 12345,
                        eventId: model.id,
                        jobId: 2,
                        prRef: 'branch-pr',
                        prTitle: 'Update the README with new information',
                        meta: {
                            commit: {
                                ...commit,
                                changedFiles: ''
                            }
                        }
                    }));
                    assert.calledOnce(syncedPipelineMock.syncPR);
                    assert.calledWith(syncedPipelineMock.syncPR.firstCall, 1);
                });
            });

            it('should skip creating builds', () => {
                config.startFrom = '~commit';
                config.webhooks = true;
                config.skipMessage = 'Skipping due to the commit message: [skip ci]';

                return eventFactory.create(config).then((model) => {
                    assert.instanceOf(model, Event);
                    assert.notCalled(jobFactoryMock.create);
                    assert.notCalled(buildFactoryMock.create);
                    assert.calledOnce(pipelineMock.sync);
                    assert.calledOnce(syncedPipelineMock.update);
                    assert.notCalled(syncedPipelineMock.syncPR);
                });
            });

            it('should create commit builds', () => {
                config.startFrom = '~commit';
                config.webhooks = true;
                syncedPipelineMock.id = 123566;

                return eventFactory.create(config).then((model) => {
                    assert.instanceOf(model, Event);
                    assert.notCalled(jobFactoryMock.create);
                    assert.calledWith(buildFactoryMock.create, sinon.match({
                        parentBuildId: 12345,
                        eventId: model.id,
                        jobId: 1
                    }));
                    assert.calledOnce(pipelineMock.sync);
                    assert.notCalled(syncedPipelineMock.syncPR);
                });
            });

            it('should create triggered builds', () => {
                config.startFrom = '~sd@123:main';

                return eventFactory.create(config).then((model) => {
                    assert.instanceOf(model, Event);
                    assert.notCalled(jobFactoryMock.create);
                    assert.calledWith(buildFactoryMock.create, sinon.match({
                        parentBuildId: 12345,
                        eventId: model.id,
                        jobId: 1
                    }));
                    assert.calledOnce(pipelineMock.sync);
                    assert.notCalled(syncedPipelineMock.syncPR);
                });
            });

            it('should create ~commit and ~commit:branch triggered builds', () => {
                config.startFrom = '~commit';

                return eventFactory.create(config).then((model) => {
                    assert.instanceOf(model, Event);
                    assert.calledWith(buildFactoryMock.create, sinon.match({
                        parentBuildId: 12345,
                        eventId: model.id,
                        jobId: 1
                    }));
                    assert.calledWith(buildFactoryMock.create, sinon.match({
                        parentBuildId: 12345,
                        eventId: model.id,
                        jobId: 5
                    }));
                    assert.calledWith(buildFactoryMock.create, sinon.match({
                        parentBuildId: 12345,
                        eventId: model.id,
                        jobId: 6
                    }));
                    assert.calledWith(buildFactoryMock.create, sinon.match({
                        parentBuildId: 12345,
                        eventId: model.id,
                        jobId: 7
                    }));
                });
            });

            it('should create ~commit:branch triggered builds', () => {
                config.startFrom = '~commit:branch';

                return eventFactory.create(config).then((model) => {
                    assert.instanceOf(model, Event);
                    assert.calledWith(buildFactoryMock.create, sinon.match({
                        parentBuildId: 12345,
                        eventId: model.id,
                        jobId: 1
                    }));
                    assert.calledWith(buildFactoryMock.create, sinon.match({
                        parentBuildId: 12345,
                        eventId: model.id,
                        jobId: 5
                    }));
                    assert.neverCalledWith(buildFactoryMock.create, sinon.match({
                        jobId: 6
                    }));
                    assert.calledWith(buildFactoryMock.create, sinon.match({
                        parentBuildId: 12345,
                        eventId: model.id,
                        jobId: 7
                    }));
                });
            });

            it('should create build if startFrom is a jobName', () => {
                config.startFrom = 'main';

                return eventFactory.create(config).then((model) => {
                    assert.instanceOf(model, Event);
                    assert.notCalled(jobFactoryMock.create);
                    assert.notCalled(syncedPipelineMock.syncPR);
                    assert.calledOnce(pipelineMock.sync);
                    assert.calledOnce(buildFactoryMock.create);
                    assert.calledWith(buildFactoryMock.create, sinon.match({
                        parentBuildId: 12345,
                        eventId: model.id,
                        jobId: 1
                    }));
                });
            });

            it('should create build if startFrom is ~release', () => {
                const releaseWorkflow = {
                    nodes: [
                        { name: '~pr' },
                        { name: '~commit' },
                        { name: '~release' },
                        { name: 'release' }
                    ],
                    edges: [
                        { src: '~release', dest: 'release' }
                    ]
                };

                jobsMock = [{
                    id: 1,
                    pipelineId: 8765,
                    name: 'release',
                    permutations: [{
                        requires: ['~release']
                    }],
                    state: 'ENABLED'
                }];

                syncedPipelineMock.workflowGraph = releaseWorkflow;
                syncedPipelineMock.getJobs = sinon.stub().resolves(jobsMock);
                syncedPipelineMock.update = sinon.stub().resolves({
                    getJobs: sinon.stub().resolves(jobsMock),
                    branch: Promise.resolve('branch')
                });
                config.startFrom = '~release';

                return eventFactory.create(config).then((model) => {
                    assert.instanceOf(model, Event);
                    assert.notCalled(jobFactoryMock.create);
                    assert.notCalled(syncedPipelineMock.syncPR);
                    assert.calledOnce(pipelineMock.sync);
                    assert.calledOnce(buildFactoryMock.create);
                    assert.calledWith(buildFactoryMock.create, sinon.match({
                        parentBuildId: 12345,
                        eventId: model.id,
                        jobId: 1
                    }));
                });
            });

            it('should create build if startFrom is ~tag', () => {
                const tagWorkflow = {
                    nodes: [
                        { name: '~pr' },
                        { name: '~commit' },
                        { name: '~tag' },
                        { name: 'tag' }
                    ],
                    edges: [
                        { src: '~tag', dest: 'tag' }
                    ]
                };

                jobsMock = [{
                    id: 1,
                    pipelineId: 8765,
                    name: 'tag',
                    permutations: [{
                        requires: ['~tag']
                    }],
                    state: 'ENABLED'
                }];

                syncedPipelineMock.workflowGraph = tagWorkflow;
                syncedPipelineMock.getJobs = sinon.stub().resolves(jobsMock);
                syncedPipelineMock.update = sinon.stub().resolves({
                    getJobs: sinon.stub().resolves(jobsMock),
                    branch: Promise.resolve('branch')
                });
                config.startFrom = '~tag';

                return eventFactory.create(config).then((model) => {
                    assert.instanceOf(model, Event);
                    assert.notCalled(jobFactoryMock.create);
                    assert.notCalled(syncedPipelineMock.syncPR);
                    assert.calledOnce(pipelineMock.sync);
                    assert.calledOnce(buildFactoryMock.create);
                    assert.calledWith(buildFactoryMock.create, sinon.match({
                        parentBuildId: 12345,
                        eventId: model.id,
                        jobId: 1
                    }));
                });
            });

            it('should throw error if startFrom job does not exist', () => {
                config.startFrom = 'doesnnotexist';

                return eventFactory.create(config).then((event) => {
                    assert.equal(event.builds, null);
                });
            });

            it('should throw error if startFrom job is disabled', () => {
                config.startFrom = 'disabledjob';

                return eventFactory.create(config).then((event) => {
                    assert.equal(event.builds, null);
                });
            });

            it('should create builds with config pipeline sha if it is a child pipeline', () => {
                pipelineMock.configPipelineId = 1;
                pipelineFactoryMock.get.withArgs(1).resolves({
                    id: 1,
                    token: Promise.resolve('token')
                });
                config.startFrom = 'main';

                return eventFactory.create(config).then((model) => {
                    assert.instanceOf(model, Event);
                    assert.deepEqual(model.configPipelineSha, 'configpipelinesha');
                    assert.calledWith(pipelineMock.sync, 'configpipelinesha');
                    assert.calledWith(buildFactoryMock.create, sinon.match({
                        configPipelineSha: 'configpipelinesha'
                    }));
                });
            });

            // Private function test
            it('should keep the workflowGraph as is with non pr event and chainPR = true', () => {
                const RewiredEventFactory = rewire('../../lib/eventFactory');
                // eslint-disable-next-line no-underscore-dangle
                const updateWorkflowGraph = RewiredEventFactory.__get__('updateWorkflowGraph');
                const pipeline = { id: 1234, chainPR: true };
                const eventConfig = {}; // non pr event
                const inWorkflowGraph = {
                    nodes: [
                        { name: '~pr' },
                        { name: '~commit' },
                        { name: 'job-A' },
                        { name: 'job-B' }
                    ],
                    edges: [
                        { src: '~pr', dest: 'job-A' },
                        { src: '~commit', dest: 'job-A' },
                        { src: 'job-A', dest: 'job-B' }
                    ]
                };
                const expectedWorkflowGraph = inWorkflowGraph;

                return updateWorkflowGraph({
                    pipeline,
                    eventConfig,
                    workflowGraph: inWorkflowGraph
                }).then((actualWorkflowGraph) => {
                    assert.notCalled(jobFactoryMock.list);
                    assert.deepEqual(expectedWorkflowGraph, actualWorkflowGraph);
                });
            });

            it('should keep the workflowGraph as is with pr event and chainPR = false', () => {
                const RewiredEventFactory = rewire('../../lib/eventFactory');
                // eslint-disable-next-line no-underscore-dangle
                const updateWorkflowGraph = RewiredEventFactory.__get__('updateWorkflowGraph');
                const pipeline = { id: 1234, chainPR: false };
                const eventConfig = { prRef: 'branch', prNum: 1 };
                const inWorkflowGraph = {
                    nodes: [
                        { name: '~pr' },
                        { name: '~commit' },
                        { name: 'job-A' },
                        { name: 'job-B' }
                    ],
                    edges: [
                        { src: '~pr', dest: 'job-A' },
                        { src: '~commit', dest: 'job-A' },
                        { src: 'job-A', dest: 'job-B' }
                    ]
                };
                const expectedWorkflowGraph = inWorkflowGraph;

                return updateWorkflowGraph({
                    pipeline,
                    eventConfig,
                    workflowGraph: inWorkflowGraph
                }).then((actualWorkflowGraph) => {
                    assert.notCalled(jobFactoryMock.list);
                    assert.deepEqual(expectedWorkflowGraph, actualWorkflowGraph);
                });
            });

            it('should update the workflowGraph properly with pr event and chainPR = true', () => {
                const RewiredEventFactory = rewire('../../lib/eventFactory');
                // eslint-disable-next-line no-underscore-dangle
                const updateWorkflowGraph = RewiredEventFactory.__get__('updateWorkflowGraph');
                const pipeline = { id: 1234, chainPR: true };
                const eventConfig = { prRef: 'branch', prNum: 1 };
                const inWorkflowGraph = {
                    nodes: [
                        { name: '~pr' },
                        { name: '~commit' },
                        { name: 'job-A' },
                        { name: 'job-B' }
                    ],
                    edges: [
                        { src: '~pr', dest: 'job-A' },
                        { src: '~commit', dest: 'job-A' },
                        { src: 'job-A', dest: 'job-B' }
                    ]
                };
                const expectedWorkflowGraph = {
                    nodes: [
                        { name: '~pr' },
                        { name: '~commit' },
                        // add ids
                        { name: 'job-A', id: 22 },
                        { name: 'job-B', id: 23 }
                    ],
                    edges: [
                        { src: '~pr', dest: 'job-A' },
                        { src: '~commit', dest: 'job-A' },
                        { src: 'job-A', dest: 'job-B' }
                    ]
                };
                const jobs = [
                    { name: 'PR-1:job-A', id: 22 },
                    { name: 'PR-1:job-B', id: 23 }
                ];

                jobFactoryMock.list.onCall(0).resolves(jobs);

                return updateWorkflowGraph({
                    pipeline,
                    eventConfig,
                    workflowGraph: inWorkflowGraph
                }).then((actualWorkflowGraph) => {
                    assert.calledOnce(jobFactoryMock.list);
                    assert.calledWith(jobFactoryMock.list, sinon.match({
                        params: { pipelineId: pipeline.id, archived: false },
                        search: { field: 'name', keyword: `PR-${eventConfig.prNum}:%` }
                    }));
                    assert.deepEqual(expectedWorkflowGraph, actualWorkflowGraph);
                });
            });

            // eslint-disable-next-line max-len
            it('should update the workflowGraph properly when a "startFrom" node is missing in the workflowGraph', () => {
                const RewiredEventFactory = rewire('../../lib/eventFactory');
                // eslint-disable-next-line no-underscore-dangle
                const updateWorkflowGraph = RewiredEventFactory.__get__('updateWorkflowGraph');
                const eventConfig = { startFrom: '~release' };
                const inWorkflowGraph = {
                    nodes: [
                        { name: '~pr' },
                        { name: '~commit' },
                        { name: 'job-A', id: 22 },
                        { name: 'job-B', id: 23 }
                    ],
                    edges: [
                        { src: '~pr', dest: 'job-A' },
                        { src: '~commit', dest: 'job-A' },
                        { src: 'job-A', dest: 'job-B' }
                    ]
                };
                const expectedWorkflowGraph = {
                    nodes: [
                        { name: '~pr' },
                        { name: '~commit' },
                        { name: 'job-A', id: 22 },
                        { name: 'job-B', id: 23 },
                        // add a missing startFrom node
                        { name: '~release' }
                    ],
                    edges: [
                        { src: '~pr', dest: 'job-A' },
                        { src: '~commit', dest: 'job-A' },
                        { src: 'job-A', dest: 'job-B' }
                    ]
                };

                return updateWorkflowGraph({
                    pipelineConfig: {},
                    eventConfig,
                    workflowGraph: inWorkflowGraph
                }).then((actualWorkflowGraph) => {
                    assert.deepEqual(expectedWorkflowGraph, actualWorkflowGraph);
                });
            });

            it('should not push a invalid node in the workflowGraph', () => {
                const RewiredEventFactory = rewire('../../lib/eventFactory');
                // eslint-disable-next-line no-underscore-dangle
                const updateWorkflowGraph = RewiredEventFactory.__get__('updateWorkflowGraph');
                const eventConfig = { startFrom: 'PR-1:test' };
                const inWorkflowGraph = {
                    nodes: [
                        { name: '~pr' },
                        { name: '~commit' },
                        { name: 'job-A', id: 22 },
                        { name: 'job-B', id: 23 }
                    ],
                    edges: [
                        { src: '~pr', dest: 'job-A' },
                        { src: '~commit', dest: 'job-A' },
                        { src: 'job-A', dest: 'job-B' }
                    ]
                };
                const expectedWorkflowGraph = inWorkflowGraph;

                return updateWorkflowGraph({
                    pipelineConfig: {},
                    eventConfig,
                    workflowGraph: inWorkflowGraph
                }).then((actualWorkflowGraph) => {
                    assert.deepEqual(expectedWorkflowGraph, actualWorkflowGraph);
                });
            });

            it('should create build of the "PR-1:main" job with chainPR config', () => {
                config.startFrom = '~pr';
                config.prRef = 'branch';
                config.prNum = 1;
                config.prTitle = 'Update the README with new information';
                config.webhooks = true;

                afterSyncedPRPipelineMock.getJobs = sinon.stub().resolves(jobsMock);
                afterSyncedPRPipelineMock.chainPR = true;
                afterSyncedPRPipelineMock.update = sinon.stub().resolves(afterSyncedPRPipelineMock);
                // This function is called in updateWorkflowGraph() which is tested in another unit test.
                jobFactoryMock.list.resolves([]);

                return eventFactory.create(config).then((model) => {
                    assert.instanceOf(model, Event);
                    assert.notCalled(jobFactoryMock.create);
                    assert.called(jobFactoryMock.list);
                    assert.calledWith(buildFactoryMock.create, sinon.match({
                        parentBuildId: 12345,
                        eventId: model.id,
                        jobId: 10,
                        prRef: 'branch',
                        prTitle: 'Update the README with new information'
                    }));
                });
            });
        });

        it('should create an Event', () =>
            eventFactory.create(config).then((model) => {
                assert.instanceOf(model, Event);
                assert.calledWith(scm.decorateAuthor, {
                    username: 'stjohn',
                    scmContext,
                    token: 'foo'
                });
                assert.calledWith(scm.decorateCommit, {
                    scmUri: 'github.com:1234:branch',
                    scmContext,
                    sha: 'ccc49349d3cffbd12ea9e3d41521480b4aa5de5f',
                    token: 'foo'
                });
                assert.strictEqual(syncedPipelineMock.lastEventId, model.id);
                assert.strictEqual(config.prInfo.url, model.pr.url);
                Object.keys(expected).forEach((key) => {
                    if (key === 'workflowGraph' || key === 'meta') {
                        assert.deepEqual(model[key], expected[key]);
                    } else {
                        assert.strictEqual(model[key], expected[key]);
                    }
                });
            })
        );

        it('should create an Event with meta', () => {
            const meta = {
                foo: 'bar',
                one: 1
            };

            config.meta = meta;
            expected.meta = meta;

            return eventFactory.create(config).then((model) => {
                assert.instanceOf(model, Event);
                assert.calledWith(scm.decorateAuthor, {
                    username: 'stjohn',
                    scmContext,
                    token: 'foo'
                });
                assert.calledWith(scm.decorateCommit, {
                    scmUri: 'github.com:1234:branch',
                    scmContext,
                    sha: 'ccc49349d3cffbd12ea9e3d41521480b4aa5de5f',
                    token: 'foo'
                });
                assert.strictEqual(syncedPipelineMock.lastEventId, model.id);
                assert.strictEqual(config.prInfo.url, model.pr.url);
                Object.keys(expected).forEach((key) => {
                    if (key === 'workflowGraph' || key === 'meta') {
                        assert.deepEqual(model[key], expected[key]);
                    } else {
                        assert.strictEqual(model[key], expected[key]);
                    }
                });
            });
        });

        it('should create an Event with creator', () => {
            const creatorTest = {
                name: 'sd:scheduler',
                username: 'sd-buildbot'
            };

            config.creator = creatorTest;
            expected.creator = creatorTest;

            eventFactory.create(config).then((model) => {
                assert.instanceOf(model, Event);
                assert.notCalled(scm.decorateAuthor);
                assert.calledWith(scm.decorateCommit, {
                    scmUri: 'github.com:1234:branch',
                    scmContext,
                    sha: 'ccc49349d3cffbd12ea9e3d41521480b4aa5de5f',
                    token: 'foo'
                });
                assert.strictEqual(syncedPipelineMock.lastEventId, model.id);
                assert.strictEqual(config.prInfo.url, model.pr.url);
                Object.keys(expected).forEach((key) => {
                    if (key === 'workflowGraph' || key === 'meta' || key === 'creator') {
                        assert.deepEqual(model[key], expected[key]);
                    } else {
                        assert.strictEqual(model[key], expected[key]);
                    }
                });
            });
        });

        it('should create an Event with baseBranch', () => {
            const baseBranchTest = 'branch';

            config.baseBranch = baseBranchTest;
            expected.baseBranch = baseBranchTest;

            eventFactory.create(config).then((model) => {
                assert.instanceOf(model, Event);
                assert.notCalled(scm.decorateAuthor);
                assert.calledWith(scm.decorateCommit, {
                    scmUri: 'github.com:1234:branch',
                    scmContext,
                    sha: 'ccc49349d3cffbd12ea9e3d41521480b4aa5de5f',
                    token: 'foo'
                });
                assert.strictEqual(syncedPipelineMock.lastEventId, model.id);
                assert.strictEqual(config.prInfo.url, model.pr.url);
                Object.keys(expected).forEach((key) => {
                    if (key === 'workflowGraph' || key === 'meta' || key === 'creator') {
                        assert.deepEqual(model[key], expected[key]);
                    } else {
                        assert.strictEqual(model[key], expected[key]);
                    }
                });
            });
        });

        it('should call pipeline sync with configPipelineSha if passed in', () => {
            config.parentEventId = 222;
            config.configPipelineSha = 'configpipelinesha';

            return eventFactory.create(config).then((model) => {
                assert.instanceOf(model, Event);
                assert.deepEqual(model.configPipelineSha, config.configPipelineSha);
                assert.calledWith(pipelineMock.sync, config.configPipelineSha);
                assert.equal(model.configPipelineSha, config.configPipelineSha);
            });
        });

        it('should create event with config pipeline sha if it is child pipeline', () => {
            pipelineMock.configPipelineId = 1;
            pipelineFactoryMock.get.withArgs(1).resolves({
                id: 1,
                token: Promise.resolve('token')
            });

            return eventFactory.create(config).then((model) => {
                assert.instanceOf(model, Event);
                assert.deepEqual(model.configPipelineSha, 'configpipelinesha');
                assert.calledWith(pipelineMock.sync, 'configpipelinesha');
            });
        });

        it('should create event with pr info if it is pr event', () => {
            config.prNum = 20;
            config.prRef = 'branch';

            return eventFactory.create(config).then((model) => {
                assert.instanceOf(model, Event);
                assert.deepEqual(model.pr, config.prInfo);
                assert.deepEqual(model.prNum, config.prNum);
            });
        });

        it('should not call pipeline sync with configPipelineSha if it is pr event', () => {
            config.parentEventId = 222;
            config.configPipelineSha = 'configpipelinesha';
            config.sha = 'configsha';
            config.prRef = 'branch';
            config.prNum = 20;

            return eventFactory.create(config).then((model) => {
                assert.instanceOf(model, Event);
                assert.neverCalledWith(pipelineMock.sync, config.configPipelineSha);
                assert.neverCalledWith(pipelineMock.sync, config.sha);
                assert.deepEqual(model.pr, config.prInfo);
                assert.deepEqual(model.prNum, config.prNum);
            });
        });

        it('throw error if sourcepaths is not supported', () => {
            jobsMock = [{
                id: 1,
                pipelineId: 8765,
                name: 'main',
                permutations: [{
                    requires: ['~pr'],
                    sourcePaths: ['src/test/']
                }],
                state: 'ENABLED'
            }];
            syncedPipelineMock.update = sinon.stub().resolves({
                getJobs: sinon.stub().resolves(jobsMock),
                branch: Promise.resolve('branch')
            });

            config.startFrom = 'main';
            config.webhooks = true;

            return eventFactory.create(config).then(() => {
                throw new Error('Should not get here');
            }, (err) => {
                assert.isOk(err, 'Error should be returned');
                assert.equal(err.message, 'Your SCM does not support Source Paths');
                assert.notCalled(buildFactoryMock.create);
            });
        });

        it('should not start build if changed file is not in sourcePaths', () => {
            jobsMock = [{
                id: 1,
                pipelineId: 8765,
                name: 'main',
                permutations: [{
                    requires: ['~pr'],
                    sourcePaths: ['src/test/']
                }],
                state: 'ENABLED'
            }];
            syncedPipelineMock.update = sinon.stub().resolves({
                getJobs: sinon.stub().resolves(jobsMock),
                branch: Promise.resolve('branch')
            });

            config.startFrom = 'main';
            config.webhooks = true;
            config.changedFiles = ['README.md', 'root/src/test/file'];

            return eventFactory.create(config).then((event) => {
                assert.notCalled(buildFactoryMock.create);
                assert.equal(event.builds, null);
            });
        });

        it('should start build if changed file is in rootDir', () => {
            jobsMock = [{
                id: 1,
                pipelineId: 8765,
                name: 'main',
                permutations: [{
                    requires: ['~pr']
                }],
                state: 'ENABLED'
            }];
            syncedPipelineMock.update = sinon.stub().resolves({
                getJobs: sinon.stub().resolves(jobsMock),
                branch: Promise.resolve('branch'),
                rootDir: Promise.resolve('root/src/test')
            });

            config.startFrom = 'main';
            config.webhooks = true;
            config.changedFiles = ['README.md', 'root/src/test/file'];

            return eventFactory.create(config).then((model) => {
                assert.instanceOf(model, Event);
                assert.calledOnce(buildFactoryMock.create);
                assert.calledWith(buildFactoryMock.create.firstCall, sinon.match({
                    meta: {
                        commit: {
                            ...commit,
                            changedFiles: 'README.md,root/src/test/file'
                        }
                    }
                }));
                assert.deepEqual(
                    buildFactoryMock.create.args[0][0].environment,
                    { SD_SOURCE_PATH: 'root/src/test/' }
                );
            });
        });

        it('should start build if changed file is in rootDir and sourcePaths exist', () => {
            jobsMock = [{
                id: 1,
                pipelineId: 8765,
                name: 'main',
                permutations: [{
                    requires: ['~pr'],
                    sourcePaths: ['screwdriver.yaml', 'test.js']
                }],
                state: 'ENABLED'
            }];
            syncedPipelineMock.update = sinon.stub().resolves({
                getJobs: sinon.stub().resolves(jobsMock),
                branch: Promise.resolve('branch'),
                rootDir: Promise.resolve('root/src/test')
            });

            config.startFrom = 'main';
            config.webhooks = true;
            config.changedFiles = ['README.md', 'root/src/test/file'];

            return eventFactory.create(config).then((event) => {
                assert.notCalled(buildFactoryMock.create);
                assert.equal(event.builds, null);
            });
        });

        // eslint-disable-next-line max-len
        it('should start build from event if changed file is not in sourcePaths and build not triggered by webhooks', () => {
            jobsMock = [{
                id: 1,
                pipelineId: 8765,
                name: 'main',
                permutations: [{
                    requires: ['~pr'],
                    sourcePaths: ['src/test/']
                }],
                state: 'ENABLED'
            }];
            syncedPipelineMock.update = sinon.stub().resolves({
                getJobs: sinon.stub().resolves(jobsMock),
                branch: Promise.resolve('branch')
            });

            config.prInfo = null;
            config.startFrom = 'main';
            config.webhooks = false;
            config.changedFiles = ['README.md', 'root/src/test/file'];

            return eventFactory.create(config).then((model) => {
                assert.instanceOf(model, Event);
                assert.calledOnce(buildFactoryMock.create);
                assert.calledWith(buildFactoryMock.create.firstCall, sinon.match({
                    meta: {
                        commit: {
                            ...commit,
                            changedFiles: 'README.md,root/src/test/file'
                        }
                    }
                }));
                assert.deepEqual(
                    buildFactoryMock.create.args[0][0].environment,
                    {}
                );
            });
        });

        it('should start builds if changed file is in sourcePaths', () => {
            jobsMock = [{
                id: 1,
                pipelineId: 8765,
                name: 'PR-1:main',
                permutations: [{
                    requires: ['~pr'],
                    sourcePaths: ['src/test/']
                }],
                state: 'ENABLED'
            }, {
                id: 2,
                pipelineId: 8765,
                name: 'PR-1:publish',
                permutations: [{
                    requires: ['~pr'],
                    sourcePaths: ['src/test/']
                }],
                state: 'ENABLED'
            }];
            afterSyncedPRPipelineMock.update = sinon.stub().resolves({
                getJobs: sinon.stub().resolves(jobsMock),
                branch: Promise.resolve('branch')
            });

            config.webhooks = true;
            config.startFrom = '~pr';
            config.prRef = 'branch';
            config.prNum = 1;
            config.prTitle = 'Update the README with new information';
            config.changedFiles = ['src/test/README.md', 'NOTINSOURCEPATH.md'];

            return eventFactory.create(config).then((model) => {
                assert.instanceOf(model, Event);
                assert.calledTwice(buildFactoryMock.create);
                assert.deepEqual(
                    buildFactoryMock.create.args[0][0].environment,
                    { SD_SOURCE_PATH: 'src/test/' }
                );
                assert.deepEqual(
                    buildFactoryMock.create.args[1][0].environment,
                    { SD_SOURCE_PATH: 'src/test/' }
                );
            });
        });

        it('should start build when sourcePath is a file, and is the same as changedFile', () => {
            jobsMock = [{
                id: 1,
                pipelineId: 8765,
                name: 'PR-1:main',
                permutations: [{
                    requires: ['~pr'],
                    sourcePaths: ['src/test']
                }],
                state: 'ENABLED'
            }];
            afterSyncedPRPipelineMock.update = sinon.stub().resolves({
                getJobs: sinon.stub().resolves(jobsMock),
                branch: Promise.resolve('branch')
            });

            config.startFrom = '~pr';
            config.webhooks = true;
            config.prRef = 'branch';
            config.prNum = 1;
            config.prTitle = 'Update the README with new information';
            config.changedFiles = ['src/test', 'NOTINSOURCEPATH.md'];

            return eventFactory.create(config).then((model) => {
                assert.instanceOf(model, Event);
                assert.calledOnce(buildFactoryMock.create);
            });
        });

        it('use username as displayName if displayLabel is not set', () => {
            scm.getDisplayName.returns(null);

            return eventFactory.create(config).then((model) => {
                assert.equal(model.causeMessage, 'Started by stjohn');
            });
        });

        it('should create using parentEvent workflowGraph and job configs', () => {
            config.parentEventId = 222;
            config.workflowGraph = {
                nodes: [
                    { name: '~commit' },
                    { name: 'testJob' }
                ],
                edges: [
                    { src: '~commit', dest: 'testJob' }
                ]
            };
            expected.workflowGraph = config.workflowGraph;
            expected.parentEventId = config.parentEventId;
            syncedPipelineMock.workflowGraph = config.workflowGraph;

            return eventFactory.create(config).then((model) => {
                assert.calledWith(pipelineMock.sync, config.sha);
                assert.instanceOf(model, Event);
                Object.keys(expected).forEach((key) => {
                    if (key === 'workflowGraph') {
                        assert.deepEqual(model[key], expected[key]);
                    } else if (key === 'parentEventId') {
                        assert.deepEqual(model[key], 222);
                    }
                });
            });
        });

        it('should have parameters if create with parameters', () => {
            const currentPipelineConfig = Object.assign({
                parameters: {
                    user: 'actualValue'
                }
            }, syncedPipelineMock);

            const fixedPipelineConfig = Object.assign({
                parameters: {
                    user: 'originalValue'
                }
            }, syncedPipelineMock);

            config.startFrom = 'main';
            config.meta = currentPipelineConfig;
            syncedPipelineMock.update = sinon.stub().resolves(fixedPipelineConfig);

            return eventFactory.create(config).then((model) => {
                assert.equal(model.meta.parameters.user, 'actualValue');
            });
        });

        it('should not have parameters if create without parameters', () => {
            const currentPipelineConfig = Object.assign({
                parameters: {
                    thisIsNotFromPipeline: 'nonExistingValue'
                }
            }, syncedPipelineMock);

            const fixedPipelineConfig = Object.assign({
                parameters: {
                    user: 'originalValue'
                }
            }, syncedPipelineMock);

            config.startFrom = 'main';
            config.meta = currentPipelineConfig;
            syncedPipelineMock.update = sinon.stub().resolves(fixedPipelineConfig);

            return eventFactory.create(config).then((model) => {
                assert.equal(model.meta.parameters.user, 'originalValue');
            });
        });
    });

    describe('getInstance', () => {
        let config;

        beforeEach(() => {
            config = { datastore, scm: {} };
        });

        it('should utilize BaseFactory to get an instance', () => {
            const f1 = EventFactory.getInstance(config);
            const f2 = EventFactory.getInstance(config);

            assert.instanceOf(f1, EventFactory);
            assert.instanceOf(f2, EventFactory);

            assert.equal(f1, f2);
        });

        it('should throw when config does not have everything necessary', () => {
            assert.throw(EventFactory.getInstance,
                Error, 'No scm plugin provided to EventFactory');

            assert.throw(() => {
                EventFactory.getInstance({ datastore });
            }, Error, 'No scm plugin provided to EventFactory');

            assert.throw(() => {
                EventFactory.getInstance({ scm: {} });
            }, Error, 'No datastore provided to EventFactory');
        });
    });
});
