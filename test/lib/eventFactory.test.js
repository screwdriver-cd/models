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
    let factory;
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

        factory = new EventFactory({ datastore, scm });
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
            const model = factory.createClass({
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

        beforeEach(() => {
            config = {
                pipelineId,
                sha,
                username: 'stjohn',
                scmContext
            };
            expected = {
                pipelineId,
                sha,
                type: 'pipeline',
                workflow: [],
                workflowGraph: {
                    nodes: [
                        { name: '~pr' },
                        { name: '~commit' },
                        { name: 'main' },
                        { name: 'disabledJob' },
                        { name: 'publish' }
                    ],
                    edges: [
                        { src: '~pr', dest: 'main' },
                        { src: '~commit', dest: 'main' },
                        { src: 'main', dest: 'disabledJob' },
                        { src: '~pr', dest: 'publish' }
                    ]
                },
                causeMessage: 'Started by github:stjohn',
                createTime: nowTime,
                creator,
                commit
            };

            pipelineMock = {
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
                        { name: 'publish' }
                    ],
                    edges: [
                        { src: '~pr', dest: 'main' },
                        { src: '~commit', dest: 'main' },
                        { src: 'main', dest: 'disabledJob' },
                        { src: '~pr', dest: 'publish' }
                    ]
                },
                getConfiguration: sinon.stub().resolves(PARSED_YAML),
                sync: sinon.stub().resolves({
                    workflow: [],
                    workflowGraph: {
                        nodes: [
                            { name: '~pr' },
                            { name: '~commit' },
                            { name: 'main' },
                            { name: 'disabledJob' },
                            { name: 'publish' }
                        ],
                        edges: [
                            { src: '~pr', dest: 'main' },
                            { src: '~commit', dest: 'main' },
                            { src: 'main', dest: 'disabledJob' },
                            { src: '~pr', dest: 'publish' }
                        ]
                    }
                }),
                syncPR: sinon.stub().resolves(),
                update: sinon.stub().resolves(null)
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
                    permutations: {
                        requires: ['~commit', '~pr']
                    },
                    state: 'ENABLED'
                }, {
                    id: 2,
                    pipelineId: 8765,
                    name: 'disabledjob',
                    permutations: {
                        requires: ['main']
                    },
                    state: 'DISABLED'
                }, {
                    id: 4,
                    pipelineId: 8765,
                    name: 'publish',
                    permutations: {
                        requires: ['~pr']
                    },
                    state: 'ENABLED'
                }];

                pipelineMock.jobs = Promise.resolve(jobsMock);
                buildFactoryMock.create.resolves(null);
            });

            it('should start existing pr jobs without creating duplicates', () => {
                jobsMock = [{
                    id: 1,
                    pipelineId: 8765,
                    name: 'main',
                    permutations: {
                        requires: ['~pr']
                    },
                    state: 'ENABLED'
                }, {
                    id: 5,
                    pipelineId: 8765,
                    name: 'PR-1:main',
                    permutations: {
                        requires: ['~pr']
                    },
                    state: 'ENABLED'
                },
                {
                    id: 7,
                    pipelineId: 8765,
                    name: 'PR-2:main',
                    permutations: {
                        requires: ['~pr']
                    },
                    state: 'ENABLED'
                },
                {
                    id: 3,
                    name: 'publish',
                    permutations: {
                        requires: ['~pr']
                    },
                    state: 'ENABLED'
                },
                {
                    id: 6,
                    name: 'PR-1:publish',
                    permutations: {
                        requires: ['~pr']
                    },
                    state: 'DISABLED'
                }];

                pipelineMock.jobs = Promise.resolve(jobsMock);

                config.startFrom = '~pr';
                config.prRef = 'branch';
                config.prNum = 1;

                return factory.create(config).then((model) => {
                    assert.instanceOf(model, Event);
                    assert.notCalled(jobFactoryMock.create);
                    assert.calledOnce(buildFactoryMock.create);
                    assert.calledWith(buildFactoryMock.create.firstCall, sinon.match({
                        eventId: model.id,
                        jobId: 5,
                        prRef: 'branch'
                    }));
                    assert.calledOnce(pipelineMock.syncPR);
                    assert.calledWith(pipelineMock.syncPR.firstCall, 1);
                });
            });

            it('should create pr builds if they do not already exist', () => {
                const prComponent = {
                    id: 5,
                    name: 'PR-1:main'
                };
                const prPublish = {
                    id: 6,
                    name: 'PR-1:publish'
                };

                jobFactoryMock.create.onCall(0).resolves(prComponent);
                jobFactoryMock.create.onCall(1).resolves(prPublish);
                config.startFrom = '~pr';
                config.prRef = 'branch';
                config.prNum = '1';

                return factory.create(config).then((model) => {
                    assert.instanceOf(model, Event);
                    assert.calledTwice(jobFactoryMock.create);
                    assert.calledWith(jobFactoryMock.create.firstCall, sinon.match({
                        pipelineId: 8765,
                        name: 'PR-1:main'
                    }));
                    assert.calledWith(jobFactoryMock.create.secondCall, sinon.match({
                        pipelineId: 8765,
                        name: 'PR-1:publish'
                    }));
                    assert.calledTwice(buildFactoryMock.create);
                    assert.calledWith(buildFactoryMock.create.firstCall, sinon.match({
                        eventId: model.id,
                        jobId: 5,
                        prRef: 'branch'
                    }));
                    assert.calledWith(buildFactoryMock.create.secondCall, sinon.match({
                        eventId: model.id,
                        jobId: 6,
                        prRef: 'branch'
                    }));
                    assert.calledOnce(pipelineMock.syncPR);
                    assert.calledWith(pipelineMock.syncPR, '1');
                    assert.notCalled(pipelineMock.sync);
                });
            });

            it('should create commit builds', () => {
                config.startFrom = '~commit';

                return factory.create(config).then((model) => {
                    assert.instanceOf(model, Event);
                    assert.notCalled(jobFactoryMock.create);
                    assert.calledWith(buildFactoryMock.create, sinon.match({
                        eventId: model.id,
                        jobId: 1
                    }));
                    assert.calledOnce(pipelineMock.sync);
                    assert.notCalled(pipelineMock.syncPR);
                });
            });

            it('should create build if startFrom is a jobName', () => {
                config.startFrom = 'main';

                return factory.create(config).then((model) => {
                    assert.instanceOf(model, Event);
                    assert.notCalled(jobFactoryMock.create);
                    assert.notCalled(pipelineMock.syncPR);
                    assert.calledOnce(pipelineMock.sync);
                    assert.calledOnce(buildFactoryMock.create);
                    assert.calledWith(buildFactoryMock.create, sinon.match({
                        eventId: model.id,
                        jobId: 1
                    }));
                });
            });

            it('should throw error if startFrom job does not exist', () => {
                config.startFrom = 'doesnnotexist';

                return factory.create(config).then(() => {
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

                return factory.create(config).then(() => {
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
            factory.create(config).then((model) => {
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
                assert.strictEqual(pipelineMock.lastEventId, model.id);
                Object.keys(expected).forEach((key) => {
                    if (key === 'workflow') {
                        assert.deepEqual(model[key], expected[key]);
                    } else if (key === 'workflowGraph') {
                        assert.deepEqual(model[key], expected[key]);
                    } else {
                        assert.strictEqual(model[key], expected[key]);
                    }
                });
            })
        );

        it('should only update lastEventId if type is pipeline', () => {
            config.type = 'pr';

            return factory.create(config).then((model) => {
                assert.instanceOf(model, Event);
                // lastEventId should not have been updated
                assert.calledOnce(pipelineMock.update);
                assert.strictEqual(pipelineMock.lastEventId, null);
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
