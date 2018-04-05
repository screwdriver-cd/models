'use strict';

const assert = require('chai').assert;
const sinon = require('sinon');
const mockery = require('mockery');
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
            get: sinon.stub()
        };
        buildFactoryMock = {
            create: sinon.stub()
        };
        jobFactoryMock = {
            create: sinon.stub()
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
            sandbox = sinon.sandbox.create({
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
                scmContext
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
                        { name: '~sd@123:main' }
                    ],
                    edges: [
                        { src: '~sd@123:main', dest: 'main' },
                        { src: '~pr', dest: 'main' },
                        { src: '~commit', dest: 'main' },
                        { src: 'main', dest: 'disabledJob' },
                        { src: '~pr', dest: 'publish' }
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
                workflow: [],
                workflowGraph: {
                    nodes: [
                        { name: '~pr' },
                        { name: '~commit' },
                        { name: 'main' },
                        { name: 'disabledJob' },
                        { name: 'publish' },
                        { name: '~sd@123:main' }
                    ],
                    edges: [
                        { src: '~sd@123:main', dest: 'main' },
                        { src: '~pr', dest: 'main' },
                        { src: '~commit', dest: 'main' },
                        { src: 'main', dest: 'disabledJob' },
                        { src: '~pr', dest: 'publish' }
                    ]
                },
                getConfiguration: sinon.stub().resolves(PARSED_YAML),
                update: sinon.stub().resolves(syncedPipelineMock),
                job: Promise.resolve([])
            };

            afterSyncedPRPipelineMock = Object.assign({}, syncedPipelineMock);
            syncedPipelineMock.syncPR = sinon.stub().resolves(afterSyncedPRPipelineMock);

            pipelineMock = {
                sync: sinon.stub().resolves(syncedPipelineMock),
                update: sinon.stub().resolves(syncedPipelineMock)
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
                        requires: ['~commit', '~pr', '~sd@123:main']
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
                }];

                syncedPipelineMock.jobs = Promise.resolve(jobsMock);
                buildFactoryMock.create.resolves('a build object');
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

                afterSyncedPRPipelineMock.jobs = Promise.resolve(jobsMock);
                afterSyncedPRPipelineMock.update = sinon.stub().resolves(afterSyncedPRPipelineMock);

                config.startFrom = '~pr';
                config.prRef = 'branch';
                config.prNum = 1;
                config.webhooks = true;

                return eventFactory.create(config).then((model) => {
                    assert.instanceOf(model, Event);
                    assert.notCalled(jobFactoryMock.create);
                    assert.calledOnce(buildFactoryMock.create);
                    assert.calledWith(buildFactoryMock.create.firstCall, sinon.match({
                        parentBuildId: 12345,
                        eventId: model.id,
                        jobId: 5,
                        prRef: 'branch'
                    }));
                    assert.calledOnce(syncedPipelineMock.syncPR);
                    assert.calledWith(syncedPipelineMock.syncPR.firstCall, 1);
                });
            });

            it('should create commit builds', () => {
                config.startFrom = '~commit';
                config.webhooks = true;

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

            it('should throw error if startFrom job does not exist', () => {
                config.startFrom = 'doesnnotexist';

                return eventFactory.create(config).then(() => {
                    throw new Error('Should not get here');
                }, (err) => {
                    assert.isOk(err, 'Error should be returned');
                    assert.equal(err.message, 'No jobs to start');
                    assert.notCalled(jobFactoryMock.create);
                    assert.notCalled(buildFactoryMock.create);
                });
            });

            it('should throw error if startFrom job is disabled', () => {
                config.startFrom = 'disabledjob';

                return eventFactory.create(config).then(() => {
                    throw new Error('Should not get here');
                }, (err) => {
                    assert.isOk(err, 'Error should be returned');
                    assert.equal(err.message, 'No jobs to start');
                    assert.notCalled(jobFactoryMock.create);
                    assert.notCalled(buildFactoryMock.create);
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
                Object.keys(expected).forEach((key) => {
                    if (key === 'workflowGraph' || key === 'meta') {
                        assert.deepEqual(model[key], expected[key]);
                    } else {
                        assert.strictEqual(model[key], expected[key]);
                    }
                });
            })
        );

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
                jobs: Promise.resolve(jobsMock)
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
                jobs: Promise.resolve(jobsMock)
            });

            config.startFrom = 'main';
            config.webhooks = true;
            config.changedFiles = ['README.md', 'root/src/test/file'];

            return eventFactory.create(config).then(() => {
                throw new Error('Should not get here');
            }, (err) => {
                assert.isOk(err, 'Error should be returned');
                assert.equal(err.message, 'No jobs to start');
                assert.notCalled(buildFactoryMock.create);
            });
        });

        // eslint-disable-next-line max-len
        it('should start build if changed file is not in sourcePaths and build not triggered by webhooks', () => {
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
                jobs: Promise.resolve(jobsMock)
            });

            config.startFrom = 'main';
            config.webhooks = false;
            config.changedFiles = ['README.md', 'root/src/test/file'];

            return eventFactory.create(config).then((model) => {
                assert.instanceOf(model, Event);
                assert.calledOnce(buildFactoryMock.create);
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
                name: 'PR-1:test',
                permutations: [{
                    requires: ['~pr'],
                    sourcePaths: ['src/test/']
                }],
                state: 'ENABLED'
            }];
            afterSyncedPRPipelineMock.update = sinon.stub().resolves({
                jobs: Promise.resolve(jobsMock)
            });

            config.startFrom = '~pr';
            config.prRef = 'branch';
            config.prNum = 1;
            config.changedFiles = ['src/test/README.md', 'NOTINSOURCEPATH.md'];

            return eventFactory.create(config).then((model) => {
                assert.instanceOf(model, Event);
                assert.calledTwice(buildFactoryMock.create);
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
                jobs: Promise.resolve(jobsMock)
            });

            config.startFrom = '~pr';
            config.webhooks = true;
            config.prRef = 'branch';
            config.prNum = 1;
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
