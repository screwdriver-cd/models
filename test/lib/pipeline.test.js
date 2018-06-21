'use strict';

const assert = require('chai').assert;
const mockery = require('mockery');
const sinon = require('sinon');
const hoek = require('hoek');
const schema = require('screwdriver-data-schema');

sinon.assert.expose(assert, { prefix: '' });
const PARSED_YAML = require('../data/parser');
const PARSED_YAML_WITH_REQUIRES = require('../data/parserWithRequires');
const PARSED_YAML_PR = require('../data/parserWithWorkflowGraphPR');
const PARSED_YAML_WITH_ERRORS = require('../data/parserWithErrors');
const SCM_URLS = [
    'foo.git'
];
const EXTERNAL_PARSED_YAML = hoek.applyToDefaults(PARSED_YAML, {
    annotations: { 'beta.screwdriver.cd/executor': 'screwdriver-executor-k8s' },
    childPipelines: {
        scmUrls: SCM_URLS
    }
});

describe('Pipeline Model', () => {
    let PipelineModel;
    let datastore;
    let hashaMock;
    let pipeline;
    let BaseModel;
    let parserMock;
    let scmMock;
    let jobFactoryMock;
    let userFactoryMock;
    let secretFactoryMock;
    let eventFactoryMock;
    let templateFactoryMock;
    let triggerFactoryMock;
    let pipelineFactoryMock;
    let tokenFactoryMock;
    let configPipelineMock;
    let childPipelineMock;

    const dateNow = 1111111111;
    const scmUri = 'github.com:12345:master';
    const scmContext = 'github:github.com';
    const testId = 123;
    const admins = { batman: true, robin: true };
    const paginate = {
        page: 1,
        count: 50
    };
    let jobs;
    let pipelineConfig;
    let publishJob;
    let mainJob;
    let blahJob;
    let pr10;
    let pr3;

    const decorateJobMock = (job) => {
        const decorated = hoek.clone(job);

        decorated.isPR = sinon.stub().returns(false);
        decorated.prNum = null;
        decorated.remove = sinon.stub().resolves(null);
        decorated.update = sinon.stub().resolves(job);

        return decorated;
    };

    const getJobMocks = (j) => {
        if (Array.isArray(j)) {
            return j.map(decorateJobMock);
        }

        return decorateJobMock(j);
    };

    before(() => {
        mockery.enable({
            useCleanCache: true,
            warnOnUnregistered: false
        });
    });

    beforeEach(() => {
        publishJob = getJobMocks({
            id: 99999,
            name: 'publish',
            archived: false
        });

        blahJob = getJobMocks({
            id: 99995,
            name: 'blah',
            archived: true
        });

        mainJob = getJobMocks({
            id: 99998,
            name: 'main',
            archived: false
        });

        pr10 = getJobMocks({
            id: 99997,
            name: 'PR-10',
            archived: false
        });

        pr3 = getJobMocks({
            id: 99996,
            name: 'PR-3',
            archived: false
        });

        pr10.isPR.returns(true);
        pr3.isPR.returns(true);
        pr10.prNum = 10;
        pr3.prNum = 3;

        datastore = {
            get: sinon.stub(),
            save: sinon.stub(),
            update: sinon.stub(),
            remove: sinon.stub().resolves(null)
        };
        hashaMock = {
            sha1: sinon.stub()
        };
        jobFactoryMock = {
            create: sinon.stub(),
            list: sinon.stub(),
            get: sinon.stub()
        };
        eventFactoryMock = {
            list: sinon.stub()
        };
        userFactoryMock = {
            get: sinon.stub(),
            getPermissions: sinon.stub()
        };
        secretFactoryMock = {
            list: sinon.stub()
        };
        templateFactoryMock = {
        };
        triggerFactoryMock = {
            list: sinon.stub(),
            create: sinon.stub()
        };
        configPipelineMock = {
            id: 1,
            childPipelines: {
                scmUrls: SCM_URLS
            },
            getConfiguration: sinon.stub().resolves(EXTERNAL_PARSED_YAML),
            update: sinon.stub().resolves(null),
            remove: sinon.stub().resolves(null)
        };
        childPipelineMock = {
            id: 2,
            childPipelines: {
                scmUrls: SCM_URLS
            },
            configPipelineId: testId,
            update: sinon.stub().resolves(null),
            remove: sinon.stub().resolves(null)
        };
        pipelineFactoryMock = {
            get: sinon.stub().resolves(configPipelineMock),
            update: sinon.stub().resolves(null),
            create: sinon.stub(),
            list: sinon.stub().resolves([]),
            scm: {
                parseUrl: sinon.stub()
            }
        };
        tokenFactoryMock = {
            list: sinon.stub()
        };
        scmMock = {
            addWebhook: sinon.stub(),
            getFile: sinon.stub(),
            decorateUrl: sinon.stub(),
            getOpenedPRs: sinon.stub(),
            getPrInfo: sinon.stub()
        };
        parserMock = sinon.stub();

        mockery.registerMock('./jobFactory', {
            getInstance: sinon.stub().returns(jobFactoryMock) });
        mockery.registerMock('./eventFactory', {
            getInstance: sinon.stub().returns(eventFactoryMock) });
        mockery.registerMock('./userFactory', {
            getInstance: sinon.stub().returns(userFactoryMock)
        });
        mockery.registerMock('./secretFactory', {
            getInstance: sinon.stub().returns(secretFactoryMock) });
        mockery.registerMock('./templateFactory', {
            getInstance: sinon.stub().returns(templateFactoryMock) });
        mockery.registerMock('./triggerFactory', {
            getInstance: sinon.stub().returns(triggerFactoryMock) });
        mockery.registerMock('screwdriver-hashr', hashaMock);
        mockery.registerMock('screwdriver-config-parser', parserMock);
        mockery.registerMock('./pipelineFactory', {
            getInstance: sinon.stub().returns(pipelineFactoryMock) });
        mockery.registerMock('./tokenFactory', {
            getInstance: sinon.stub().returns(tokenFactoryMock) });

        // eslint-disable-next-line global-require
        PipelineModel = require('../../lib/pipeline');
        // eslint-disable-next-line global-require
        BaseModel = require('../../lib/base');

        pipelineConfig = {
            datastore,
            id: testId,
            scmUri,
            scmContext,
            createTime: dateNow,
            admins,
            scm: scmMock
        };

        pipeline = new PipelineModel(pipelineConfig);
    });

    afterEach(() => {
        datastore = null;
        mockery.deregisterAll();
        mockery.resetCache();
    });

    after(() => {
        mockery.disable();
    });

    it('extends base class', () => {
        assert.instanceOf(pipeline, PipelineModel);
        assert.instanceOf(pipeline, BaseModel);

        schema.models.pipeline.allKeys.forEach((key) => {
            assert.strictEqual(pipeline[key], pipelineConfig[key]);
        });
    });

    const getUserPermissionMocks = (a) => {
        userFactoryMock.get.withArgs({ username: a.username, scmContext }).resolves({
            unsealToken: sinon.stub().resolves('foo'),
            getPermissions: sinon.stub().resolves({
                push: a.push,
                admin: a.admin
            }),
            username: a.username
        });
    };

    describe('addWebhook', () => {
        beforeEach(() => {
            getUserPermissionMocks({ username: 'batman', push: true });
            getUserPermissionMocks({ username: 'robin', push: true });
            pipeline.admins = { batman: true, robin: true };
            pipeline.update = sinon.stub().resolves('foo');
        });

        it('updates the webhook', () => {
            scmMock.addWebhook.resolves(null);

            return pipeline.addWebhook('https://api.screwdriver.cd/v4/webhooks')
                .then(() => {
                    assert.calledWith(scmMock.addWebhook, {
                        scmUri,
                        scmContext,
                        token: 'foo',
                        webhookUrl: 'https://api.screwdriver.cd/v4/webhooks'
                    });
                });
        });

        it('rejects if there is a failure to update the webhook', () => {
            scmMock.addWebhook.rejects(new Error('error adding webhooks'));

            return pipeline.addWebhook('https://api.screwdriver.cd/v4/webhooks')
                .then(() => assert.fail('should not get here'), (err) => {
                    assert.instanceOf(err, Error);
                    assert.equal(err.message, 'error adding webhooks');
                });
        });
    });

    describe.only('sync', () => {
        let publishMock;
        let mainMock;
        let mainModelMock;
        let publishModelMock;

        beforeEach(() => {
            datastore.update.resolves(null);
            scmMock.getFile.resolves('superyamlcontent');
            scmMock.addWebhook.resolves();
            parserMock.withArgs('superyamlcontent', templateFactoryMock).resolves(PARSED_YAML);
            parserMock.withArgs('yamlcontentwithscmurls', templateFactoryMock)
                .resolves(EXTERNAL_PARSED_YAML);
            getUserPermissionMocks({ username: 'batman', push: true });
            getUserPermissionMocks({ username: 'robin', push: true });
            pipeline.admins = { batman: true, robin: true };
            triggerFactoryMock.list.resolves([]);
            triggerFactoryMock.create.resolves(null);

            mainModelMock = {
                isPR: sinon.stub().returns(false),
                update: sinon.stub(),
                id: 1,
                name: 'main',
                state: 'ENABLED'
            };

            publishModelMock = {
                isPR: sinon.stub().returns(false),
                update: sinon.stub(),
                id: 2,
                name: 'publish',
                state: 'ENABLED'
            };

            publishMock = {
                pipelineId: testId,
                name: 'publish',
                permutations: [{
                    commands: [
                        { command: 'npm run bump', name: 'bump' },
                        { command: 'npm publish --tag $NODE_TAG', name: 'publish' },
                        { command: 'git push origin --tags', name: 'tag' }
                    ],
                    environment: { NODE_ENV: 'test', NODE_TAG: 'latest' },
                    image: 'node:4'
                }]
            };
            mainMock = {
                pipelineId: testId,
                name: 'main',
                permutations: [{
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
                }]
            };
        });

        it('create external trigger in datastore for new jobs', () => {
            jobs = [];
            parserMock.withArgs('superyamlcontent', templateFactoryMock)
                .resolves(PARSED_YAML_WITH_REQUIRES);
            mainMock.permutations.forEach((p) => {
                p.requires = ['~pr', '~commit', '~sd@12345:test'];
            });
            publishMock.permutations[0].requires = ['main'];
            jobFactoryMock.list.resolves(jobs);
            jobFactoryMock.create.withArgs(mainMock).resolves(mainModelMock);
            jobFactoryMock.create.withArgs(publishMock).resolves(publishModelMock);

            return pipeline.sync().then(() => {
                assert.calledOnce(triggerFactoryMock.create); // only create for external trigger
                assert.calledWith(triggerFactoryMock.create, {
                    src: '~sd@12345:test',
                    dest: `~sd@${testId}:main`
                });
            });
        });

        it('remove external trigger in datastore if it is not in requires anymore', () => {
            const triggerMock = {
                src: '~sd@8765:oldrequires', // no longer requires
                dest: `~sd@${testId}:main`,
                remove: sinon.stub().resolves(null)
            };

            jobFactoryMock.list.resolves([mainModelMock, publishModelMock]);
            mainModelMock.update.resolves(mainModelMock);
            publishModelMock.update.resolves(publishModelMock);
            triggerFactoryMock.list.onCall(0).resolves([triggerMock]);
            triggerFactoryMock.list.onCall(1).resolves([]);

            return pipeline.sync().then(() => {
                assert.calledOnce(triggerMock.remove);
            });
        });

        it('do not remove external trigger in datastore if still in requires', () => {
            const triggerMock = {
                src: '~sd@12345:test',
                dest: `~sd@${testId}:main`,
                remove: sinon.stub().resolves(null)
            };

            parserMock.withArgs('superyamlcontent', templateFactoryMock)
                .resolves(PARSED_YAML_WITH_REQUIRES);
            jobFactoryMock.list.resolves([mainModelMock, publishModelMock]);
            mainModelMock.update.resolves(mainModelMock);
            publishModelMock.update.resolves(publishModelMock);
            triggerFactoryMock.list.onCall(0).resolves([triggerMock]);
            triggerFactoryMock.list.onCall(1).resolves([]);

            return pipeline.sync().then(() => {
                assert.notCalled(triggerMock.remove);
                assert.notCalled(triggerFactoryMock.create);
            });
        });

        it('stores workflowGraph to pipeline', () => {
            jobs = [];
            jobFactoryMock.list.resolves(jobs);
            jobFactoryMock.create.withArgs(mainMock).resolves(mainModelMock);
            jobFactoryMock.create.withArgs(publishMock).resolves(publishModelMock);

            return pipeline.sync().then(() => {
                assert.deepEqual(pipeline.workflowGraph, {
                    nodes: [
                        { name: '~pr' },
                        { name: '~commit' },
                        { name: 'main', id: 1 },
                        { name: 'publish', id: 2 }
                    ],
                    edges: [
                        { src: '~pr', dest: 'main' },
                        { src: '~commit', dest: 'main' },
                        { src: 'main', dest: 'publish' }
                    ]
                });
            });
        });

        it('gets job config from the given ref/sha if passed in', () => {
            const ref = 'shafromoldevent';
            // deep clone PARSED_YAML
            const YAML_FROM_SHA = JSON.parse(JSON.stringify(PARSED_YAML));

            YAML_FROM_SHA.jobs.publish[0].commands = [
                {
                    name: 'old-step',
                    command: 'echo old step from a specific sha'
                }
            ];
            scmMock.getFile.withArgs(sinon.match({ ref })).resolves('yamlcontentfromsha');
            parserMock.withArgs('yamlcontentfromsha', templateFactoryMock).resolves(YAML_FROM_SHA);
            publishMock.permutations[0].commands = YAML_FROM_SHA.jobs.publish[0].commands;
            jobs = [];
            jobFactoryMock.list.resolves(jobs);
            jobFactoryMock.create.withArgs(mainMock).resolves(mainModelMock);
            jobFactoryMock.create.withArgs(publishMock).resolves(publishModelMock);

            return pipeline.sync(ref).then(() => {
                assert.calledWith(scmMock.getFile, sinon.match({ ref }));
                assert.calledTwice(jobFactoryMock.create);
                assert.calledWith(jobFactoryMock.create, publishMock);
            });
        });

        it('stores annotations to pipeline', () => {
            jobs = [];
            jobFactoryMock.list.resolves(jobs);
            jobFactoryMock.create.withArgs(publishMock).resolves(publishMock);
            jobFactoryMock.create.withArgs(mainMock).resolves(mainMock);

            return pipeline.sync().then(() => {
                assert.deepEqual(pipeline.annotations, {
                    'beta.screwdriver.cd/executor': 'screwdriver-executor-vm'
                });
            });
        });

        it('creates new jobs', () => {
            jobs = [];
            jobFactoryMock.list.resolves(jobs);
            jobFactoryMock.create.withArgs(publishMock).resolves(publishMock);
            jobFactoryMock.create.withArgs(mainMock).resolves(mainMock);

            return pipeline.sync()
                .then((p) => {
                    assert.equal(p.id, testId);
                    assert.calledWith(scmMock.getFile, {
                        scmUri,
                        scmContext,
                        path: 'screwdriver.yaml',
                        token: 'foo'
                    });
                    assert.calledWith(parserMock, 'superyamlcontent', templateFactoryMock);
                    assert.calledWith(jobFactoryMock.create, publishMock);
                    assert.calledWith(jobFactoryMock.create, mainMock);
                });
        });

        it('updates existing jobs that are in the config', () => {
            jobs = [mainModelMock, publishModelMock];
            jobFactoryMock.list.resolves(jobs);
            mainModelMock.update.resolves(mainModelMock);
            publishModelMock.update.resolves(publishModelMock);

            return pipeline.sync()
                .then(() => {
                    assert.calledOnce(jobs[0].update);
                    assert.deepEqual(jobs[0].archived, false);
                    assert.deepEqual(jobs[0].permutations, [{
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
                    }]);
                    assert.calledOnce(jobs[1].update);
                    assert.deepEqual(jobs[1].archived, false);
                    assert.deepEqual(jobs[1].permutations, [{
                        commands: [
                            { command: 'npm run bump', name: 'bump' },
                            { command: 'npm publish --tag $NODE_TAG', name: 'publish' },
                            { command: 'git push origin --tags', name: 'tag' }
                        ],
                        environment: { NODE_ENV: 'test', NODE_TAG: 'latest' },
                        image: 'node:4'
                    }]);
                });
        });

        it('disable jobs if they are not in the config', () => {
            const disableJobMock = {
                update: sinon.stub(),
                isPR: sinon.stub().returns(false),
                name: 'banana',
                state: 'ENABLED'
            };

            jobs = [mainModelMock, publishModelMock, disableJobMock];
            jobFactoryMock.list.resolves(jobs);
            mainModelMock.update.resolves(mainModelMock);
            publishModelMock.update.resolves(publishModelMock);
            disableJobMock.update.resolves(disableJobMock);

            return pipeline.sync()
                .then(() => {
                    assert.calledOnce(disableJobMock.update);
                    assert.equal(disableJobMock.archived, true);
                });
        });

        it('does nothing if the job is a PR job', () => {
            const prJobMock = {
                update: sinon.stub(),
                isPR: sinon.stub().returns(true),
                name: 'PR-1',
                state: 'ENABLED'
            };

            jobs = [mainModelMock, publishModelMock, prJobMock];
            mainModelMock.update.resolves(mainModelMock);
            publishModelMock.update.resolves(publishModelMock);
            jobFactoryMock.list.resolves(jobs);

            return pipeline.sync()
                .then(() => {
                    assert.notCalled(prJobMock.update);
                });
        });

        it('returns error if something explodes', () => {
            const error = new Error('blah');

            jobFactoryMock.list.rejects(error);

            return pipeline.sync()
                .catch((err) => {
                    assert.deepEqual(err, error);
                });
        });

        it('Sync child pipeline if detects changes in scmUrls', () => {
            const parsedYaml = hoek.clone(EXTERNAL_PARSED_YAML);

            parsedYaml.childPipelines = {
                scmUrls: [
                    'foo.git',
                    'bar.git'
                ]
            };
            jobs = [mainJob, publishJob];
            jobFactoryMock.list.resolves(jobs);
            getUserPermissionMocks({ username: 'batman', push: true, admin: true });
            scmMock.getFile.resolves('yamlcontentwithscmurls');
            parserMock.withArgs('yamlcontentwithscmurls', templateFactoryMock)
                .resolves(parsedYaml);
            pipelineFactoryMock.scm.parseUrl.withArgs(sinon.match({
                checkoutUrl: 'foo.git'
            })).resolves('foo');
            pipelineFactoryMock.scm.parseUrl.withArgs(sinon.match({
                checkoutUrl: 'bar.git'
            })).resolves('bar');
            pipelineFactoryMock.scm.parseUrl.withArgs(sinon.match({
                checkoutUrl: 'baz.git'
            })).resolves('baz');
            pipelineFactoryMock.get.resolves(childPipelineMock);
            pipelineFactoryMock.get.withArgs({ scmUri: 'bar' }).resolves(null);
            pipeline.childPipelines = {
                scmUrls: [
                    'baz.git'
                ]
            };

            return pipeline.sync()
                .then((p) => {
                    assert.equal(p.id, testId);
                    assert.deepEqual(p.childPipelines.scmUrls, [
                        'foo.git',
                        'bar.git'
                    ]);
                    assert.calledWith(parserMock, 'yamlcontentwithscmurls', templateFactoryMock);
                    assert.calledOnce(pipelineFactoryMock.create);
                    assert.calledOnce(childPipelineMock.update);
                    assert.calledOnce(childPipelineMock.remove);
                });
        });

        it('Do not sync child pipelines if no admin permissions', () => {
            jobs = [mainJob, publishJob];
            jobFactoryMock.list.resolves(jobs);
            pipelineFactoryMock.scm.parseUrl.withArgs(sinon.match({
                checkoutUrl: 'foo.git'
            })).resolves('foo');
            pipelineFactoryMock.get.resolves(null);
            scmMock.getFile.resolves('yamlcontentwithscmurls');

            return pipeline.sync()
                .then((p) => {
                    assert.equal(p.id, testId);
                    assert.notCalled(pipelineFactoryMock.create);
                });
        });

        it('Do not update child pipelines if not belong to this parent', () => {
            jobs = [mainJob, publishJob];
            jobFactoryMock.list.resolves(jobs);
            getUserPermissionMocks({ username: 'batman', push: true, admin: true });
            pipelineFactoryMock.scm.parseUrl.withArgs(sinon.match({
                checkoutUrl: 'bar.git'
            })).resolves('bar');
            childPipelineMock.configPipelineId = 456;
            pipelineFactoryMock.get.resolves(childPipelineMock);
            scmMock.getFile.resolves('yamlcontentwithscmurls');

            return pipeline.sync()
                .then((p) => {
                    assert.equal(p.id, testId);
                    assert.notCalled(pipelineFactoryMock.update);
                });
        });

        it('Remove child pipeline and reset scmUrls if it is removed from new yaml', () => {
            jobs = [mainJob, publishJob];
            jobFactoryMock.list.resolves(jobs);
            getUserPermissionMocks({ username: 'batman', push: true, admin: true });
            pipelineFactoryMock.scm.parseUrl.withArgs(sinon.match({
                checkoutUrl: 'bar.git'
            })).resolves('bar');
            childPipelineMock.configPipelineId = 456;
            pipelineFactoryMock.get.resolves(childPipelineMock);
            pipeline.childPipelines = {
                scmUrls: [
                    'bar.git'
                ]
            };

            return pipeline.sync()
                .then((p) => {
                    assert.equal(p.id, testId);
                    assert.equal(p.childPipelines, null);
                    assert.calledOnce(childPipelineMock.remove);
                });
        });
        it.only('does not sync child pipelines if the YAML has errors', () => {
            scmMock.getFile.resolves('yamlcontentwithscmurls');
            parserMock.withArgs('yamlcontentwithscmurls', templateFactoryMock)
                .resolves(PARSED_YAML_WITH_ERRORS);
            jobs = [mainJob];
            jobFactoryMock.list.resolves(jobs);
            getUserPermissionMocks({ username: 'batman', push: true, admin: true });
            pipelineFactoryMock.scm.parseUrl.withArgs(sinon.match({
                checkoutUrl: 'foo.git'
            })).resolves('foo');
            childPipelineMock.configPipelineId = 456;
            pipelineFactoryMock.get.resolves(childPipelineMock);
            pipeline.childPipelines = EXTERNAL_PARSED_YAML.childPipelines;

            return pipeline.sync()
                .then((p) => {
                    assert.equal(p.id, testId);
                    assert.deepEqual(p.childPipelines, EXTERNAL_PARSED_YAML.childPipelines);
                    assert.notCalled(childPipelineMock.remove);
                });
        });
    });

    describe('syncPR', () => {
        let prJob;

        beforeEach(() => {
            datastore.update.resolves(null);
            scmMock.getFile.resolves('superyamlcontent');
            scmMock.getPrInfo.resolves({ ref: 'pulls/1/merge' });
            parserMock.withArgs('superyamlcontent', templateFactoryMock).resolves(PARSED_YAML);
            getUserPermissionMocks({ username: 'batman', push: true });
            getUserPermissionMocks({ username: 'robin', push: true });
            pipeline.admins = { batman: true, robin: true };
            prJob = {
                update: sinon.stub().resolves(null),
                isPR: sinon.stub().returns(true),
                name: 'PR-1:main',
                state: 'ENABLED',
                archived: false
            };
        });

        it('update PR config', () => {
            jobFactoryMock.list.resolves([prJob]);

            return pipeline.syncPR(1).then(() => {
                assert.calledWith(scmMock.getFile, {
                    path: 'screwdriver.yaml',
                    ref: 'pulls/1/merge',
                    scmUri,
                    scmContext,
                    token: 'foo'
                });
                assert.called(prJob.update);
                assert.deepEqual(prJob.permutations, PARSED_YAML.jobs.main);
                assert.isFalse(prJob.archived);
            });
        });

        it('update PR config for multiple PR jobs and create missing PR jobs', () => {
            const firstPRJob = {
                update: sinon.stub().resolves(null),
                isPR: sinon.stub().returns(true),
                name: 'PR-1:main',
                state: 'ENABLED',
                archived: false
            };
            const secondPRJob = {
                update: sinon.stub().resolves(null),
                isPR: sinon.stub().returns(true),
                name: 'PR-1:publish',
                state: 'ENABLED',
                archived: false
            };
            const clonedYAML = JSON.parse(JSON.stringify(PARSED_YAML_PR));

            clonedYAML.workflowGraph.edges.push({
                src: '~pr', dest: 'publish'
            });

            jobFactoryMock.list.resolves([firstPRJob, secondPRJob]);
            parserMock.withArgs('superyamlcontent', templateFactoryMock).resolves(clonedYAML);

            return pipeline.syncPR(1).then(() => {
                assert.calledWith(scmMock.getFile, {
                    path: 'screwdriver.yaml',
                    ref: 'pulls/1/merge',
                    scmUri,
                    scmContext,
                    token: 'foo'
                });
                assert.calledOnce(firstPRJob.update);
                assert.calledOnce(secondPRJob.update);
                assert.calledWith(jobFactoryMock.create, sinon.match({
                    pipelineId: 123,
                    name: 'PR-1:new_pr_job'
                }));
                assert.deepEqual(firstPRJob.permutations, clonedYAML.jobs.main);
                assert.deepEqual(secondPRJob.permutations, clonedYAML.jobs.publish);
                assert.isFalse(firstPRJob.archived);
                assert.isFalse(secondPRJob.archived);
            });
        });

        it('archives outdated PR job', () => {
            const firstPRJob = {
                update: sinon.stub().resolves(null),
                isPR: sinon.stub().returns(true),
                name: 'PR-1:main',
                state: 'ENABLED',
                archived: false
            };
            const secondPRJob = {
                update: sinon.stub().resolves(null),
                isPR: sinon.stub().returns(true),
                name: 'PR-1:publish',
                state: 'ENABLED',
                archived: false
            };

            jobFactoryMock.list.resolves([firstPRJob, secondPRJob]);
            parserMock.withArgs('superyamlcontent', templateFactoryMock).resolves(PARSED_YAML_PR);

            return pipeline.syncPR(1).then(() => {
                assert.calledWith(scmMock.getFile, {
                    path: 'screwdriver.yaml',
                    ref: 'pulls/1/merge',
                    scmUri,
                    scmContext,
                    token: 'foo'
                });
                assert.calledOnce(firstPRJob.update);
                assert.calledOnce(secondPRJob.update);
                assert.calledWith(jobFactoryMock.create, sinon.match({
                    pipelineId: 123,
                    name: 'PR-1:new_pr_job'
                }));
                assert.deepEqual(firstPRJob.permutations, PARSED_YAML_PR.jobs.main);
                assert.isFalse(firstPRJob.archived);
                assert.isTrue(secondPRJob.archived);
            });
        });

        it('returns error if fails to get configuration', () => {
            const error = new Error('fails to get config');

            scmMock.getFile.rejects(error);
            parserMock.rejects(error);

            return pipeline.syncPR(1).catch((err) => {
                assert.deepEqual(err, error);
            });
        });

        it('returns error if fails to get PR job', () => {
            const error = new Error('fails to get job');

            jobFactoryMock.list.rejects(error);

            return pipeline.syncPR(1).catch((err) => {
                assert.deepEqual(err, error);
            });
        });
    });

    describe('syncPRs', () => {
        let prJob;

        beforeEach(() => {
            datastore.update.resolves(null);
            scmMock.getFile.resolves('superyamlcontent');
            parserMock.withArgs('superyamlcontent', templateFactoryMock).resolves(PARSED_YAML);
            getUserPermissionMocks({ username: 'batman', push: true });
            getUserPermissionMocks({ username: 'robin', push: true });
            pipeline.admins = { batman: true, robin: true };
            prJob = {
                update: sinon.stub().resolves(null),
                isPR: sinon.stub().returns(true),
                name: 'PR-1',
                state: 'ENABLED',
                archived: false
            };
            jobs = [mainJob, prJob];
            jobFactoryMock.list.resolves(jobs);
        });

        it('archive PR job if it is closed', () => {
            scmMock.getOpenedPRs.resolves([]);

            return pipeline.syncPRs()
                .then(() => {
                    assert.calledOnce(prJob.update);
                    assert.equal(prJob.archived, true);
                });
        });

        it('create PR job if it is opened and not in the existing jobs', () => {
            prJob.archived = true;
            const prJob2 = {
                pipelineId: testId,
                name: 'PR-2',
                permutations: PARSED_YAML.jobs.main
            };

            scmMock.getOpenedPRs.resolves([{ name: 'PR-2', ref: 'abc' }]);
            jobFactoryMock.create.resolves(prJob2);

            return pipeline.syncPRs()
                .then(() => {
                    assert.calledWith(jobFactoryMock.create, {
                        pipelineId: testId,
                        name: 'PR-2:main',
                        permutations: PARSED_YAML.jobs.main
                    });
                });
        });

        it('unarchive PR job if it was previously archived', () => {
            prJob.archived = true;
            scmMock.getOpenedPRs.resolves([{ name: 'PR-1', ref: 'abc' }]);

            return pipeline.syncPRs()
                .then(() => {
                    assert.calledOnce(prJob.update);
                    assert.equal(prJob.archived, false);
                });
        });

        it('does nothing if it PR is not archived', () => {
            scmMock.getOpenedPRs.resolves([{ name: 'PR-1', ref: 'abc' }]);

            return pipeline.syncPRs()
                .then(() => {
                    assert.notCalled(prJob.update);
                    assert.notCalled(jobFactoryMock.create);
                });
        });
    });

    describe('get admin', () => {
        beforeEach(() => {
            userFactoryMock.get.resolves({
                getPermissions: sinon.stub().resolves({
                    push: true
                })
            });
        });

        it('has an admin getter', () => {
            // when we fetch a user it resolves to a promise
            assert.isFunction(pipeline.admin.then);
            // and a factory is called to create that promise
            assert.called(userFactoryMock.get);

            // When we call pipeline.admin again it is still a promise
            assert.isFunction(pipeline.admin.then);
            // ...but the factory was not recreated, since the promise is stored
            // as the model's pipeline property, now
            assert.called(userFactoryMock.get);
        });
    });

    describe('getFirstAdmin', () => {
        beforeEach(() => {
            getUserPermissionMocks({ username: 'batman', push: false });
            getUserPermissionMocks({ username: 'robin', push: true });
            pipeline.admins = { batman: true, robin: true };
            pipeline.update = sinon.stub().resolves('foo');
        });

        it('has an admin robin', () => {
            const admin = pipeline.getFirstAdmin();

            return admin.then((realAdmin) => {
                assert.equal(realAdmin.username, 'robin');
            });
        });

        it('has no admin', () => {
            getUserPermissionMocks({ username: 'batman', push: false });
            getUserPermissionMocks({ username: 'robin', push: false });

            return pipeline.getFirstAdmin().then(() => {
                assert.fail('should not get here');
            }).catch((e) => {
                assert.isOk(e);
                assert.equal(e.message, 'Pipeline has no admin');
            });
        });
    });

    describe('get token', () => {
        beforeEach(() => {
            getUserPermissionMocks({ username: 'batman', push: true });
            getUserPermissionMocks({ username: 'robin', push: true });
            pipeline.admins = { batman: true, robin: true };
            pipeline.update = sinon.stub().resolves('foo');
        });

        it('has an token getter', () =>
            pipeline.token.then((token) => {
                assert.equal(token, 'foo');
            })
        );
    });

    describe('get branch', () => {
        it('has an branch getter', () => {
            pipeline.branch.then((branch) => {
                assert.equal(branch, 'master');
            });
        });

        it('return blank if scmUri is blank', () => {
            pipeline.scmUri = '';
            pipeline.branch.then((branch) => {
                assert.equal(branch, '');
            });
        });

        it('return blank if scmUri is invalid', () => {
            pipeline.scmUri = 'github.com:1234';
            pipeline.branch.then((branch) => {
                assert.equal(branch, '');
            });
        });
    });

    describe('get jobs', () => {
        it('has a jobs getter', () => {
            const listConfig = {
                params: {
                    pipelineId: pipeline.id
                },
                paginate
            };

            jobFactoryMock.list.resolves(null);
            // when we fetch jobs it resolves to a promise
            assert.isFunction(pipeline.jobs.then);
            // and a factory is called to create that promise
            assert.calledWith(jobFactoryMock.list, listConfig);

            // When we call pipeline.jobs again it is still a promise
            assert.isFunction(pipeline.jobs.then);
            // ...but the factory was not recreated, since the promise is stored
            // as the model's pipeline property, now
            assert.calledOnce(jobFactoryMock.list);
        });
    });

    describe('get secrets', () => {
        it('has a secrets getter', () => {
            const listConfig = {
                params: {
                    pipelineId: pipeline.id
                },
                paginate
            };

            secretFactoryMock.list.resolves(null);
            // when we fetch secrets it resolves to a promise
            assert.isFunction(pipeline.secrets.then);
            // and a factory is called to create that promise
            assert.calledWith(secretFactoryMock.list, listConfig);

            // When we call pipeline.secrets again it is still a promise
            assert.isFunction(pipeline.secrets.then);
            // ...but the factory was not recreated, since the promise is stored
            // as the model's pipeline property, now
            assert.calledOnce(secretFactoryMock.list);
        });

        it('gets config pipeline\'s secrets', () => {
            const childPipelineId = 1234;

            pipelineConfig.id = childPipelineId;
            pipelineConfig.configPipelineId = pipeline.id;

            const childPipeline = new PipelineModel(pipelineConfig);

            const childPipelineSecrets = [
                {
                    name: 'TEST',
                    value: 'child test value',
                    allowInPR: true,
                    pipelineId: childPipeline.id
                }
            ];
            const configPipelineSecrets = [
                {
                    name: 'TEST',
                    value: 'config test value',
                    allowInPR: true,
                    pipelineId: pipeline.id
                },
                {
                    name: 'ANOTHER',
                    value: 'another value',
                    allowInPR: true,
                    pipelineId: pipeline.id
                }
            ];

            const childPipelineListConfig = {
                params: {
                    pipelineId: childPipeline.id
                },
                paginate
            };
            const configPipelineListConfig = {
                params: {
                    pipelineId: pipeline.id
                },
                paginate
            };

            secretFactoryMock.list.onCall(0).resolves(childPipelineSecrets);
            secretFactoryMock.list.onCall(1).resolves(configPipelineSecrets);

            return childPipeline.secrets.then((secrets) => {
                // Both the configPipeline and childPipeline secrets are fetched
                assert.calledTwice(secretFactoryMock.list);
                assert.calledWith(secretFactoryMock.list, childPipelineListConfig);
                assert.calledWith(secretFactoryMock.list, configPipelineListConfig);
                // There should only be 2 secrets since both pipelines have a secret named 'TEST'
                assert.strictEqual(secrets.length, 2);
                // The 'TEST' secret should match that of the child pipeline
                assert.deepEqual(secrets[0], childPipelineSecrets[0]);
                // The secrets array should contain the config pipeline's 'ANOTHER' secret
                assert.deepEqual(secrets[1], configPipelineSecrets[1]);
            });
        });
    });

    describe('get jobs', () => {
        it('Get all jobs', () => {
            const expected = {
                params: {
                    pipelineId: 123,
                    archived: false
                },
                paginate
            };

            const jobList = [publishJob, mainJob, pr10, pr3];
            const expectedJobs = [publishJob, mainJob, pr3, pr10];

            jobFactoryMock.list.resolves(jobList);

            return pipeline.getJobs().then((result) => {
                assert.calledWith(jobFactoryMock.list, expected);
                assert.deepEqual(result, expectedJobs);
            });
        });

        it('Only gets PR jobs', () => {
            const config = {
                type: 'pr'
            };
            const expected = {
                params: {
                    pipelineId: 123,
                    archived: false
                },
                paginate
            };
            const jobList = [publishJob, mainJob, pr10, pr3];
            const expectedJobs = [pr3, pr10];

            jobFactoryMock.list.resolves(jobList);

            return pipeline.getJobs(config).then((result) => {
                assert.calledWith(jobFactoryMock.list, expected);
                assert.deepEqual(result, expectedJobs);
            });
        });

        it('Only gets Pipeline jobs', () => {
            const config = {
                type: 'pipeline'
            };
            const expected = {
                params: {
                    pipelineId: 123,
                    archived: false
                },
                paginate
            };
            const jobList = [publishJob, mainJob, pr10, pr3];
            const expectedJobs = [publishJob, mainJob];

            jobFactoryMock.list.resolves(jobList);

            return pipeline.getJobs(config).then((result) => {
                assert.calledWith(jobFactoryMock.list, expected);
                assert.deepEqual(result, expectedJobs);
            });
        });

        it('Get archived jobs', () => {
            const config = {
                params: {
                    archived: true
                }
            };
            const expected = {
                params: {
                    pipelineId: 123,
                    archived: true
                },
                paginate
            };

            publishJob.archived = true;

            const jobList = [publishJob, mainJob];

            jobFactoryMock.list.resolves(jobList);

            return pipeline.getJobs(config).then((result) => {
                assert.calledWith(jobFactoryMock.list, expected);
                assert.deepEqual(result, [publishJob]);
            });
        });
    });

    describe('get events', () => {
        const events = [{
            id: '12345f642bbfd1886623964b4cff12db59869e5d'
        }, {
            id: '12855123cc7f1b808aac07feff24d7d5362cc215'
        }];

        it('Get list of events', () => {
            const expected = {
                params: {
                    pipelineId: 123,
                    type: 'pipeline'
                },
                sort: 'descending',
                paginate
            };

            eventFactoryMock.list.resolves(events);

            return pipeline.getEvents().then((result) => {
                assert.calledWith(eventFactoryMock.list, expected);
                assert.deepEqual(result, events);
            });
        });

        it('Merge the passed in config with the default config', () => {
            const expected = {
                params: {
                    pipelineId: 123,
                    type: 'pr'
                },
                sort: 'descending',
                paginate: {
                    page: 1,
                    count: 50
                }
            };

            eventFactoryMock.list.resolves(events);

            return pipeline.getEvents({
                params: {
                    type: 'pr'
                }
            }).then(() => {
                assert.calledWith(eventFactoryMock.list, expected);
            });
        });

        it('Rejects with errors', () => {
            eventFactoryMock.list.rejects(new Error('cannotgetit'));

            return pipeline.getEvents()
                .then(() => {
                    assert.fail('Should not get here');
                }).catch((err) => {
                    assert.instanceOf(err, Error);
                    assert.equal(err.message, 'cannotgetit');
                });
        });
    });

    describe('getConfiguration', () => {
        beforeEach(() => {
            scmMock.getFile.resolves('superyamlcontent');
            parserMock.withArgs('superyamlcontent', templateFactoryMock).resolves(PARSED_YAML);
            parserMock.withArgs('', templateFactoryMock).resolves('DEFAULT_YAML');
            getUserPermissionMocks({ username: 'batman', push: true });
            getUserPermissionMocks({ username: 'robin', push: true });
            pipeline.admins = { batman: true, robin: true };
            pipeline.update = sinon.stub().resolves('foo');
        });

        it('gets pipeline config', () =>
            pipeline.getConfiguration()
                .then((config) => {
                    assert.equal(config, PARSED_YAML);
                    assert.calledWith(scmMock.getFile, {
                        scmUri,
                        scmContext,
                        path: 'screwdriver.yaml',
                        token: 'foo'
                    });
                    assert.calledWith(parserMock, 'superyamlcontent', templateFactoryMock);
                })
        );

        it('gets pipeline config from an alternate ref', () =>
            pipeline.getConfiguration({ ref: 'bar' })
                .then((config) => {
                    assert.equal(config, PARSED_YAML);
                    assert.calledWith(scmMock.getFile, {
                        scmUri,
                        scmContext,
                        path: 'screwdriver.yaml',
                        token: 'foo',
                        ref: 'bar'
                    });
                    assert.calledWith(parserMock, 'superyamlcontent', templateFactoryMock);
                })
        );

        it('gets config from external config pipeline', () => {
            pipeline.configPipelineId = 1;

            return pipeline.getConfiguration()
                .then((config) => {
                    assert.calledWith(configPipelineMock.getConfiguration, { ref: undefined });
                    assert.equal(config, EXTERNAL_PARSED_YAML);
                });
        });

        it('gets config from external config pipeline with an alternate ref', () => {
            pipeline.configPipelineId = 1;

            return pipeline.getConfiguration({
                ref: 'bar'
            })
                .then((config) => {
                    assert.calledWith(configPipelineMock.getConfiguration, {
                        ref: 'bar'
                    });
                    assert.equal(config, EXTERNAL_PARSED_YAML);
                });
        });

        it('Do not pass PR ref when get config from external pipeline', () => {
            pipeline.configPipelineId = 1;

            return pipeline.getConfiguration({
                ref: 'pull/1/ref',
                isPR: true
            })
                .then((config) => {
                    assert.calledWith(configPipelineMock.getConfiguration, {});
                    assert.equal(config, EXTERNAL_PARSED_YAML);
                });
        });

        it('converts fetch errors to empty file', () => {
            scmMock.getFile.rejects(new Error('cannotgetit'));

            return pipeline.getConfiguration({ ref: 'foobar' })
                .then((config) => {
                    assert.equal(config, 'DEFAULT_YAML');
                    assert.calledWith(scmMock.getFile, {
                        scmUri,
                        scmContext,
                        path: 'screwdriver.yaml',
                        token: 'foo',
                        ref: 'foobar'
                    });
                    assert.calledWith(parserMock, '', templateFactoryMock);
                });
        });
    });

    describe('update', () => {
        const scmRepo = {
            name: 'foo/bar',
            branch: 'master',
            url: 'https://github.com/foo/bar/tree/master'
        };

        it('updates a pipeline with a different scm repository and branch', () => {
            const expected = {
                params: {
                    admins: { d2lam: true },
                    id: 123,
                    scmContext,
                    scmRepo: {
                        branch: 'master',
                        name: 'foo/bar',
                        url: 'https://github.com/foo/bar/tree/master'
                    },
                    scmUri: 'github.com:12345:master'
                },
                table: 'pipelines'
            };

            scmMock.decorateUrl.resolves(scmRepo);
            userFactoryMock.get.withArgs({
                username: 'd2lam',
                scmContext
            }).resolves({
                unsealToken: sinon.stub().resolves('foo'),
                getPermissions: sinon.stub().resolves({
                    push: true
                })
            });
            datastore.update.resolves({});

            pipeline.scmUri = 'github.com:12345:master';
            pipeline.scmContext = scmContext;
            pipeline.admins = {
                d2lam: true
            };

            return pipeline.update().then((p) => {
                assert.calledWith(scmMock.decorateUrl, { scmUri, scmContext, token: 'foo' });
                assert.calledWith(datastore.update, expected);
                assert.ok(p);
            });
        });

        it('updates a pipeline without updating scmUri when it has not changes', () => {
            const expected = {
                params: {
                    admins: { d2lam: true },
                    id: 123,
                    scmContext
                },
                table: 'pipelines'
            };

            scmMock.decorateUrl.resolves(scmRepo);
            userFactoryMock.get.withArgs({ username: 'd2lam' }).resolves({
                unsealToken: sinon.stub().resolves('foo'),
                getPermissions: sinon.stub().resolves({
                    push: true
                })
            });
            datastore.update.resolves({});

            pipeline.admins = {
                d2lam: true
            };

            return pipeline.update().then((p) => {
                assert.notCalled(scmMock.decorateUrl);
                assert.calledWith(datastore.update, expected);
                assert.ok(p);
            });
        });
    });

    describe('remove', () => {
        let archived;
        let prType;
        const testEvent = {
            pipelineId: testId,
            remove: sinon.stub().resolves(null),
            sha: '1a6559a40e72c8bbe7def302e85d63f68ef177e4',
            type: 'pipeline',
            username: 'd2lam'
        };
        const secret = {
            name: 'TEST',
            value: 'testvalue',
            allowInPR: true,
            pipelineId: testId,
            remove: sinon.stub().resolves(null)
        };
        const token = {
            name: 'TEST_TOKEN',
            pipelineId: testId,
            remove: sinon.stub().resolves(null)
        };

        beforeEach(() => {
            archived = {
                params: {
                    pipelineId: testId,
                    archived: true
                },
                paginate
            };

            prType = {
                params: {
                    pipelineId: testId,
                    type: 'pr'
                },
                paginate,
                sort: 'descending'
            };

            eventFactoryMock.list.resolves([]);
            jobFactoryMock.list.resolves([]);
            secretFactoryMock.list.resolves([secret]);
            tokenFactoryMock.list.resolves([token]);
        });

        afterEach(() => {
            eventFactoryMock.list.reset();
            jobFactoryMock.list.reset();
            secretFactoryMock.list.reset();
            tokenFactoryMock.list.reset();
            publishJob.remove.reset();
            mainJob.remove.reset();
            blahJob.remove.reset();
            secret.remove.reset();
            token.remove.reset();
        });

        it('remove secrets', () =>
            pipeline.remove().then(() => {
                assert.calledOnce(secretFactoryMock.list);
                assert.calledOnce(secret.remove);
            })
        );

        it('remove tokens', () =>
            pipeline.remove().then(() => {
                assert.calledOnce(tokenFactoryMock.list);
                assert.calledOnce(token.remove);
            })
        );

        it('remove jobs recursively', () => {
            const nonArchived = hoek.clone(archived);
            let i;

            nonArchived.params.archived = false;

            for (i = 0; i < 4; i += 1) {
                jobFactoryMock.list.withArgs(nonArchived).onCall(i).resolves([publishJob, mainJob]);
            }
            jobFactoryMock.list.withArgs(nonArchived).onCall(i).resolves([]);

            for (i = 0; i < 2; i += 1) {
                jobFactoryMock.list.withArgs(archived).onCall(i).resolves([blahJob]);
            }
            jobFactoryMock.list.withArgs(archived).onCall(i).resolves([]);

            return pipeline.remove().then(() => {
                assert.callCount(jobFactoryMock.list, 8);

                // Delete all the jobs
                assert.callCount(publishJob.remove, 4);
                assert.callCount(mainJob.remove, 4);
                assert.callCount(blahJob.remove, 2);

                // Delete the pipeline
                assert.calledOnce(datastore.remove);
            });
        });

        it('fail if getJobs returns error', () => {
            jobFactoryMock.list.rejects(new Error('error'));

            return pipeline.remove().then(() => {
                assert.fail('should not get here');
            }).catch((err) => {
                assert.isOk(err);
                assert.equal(err.message, 'error');
            });
        });

        it('fail if job.remove returns error', () => {
            publishJob.remove.rejects(new Error('error removing job'));
            jobFactoryMock.list.resolves([publishJob, mainJob]);

            return pipeline.remove().then(() => {
                assert.fail('should not get here');
            }).catch((err) => {
                assert.isOk(err);
                assert.equal(err.message, 'error removing job');
            });
        });

        it('remove events recursively', () => {
            const pipelineType = hoek.clone(prType);
            let i;

            pipelineType.params.type = 'pipeline';

            for (i = 0; i < 4; i += 1) {
                eventFactoryMock.list.withArgs(pipelineType).onCall(i).resolves([testEvent]);
            }
            eventFactoryMock.list.withArgs(pipelineType).onCall(i).resolves([]);

            for (i = 0; i < 2; i += 1) {
                eventFactoryMock.list.withArgs(prType).onCall(i).resolves([testEvent]);
            }
            eventFactoryMock.list.withArgs(prType).onCall(i).resolves([]);

            return pipeline.remove().then(() => {
                assert.callCount(eventFactoryMock.list, 8);

                // Delete all the events
                assert.callCount(testEvent.remove, 6);

                // Delete the pipeline
                assert.calledOnce(datastore.remove);
            });
        });

        it('remove child pipelines', () => {
            pipelineFactoryMock.list.resolves([childPipelineMock, childPipelineMock]);

            return pipeline.remove().then(() => {
                // Delete all the child pipelines
                assert.callCount(childPipelineMock.remove, 2);

                // Delete the pipeline
                assert.calledOnce(datastore.remove);
            });
        });

        it('fail if getEvents returns error', () => {
            eventFactoryMock.list.rejects(new Error('error'));

            return pipeline.remove().then(() => {
                assert.fail('should not get here');
            }).catch((err) => {
                assert.isOk(err);
                assert.equal(err.message, 'error');
            });
        });

        it('fail if event.remove returns error', () => {
            testEvent.remove.rejects(new Error('error removing event'));
            eventFactoryMock.list.resolves([testEvent]);

            return pipeline.remove().then(() => {
                assert.fail('should not get here');
            }).catch((err) => {
                assert.isOk(err);
                assert.equal(err.message, 'error removing event');
            });
        });

        it('fail if secret.remove returns error', () => {
            secret.remove.rejects(new Error('error removing secret'));

            return pipeline.remove().then(() => {
                assert.fail('should not get here');
            }).catch((err) => {
                assert.isOk(err);
                assert.equal(err.message, 'error removing secret');
            });
        });

        it('fail if token.remove returns error', () => {
            secret.remove.reset();
            token.remove.rejects(new Error('error removing token'));

            return pipeline.remove().then(() => {
                assert.fail('should not get here');
            }).catch((err) => {
                assert.isOk(err);
                assert.equal(err.message, 'error removing token');
            });
        });
    });

    describe('get tokens', () => {
        it('has a tokens getter', () => {
            const listConfig = {
                params: {
                    pipelineId: testId
                },
                paginate
            };

            tokenFactoryMock.list.resolves(null);
            // when we fetch tokens it resolves to a promise
            assert.isFunction(pipeline.tokens.then);
            // and a factory is called to create that promise
            assert.calledWith(tokenFactoryMock.list, listConfig);

            // When we call user.tokens again it is still a promise
            assert.isFunction(pipeline.tokens.then);
            // ...but the factory was not recreated, since the promise is stored
            // as the model's tokens property, now
            assert.calledOnce(tokenFactoryMock.list);
        });
    });
});
