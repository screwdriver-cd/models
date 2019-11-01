'use strict';

const assert = require('chai').assert;
const mockery = require('mockery');
const sinon = require('sinon');

sinon.assert.expose(assert, { prefix: '' });

describe('Trigger Factory', () => {
    const src = '~sd@8765:main';
    const dest = '~sd@5678:main';
    const metaData = {
        src,
        dest
    };
    const pipelineId = 8765;
    const generatedId = 1234135;
    let TriggerFactory;
    let datastore;
    let factory;
    let Trigger;
    let pipelineFactoryMock;
    let pipelineMock;
    const jobsMock = [{
        id: 1,
        pipelineId,
        name: 'main',
        permutations: [{
            requires: ['~commit', '~pr', '~sd@123:main', '~commit:branch', '~pr:branch']
        }],
        state: 'ENABLED'
    }, {
        id: 2,
        pipelineId,
        name: 'disabledjob',
        permutations: [{
            requires: ['main']
        }],
        state: 'DISABLED'
    }, {
        id: 4,
        pipelineId,
        name: 'publish',
        permutations: [{
            requires: ['~pr']
        }],
        state: 'ENABLED'
    }];

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
        pipelineMock = {
            id: pipelineId,
            scmUri: 'github.com:1234:branch',
            scmContext: 'github:github.com',
            token: Promise.resolve('foo'),
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
            getJobs: sinon.stub().resolves(jobsMock)
        };
        pipelineFactoryMock = {
            get: sinon.stub().resolves(pipelineMock),
            scm: {
                getCommitSha: sinon.stub().resolves('configpipelinesha')
            }
        };

        mockery.registerMock('./pipelineFactory', {
            getInstance: sinon.stub().returns(pipelineFactoryMock)
        });

        // eslint-disable-next-line global-require
        Trigger = require('../../lib/trigger');
        // eslint-disable-next-line global-require
        TriggerFactory = require('../../lib/triggerFactory');

        factory = new TriggerFactory({ datastore });
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
        it('should return a Trigger model', () => {
            const model = factory.createClass(metaData);

            assert.instanceOf(model, Trigger);
        });
    });

    describe('create', () => {
        let expected;

        beforeEach(() => {
            expected = {
                id: generatedId,
                src,
                dest
            };
        });

        it('creates a Trigger given pipelineId, jobName, and trigger', () => {
            datastore.save.resolves(expected);

            return factory.create({
                src,
                dest
            }).then((model) => {
                assert.instanceOf(model, Trigger);
                Object.keys(expected).forEach((key) => {
                    assert.strictEqual(model[key], expected[key]);
                });
            });
        });
    });

    describe('getDestFromSrc', () => {
        let expected;

        beforeEach(() => {
            expected = [{
                id: generatedId,
                src,
                dest
            }, {
                id: 111,
                src,
                dest: '~sd@1234:main'
            }, {
                id: 222,
                src,
                dest: '~sd@2222:main'
            }];
        });

        it('gets destination based on source', () => {
            datastore.scan.resolves(expected);

            return factory.getDestFromSrc(src).then((result) => {
                assert.deepEqual(result, [dest, '~sd@1234:main', '~sd@2222:main']);
            });
        });

        it('returns empty array if source is not found in trigger table', () => {
            datastore.scan.resolves([]);

            return factory.getDestFromSrc(src).then((result) => {
                assert.deepEqual(result, []);
            });
        });
    });

    describe('getTriggers', () => {
        let expected;

        beforeEach(() => {
            expected = [{
                id: generatedId,
                src,
                dest
            }, {
                id: 1234567,
                src,
                dest: '~sd@12345:main'
            }, {
                id: 1234568,
                src: '~sd@8765:disabledjob',
                dest: '~sd@58967:main'
            }, {
                id: 1234569,
                src: '~sd@8765:publish',
                dest: '~sd@58967:publish'
            }];
        });

        it('gets all pipeline Triggers given a pipelineId', () => {
            datastore.scan.resolves(expected);

            return factory.getTriggers({
                pipelineId
            }).then((model) => {
                model.forEach((m) => {
                    assert.instanceOf(m.triggers, Array);
                    assert.calledWith(pipelineMock.getJobs, { type: 'pipeline' });
                });
            });
        });

        it('gets all PR Triggers given a pipelineId and type', () => {
            datastore.scan.resolves(expected);
            pipelineMock.getJobs.withArgs({ type: 'pr' }).resolves([{
                id: 1,
                pipelineId,
                name: 'PR-1:main',
                permutations: [{
                    requires: ['~commit', '~pr', '~sd@123:main', '~commit:branch', '~pr:branch']
                }],
                state: 'ENABLED'
            }]);

            return factory.getTriggers({
                pipelineId,
                type: 'pr'
            }).then((model) => {
                model.forEach((m) => {
                    assert.instanceOf(m.triggers, Array);
                    assert.calledWith(pipelineMock.getJobs, { type: 'pr' });
                });
            });
        });

        it('returns empty array if pipeline does not exist', () => {
            pipelineFactoryMock.get.resolves(null);

            return factory.getTriggers({
                pipelineId
            }).then((model) => {
                assert.instanceOf(model, Array);
            });
        });
    });

    describe('getInstance', () => {
        let config;

        beforeEach(() => {
            config = { datastore };
        });

        it('should get an instance', () => {
            const f1 = TriggerFactory.getInstance(config);
            const f2 = TriggerFactory.getInstance(config);

            assert.instanceOf(f1, TriggerFactory);
            assert.instanceOf(f2, TriggerFactory);

            assert.equal(f1, f2);
        });

        it('should throw when config not supplied', () => {
            assert.throw(TriggerFactory.getInstance,
                Error, 'No datastore provided to TriggerFactory');
        });
    });
});
