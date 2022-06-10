'use strict';

const { assert } = require('chai');
const mockery = require('mockery');
const sinon = require('sinon');
const hoek = require('@hapi/hoek');
const schema = require('screwdriver-data-schema');
const rewire = require('rewire');
const dayjs = require('dayjs');
const fs = require('fs');
const path = require('path');

sinon.assert.expose(assert, { prefix: '' });
const YAML_WITH_PROVIDER_FILE_PATH = '../data/yamlWithProviderPath.yaml';
const YAML_WITH_PROVIDER = '../data/yamlWithProvider.yaml';
const SHARED_PROVIDER_YAML = '../data/sharedProvider.yaml';
const PROVIDER_YAML = '../data/provider.yaml';
const PARSED_YAML_WITH_PROVIDER = require('../data/parserWithProvider.json');
const PARSED_YAML = require('../data/parser.json');
const PARSED_YAML_WITH_REQUIRES = require('../data/parserWithRequires.json');
const PARSED_YAML_PR = require('../data/parserWithWorkflowGraphPR.json');
const PARSED_YAML_WITH_ERRORS = require('../data/parserWithErrors.json');
const PARSED_YAML_WITH_SUBSCRIBE = require('../data/parserWithSubscribedScms.json');
const SCM_URL_FOO = 'git@github.com:baz/foo.git';
const SCM_URL_BAR = 'git@github.com:baz/bar.git';
const SCM_URL_BAZ = 'git@github.com:baz/baz.git';
const SCM_URL_GITLAB = 'git@gitlab.com:baz/foo.git';
const SCM_URL_GITLAB2 = 'git@gitlab.com:baz/bar.git';
const SCM_URL_GITLAB3 = 'git@gitlab.com:baz/baz.git';
const SCM_URLS = [SCM_URL_FOO];
const EXTERNAL_PARSED_YAML = hoek.applyToDefaults(PARSED_YAML, {
    annotations: { 'beta.screwdriver.cd/executor': 'screwdriver-executor-k8s' },
    childPipelines: {
        scmUrls: SCM_URLS
    }
});
const NON_CHAINPR_PARSED_YAML = hoek.applyToDefaults(PARSED_YAML_PR, {
    annotations: { 'screwdriver.cd/chainPR': false }
});
const DEFAULT_PAGE = 1;
const MAX_METRIC_GET_COUNT = 1000;
const FAKE_MAX_METRIC_GET_COUNT = 5;
const SCM_CONTEXT_GITHUB = 'github:github.com';
const SCM_CONTEXT_GITLAB = 'gitlab:gitlab.com';

/**
 * Load sample data from disk
 * @method loadData
 * @param  {String} name Filename to read (inside data dir)
 * @return {String}      Contents of file
 */
function loadData(name) {
    return fs.readFileSync(path.resolve(__dirname, name), 'utf-8');
}

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
    let buildFactoryMock;
    let templateFactoryMock;
    let buildClusterFactoryMock;
    let triggerFactoryMock;
    let pipelineFactoryMock;
    let collectionFactoryMock;
    let tokenFactoryMock;
    let configPipelineMock;
    let childPipelineMock;
    let buildClusterFactory;

    const dateNow = 1111111111;
    const scmUri = 'github.com:12345:master';
    const scmContext = 'github:github.com';
    const testId = 123;
    const admins = { batman: true, robin: true };
    const scmRepo = {
        name: 'foo/bar',
        branch: 'master',
        url: 'https://github.com/foo/bar/tree/master'
    };
    let jobs;
    let pipelineConfig;
    let publishJob;
    let mainJob;
    let blahJob;
    let testJob;
    let pr10;
    let pr3;
    let pr3Info;
    let pr10Info;

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
            name: 'iOS',
            managedByScrewdriver: false,
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

    const decorateJobMock = job => {
        const decorated = hoek.clone(job);

        decorated.isPR = sinon.stub().returns(false);
        decorated.prNum = null;
        decorated.remove = sinon.stub().resolves(null);
        decorated.update = sinon.stub().resolves(job);

        return decorated;
    };

    const getJobMocks = j => {
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

        testJob = getJobMocks({
            id: 100,
            name: 'test',
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

        pr3Info = {
            name: 'PR-3',
            ref: 'abc',
            title: 'Test ref abc',
            username: 'janedoe',
            createTime: '2018-10-10T21:35:31Z',
            url: '/PR-3',
            userProfile: '/janedoe'
        };

        pr10Info = {
            name: 'PR-10',
            ref: 'efg',
            title: 'Test ref efg',
            username: 'johnsmith',
            createTime: '2018-10-10T21:35:31Z',
            url: '/PR-3',
            userProfile: '/johnsmith'
        };

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
            get: sinon.stub(),
            getPullRequestJobsForPipelineSync: sinon.stub()
        };
        eventFactoryMock = {
            list: sinon.stub()
        };
        buildFactoryMock = {
            list: sinon.stub()
        };
        userFactoryMock = {
            get: sinon.stub(),
            getPermissions: sinon.stub()
        };
        secretFactoryMock = {
            list: sinon.stub()
        };
        templateFactoryMock = {};
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
            configPipelineId: testId,
            update: sinon.stub().resolves(null),
            remove: sinon.stub().resolves(null),
            sync: sinon.stub().resolves(null)
        };
        pipelineFactoryMock = {
            getExternalJoinFlag: sinon.stub(),
            getNotificationsValidationErrFlag: sinon.stub(),
            get: sinon.stub().resolves(configPipelineMock),
            update: sinon.stub().resolves(null),
            create: sinon.stub(),
            list: sinon.stub().resolves([]),
            scm: {
                parseUrl: sinon.stub()
            }
        };
        collectionFactoryMock = {
            list: sinon.stub().resolves([])
        };
        tokenFactoryMock = {
            list: sinon.stub()
        };
        scmMock = {
            addWebhook: sinon.stub(),
            getWebhookEventsMapping: sinon.stub().returns({ pr: 'pull_request' }),
            getFile: sinon.stub(),
            decorateUrl: sinon.stub().resolves(scmRepo),
            annotations: sinon.stub(),
            getOpenedPRs: sinon.stub(),
            getPrInfo: sinon.stub(),
            getScmContext: sinon.stub(),
            getReadOnlyInfo: sinon.stub().returns({})
        };
        parserMock = sinon.stub();
        pipelineFactoryMock.getExternalJoinFlag.returns(false);
        pipelineFactoryMock.getNotificationsValidationErrFlag.returns(true);

        buildClusterFactoryMock = {
            list: sinon.stub().resolves([]),
            get: sinon.stub().resolves(externalBuildCluster)
        };
        buildClusterFactory = {
            getInstance: sinon.stub().returns(buildClusterFactoryMock)
        };

        mockery.registerMock('./jobFactory', {
            getInstance: sinon.stub().returns(jobFactoryMock)
        });
        mockery.registerMock('./eventFactory', {
            getInstance: sinon.stub().returns(eventFactoryMock)
        });
        mockery.registerMock('./buildFactory', {
            getInstance: sinon.stub().returns(buildFactoryMock)
        });
        mockery.registerMock('./userFactory', {
            getInstance: sinon.stub().returns(userFactoryMock)
        });
        mockery.registerMock('./secretFactory', {
            getInstance: sinon.stub().returns(secretFactoryMock)
        });
        mockery.registerMock('./templateFactory', {
            getInstance: sinon.stub().returns(templateFactoryMock)
        });
        mockery.registerMock('./triggerFactory', {
            getInstance: sinon.stub().returns(triggerFactoryMock)
        });
        mockery.registerMock('screwdriver-hashr', hashaMock);
        mockery.registerMock('screwdriver-config-parser', parserMock);
        mockery.registerMock('./pipelineFactory', {
            getInstance: sinon.stub().returns(pipelineFactoryMock)
        });
        mockery.registerMock('./collectionFactory', {
            getInstance: sinon.stub().returns(collectionFactoryMock)
        });
        mockery.registerMock('./tokenFactory', {
            getInstance: sinon.stub().returns(tokenFactoryMock)
        });
        mockery.registerMock('./buildClusterFactory', buildClusterFactory);

        // eslint-disable-next-line global-require
        PipelineModel = require('../../lib/pipeline');
        // eslint-disable-next-line global-require
        BaseModel = require('../../lib/base');

        pipelineConfig = {
            datastore,
            id: testId,
            scmUri,
            scmContext,
            scmRepo: {
                branch: 'branch',
                url: 'https://host/owner/repo/tree/branch',
                name: 'owner/repo'
            },
            createTime: dateNow,
            admins,
            scm: scmMock,
            multiBuildClusterEnabled: true
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

        schema.models.pipeline.allKeys.forEach(key => {
            assert.strictEqual(pipeline[key], pipelineConfig[key]);
        });
    });

    const getUserPermissionMocks = (a, context = scmContext) => {
        userFactoryMock.get.withArgs({ username: a.username, scmContext: context }).resolves({
            unsealToken: sinon.stub().resolves('foo'),
            getPermissions: sinon.stub().resolves({
                push: a.push,
                admin: a.admin
            }),
            username: a.username
        });
    };

    const getChildPipelineMock = () => {
        return {
            id: Date.now(),
            configPipelineId: testId,
            update: sinon.stub().resolves(null),
            remove: sinon.stub().resolves(null),
            sync: sinon.stub().resolves(null)
        };
    };

    describe('addWebhooks', () => {
        beforeEach(() => {
            getUserPermissionMocks({ username: 'batman', push: true, admin: true });
            getUserPermissionMocks({ username: 'robin', push: true });
            pipeline.admins = { batman: true, robin: true };
            pipeline.update = sinon.stub().resolves('foo');
            scmMock.getReadOnlyInfo
                .withArgs({ scmContext: SCM_CONTEXT_GITLAB })
                .returns({ enabled: true, username: 'sd-buildbot', accessToken: 'tokenRO' });
        });

        it('updates the webhook', () => {
            scmMock.addWebhook.resolves(null);

            return pipeline.addWebhooks('https://api.screwdriver.cd/v4/webhooks').then(() => {
                assert.calledWith(scmMock.addWebhook, {
                    scmUri,
                    scmContext,
                    token: 'foo',
                    actions: [],
                    webhookUrl: 'https://api.screwdriver.cd/v4/webhooks'
                });
            });
        });

        it('updates the webhook when child pipeline is in read-only SCM', () => {
            pipelineConfig.scmContext = 'gitlab:gitlab.com';
            pipelineConfig.configPipelineId = testId;
            pipeline = new PipelineModel(pipelineConfig);
            scmMock.addWebhook.resolves(null);

            return pipeline.addWebhooks('https://api.screwdriver.cd/v4/webhooks').then(() => {
                assert.calledWith(scmMock.addWebhook, {
                    scmUri,
                    scmContext: 'gitlab:gitlab.com',
                    token: 'tokenRO',
                    actions: [],
                    webhookUrl: 'https://api.screwdriver.cd/v4/webhooks'
                });
            });
        });

        it('rejects if there is no admins', () => {
            getUserPermissionMocks({ username: 'batman', push: true });

            return pipeline.addWebhooks('https://api.screwdriver.cd/v4/webhooks').then(
                () => assert.fail('should not get here'),
                err => {
                    assert.instanceOf(err, Error);
                    assert.equal(err.message, 'Pipeline has no repository admins');
                }
            );
        });

        it('rejects if there is a failure to update the webhook', () => {
            scmMock.addWebhook.rejects(new Error('error adding webhooks'));

            return pipeline.addWebhooks('https://api.screwdriver.cd/v4/webhooks').then(
                () => assert.fail('should not get here'),
                err => {
                    assert.instanceOf(err, Error);
                    assert.equal(err.message, 'error adding webhooks');
                }
            );
        });
    });

    describe('sync', () => {
        let publishMock;
        let mainMock;
        let externalMock;
        let mainModelMock;
        let publishModelMock;
        let externalModelMock;
        let parserConfig;

        beforeEach(() => {
            datastore.update.resolves(null);
            scmMock.getFile.resolves(SCM_CONTEXT_GITHUB);
            scmMock.addWebhook.resolves();
            scmMock.getScmContext.withArgs({ hostname: 'github.com' }).returns(SCM_CONTEXT_GITHUB);
            scmMock.getScmContext.withArgs({ hostname: 'gitlab.com' }).returns(SCM_CONTEXT_GITLAB);
            scmMock.getReadOnlyInfo.withArgs({ scmContext: SCM_CONTEXT_GITHUB }).returns({ enabled: false });
            scmMock.getReadOnlyInfo
                .withArgs({ scmContext: SCM_CONTEXT_GITLAB })
                .returns({ enabled: true, username: 'sd-buildbot', accessToken: 'tokenRO' });
            pipelineFactoryMock.scm.parseUrl
                .withArgs(
                    sinon.match({
                        checkoutUrl: SCM_URL_FOO
                    })
                )
                .resolves('foo');
            pipelineFactoryMock.scm.parseUrl
                .withArgs(
                    sinon.match({
                        checkoutUrl: SCM_URL_BAR
                    })
                )
                .resolves('bar');
            pipelineFactoryMock.scm.parseUrl
                .withArgs(
                    sinon.match({
                        checkoutUrl: SCM_URL_BAZ
                    })
                )
                .resolves('baz');
            pipelineFactoryMock.scm.parseUrl
                .withArgs(
                    sinon.match({
                        checkoutUrl: SCM_URL_GITLAB
                    })
                )
                .resolves('foo');
            pipelineFactoryMock.scm.parseUrl
                .withArgs(
                    sinon.match({
                        checkoutUrl: SCM_URL_GITLAB2
                    })
                )
                .resolves('bar');
            pipelineFactoryMock.scm.parseUrl
                .withArgs(
                    sinon.match({
                        checkoutUrl: SCM_URL_GITLAB3
                    })
                )
                .resolves('baz');
            parserConfig = {
                yaml: SCM_CONTEXT_GITHUB,
                templateFactory: templateFactoryMock,
                buildClusterFactory: buildClusterFactoryMock,
                notificationsValidationErr: true
            };
            parserMock.withArgs(parserConfig).resolves(PARSED_YAML);
            parserMock
                .withArgs({ ...parserConfig, ...{ yaml: 'yamlcontentwithscmurls' } })
                .resolves(EXTERNAL_PARSED_YAML);
            userFactoryMock.get.resolves({
                getPermissions: sinon.stub().resolves({
                    push: true
                }),
                unsealToken: sinon.stub().resolves('headlesstoken')
            });
            getUserPermissionMocks({ username: 'batman', push: true });
            getUserPermissionMocks({ username: 'robin', push: true });
            pipeline.admins = { batman: true, robin: true };
            pipelineFactoryMock.create.resolves({ id: '98765', sync: sinon.stub().resolves({ id: '98765' }) });
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
            externalModelMock = {
                isPR: sinon.stub().returns(false),
                update: sinon.stub(),
                id: 3,
                name: 'main',
                state: 'ENABLED'
            };

            publishMock = {
                pipelineId: testId,
                name: 'publish',
                permutations: [
                    {
                        commands: [
                            { command: 'npm run bump', name: 'bump' },
                            { command: 'npm publish --tag $NODE_TAG', name: 'publish' },
                            { command: 'git push origin --tags', name: 'tag' }
                        ],
                        environment: { NODE_ENV: 'test', NODE_TAG: 'latest' },
                        image: 'node:4'
                    }
                ]
            };
            mainMock = {
                pipelineId: testId,
                name: 'main',
                permutations: [
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
                ]
            };
            externalMock = {
                pipelineId: testId,
                name: 'main',
                permutations: [
                    {
                        commands: [
                            { command: 'npm run bump', name: 'bump' },
                            { command: 'npm publish --tag $NODE_TAG', name: 'publish' },
                            { command: 'git push origin --tags', name: 'tag' }
                        ],
                        environment: { NODE_ENV: 'test', NODE_TAG: 'latest' },
                        image: 'node:4'
                    }
                ]
            };
        });

        it('create external trigger in datastore for new jobs', () => {
            jobs = [];
            sinon.spy(pipeline, 'update');
            parserMock.withArgs(parserConfig).resolves(PARSED_YAML_WITH_REQUIRES);
            mainMock.permutations.forEach(p => {
                p.requires = ['~pr', '~commit', '~sd@12345:test'];
            });
            publishMock.permutations[0].requires = ['main'];
            jobFactoryMock.list.resolves(jobs);
            jobFactoryMock.create.withArgs(mainMock).resolves(mainModelMock);
            jobFactoryMock.create.withArgs(publishMock).resolves(publishModelMock);

            return pipeline.sync().then(() => {
                assert.calledOnce(pipeline.update);
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

            parserMock.withArgs(parserConfig).resolves(PARSED_YAML_WITH_REQUIRES);
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
            sinon.spy(pipeline, 'update');
            jobFactoryMock.list.resolves(jobs);
            jobFactoryMock.create.withArgs(mainMock).resolves(mainModelMock);
            jobFactoryMock.create.withArgs(publishMock).resolves(publishModelMock);
            jobFactoryMock.create.withArgs(externalMock).resolves(externalModelMock);
            pipelineFactoryMock.get.resolves({
                id: testId,
                update: sinon.stub().resolves(null),
                remove: sinon.stub().resolves(null),
                workflowGraph: { nodes: [{ name: '~pr' }, { name: '~commit' }, { name: 'main', id: 3 }] }
            });

            return pipeline.sync().then(() => {
                assert.calledOnce(pipeline.update);
                assert.deepEqual(pipeline.workflowGraph, {
                    nodes: [
                        { name: '~pr' },
                        { name: '~commit' },
                        { name: 'main', id: 1 },
                        { name: 'publish', id: 2 },
                        { name: 'sd@123:main', id: 3 }
                    ],
                    edges: [
                        { src: '~pr', dest: 'main' },
                        { src: '~commit', dest: 'main' },
                        { src: 'main', dest: 'publish' },
                        { src: 'publish', dest: 'sd@123:main' }
                    ]
                });
            });
        });

        it('adds subscribed pipelines from config to the model', () => {
            jobs = [];
            sinon.spy(pipeline, 'update');
            jobFactoryMock.list.resolves(jobs);
            jobFactoryMock.create.withArgs(mainMock).resolves(mainModelMock);
            jobFactoryMock.create.withArgs(publishMock).resolves(publishModelMock);
            jobFactoryMock.create.withArgs(externalMock).resolves(externalModelMock);
            parserMock.withArgs(parserConfig).resolves(PARSED_YAML_WITH_SUBSCRIBE);

            return pipeline.sync().then(() => {
                assert.deepEqual(pipeline.subscribedScmUrlsWithActions, [
                    { actions: ['commit', 'tags', 'release'], scmUri: 'foo' }
                ]);
            });
        });

        it('removes subscribed pipelines from config to the model', () => {
            pipeline = new PipelineModel({
                datastore,
                id: testId,
                scmUri,
                scmContext,
                scmRepo: {
                    branch: 'branch',
                    url: 'https://host/owner/repo/tree/branch',
                    name: 'owner/repo'
                },
                createTime: dateNow,
                admins,
                scm: scmMock,
                multiBuildClusterEnabled: true,
                subscribedScmUrlsWithActions: [{ actions: ['commit', 'tags', 'release'], scmUri: 'foo' }]
            });
            jobs = [];
            sinon.spy(pipeline, 'update');
            jobFactoryMock.list.resolves(jobs);
            jobFactoryMock.create.withArgs(mainMock).resolves(mainModelMock);
            jobFactoryMock.create.withArgs(publishMock).resolves(publishModelMock);
            jobFactoryMock.create.withArgs(externalMock).resolves(externalModelMock);
            parserMock.withArgs(parserConfig).resolves(PARSED_YAML);

            return pipeline.sync().then(() => {
                assert.deepEqual(pipeline.subscribedScmUrlsWithActions, []);
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
            parserConfig.yaml = 'yamlcontentfromsha';
            parserMock.withArgs(parserConfig).resolves(YAML_FROM_SHA);
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
            buildClusterFactoryMock.list.resolves(sdBuildClusters);

            return pipeline.sync().then(() => {
                assert.deepEqual(pipeline.annotations, {
                    'beta.screwdriver.cd/executor': 'screwdriver-executor-vm',
                    'screwdriver.cd/chainPR': true,
                    'screwdriver.cd/buildCluster': 'sd1'
                });
            });
        });

        it('store annotations with buildCluster to pipeline', () => {
            jobs = [];
            jobFactoryMock.list.resolves(jobs);
            jobFactoryMock.create.withArgs(publishMock).resolves(publishMock);
            jobFactoryMock.create.withArgs(mainMock).resolves(mainMock);
            buildClusterFactoryMock.list.resolves(sdBuildClusters);

            pipeline.annotations = { 'screwdriver.cd/buildCluster': 'sd1' };

            return pipeline.sync().then(() => {
                assert.deepEqual(pipeline.annotations, {
                    'beta.screwdriver.cd/executor': 'screwdriver-executor-vm',
                    'screwdriver.cd/chainPR': true,
                    'screwdriver.cd/buildCluster': 'sd1'
                });
            });
        });

        it('stores chainPR to pipeline', () => {
            const configMock = { ...PARSED_YAML };
            const defaultChainPR = false;

            delete parserConfig.buildFactory;

            parserMock.withArgs(parserConfig).resolves(configMock);
            jobs = [];
            jobFactoryMock.list.resolves(jobs);
            jobFactoryMock.create.withArgs(publishMock).resolves(publishMock);
            jobFactoryMock.create.withArgs(mainMock).resolves(mainMock);
            buildClusterFactoryMock.list.resolves(sdBuildClusters);

            return pipeline.sync(null, defaultChainPR).then(() => {
                assert.equal(pipeline.chainPR, true);
            });
        });

        it('creates new jobs', () => {
            jobs = [];
            jobFactoryMock.list.resolves(jobs);
            jobFactoryMock.create.withArgs(publishMock).resolves(publishMock);
            jobFactoryMock.create.withArgs(mainMock).resolves(mainMock);
            buildClusterFactoryMock.list.resolves(sdBuildClusters);

            return pipeline.sync().then(p => {
                assert.equal(p.id, testId);
                assert.calledWith(scmMock.getFile, {
                    scmUri,
                    scmContext,
                    path: 'screwdriver.yaml',
                    token: 'foo',
                    scmRepo: {
                        branch: 'branch',
                        url: 'https://host/owner/repo/tree/branch',
                        name: 'owner/repo'
                    }
                });
                assert.calledWith(parserMock, parserConfig);
                assert.calledWith(jobFactoryMock.create, publishMock);
                assert.calledWith(jobFactoryMock.create, mainMock);
            });
        });

        it('updates existing jobs that are in the config', () => {
            jobs = [mainModelMock, publishModelMock];
            jobFactoryMock.list.resolves(jobs);
            mainModelMock.update.resolves(mainModelMock);
            publishModelMock.update.resolves(publishModelMock);
            buildClusterFactoryMock.list.resolves(sdBuildClusters);

            return pipeline.sync().then(() => {
                assert.calledOnce(jobs[0].update);
                assert.deepEqual(jobs[0].archived, false);
                assert.deepEqual(jobs[0].permutations, [
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
                ]);
                assert.calledOnce(jobs[1].update);
                assert.deepEqual(jobs[1].archived, false);
                assert.deepEqual(jobs[1].permutations, [
                    {
                        commands: [
                            { command: 'npm run bump', name: 'bump' },
                            { command: 'npm publish --tag $NODE_TAG', name: 'publish' },
                            { command: 'git push origin --tags', name: 'tag' }
                        ],
                        environment: { NODE_ENV: 'test', NODE_TAG: 'latest' },
                        image: 'node:4'
                    }
                ]);
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
            buildClusterFactoryMock.list.resolves(sdBuildClusters);

            return pipeline.sync().then(() => {
                assert.calledOnce(disableJobMock.update);
                assert.equal(disableJobMock.archived, true);
            });
        });

        it('returns error if something explodes', () => {
            const error = new Error('blah');

            jobFactoryMock.list.rejects(error);

            return pipeline.sync().catch(err => {
                assert.deepEqual(err, error);
            });
        });

        it('syncs child pipeline if there are changes in scmUrls', () => {
            const parsedYaml = hoek.clone(EXTERNAL_PARSED_YAML);
            const childPipelineFooMock = getChildPipelineMock();
            const childPipelineBazMock = getChildPipelineMock();

            parsedYaml.childPipelines = {
                scmUrls: [SCM_URL_FOO, SCM_URL_BAR]
            };

            jobs = [mainJob, publishJob];
            jobFactoryMock.list.resolves(jobs);
            getUserPermissionMocks({ username: 'batman', push: true, admin: true });
            scmMock.getFile.resolves('yamlcontentwithscmurls');
            parserMock.withArgs({ ...parserConfig, ...{ yaml: 'yamlcontentwithscmurls' } }).resolves(parsedYaml);
            pipelineFactoryMock.get.withArgs({ scmUri: 'foo' }).resolves(childPipelineFooMock);
            pipelineFactoryMock.get.withArgs({ scmUri: 'baz' }).resolves(childPipelineBazMock);
            pipelineFactoryMock.get.withArgs({ scmUri: 'bar' }).resolves(null);
            pipeline.childPipelines = {
                scmUrls: [SCM_URL_BAZ]
            };

            return pipeline.sync().then(p => {
                assert.equal(p.id, testId);
                assert.deepEqual(p.childPipelines.scmUrls, [SCM_URL_FOO, SCM_URL_BAR]);
                assert.calledWith(parserMock, { ...parserConfig, ...{ yaml: 'yamlcontentwithscmurls' } });
                assert.calledOnce(pipelineFactoryMock.create);
                assert.calledWith(
                    pipelineFactoryMock.create,
                    sinon.match({
                        configPipelineId: testId,
                        scmUri: 'bar'
                    })
                );
                assert.calledOnce(childPipelineFooMock.sync);
                assert.calledOnce(childPipelineBazMock.update);
            });
        });

        it('syncs child pipeline if from read-only SCM', () => {
            const parsedYaml = hoek.clone(EXTERNAL_PARSED_YAML);
            const childPipelineFooMock = getChildPipelineMock();
            const childPipelineBazMock = getChildPipelineMock();

            parsedYaml.childPipelines = {
                scmUrls: [SCM_URL_GITLAB, SCM_URL_GITLAB2]
            };
            jobs = [mainJob, publishJob];
            jobFactoryMock.list.resolves(jobs);
            getUserPermissionMocks({ username: 'batman', push: true, admin: true });
            scmMock.getFile.resolves('yamlcontentwithscmurls');
            parserMock.withArgs({ ...parserConfig, ...{ yaml: 'yamlcontentwithscmurls' } }).resolves(parsedYaml);
            pipelineFactoryMock.get.withArgs({ scmUri: 'foo' }).resolves(childPipelineFooMock);
            pipelineFactoryMock.get.withArgs({ scmUri: 'baz' }).resolves(childPipelineBazMock);
            pipelineFactoryMock.get.withArgs({ scmUri: 'bar' }).resolves(null);
            pipeline.childPipelines = {
                scmUrls: [SCM_URL_BAZ]
            };

            return pipeline.sync().then(p => {
                assert.equal(p.id, testId);
                assert.deepEqual(p.childPipelines.scmUrls, [SCM_URL_GITLAB, SCM_URL_GITLAB2]);
                assert.calledWith(parserMock, { ...parserConfig, ...{ yaml: 'yamlcontentwithscmurls' } });
                assert.calledWith(
                    pipelineFactoryMock.create,
                    sinon.match({
                        configPipelineId: testId,
                        scmUri: 'bar'
                    })
                );
                assert.calledOnce(childPipelineFooMock.sync);
                assert.calledOnce(childPipelineBazMock.update);
            });
        });

        it('does not sync if child pipeline not from read-only SCM', () => {
            const parsedYaml = hoek.clone(EXTERNAL_PARSED_YAML);
            const childPipelineFooMock = getChildPipelineMock();
            const childPipelineBazMock = getChildPipelineMock();

            parsedYaml.childPipelines = {
                scmUrls: [SCM_URL_GITLAB, SCM_URL_GITLAB2]
            };
            jobs = [mainJob, publishJob];
            jobFactoryMock.list.resolves(jobs);
            getUserPermissionMocks({ username: 'batman', push: true, admin: true });
            scmMock.getFile.resolves('yamlcontentwithscmurls');
            parserMock.withArgs({ ...parserConfig, ...{ yaml: 'yamlcontentwithscmurls' } }).resolves(parsedYaml);
            scmMock.getReadOnlyInfo.withArgs({ scmContext: SCM_CONTEXT_GITLAB }).returns({ enabled: false });
            pipelineFactoryMock.get.withArgs({ scmUri: 'foo' }).resolves(childPipelineFooMock);
            pipelineFactoryMock.get.withArgs({ scmUri: 'baz' }).resolves(childPipelineBazMock);
            pipelineFactoryMock.get.withArgs({ scmUri: 'bar' }).resolves(null);
            pipeline.childPipelines = {
                scmUrls: [SCM_URL_BAZ]
            };

            return pipeline.sync().then(p => {
                assert.equal(p.id, testId);
                assert.deepEqual(p.childPipelines.scmUrls, [SCM_URL_GITLAB, SCM_URL_GITLAB2]);
                assert.calledWith(parserMock, { ...parserConfig, ...{ yaml: 'yamlcontentwithscmurls' } });
                assert.notCalled(pipelineFactoryMock.create);
                assert.notCalled(childPipelineFooMock.sync);
                assert.calledOnce(childPipelineBazMock.update);
            });
        });

        it('does not sync child pipelines if no admin permissions', () => {
            jobs = [mainJob, publishJob];
            jobFactoryMock.list.resolves(jobs);
            pipelineFactoryMock.get.withArgs({ scmUri: 'foo' }).resolves(childPipelineMock);
            scmMock.getFile.resolves('yamlcontentwithscmurls');

            return pipeline.sync().then(p => {
                assert.equal(p.id, testId);
                assert.calledOnce(pipelineFactoryMock.get);
                assert.notCalled(pipelineFactoryMock.create);
                assert.notCalled(childPipelineMock.sync);
            });
        });

        it('does not update child pipelines if does not belong to this parent', () => {
            jobs = [mainJob, publishJob];
            jobFactoryMock.list.resolves(jobs);
            getUserPermissionMocks({ username: 'batman', push: true, admin: true });
            childPipelineMock.configPipelineId = 456;
            pipelineFactoryMock.get.resolves(childPipelineMock);
            pipelineFactoryMock.get.withArgs({ scmUri: 'foo' }).resolves(childPipelineMock);
            scmMock.getFile.resolves('yamlcontentwithscmurls');

            return pipeline.sync().then(p => {
                assert.equal(p.id, testId);
                assert.notCalled(pipelineFactoryMock.update);
                assert.notCalled(childPipelineMock.sync);
            });
        });

        it('does not deactivate child pipelines if does not belong to this parent', () => {
            jobs = [mainJob, publishJob];
            jobFactoryMock.list.resolves(jobs);
            getUserPermissionMocks({ username: 'batman', push: true, admin: true });
            scmMock.getReadOnlyInfo.withArgs({ scmContext: SCM_CONTEXT_GITLAB }).returns({ enabled: false });
            childPipelineMock.configPipelineId = 789;
            pipelineFactoryMock.get.resolves(childPipelineMock);
            pipeline.childPipelines = {
                scmUrls: [SCM_URL_BAR, SCM_URL_GITLAB3]
            };
            buildClusterFactoryMock.list.resolves(sdBuildClusters);

            return pipeline.sync().then(p => {
                assert.equal(p.id, testId);
                assert.notCalled(childPipelineMock.update);
            });
        });

        it('does not deactivate child pipelines if no admin permissions', () => {
            jobs = [mainJob, publishJob];
            jobFactoryMock.list.resolves(jobs);
            pipelineFactoryMock.get.resolves(null);
            scmMock.getFile.resolves('yamlcontentwithscmurls');
            scmMock.getReadOnlyInfo.withArgs({ scmContext: SCM_CONTEXT_GITLAB }).returns({ enabled: false });
            childPipelineMock.configPipelineId = 789;
            pipelineFactoryMock.get.resolves(childPipelineMock);
            pipeline.childPipelines = {
                scmUrls: [SCM_URL_BAR, SCM_URL_GITLAB3]
            };
            buildClusterFactoryMock.list.resolves(sdBuildClusters);

            return pipeline.sync().then(p => {
                assert.equal(p.id, testId);
                assert.notCalled(pipelineFactoryMock.create);
                assert.notCalled(childPipelineMock.update);
            });
        });

        it('deactivates child pipeline if scmUrls is removed from new yaml', () => {
            jobs = [mainJob, publishJob];
            jobFactoryMock.list.resolves(jobs);
            getUserPermissionMocks({ username: 'batman', push: true, admin: true });
            childPipelineMock.configPipelineId = testId;
            pipelineFactoryMock.get.resolves(childPipelineMock);
            pipeline.childPipelines = {
                scmUrls: [SCM_URL_BAR]
            };
            buildClusterFactoryMock.list.resolves(sdBuildClusters);

            return pipeline.sync().then(p => {
                assert.equal(p.id, testId);
                assert.equal(p.childPipelines, null);
                assert.calledOnce(childPipelineMock.update);
            });
        });

        it('activates child pipeline if scmUrls is read-only SCM and removed from new yaml', () => {
            jobs = [mainJob, publishJob];
            jobFactoryMock.list.resolves(jobs);
            getUserPermissionMocks({ username: 'batman', push: true, admin: true });
            childPipelineMock.configPipelineId = testId;
            pipelineFactoryMock.get.resolves(childPipelineMock);
            pipeline.childPipelines = {
                scmUrls: [SCM_URL_GITLAB3]
            };
            buildClusterFactoryMock.list.resolves(sdBuildClusters);

            return pipeline.sync().then(p => {
                assert.equal(p.id, testId);
                assert.equal(p.childPipelines, null);
                assert.calledOnce(childPipelineMock.update);
            });
        });

        it('deactivates child pipeline if scmUrls added back (previously removed) in the new yaml', () => {
            const parsedYaml = hoek.clone(EXTERNAL_PARSED_YAML);
            const inActiveChildPipelineMock = getChildPipelineMock({ state: 'INACTIVE' });

            jobs = [mainJob, publishJob];
            jobFactoryMock.list.resolves(jobs);
            getUserPermissionMocks({ username: 'batman', push: true, admin: true });
            parsedYaml.childPipelines = {
                scmUrls: [SCM_URL_FOO]
            };
            scmMock.getFile.resolves('yamlcontentwithscmurls');
            parserMock.withArgs({ ...parserConfig, ...{ yaml: 'yamlcontentwithscmurls' } }).resolves(parsedYaml);
            pipelineFactoryMock.get.withArgs({ scmUri: 'foo' }).resolves(inActiveChildPipelineMock);
            buildClusterFactoryMock.list.resolves(sdBuildClusters);

            return pipeline.sync().then(p => {
                assert.equal(p.id, testId);
                assert.deepEqual(p.childPipelines.scmUrls, [SCM_URL_FOO]);
                assert.equal(inActiveChildPipelineMock.state, 'ACTIVE');
                assert.calledOnce(inActiveChildPipelineMock.sync);
            });
        });

        it('reactivates child pipeline if scmUrls is read-only SCM and added back (previously removed) in the new yaml', () => {
            const parsedYaml = hoek.clone(EXTERNAL_PARSED_YAML);
            const inActiveChildPipelineMock = getChildPipelineMock({ state: 'INACTIVE' });

            jobs = [mainJob, publishJob];
            jobFactoryMock.list.resolves(jobs);
            getUserPermissionMocks({ username: 'batman', push: true, admin: true });
            parsedYaml.childPipelines = {
                scmUrls: [SCM_URL_GITLAB]
            };
            scmMock.getFile.resolves('yamlcontentwithscmurls');
            parserMock.withArgs({ ...parserConfig, ...{ yaml: 'yamlcontentwithscmurls' } }).resolves(parsedYaml);
            pipelineFactoryMock.get.withArgs({ scmUri: 'foo' }).resolves(inActiveChildPipelineMock);
            buildClusterFactoryMock.list.resolves(sdBuildClusters);

            return pipeline.sync().then(p => {
                assert.equal(p.id, testId);
                assert.deepEqual(p.childPipelines.scmUrls, [SCM_URL_GITLAB]);
                assert.equal(inActiveChildPipelineMock.state, 'ACTIVE');
                assert.calledOnce(inActiveChildPipelineMock.sync);
            });
        });

        it('does not sync child pipelines if the YAML has errors', () => {
            scmMock.getFile.resolves('yamlcontentwithscmurls');
            parserMock
                .withArgs({ ...parserConfig, ...{ yaml: 'yamlcontentwithscmurls' } })
                .resolves(PARSED_YAML_WITH_ERRORS);
            jobs = [mainJob];
            jobFactoryMock.list.resolves(jobs);
            getUserPermissionMocks({ username: 'batman', push: true, admin: true });
            childPipelineMock.configPipelineId = 456;
            pipelineFactoryMock.get.resolves(childPipelineMock);
            pipeline.childPipelines = EXTERNAL_PARSED_YAML.childPipelines;

            return pipeline.sync().then(p => {
                assert.equal(p.id, testId);
                assert.deepEqual(p.childPipelines, EXTERNAL_PARSED_YAML.childPipelines);
                assert.notCalled(childPipelineMock.sync);
                assert.notCalled(childPipelineMock.update);
            });
        });
    });

    describe('syncPR', () => {
        let prJob;
        let parserConfig;
        const expectedGetFile = {
            path: 'screwdriver.yaml',
            ref: 'pulls/1/merge',
            scmUri,
            scmContext,
            token: 'foo',
            scmRepo: {
                branch: 'branch',
                url: 'https://host/owner/repo/tree/branch',
                name: 'owner/repo'
            }
        };

        beforeEach(() => {
            parserConfig = {
                yaml: SCM_CONTEXT_GITHUB,
                templateFactory: templateFactoryMock,
                buildClusterFactory: buildClusterFactoryMock,
                notificationsValidationErr: true
            };
            datastore.update.resolves(null);
            scmMock.getFile.resolves(SCM_CONTEXT_GITHUB);
            scmMock.getPrInfo.resolves({ ref: 'pulls/1/merge', baseBranch: 'testBranch' });
            scmMock.getReadOnlyInfo
                .withArgs({ scmContext: SCM_CONTEXT_GITLAB })
                .returns({ enabled: true, username: 'sd-buildbot', accessToken: 'tokenRO' });
            parserMock.withArgs(parserConfig).resolves(PARSED_YAML);
            getUserPermissionMocks({ username: 'batman', push: true });
            getUserPermissionMocks({ username: 'robin', push: true });
            pipeline.admins = { batman: true, robin: true };
            prJob = {
                update: sinon.stub().resolves(null),
                isPR: sinon.stub().returns(true),
                name: 'PR-1:main',
                state: 'ENABLED',
                archived: false,
                parsePRJobName: sinon.stub().returns('main')
            };
        });

        afterEach(() => {
            prJob.update.reset();
        });

        it('update PR config', () => {
            jobFactoryMock.list.resolves([mainJob]); // pipeline jobs
            jobFactoryMock.getPullRequestJobsForPipelineSync.resolves([prJob]); // pull request jobs

            scmMock.getOpenedPRs.resolves([{ name: 'PR-1', ref: 'abc' }]);

            return pipeline.syncPR(1).then(() => {
                assert.calledWith(scmMock.getFile, expectedGetFile);
                assert.called(prJob.update);
                assert.deepEqual(prJob.permutations, PARSED_YAML.jobs.main);
                assert.isFalse(prJob.archived);
            });
        });

        it('update PR config for multiple PR jobs and create missing PR jobs', () => {
            const clonedYAML = JSON.parse(JSON.stringify(PARSED_YAML_PR));

            jobFactoryMock.list.resolves([mainJob, publishJob, testJob]); // pipeline jobs
            jobFactoryMock.getPullRequestJobsForPipelineSync.resolves([prJob]); // pull request jobs

            scmMock.getOpenedPRs.resolves([{ name: 'PR-1', ref: 'abc' }]);
            parserMock.withArgs(parserConfig).resolves(clonedYAML);

            return pipeline.syncPR(1).then(() => {
                assert.calledWith(scmMock.getFile, expectedGetFile);
                assert.calledOnce(prJob.update);
                assert.calledThrice(jobFactoryMock.create);
                assert.calledWith(jobFactoryMock.create.firstCall, {
                    name: 'PR-1:test',
                    permutations: [
                        {
                            commands: [{ command: 'npm test', name: 'test' }],
                            image: 'node:10',
                            requires: ['~pr']
                        }
                    ],
                    pipelineId: testId,
                    prParentJobId: 100
                });
                assert.calledWith(
                    jobFactoryMock.create.secondCall,
                    sinon.match({
                        pipelineId: testId,
                        name: 'PR-1:new_pr_job'
                    })
                );
                assert.calledWith(
                    jobFactoryMock.create.thirdCall,
                    sinon.match({
                        pipelineId: testId,
                        name: 'PR-1:pr_specific_branch'
                    })
                );
                assert.deepEqual(prJob.permutations, clonedYAML.jobs.main);
                assert.isFalse(prJob.archived);
            });
        });

        it('archives outdated PR job', () => {
            const secondPRJob = {
                update: sinon.stub().resolves(null),
                isPR: sinon.stub().returns(true),
                name: 'PR-1:publish',
                state: 'ENABLED',
                archived: false,
                parsePRJobName: sinon.stub().returns('publish')
            };

            jobFactoryMock.list.resolves([mainJob, publishJob]); // pipeline jobs
            jobFactoryMock.getPullRequestJobsForPipelineSync.resolves([prJob, secondPRJob]); // pull request jobs

            scmMock.getOpenedPRs.resolves([{ name: 'PR-1', ref: 'abc' }]);
            parserMock.withArgs(parserConfig).resolves(PARSED_YAML_PR);

            return pipeline.syncPR(1).then(() => {
                assert.calledWith(scmMock.getFile, {
                    path: 'screwdriver.yaml',
                    ref: 'pulls/1/merge',
                    scmUri,
                    scmContext,
                    token: 'foo',
                    scmRepo: {
                        branch: 'branch',
                        url: 'https://host/owner/repo/tree/branch',
                        name: 'owner/repo'
                    }
                });
                assert.calledOnce(prJob.update);
                assert.calledOnce(secondPRJob.update);
                assert.calledWith(
                    jobFactoryMock.create,
                    sinon.match({
                        pipelineId: testId,
                        name: 'PR-1:new_pr_job'
                    })
                );
                assert.deepEqual(prJob.permutations, PARSED_YAML_PR.jobs.main);
                assert.isFalse(prJob.archived);
                assert.isTrue(secondPRJob.archived);
            });
        });

        it('returns error if fails to get configuration', () => {
            const error = new Error('pipelineId:123: Failed to fetch screwdriver.yaml.');

            scmMock.getFile.rejects(error);
            jobFactoryMock.list.resolves([]);

            return pipeline.syncPR(1).catch(err => {
                assert.equal(err.message, error.message);
            });
        });

        it('returns error if fails to get PR job', () => {
            const error = new Error('fails to get job');

            jobFactoryMock.list.rejects(error);

            return pipeline.syncPR(1).catch(err => {
                assert.deepEqual(err, error);
            });
        });

        it('updates PR config, but it can not override chainPR flag', () => {
            pipeline.chainPR = true;
            const clonedYAML = JSON.parse(JSON.stringify(NON_CHAINPR_PARSED_YAML));

            jobFactoryMock.list.resolves([mainJob, publishJob, testJob]); // pipeline jobs
            jobFactoryMock.getPullRequestJobsForPipelineSync.resolves([prJob]); // pull request jobs

            scmMock.getOpenedPRs.resolves([{ name: 'PR-1', ref: 'abc' }]);
            parserMock.withArgs(parserConfig).resolves(clonedYAML);

            return pipeline.syncPR(1).then(() => {
                assert.calledWith(scmMock.getFile, {
                    path: 'screwdriver.yaml',
                    ref: 'pulls/1/merge',
                    scmUri,
                    scmContext,
                    token: 'foo',
                    scmRepo: {
                        branch: 'branch',
                        url: 'https://host/owner/repo/tree/branch',
                        name: 'owner/repo'
                    }
                });
                assert.calledOnce(prJob.update);
                assert.callCount(jobFactoryMock.create, 4);
                assert.calledWith(jobFactoryMock.create.firstCall, {
                    name: 'PR-1:test',
                    permutations: [
                        {
                            commands: [{ command: 'npm test', name: 'test' }],
                            image: 'node:10',
                            requires: ['~pr']
                        }
                    ],
                    pipelineId: testId,
                    prParentJobId: 100
                });
                assert.calledWith(
                    jobFactoryMock.create.secondCall,
                    sinon.match({
                        name: 'PR-1:new_pr_job',
                        permutations: [
                            {
                                commands: [{ command: 'npm install test', name: 'install' }],
                                image: 'node:8',
                                requires: ['~pr']
                            }
                        ],
                        pipelineId: testId
                    })
                );
                assert.calledWith(
                    jobFactoryMock.create.lastCall,
                    sinon.match({
                        name: 'PR-1:publish',
                        permutations: [
                            {
                                commands: [{ command: 'npm publish --tag $NODE_TAG', name: 'publish' }],
                                environment: { NODE_ENV: 'test', NODE_TAG: 'latest' },
                                image: 'node:4',
                                requires: ['main']
                            }
                        ],
                        pipelineId: testId,
                        prParentJobId: 99999
                    })
                );
                assert.deepEqual(prJob.permutations, clonedYAML.jobs.main);
                assert.isFalse(prJob.archived);
            });
        });

        it('updates PR config, and it creates PR job which requires specific branch for PR', () => {
            const prJobs = [
                {
                    update: sinon.stub().resolves(null),
                    isPR: sinon.stub().returns(true),
                    parsePRJobName: sinon.stub().returns('main'),
                    name: 'PR-1:main',
                    state: 'ENABLED',
                    archived: false
                },
                {
                    update: sinon.stub().resolves(null),
                    isPR: sinon.stub().returns(true),
                    parsePRJobName: sinon.stub().returns('test'),
                    name: 'PR-1:test',
                    state: 'ENABLED',
                    archived: false
                },
                {
                    update: sinon.stub().resolves(null),
                    isPR: sinon.stub().returns(true),
                    parsePRJobName: sinon.stub().returns('new_pr_job'),
                    name: 'PR-1:new_pr_job',
                    state: 'ENABLED',
                    archived: false
                }
            ];
            const clonedYAML = JSON.parse(JSON.stringify(PARSED_YAML_PR));

            jobFactoryMock.list.resolves([mainJob, publishJob, testJob]); // pipeline jobs
            jobFactoryMock.getPullRequestJobsForPipelineSync.resolves(prJobs); // pull request jobs

            scmMock.getOpenedPRs.resolves([{ name: 'PR-1', ref: 'abc' }]);
            parserMock.withArgs(parserConfig).resolves(clonedYAML);

            return pipeline.syncPR(1).then(() => {
                assert.calledWith(scmMock.getFile, {
                    path: 'screwdriver.yaml',
                    ref: 'pulls/1/merge',
                    scmUri,
                    scmContext,
                    token: 'foo',
                    scmRepo: {
                        branch: 'branch',
                        url: 'https://host/owner/repo/tree/branch',
                        name: 'owner/repo'
                    }
                });
                assert.calledOnce(prJobs[0].update);
                assert.calledOnce(prJobs[1].update);
                assert.calledOnce(prJobs[2].update);
                assert.calledOnce(jobFactoryMock.create);
                assert.calledWith(
                    jobFactoryMock.create,
                    sinon.match({
                        name: 'PR-1:pr_specific_branch',
                        permutations: [
                            {
                                commands: [{ command: 'npm install test', name: 'install' }],
                                image: 'node:8',
                                requires: ['~pr:testBranch']
                            }
                        ],
                        pipelineId: testId
                    })
                );
            });
        });

        it("updates PR config, and it doesn't create duplicated PR jobs", () => {
            const prJobs = [
                {
                    update: sinon.stub().resolves(null),
                    isPR: sinon.stub().returns(true),
                    parsePRJobName: sinon.stub().returns('main'),
                    name: 'PR-1:main',
                    state: 'ENABLED',
                    archived: false
                },
                {
                    update: sinon.stub().resolves(null),
                    isPR: sinon.stub().returns(true),
                    parsePRJobName: sinon.stub().returns('new_pr_job'),
                    name: 'PR-1:new_pr_job',
                    state: 'ENABLED',
                    archived: false
                },
                {
                    update: sinon.stub().resolves(null),
                    isPR: sinon.stub().returns(true),
                    parsePRJobName: sinon.stub().returns('pr_specific_branch'),
                    name: 'PR-1:pr_specific_branch',
                    state: 'ENABLED',
                    archived: false
                }
            ];
            const clonedYAML = JSON.parse(JSON.stringify(PARSED_YAML_PR));

            clonedYAML.jobs.test[0].requires = ['~pr', '~pr:testBranch'];

            jobFactoryMock.list.resolves([mainJob, publishJob]); // pipeline jobs
            jobFactoryMock.getPullRequestJobsForPipelineSync.resolves(prJobs); // pull request jobs

            scmMock.getOpenedPRs.resolves([{ name: 'PR-1', ref: 'abc' }]);

            parserMock.withArgs(parserConfig).resolves(clonedYAML);

            return pipeline.syncPR(1).then(() => {
                assert.calledWith(scmMock.getFile, {
                    path: 'screwdriver.yaml',
                    ref: 'pulls/1/merge',
                    scmUri,
                    scmContext,
                    token: 'foo',
                    scmRepo: {
                        branch: 'branch',
                        url: 'https://host/owner/repo/tree/branch',
                        name: 'owner/repo'
                    }
                });
                assert.calledOnce(prJobs[0].update);
                assert.calledOnce(prJobs[1].update);
                assert.calledOnce(prJobs[2].update);
                // PR-1:test is triggered by ~pr and ~pr:testBranch, but it should be created just once
                assert.calledOnce(jobFactoryMock.create);
                assert.calledWith(jobFactoryMock.create, {
                    name: 'PR-1:test',
                    permutations: [
                        {
                            commands: [{ command: 'npm test', name: 'test' }],
                            image: 'node:10',
                            requires: ['~pr', '~pr:testBranch']
                        }
                    ],
                    pipelineId: testId
                });
            });
        });
    });

    describe('syncPRs', () => {
        let prJob;
        let parserConfig;

        beforeEach(() => {
            parserConfig = {
                yaml: SCM_CONTEXT_GITHUB,
                templateFactory: templateFactoryMock,
                buildClusterFactory: buildClusterFactoryMock,
                notificationsValidationErr: true
            };
            datastore.update.resolves(null);
            scmMock.getFile.resolves(SCM_CONTEXT_GITHUB);
            scmMock.getReadOnlyInfo
                .withArgs({ scmContext: SCM_CONTEXT_GITLAB })
                .returns({ enabled: true, username: 'sd-buildbot', accessToken: 'tokenRO' });
            parserMock.withArgs(parserConfig).resolves(PARSED_YAML);
            scmMock.getPrInfo.resolves({ ref: 'pulls/1/merge', baseBranch: 'testBranch' });
            getUserPermissionMocks({ username: 'batman', push: true });
            getUserPermissionMocks({ username: 'robin', push: true });
            pipeline.admins = { batman: true, robin: true };
            prJob = {
                update: sinon.stub().resolves(null),
                isPR: sinon.stub().returns(true),
                parsePRJobName: sinon.stub().returns('PR-1'),
                name: 'PR-1:main',
                state: 'ENABLED',
                archived: false
            };

            jobFactoryMock.getPullRequestJobsForPipelineSync.resolves([prJob]); // pull request jobs
            jobFactoryMock.list.resolves([mainJob, publishJob]); // pipeline jobs
        });

        it('archive PR job if it is closed', () => {
            scmMock.getOpenedPRs.resolves([]);

            return pipeline.syncPRs().then(() => {
                assert.equal(prJob.archived, true);
            });
        });

        it('create PR job if it is opened and not in the existing jobs', () => {
            prJob.archived = true;
            const prJob2 = {
                pipelineId: testId,
                name: 'PR-2:main',
                permutations: PARSED_YAML.jobs.main
            };

            scmMock.getOpenedPRs.resolves([{ name: 'PR-2', ref: 'abc' }]);
            jobFactoryMock.create.resolves(prJob2);

            return pipeline.syncPRs().then(() => {
                assert.calledOnce(jobFactoryMock.create);
                assert.calledWith(jobFactoryMock.create, {
                    permutations: PARSED_YAML.jobs.main,
                    pipelineId: testId,
                    name: 'PR-2:main',
                    prParentJobId: 99998
                });
            });
        });

        it('unarchive PR job if it was previously archived and chainPR is false', () => {
            pipeline.chainPR = false;
            prJob.archived = true;
            scmMock.getOpenedPRs.resolves([{ name: 'PR-1', ref: 'abc' }]);

            return pipeline.syncPRs().then(() => {
                assert.calledOnce(prJob.update);
                assert.equal(prJob.archived, false);
            });
        });

        it('does nothing if it PR is not archived', () => {
            scmMock.getOpenedPRs.resolves([{ name: 'PR-1', ref: 'abc' }]);

            return pipeline.syncPRs().then(() => {
                assert.notCalled(jobFactoryMock.create);
            });
        });
    });

    describe('get admin', () => {
        beforeEach(() => {
            scmMock.getReadOnlyInfo
                .withArgs({ scmContext: SCM_CONTEXT_GITLAB })
                .returns({ enabled: true, username: 'sd-buildbot', accessToken: 'tokenRO' });
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
            scmMock.getReadOnlyInfo
                .withArgs({ scmContext: SCM_CONTEXT_GITLAB })
                .returns({ enabled: true, username: 'sd-buildbot', accessToken: 'tokenRO' });
            getUserPermissionMocks({ username: 'batman', push: false });
            getUserPermissionMocks({ username: 'robin', push: true });
            pipeline.admins = { batman: true, robin: true };
            pipeline.update = sinon.stub().resolves('foo');
        });

        it('has an admin robin', () => {
            const admin = pipeline.getFirstAdmin();

            return admin.then(realAdmin => {
                assert.equal(realAdmin.username, 'robin');
            });
        });

        it('uses parent admin if read-only child pipeline', () => {
            // Create child pipeline with read-only SCM
            pipelineConfig.scmContext = 'gitlab:gitlab.com';
            pipelineConfig.configPipelineId = testId;
            pipeline = new PipelineModel(pipelineConfig);
            // Create parent pipeline with normal SCM
            pipelineConfig.scmContext = 'github:github.com';

            const parentPipeline = new PipelineModel(pipelineConfig);

            pipelineFactoryMock.get.withArgs(testId).resolves(parentPipeline);

            const admin = pipeline.getFirstAdmin();

            return admin.then(realAdmin => {
                assert.equal(realAdmin.username, 'robin');
            });
        });

        it('has no admin', () => {
            getUserPermissionMocks({ username: 'batman', push: false });
            getUserPermissionMocks({ username: 'robin', push: false });

            return pipeline
                .getFirstAdmin()
                .then(() => {
                    assert.fail('should not get here');
                })
                .catch(e => {
                    assert.isOk(e);
                    assert.equal(e.message, 'Pipeline has no admin');
                    assert.equal(e.output.statusCode, 403);
                });
        });

        it('catch 401 from get permission', () => {
            const error = new Error('fails to get permissions');

            error.status = 401;
            userFactoryMock.get.withArgs({ username: 'batman', scmContext }).resolves({
                unsealToken: sinon.stub().resolves('foo'),
                getPermissions: sinon.stub().throws(error),
                username: 'batman'
            });

            return pipeline.getFirstAdmin().then(realAdmin => {
                assert.equal(realAdmin.username, 'robin');
            });
        });

        it('catch 404 from get permission', () => {
            const error = new Error('Not found');

            error.status = 404;
            userFactoryMock.get.withArgs({ username: 'batman', scmContext }).resolves({
                unsealToken: sinon.stub().resolves('foo'),
                getPermissions: sinon.stub().throws(error),
                username: 'batman'
            });

            return pipeline.getFirstAdmin().then(realAdmin => {
                assert.equal(realAdmin.username, 'robin');
            });
        });

        it('does not catch other error', () => {
            const error = new Error('fails to get permissions');

            error.status = 403;
            userFactoryMock.get.withArgs({ username: 'batman', scmContext }).resolves({
                unsealToken: sinon.stub().resolves('foo'),
                getPermissions: sinon.stub().throws(error),
                username: 'batman'
            });

            return pipeline
                .getFirstAdmin()
                .then(() => {
                    assert.fail('should not get here');
                })
                .catch(e => {
                    assert.isOk(e);
                    assert.equal(e.message, 'fails to get permissions');
                });
        });
    });

    describe('get token', () => {
        beforeEach(() => {
            getUserPermissionMocks({ username: 'batman', push: true });
            getUserPermissionMocks({ username: 'robin', push: true });
            scmMock.getReadOnlyInfo
                .withArgs({ scmContext: SCM_CONTEXT_GITLAB })
                .returns({ enabled: true, username: 'sd-buildbot', accessToken: 'tokenRO' });
            pipeline.admins = { batman: true, robin: true };
            pipeline.update = sinon.stub().resolves('foo');
        });

        it('has an token getter', () =>
            pipeline.token.then(token => {
                assert.equal(token, 'foo');
            }));

        it('gets read-only token', () => {
            pipelineConfig.scmContext = 'gitlab:gitlab.com';
            pipelineConfig.configPipelineId = '456';

            pipeline = new PipelineModel(pipelineConfig);

            return pipeline.token.then(token => {
                assert.equal(token, 'tokenRO');
            });
        });
    });

    describe('get branch', () => {
        it('has an branch getter', () => {
            pipeline.branch.then(branch => {
                assert.equal(branch, 'master');
            });
        });

        it('return blank if scmUri is blank', () => {
            pipeline.scmUri = '';
            pipeline.branch.then(branch => {
                assert.equal(branch, '');
            });
        });

        it('return blank if scmUri is invalid', () => {
            pipeline.scmUri = 'github.com:1234';
            pipeline.branch.then(branch => {
                assert.equal(branch, '');
            });
        });
    });

    describe('get rootDir', () => {
        it('has an rootDir getter', () => {
            pipeline.scmUri = 'github.com:1234:branch:src/app/component';
            pipeline.rootDir.then(rootDir => {
                assert.equal(rootDir, 'src/app/component');
            });
        });

        it('return blank if scmUri is blank', () => {
            pipeline.scmUri = '';
            pipeline.rootDir.then(rootDir => {
                assert.equal(rootDir, '');
            });
        });

        it('return blank if scmUri is invalid', () => {
            pipeline.scmUri = 'github.com:1234:branch';
            pipeline.rootDir.then(rootDir => {
                assert.equal(rootDir, '');
            });
        });
    });

    describe('get pipelineJobs', () => {
        it('has a pipelineJobs getter', () => {
            const listConfig = {
                params: {
                    pipelineId: pipeline.id,
                    prParentJobId: null
                }
            };

            jobFactoryMock.list.resolves(null);
            // when we fetch jobs it resolves to a promise
            assert.isFunction(pipeline.pipelineJobs.then);
            // and a factory is called to create that promise
            assert.calledWith(jobFactoryMock.list, listConfig);

            // When we call pipeline.jobs again it is still a promise
            assert.isFunction(pipeline.pipelineJobs.then);
            // ...but the factory was not recreated, since the promise is stored
            // as the model's pipeline property, now
            assert.calledOnce(jobFactoryMock.list);
        });

        it('gets only pipelineJobs', () => {
            jobFactoryMock.list.resolves([mainJob, pr10]);

            return pipeline.pipelineJobs.then(value => {
                assert.deepEqual(value, [mainJob]);
            });
        });
    });

    describe('get secrets', () => {
        it('has a secrets getter', () => {
            const listConfig = {
                params: {
                    pipelineId: pipeline.id
                }
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

        it("gets config pipeline's secrets", () => {
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
                }
            };
            const configPipelineListConfig = {
                params: {
                    pipelineId: pipeline.id
                }
            };

            secretFactoryMock.list.onCall(0).resolves(childPipelineSecrets);
            secretFactoryMock.list.onCall(1).resolves(configPipelineSecrets);

            return childPipeline.secrets.then(secrets => {
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

    describe('get config pipeline', () => {
        it('has a config pipeline getter', () => {
            const childPipeline = new PipelineModel(pipelineConfig);

            childPipeline.id = 2;
            childPipeline.configPipelineId = testId;

            pipelineFactoryMock.get.withArgs(testId).resolves(pipeline);

            childPipeline.configPipeline.then(configPipeline => {
                assert.deepEqual(configPipeline, pipeline);
            });
        });
    });

    describe('get jobs', () => {
        beforeEach(() => {
            getUserPermissionMocks({ username: 'janedoe', push: true });
            getUserPermissionMocks({ username: 'johnsmith', push: true });
            pipeline.admins = { janedoe: true, johnsmith: true };
            scmMock.getOpenedPRs.resolves([pr3Info, pr10Info]);
        });

        it('gets all jobs', () => {
            const expected = {
                params: {
                    pipelineId: testId,
                    archived: false
                }
            };

            const jobList = [publishJob, mainJob, pr10, pr3];
            const expectedJobs = [publishJob, mainJob, pr3, pr10];

            jobFactoryMock.list.resolves(jobList);

            return pipeline.getJobs().then(result => {
                assert.calledWith(jobFactoryMock.list, expected);
                assert.deepEqual(result, expectedJobs);
                assert.equal(result[2].title, pr3Info.title);
                assert.equal(result[2].url, pr3Info.url);
                assert.equal(result[2].userProfile, pr3Info.userProfile);
                assert.equal(result[3].title, pr10Info.title);
                assert.equal(result[3].url, pr10Info.url);
                assert.equal(result[3].userProfile, pr10Info.userProfile);
            });
        });

        it('only gets PR jobs', () => {
            const config = {
                type: 'pr'
            };
            const expected = {
                params: {
                    pipelineId: testId,
                    archived: false
                }
            };
            const jobList = [publishJob, mainJob, pr10, pr3];
            const expectedJobs = [pr3, pr10];

            jobFactoryMock.list.resolves(jobList);

            return pipeline.getJobs(config).then(result => {
                assert.calledWith(jobFactoryMock.list, expected);
                assert.deepEqual(result, expectedJobs);
                assert.equal(result[0].title, pr3Info.title);
                assert.equal(result[0].url, pr3Info.url);
                assert.equal(result[0].userProfile, pr3Info.userProfile);
                assert.equal(result[1].title, pr10Info.title);
                assert.equal(result[1].url, pr10Info.url);
                assert.equal(result[1].userProfile, pr10Info.userProfile);
            });
        });

        it('still gets PR jobs if scm.getOpenedPRs failed', () => {
            const config = {
                type: 'pr'
            };
            const expected = {
                params: {
                    pipelineId: testId,
                    archived: false
                }
            };
            const jobList = [publishJob, mainJob, pr10, pr3];
            const expectedJobs = [pr3, pr10];

            jobFactoryMock.list.resolves(jobList);
            scmMock.getOpenedPRs.rejects(new Error('user account suspened'));

            return pipeline.getJobs(config).then(result => {
                assert.calledWith(jobFactoryMock.list, expected);
                assert.deepEqual(result, expectedJobs);
            });
        });

        it('only gets Pipeline jobs', () => {
            const config = {
                type: 'pipeline'
            };
            const expected = {
                params: {
                    pipelineId: testId,
                    archived: false
                }
            };
            const jobList = [publishJob, mainJob, pr10, pr3];
            const expectedJobs = [publishJob, mainJob];

            jobFactoryMock.list.resolves(jobList);

            return pipeline.getJobs(config).then(result => {
                assert.calledWith(jobFactoryMock.list, expected);
                assert.deepEqual(result, expectedJobs);
            });
        });

        it('gets archived jobs', () => {
            const config = {
                params: {
                    archived: true
                }
            };
            const expected = {
                params: {
                    pipelineId: testId,
                    archived: true
                }
            };

            publishJob.archived = true;

            const jobList = [publishJob, mainJob];

            jobFactoryMock.list.resolves(jobList);

            return pipeline.getJobs(config).then(result => {
                assert.calledWith(jobFactoryMock.list, expected);
                assert.deepEqual(result, [publishJob]);
            });
        });
    });

    describe('get events', () => {
        const events = [
            {
                id: '12345f642bbfd1886623964b4cff12db59869e5d'
            },
            {
                id: '12855123cc7f1b808aac07feff24d7d5362cc215'
            }
        ];

        it('gets a list of events', () => {
            const expected = {
                params: {
                    pipelineId: testId,
                    type: 'pipeline'
                },
                sort: 'descending'
            };

            eventFactoryMock.list.resolves(events);

            return pipeline.getEvents().then(result => {
                assert.calledWith(eventFactoryMock.list, expected);
                assert.deepEqual(result, events);
            });
        });

        it('merges the passed in config with the default config', () => {
            const expected = {
                params: {
                    pipelineId: testId,
                    type: 'pr'
                },
                sort: 'descending'
            };

            eventFactoryMock.list.resolves(events);

            return pipeline
                .getEvents({
                    params: {
                        type: 'pr'
                    }
                })
                .then(() => {
                    assert.calledWith(eventFactoryMock.list, expected);
                });
        });

        it('rejects with errors', () => {
            eventFactoryMock.list.rejects(new Error('cannotgetit'));

            return pipeline
                .getEvents()
                .then(() => {
                    assert.fail('Should not get here');
                })
                .catch(err => {
                    assert.instanceOf(err, Error);
                    assert.equal(err.message, 'cannotgetit');
                });
        });
    });

    describe('getConfiguration', () => {
        let parserConfig;
        let getFileConfig;

        beforeEach(() => {
            getFileConfig = {
                scmUri,
                scmContext,
                path: 'screwdriver.yaml',
                token: 'foo',
                scmRepo: {
                    branch: 'branch',
                    url: 'https://host/owner/repo/tree/branch',
                    name: 'owner/repo'
                }
            };
            parserConfig = {
                yaml: SCM_CONTEXT_GITHUB,
                templateFactory: templateFactoryMock,
                buildClusterFactory: buildClusterFactoryMock,
                notificationsValidationErr: true
            };
            scmMock.getFile.resolves(SCM_CONTEXT_GITHUB);
            parserMock.withArgs(parserConfig).resolves(PARSED_YAML);
            parserMock.withArgs('', templateFactoryMock, buildClusterFactoryMock).resolves('DEFAULT_YAML');
            getUserPermissionMocks({ username: 'batman', push: true });
            getUserPermissionMocks({ username: 'robin', push: true });
            pipeline.admins = { batman: true, robin: true };
            pipeline.update = sinon.stub().resolves('foo');
        });

        it('gets pipeline config', () =>
            pipeline.getConfiguration().then(config => {
                assert.equal(config, PARSED_YAML);
                assert.calledWith(scmMock.getFile, getFileConfig);
                assert.calledWith(parserMock, parserConfig);
            }));

        it('passes triggerFactoryMock and pipelineId if external join flag is true', () => {
            pipelineFactoryMock.getExternalJoinFlag.returns(true);
            parserConfig.triggerFactory = triggerFactoryMock;
            parserConfig.pipelineId = testId;

            return pipeline.getConfiguration().then(config => {
                assert.equal(config, PARSED_YAML);
                assert.calledWith(scmMock.getFile, getFileConfig);
                assert.calledWith(parserMock, parserConfig);
            });
        });

        it('gets pipeline config with provider config', () => {
            getFileConfig = {
                scmUri,
                scmContext,
                path: 'screwdriver.yaml',
                token: 'foo',
                scmRepo: {
                    branch: 'branch',
                    url: 'https://host/owner/repo/tree/branch',
                    name: 'owner/repo'
                },
                ref: 'bar'
            };
            parserConfig = {
                yaml: loadData(YAML_WITH_PROVIDER),
                templateFactory: templateFactoryMock,
                buildClusterFactory: buildClusterFactoryMock,
                notificationsValidationErr: true
            };
            scmMock.getFile.onCall(0).resolves(loadData(YAML_WITH_PROVIDER_FILE_PATH));
            scmMock.getFile.onCall(1).resolves(loadData(SHARED_PROVIDER_YAML));
            scmMock.getFile.onCall(2).resolves(loadData(PROVIDER_YAML));
            parserMock.withArgs(parserConfig).resolves(PARSED_YAML_WITH_PROVIDER);

            return pipeline.getConfiguration({ ref: 'bar' }).then(config => {
                assert.calledWith(parserMock, parserConfig);
                assert.deepEqual(config, PARSED_YAML_WITH_PROVIDER);
                assert.calledWith(scmMock.getFile.thirdCall, {
                    scmUri: 'github.com:12345:master',
                    scmContext: 'github:github.com',
                    path: 'git@github.com:screwdriver-cd/provider.git:configuration/aws/provider.yaml',
                    token: 'foo',
                    scmRepo: {
                        branch: 'branch',
                        url: 'https://host/owner/repo/tree/branch',
                        name: 'owner/repo'
                    }
                });
                assert.calledWith(scmMock.getFile.firstCall, getFileConfig);
            });
        });

        it('gets pipeline config from an alternate ref', () => {
            getFileConfig.ref = 'bar';

            return pipeline.getConfiguration({ ref: 'bar' }).then(config => {
                assert.equal(config, PARSED_YAML);
                assert.calledWith(scmMock.getFile, getFileConfig);
                assert.calledWith(parserMock, parserConfig);
            });
        });

        it('gets config from external config pipeline', () => {
            pipeline.configPipelineId = 1;

            return pipeline.getConfiguration().then(config => {
                assert.calledWith(configPipelineMock.getConfiguration, { id: testId, ref: undefined });
                assert.equal(config, EXTERNAL_PARSED_YAML);
            });
        });

        it('gets config from external config pipeline with an alternate ref', () => {
            pipeline.configPipelineId = 1;

            return pipeline
                .getConfiguration({
                    ref: 'bar'
                })
                .then(config => {
                    assert.calledWith(configPipelineMock.getConfiguration, {
                        id: testId,
                        ref: 'bar'
                    });
                    assert.equal(config, EXTERNAL_PARSED_YAML);
                });
        });

        it('does not pass PR ref when get config from external pipeline', () => {
            pipeline.configPipelineId = 1;

            return pipeline
                .getConfiguration({
                    ref: 'pull/1/ref',
                    isPR: true
                })
                .then(config => {
                    assert.calledWith(configPipelineMock.getConfiguration, {});
                    assert.equal(config, EXTERNAL_PARSED_YAML);
                });
        });

        it('returns error on scm fetch errors', async () => {
            getFileConfig.ref = 'foobar';
            scmMock.getFile.rejects(new Error('cannotgetit'));

            let errMessage = '';

            try {
                await pipeline.getConfiguration({ ref: 'foobar' });
            } catch (err) {
                errMessage = err.message;
            }

            assert.calledWith(scmMock.getFile, getFileConfig);
            assert.equal(errMessage, 'pipelineId:123: Failed to fetch screwdriver.yaml.');
        });
    });

    describe('update', () => {
        it('multipleBuildClusterDisabled without annotations and updates a pipelines scm repository and branch ', () => {
            const expected = {
                params: {
                    admins: { d2lam: true },
                    id: testId,
                    name: 'foo/bar',
                    scmContext,
                    scmRepo,
                    scmUri
                },
                table: 'pipelines'
            };

            userFactoryMock.get
                .withArgs({
                    username: 'd2lam',
                    scmContext
                })
                .resolves({
                    unsealToken: sinon.stub().resolves('foo'),
                    getPermissions: sinon.stub().resolves({
                        push: true
                    })
                });
            datastore.update.resolves({});

            pipeline.scmUri = scmUri;
            pipeline.scmContext = scmContext;
            pipeline.admins = {
                d2lam: true
            };

            return pipeline.update().then(p => {
                assert.calledWith(scmMock.decorateUrl, {
                    scmUri,
                    scmContext,
                    token: 'foo'
                });
                assert.calledWith(datastore.update, expected);
                assert.ok(p);
            });
        });

        it('multipleBuildClusterDisabled with annotations and updates a pipelines scm repository and branch', () => {
            const expected = {
                params: {
                    admins: { d2lam: true },
                    id: testId,
                    name: 'foo/bar',
                    scmContext,
                    scmRepo,
                    scmUri,
                    annotations: {
                        'screwdriver.cd/prChain': 'fork'
                    }
                },
                table: 'pipelines'
            };

            userFactoryMock.get
                .withArgs({
                    username: 'd2lam',
                    scmContext
                })
                .resolves({
                    unsealToken: sinon.stub().resolves('foo'),
                    getPermissions: sinon.stub().resolves({
                        push: true
                    })
                });
            datastore.update.resolves({});

            pipeline.scmUri = scmUri;
            pipeline.scmContext = scmContext;
            pipeline.admins = {
                d2lam: true
            };
            pipeline.annotations = {
                'screwdriver.cd/prChain': 'fork'
            };

            return pipeline.update().then(p => {
                assert.calledWith(scmMock.decorateUrl, {
                    scmUri,
                    scmContext,
                    token: 'foo'
                });
                assert.calledWith(datastore.update, expected);
                assert.ok(p);
            });
        });

        it(
            'multipleBuildClusterEnabled - without annotation - ' +
                'updates a pipelines scm repository and branch - ' +
                'pick screwdriver build cluster',
            () => {
                const expected = {
                    params: {
                        admins: { d2lam: true },
                        id: testId,
                        name: 'foo/bar',
                        scmContext,
                        scmRepo,
                        scmUri,
                        annotations: {
                            'screwdriver.cd/buildCluster': 'sd1'
                        }
                    },
                    table: 'pipelines'
                };

                userFactoryMock.get
                    .withArgs({
                        username: 'd2lam',
                        scmContext
                    })
                    .resolves({
                        unsealToken: sinon.stub().resolves('foo'),
                        getPermissions: sinon.stub().resolves({
                            push: true
                        })
                    });

                datastore.update.resolves({});
                buildClusterFactoryMock.list.resolves(sdBuildClusters);

                pipeline.scmUri = scmUri;
                pipeline.scmContext = scmContext;
                pipeline.admins = {
                    d2lam: true
                };

                return pipeline.update().then(p => {
                    assert.calledWith(scmMock.decorateUrl, {
                        scmUri,
                        scmContext,
                        token: 'foo'
                    });
                    assert.calledWith(datastore.update, expected);
                    assert.ok(p);
                });
            }
        );

        it(
            'multipleBuildClusterEnabled - without cluster annotation - ' +
                'updates a pipelines scm repository and branch - ' +
                'pick screwdriver build cluster',
            () => {
                const expected = {
                    params: {
                        admins: { d2lam: true },
                        id: testId,
                        name: 'foo/bar',
                        scmContext,
                        scmRepo,
                        scmUri,
                        annotations: {
                            'screwdriver.cd/prChain': 'fork',
                            'screwdriver.cd/buildCluster': 'sd1'
                        }
                    },
                    table: 'pipelines'
                };

                userFactoryMock.get
                    .withArgs({
                        username: 'd2lam',
                        scmContext
                    })
                    .resolves({
                        unsealToken: sinon.stub().resolves('foo'),
                        getPermissions: sinon.stub().resolves({
                            push: true
                        })
                    });

                datastore.update.resolves({});
                buildClusterFactoryMock.list.resolves(sdBuildClusters);

                pipeline.scmUri = scmUri;
                pipeline.scmContext = scmContext;
                pipeline.admins = {
                    d2lam: true
                };
                pipeline.annotations = {
                    'screwdriver.cd/prChain': 'fork'
                };

                return pipeline.update().then(p => {
                    assert.calledWith(scmMock.decorateUrl, {
                        scmUri,
                        scmContext,
                        token: 'foo'
                    });
                    assert.calledWith(datastore.update, expected);
                    assert.ok(p);
                });
            }
        );

        it(
            'multipleBuildClusterEnabled - with cluster annotation - ' +
                'updates a pipelines scm repository and branch',
            () => {
                const expected = {
                    params: {
                        admins: { d2lam: true },
                        id: testId,
                        name: 'screwdriver/ui',
                        scmContext,
                        scmRepo: {
                            branch: 'master',
                            name: 'screwdriver/ui',
                            url: 'https://github.com/foo/bar/tree/master'
                        },
                        scmUri,
                        annotations: { 'screwdriver.cd/buildCluster': 'iOS' }
                    },
                    table: 'pipelines'
                };

                userFactoryMock.get
                    .withArgs({
                        username: 'd2lam',
                        scmContext
                    })
                    .resolves({
                        unsealToken: sinon.stub().resolves('foo'),
                        getPermissions: sinon.stub().resolves({
                            push: true
                        })
                    });

                datastore.update.resolves({});
                buildClusterFactoryMock.list.resolves(sdBuildClusters);
                scmMock.decorateUrl.resolves({
                    branch: 'master',
                    name: 'screwdriver/ui',
                    url: 'https://github.com/foo/bar/tree/master'
                });
                pipeline.scmUri = scmUri;
                pipeline.scmContext = scmContext;
                pipeline.admins = {
                    d2lam: true
                };
                pipeline.annotations = { 'screwdriver.cd/buildCluster': 'iOS' };

                return pipeline.update().then(p => {
                    assert.calledWith(scmMock.decorateUrl, {
                        scmUri,
                        scmContext,
                        token: 'foo'
                    });
                    assert.calledWith(datastore.update, expected);
                    assert.ok(p);
                });
            }
        );

        it('throws err if the pipeline is unauthorized to use the build cluster', () => {
            userFactoryMock.get
                .withArgs({
                    username: 'd2lam',
                    scmContext
                })
                .resolves({
                    unsealToken: sinon.stub().resolves('foo'),
                    getPermissions: sinon.stub().resolves({
                        push: true
                    })
                });
            datastore.update.resolves({});
            buildClusterFactoryMock.list.resolves(sdBuildClusters);
            pipeline.scmUri = scmUri;
            pipeline.scmContext = scmContext;
            pipeline.admins = {
                d2lam: true
            };
            pipeline.annotations = { 'screwdriver.cd/buildCluster': 'iOS' };

            return pipeline.update().catch(err => {
                assert.instanceOf(err, Error);
                assert.strictEqual(err.message, 'This pipeline is not authorized to use this build cluster.');
            });
        });

        it('throws err if the build cluster specified does not exist', () => {
            userFactoryMock.get
                .withArgs({
                    username: 'd2lam',
                    scmContext
                })
                .resolves({
                    unsealToken: sinon.stub().resolves('foo'),
                    getPermissions: sinon.stub().resolves({
                        push: true
                    })
                });
            datastore.update.resolves({});
            buildClusterFactoryMock.get.resolves(null);
            pipeline.scmUri = scmUri;
            pipeline.scmContext = scmContext;
            pipeline.admins = {
                d2lam: true
            };
            pipeline.annotations = { 'screwdriver.cd/buildCluster': 'iOS' };

            return pipeline.update().catch(err => {
                assert.instanceOf(err, Error);
                assert.strictEqual(
                    err.message,
                    'Cluster specified in screwdriver.cd/buildCluster iOS ' +
                        `for scmContext ${pipeline.scmContext} does not exist.`
                );
            });
        });

        it('updates a pipelines scm repository and branch when the scmUri does not change', () => {
            const expected = {
                params: {
                    admins: { d2lam: true },
                    id: testId,
                    name: 'foo/bar',
                    scmContext,
                    scmRepo
                },
                table: 'pipelines'
            };

            userFactoryMock.get
                .withArgs({
                    username: 'd2lam',
                    scmContext
                })
                .resolves({
                    unsealToken: sinon.stub().resolves('foo'),
                    getPermissions: sinon.stub().resolves({
                        push: true
                    })
                });
            datastore.update.resolves({});
            pipeline.admins = {
                d2lam: true
            };

            return pipeline.update().then(p => {
                assert.calledWith(scmMock.decorateUrl, {
                    scmUri,
                    scmContext,
                    token: 'foo'
                });
                assert.calledWith(datastore.update, expected);
                assert.ok(p);
            });
        });
    });

    describe('remove', () => {
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
        const trigger = {
            src: '~sd@123:main',
            dest: '~sd@345:main',
            remove: sinon.stub().resolves(null)
        };
        const collection = {
            name: 'TEST_COLLECTION',
            pipelineIds: [testId, 456],
            update: sinon.stub().resolves(null)
        };

        beforeEach(() => {
            eventFactoryMock.list.resolves([]);
            jobFactoryMock.list.resolves([]);
            collectionFactoryMock.list.resolves([collection]);
            secretFactoryMock.list.resolves([secret]);
            tokenFactoryMock.list.resolves([token]);
            triggerFactoryMock.list.resolves([trigger]);
        });

        afterEach(() => {
            eventFactoryMock.list.reset();
            jobFactoryMock.list.reset();
            secretFactoryMock.list.reset();
            tokenFactoryMock.list.reset();
            collectionFactoryMock.list.reset();
            triggerFactoryMock.list.reset();
            publishJob.remove.reset();
            mainJob.remove.reset();
            blahJob.remove.reset();
            secret.remove.reset();
            token.remove.reset();
            trigger.remove.reset();
        });

        it('remove secrets', () =>
            pipeline.remove().then(() => {
                assert.calledOnce(secretFactoryMock.list);
                assert.calledOnce(secret.remove);
            }));

        it('remove tokens', () =>
            pipeline.remove().then(() => {
                assert.calledOnce(tokenFactoryMock.list);
                assert.calledOnce(token.remove);
            }));

        it('remove triggers', () =>
            pipeline.remove().then(() => {
                assert.calledWith(triggerFactoryMock.list, { params: { dest: [] } });
                assert.calledThrice(jobFactoryMock.list);
                assert.calledOnce(triggerFactoryMock.list);
                assert.calledOnce(trigger.remove);
            }));

        it('remove jobs recursively', () => {
            const nonArchivedMatcher = sinon.match(function(value) {
                return value && value.params && !value.params.archived;
            });
            const archivedMatcher = sinon.match(function(value) {
                return value && value.params && value.params.archived;
            });
            let i;

            for (i = 0; i < 4; i += 1) {
                jobFactoryMock.list
                    .withArgs(nonArchivedMatcher)
                    .onCall(i)
                    .resolves([publishJob, mainJob]);
            }
            jobFactoryMock.list
                .withArgs(nonArchivedMatcher)
                .onCall(i)
                .resolves([]);

            for (i = 0; i < 2; i += 1) {
                jobFactoryMock.list
                    .withArgs(archivedMatcher)
                    .onCall(i)
                    .resolves([blahJob]);
            }
            jobFactoryMock.list
                .withArgs(archivedMatcher)
                .onCall(i)
                .resolves([]);

            return pipeline.remove().then(() => {
                assert.callCount(jobFactoryMock.list, 8);

                // Delete all the jobs
                assert.callCount(publishJob.remove, 3);
                assert.callCount(mainJob.remove, 3);
                assert.callCount(blahJob.remove, 2);

                // Delete the pipeline
                assert.calledOnce(datastore.remove);
            });
        });

        it('fail if getJobs returns error', () => {
            jobFactoryMock.list.rejects(new Error('error'));

            return pipeline
                .remove()
                .then(() => {
                    assert.fail('should not get here');
                })
                .catch(err => {
                    assert.isOk(err);
                    assert.equal(err.message, 'error');
                });
        });

        it('update collection associated with pipeline', () => {
            const expected = [456];
            const search = {
                field: 'pipelineIds',
                keyword: `%${testId}%`
            };

            return pipeline.remove().then(() => {
                assert.calledWith(collectionFactoryMock.list, { search });
                assert.deepEqual(collection.pipelineIds, expected);
                assert.calledOnce(collection.update);
            });
        });

        it('fail if fail to get collections', () => {
            collectionFactoryMock.list.rejects(new Error('error'));

            return pipeline
                .remove()
                .then(() => {
                    assert.fail('should not get here');
                })
                .catch(err => {
                    assert.isOk(err);
                    assert.equal(err.message, 'error');
                });
        });

        it('fail if job.remove returns error', () => {
            publishJob.remove.rejects(new Error('error removing job'));
            jobFactoryMock.list.resolves([publishJob, mainJob]);

            return pipeline
                .remove()
                .then(() => {
                    assert.fail('should not get here');
                })
                .catch(err => {
                    assert.isOk(err);
                    assert.equal(err.message, 'error removing job');
                });
        });

        it('remove events recursively', () => {
            const pipelineTypeMatcher = sinon.match(function(value) {
                return value && value.params && value.params.type === 'pipeline';
            });
            const prTypeMatcher = sinon.match(function(value) {
                return value && value.params && value.params.type === 'pr';
            });
            let i;

            for (i = 0; i < 4; i += 1) {
                eventFactoryMock.list
                    .withArgs(pipelineTypeMatcher)
                    .onCall(i)
                    .resolves([testEvent]);
            }
            eventFactoryMock.list
                .withArgs(pipelineTypeMatcher)
                .onCall(i)
                .resolves([]);

            for (i = 0; i < 2; i += 1) {
                eventFactoryMock.list
                    .withArgs(prTypeMatcher)
                    .onCall(i)
                    .resolves([testEvent]);
            }
            eventFactoryMock.list
                .withArgs(prTypeMatcher)
                .onCall(i)
                .resolves([]);

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

            return pipeline
                .remove()
                .then(() => {
                    assert.fail('should not get here');
                })
                .catch(err => {
                    assert.isOk(err);
                    assert.equal(err.message, 'error');
                });
        });

        it('fail if event.remove returns error', () => {
            testEvent.remove.rejects(new Error('error removing event'));
            eventFactoryMock.list.resolves([testEvent]);

            return pipeline
                .remove()
                .then(() => {
                    assert.fail('should not get here');
                })
                .catch(err => {
                    assert.isOk(err);
                    assert.equal(err.message, 'error removing event');
                });
        });

        it('fail if secret.remove returns error', () => {
            secret.remove.rejects(new Error('error removing secret'));

            return pipeline
                .remove()
                .then(() => {
                    assert.fail('should not get here');
                })
                .catch(err => {
                    assert.isOk(err);
                    assert.equal(err.message, 'error removing secret');
                });
        });

        it('fail if token.remove returns error', () => {
            secret.remove.reset();
            token.remove.rejects(new Error('error removing token'));

            return pipeline
                .remove()
                .then(() => {
                    assert.fail('should not get here');
                })
                .catch(err => {
                    assert.isOk(err);
                    assert.equal(err.message, 'error removing token');
                });
        });

        it("does not remove parent pipeline's secrets", () => {
            const childPipeline = new PipelineModel(pipelineConfig);

            childPipeline.id = 2;
            childPipeline.configPipelineId = testId;

            const childSecret = {
                name: 'TEST_CHILD',
                value: 'testvalue',
                allowInPR: true,
                pipelineId: childPipeline.id,
                remove: sinon.stub().resolves(null)
            };

            secretFactoryMock.list.onCall(0).resolves([childSecret]);
            secretFactoryMock.list.onCall(1).resolves([secret]);

            childPipeline.remove().then(() => {
                assert.notCalled(secret.remove);
                assert.calledOnce(childSecret.remove);
            });
        });
    });

    describe('get tokens', () => {
        it('has a tokens getter', () => {
            const listConfig = {
                params: {
                    pipelineId: testId
                }
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

    describe('get metrics', () => {
        const startTime = '2019-01-20T12:00:00.000Z';
        const endTime = '2019-01-30T12:00:00.000Z';
        const page = 1;
        const count = 2;
        const build11 = {
            id: 11,
            jobId: 1,
            eventId: 1,
            startTime: '2019-01-22T21:08:00.000Z', // minStartTime for event1
            endTime: '2019-01-22T21:30:00.000Z',
            status: 'SUCCESS',
            imagePullTime: 20,
            queuedTime: 1
        };
        const build12 = {
            id: 12,
            jobId: 2,
            eventId: 1,
            startTime: '2019-01-22T21:21:00.000Z',
            endTime: '2019-01-22T22:30:00.000Z', // maxEndTime for event1
            status: 'FAILURE',
            imagePullTime: 30,
            queuedTime: 2
        };
        const build13 = {
            id: 13,
            jobId: 3,
            eventId: 1,
            startTime: '2019-01-22T21:21:00.000Z',
            endTime: '2019-01-22T22:30:00.000Z', // maxEndTime for event1
            status: 'FAILURE',
            imagePullTime: 30,
            queuedTime: 2
        };
        let build21;
        const build22 = {
            id: 22,
            jobId: 1,
            eventId: 2,
            startTime: '2019-01-24T11:30:00.000Z', // minStartTime for event2
            endTime: '2019-01-24T15:30:00.000Z', // maxEndTime for event2
            status: 'SUCCESS',
            imagePullTime: 50,
            queuedTime: 4
        };
        const duration1 = dayjs(build12.endTime).diff(dayjs(build11.startTime), 'second');
        const duration2 = dayjs(build22.endTime).diff(dayjs(build22.startTime), 'second');
        let event0;
        let event1;
        let event2;
        let metrics;

        beforeEach(() => {
            build21 = {
                id: 21,
                jobId: 2,
                eventId: 2,
                startTime: '2019-01-24T11:31:00.000Z',
                endTime: '2019-01-24T12:20:00.000Z',
                status: 'SUCCESS',
                imagePullTime: 40,
                queuedTime: 3
            };
            event1 = {
                id: 1233,
                causeMessage: 'Merged by batman',
                commit: {
                    author: {
                        name: 'BatMan',
                        username: 'batman'
                    },
                    message: 'Update screwdriver.yaml',
                    // eslint-disable-next-line max-len
                    url: 'https://github.com/Code-Beast/models/commit/14b920bef306eb1bde8ec0b6a32372eebecc6d0e'
                },
                createTime: '2019-01-22T21:00:00.000Z',
                creator: {
                    name: 'BatMan',
                    username: 'batman'
                },
                meta: {
                    meta: { summary: { foo: 'bar' } }
                },
                pipelineId: 300123,
                sha: '14b920bef306eb1bde8ec0b6a32372eebecc6d0e',
                configPipelineSha: '14b920bef306eb1bde8ec0b6a32372eebecc6d0e',
                startFrom: '~commit',
                type: 'pipeline',
                workflowGraph: {
                    nodes: [{ name: '~pr' }, { name: '~commit' }, { name: 'test', id: 124 }],
                    edges: [
                        { src: '~pr', dest: 'test' },
                        { src: '~commit', dest: 'test' }
                    ]
                },
                pr: {},
                duration: 25,
                getMetrics: sinon.stub().resolves([build11, build12])
            };
            event2 = {
                id: 1234,
                commit: {
                    author: {
                        name: 'BatMan',
                        username: 'batman'
                    },
                    message: 'Update package.json',
                    // eslint-disable-next-line max-len
                    url: 'https://github.com/Code-Beast/models/commit/14b920bef306eb1bde8ec0b6a32372eebecc6d0e'
                },
                createTime: '2019-01-24T11:25:00.610Z',
                sha: '14b920bef306eb1bde8ec0b6a32372eebecc6d0e',
                getMetrics: sinon.stub().resolves([build21, build22])
            };
            event0 = {
                id: 1235,
                createTime: '2019-01-24T11:25:00.610Z',
                sha: '14b920bef306eb1bde8ec0b6a32372eebecc6d0e',
                getMetrics: sinon.stub().resolves([])
            };
            metrics = [
                {
                    id: event1.id,
                    createTime: event1.createTime,
                    sha: event1.sha,
                    commit: event1.commit,
                    causeMessage: event1.causeMessage,
                    duration: duration1,
                    status: build12.status,
                    imagePullTime: build11.imagePullTime + build12.imagePullTime,
                    queuedTime: build11.queuedTime + build12.queuedTime,
                    builds: [build11, build12],
                    downtimeDuration: dayjs(new Date()).diff(dayjs(new Date(build12.endTime)), 'second'),
                    isDowntimeEvent: true,
                    maxEndTime: new Date(build12.endTime)
                },
                {
                    id: event2.id,
                    createTime: event2.createTime,
                    sha: event2.sha,
                    commit: event2.commit,
                    causeMessage: event2.causeMessage,
                    duration: duration2,
                    status: build22.status,
                    imagePullTime: build21.imagePullTime + build22.imagePullTime,
                    queuedTime: build21.queuedTime + build22.queuedTime,
                    builds: [build21, build22],
                    isDowntimeEvent: false,
                    maxEndTime: new Date(build22.endTime)
                }
            ];
        });

        it('generates metrics by time', () => {
            const eventListConfig = {
                params: {
                    pipelineId: testId,
                    type: 'pipeline'
                },
                sort: 'ascending',
                sortBy: 'id',
                paginate: {
                    page: DEFAULT_PAGE,
                    count: MAX_METRIC_GET_COUNT
                },
                startTime,
                endTime,
                readOnly: true
            };

            eventFactoryMock.list.resolves([event1, event0, event2]);

            return pipeline.getMetrics({ startTime, endTime }).then(result => {
                assert.calledWith(eventFactoryMock.list, eventListConfig);
                assert.calledOnce(event1.getMetrics);
                assert.calledOnce(event2.getMetrics);
                assert.deepEqual(result, metrics);
            });
        });

        it('generates metrics for specified downtime jobs', () => {
            const eventListConfig = {
                params: {
                    pipelineId: testId,
                    type: 'pipeline'
                },
                sort: 'ascending',
                sortBy: 'id',
                paginate: {
                    page: DEFAULT_PAGE,
                    count: MAX_METRIC_GET_COUNT
                },
                startTime,
                endTime,
                readOnly: true
            };

            event1.getMetrics = sinon.stub().resolves([build11, build12, build13]);
            build21.status = 'FAILURE';

            metrics = [
                {
                    id: event1.id,
                    createTime: event1.createTime,
                    sha: event1.sha,
                    commit: event1.commit,
                    causeMessage: event1.causeMessage,
                    duration: duration1,
                    status: build13.status,
                    imagePullTime: build11.imagePullTime + build12.imagePullTime + build13.imagePullTime,
                    queuedTime: build11.queuedTime + build12.queuedTime + build13.queuedTime,
                    builds: [build11, build12, build13],
                    downtimeDuration: dayjs(new Date(build22.endTime)).diff(dayjs(new Date(build13.endTime)), 'second'),
                    isDowntimeEvent: true,
                    maxEndTime: new Date(build13.endTime)
                },
                {
                    id: event2.id,
                    createTime: event2.createTime,
                    sha: event2.sha,
                    commit: event2.commit,
                    causeMessage: event2.causeMessage,
                    duration: duration2,
                    status: build22.status,
                    imagePullTime: build21.imagePullTime + build22.imagePullTime,
                    queuedTime: build21.queuedTime + build22.queuedTime,
                    builds: [build21, build22],
                    downtimeDuration: dayjs(new Date()).diff(dayjs(new Date(build22.endTime)), 'second'),
                    isDowntimeEvent: true,
                    maxEndTime: new Date(build22.endTime)
                }
            ];

            eventFactoryMock.list.resolves([event1, event0, event2]);

            return pipeline.getMetrics({ startTime, endTime, downtimeJobs: [2, 3] }).then(result => {
                assert.calledWith(eventFactoryMock.list, eventListConfig);
                assert.calledOnce(event1.getMetrics);
                assert.calledOnce(event2.getMetrics);
                assert.deepEqual(result, metrics);
            });
        });

        it('generates metrics by pagination', () => {
            const eventListConfig = {
                params: {
                    pipelineId: testId,
                    type: 'pipeline'
                },
                sort: 'ascending',
                sortBy: 'id',
                paginate: {
                    page,
                    count
                },
                readOnly: true
            };

            eventFactoryMock.list.resolves([event1, event0, event2]);

            return pipeline.getMetrics({ page, count }).then(result => {
                assert.calledWith(eventFactoryMock.list, eventListConfig);
                assert.calledOnce(event0.getMetrics);
                assert.calledOnce(event2.getMetrics);
                assert.calledOnce(event1.getMetrics);
                assert.deepEqual(result, metrics);
            });
        });

        it('generates metrics by pagination if page is available but count', () => {
            const eventListConfig = {
                params: {
                    pipelineId: testId,
                    type: 'pipeline'
                },
                sort: 'ascending',
                sortBy: 'id',
                paginate: {
                    page,
                    count: undefined
                },
                readOnly: true
            };

            eventFactoryMock.list.resolves([event1, event0, event2]);

            return pipeline.getMetrics({ page }).then(result => {
                assert.calledWith(eventFactoryMock.list, eventListConfig);
                assert.calledOnce(event0.getMetrics);
                assert.calledOnce(event2.getMetrics);
                assert.calledOnce(event1.getMetrics);
                assert.deepEqual(result, metrics);
            });
        });

        it('generates metrics by pagination if count is available but page', () => {
            const eventListConfig = {
                params: {
                    pipelineId: testId,
                    type: 'pipeline'
                },
                sort: 'ascending',
                sortBy: 'id',
                paginate: {
                    page: undefined,
                    count
                },
                readOnly: true
            };

            eventFactoryMock.list.resolves([event1, event0, event2]);

            return pipeline.getMetrics({ count }).then(result => {
                assert.calledWith(eventFactoryMock.list, eventListConfig);
                assert.calledOnce(event0.getMetrics);
                assert.calledOnce(event2.getMetrics);
                assert.calledOnce(event1.getMetrics);
                assert.deepEqual(result, metrics);
            });
        });

        describe('aggregate metrics', () => {
            const RewirePipelineModel = rewire('../../lib/pipeline');

            // eslint-disable-next-line no-underscore-dangle
            RewirePipelineModel.__set__('MAX_METRIC_GET_COUNT', FAKE_MAX_METRIC_GET_COUNT);
            let eventListConfig;

            beforeEach(() => {
                pipeline = new RewirePipelineModel(pipelineConfig);
                eventListConfig = {
                    params: {
                        pipelineId: testId,
                        type: 'pipeline'
                    },
                    startTime,
                    endTime,
                    sort: 'ascending',
                    sortBy: 'id',
                    paginate: {
                        page: DEFAULT_PAGE,
                        count: FAKE_MAX_METRIC_GET_COUNT
                    },
                    readOnly: true
                };
                const testEvents = [];
                let currentDay = event1.createTime;

                // generate 8 mock builds
                for (let i = 0; i < 8; i += 1) {
                    testEvents.push({ ...event1 });
                    testEvents[i].id = i;

                    if (i % 3 === 0) {
                        currentDay = dayjs(currentDay).add(2, 'day');
                    }

                    const testBuild = {
                        id: 8888,
                        eventId: i,
                        status: 'SUCCESS',
                        imagePullTime: 10 + i,
                        queuedTime: 5 + i,
                        createTime: currentDay.toISOString(),
                        startTime: dayjs(currentDay)
                            .add(10, 'minute')
                            .toISOString(),
                        endTime: dayjs(currentDay)
                            .add(20 + i, 'minute')
                            .toISOString()
                    };

                    testEvents[i].getMetrics = sinon.stub().resolves([testBuild]);
                    testEvents[i].createTime = currentDay.toISOString();
                }

                eventFactoryMock.list.onCall(0).resolves(testEvents.slice(0, 5));
                eventFactoryMock.list.onCall(1).resolves(testEvents.slice(5, testEvents.length));
            });

            it('generates daily aggregated metrics', () => {
                metrics = [
                    {
                        createTime: '2019-01-24T21:00:00.000Z',
                        duration: 660,
                        queuedTime: 6,
                        imagePullTime: 11
                    },
                    {
                        createTime: '2019-01-26T21:00:00.000Z',
                        duration: 840,
                        queuedTime: 9,
                        imagePullTime: 14
                    },
                    {
                        createTime: '2019-01-28T21:00:00.000Z',
                        duration: 990,
                        queuedTime: 11.5,
                        imagePullTime: 16.5
                    }
                ];

                return pipeline.getMetrics({ startTime, endTime, aggregateInterval: 'day' }).then(result => {
                    assert.calledTwice(eventFactoryMock.list);
                    assert.calledWith(eventFactoryMock.list.firstCall, eventListConfig);

                    eventListConfig.paginate.page = 2;
                    assert.calledWith(eventFactoryMock.list.secondCall, eventListConfig);

                    assert.deepEqual(result, metrics);
                });
            });

            it('generates monthly aggregated metrics', () => {
                metrics = [
                    {
                        createTime: '2019-01-24T21:00:00.000Z',
                        duration: 810, // AVG(SUM(10:17)) * 60 seconds
                        imagePullTime: 13.5, // AVG(SUM(10:17))
                        queuedTime: 8.5 // AVG(SUM(5:12))
                    }
                ];

                return pipeline.getMetrics({ startTime, endTime, aggregateInterval: 'month' }).then(result => {
                    assert.calledTwice(eventFactoryMock.list);
                    assert.calledWith(eventFactoryMock.list.firstCall, eventListConfig);

                    eventListConfig.paginate.page = 2;
                    assert.calledWith(eventFactoryMock.list.secondCall, eventListConfig);

                    assert.deepEqual(result, metrics);
                });
            });

            it('accounts for empty metrics', () => {
                // this build missing some stats
                const badbuild = {
                    id: 22,
                    eventId: 2,
                    status: 'SUCCESS',
                    queuedTime: 4,
                    duration: 30
                };
                const testBuild = { ...build21 };

                delete testBuild.startTime;

                event2.getMetrics = sinon.stub().resolves([testBuild, badbuild]);

                eventFactoryMock.list.onCall(0).resolves([event0, event1, event2]);
                metrics = [
                    {
                        createTime: '2019-01-24T11:25:00.610Z',
                        duration: 4920,
                        imagePullTime: 45,
                        queuedTime: 5
                    }
                ];

                return pipeline.getMetrics({ startTime, endTime, aggregateInterval: 'month' }).then(result => {
                    assert.calledOnce(eventFactoryMock.list);
                    assert.calledWith(eventFactoryMock.list.firstCall, eventListConfig);

                    assert.deepEqual(result, metrics);
                });
            });
        });

        it('does not fail if stats is missing', () => {
            const build14 = {
                id: 13,
                eventId: 1,
                startTime: '2019-01-22T21:10:00.000Z',
                endTime: '2019-01-22T21:12:00.000Z',
                status: 'SUCCESS'
            };

            event1.getMetrics = sinon.stub().resolves([build11, build12, build14]);
            metrics[0].builds = [build11, build12, build14];

            eventFactoryMock.list.resolves([event1, event2]);

            return pipeline.getMetrics({ startTime, endTime }).then(result => {
                assert.calledOnce(event1.getMetrics);
                assert.calledOnce(event2.getMetrics);
                assert.deepEqual(result, metrics);
            });
        });

        it('do not fail if queuedTime and imagePullTime are not there', () => {
            const build14 = {
                id: 13,
                eventId: 1,
                startTime: '2019-01-22T21:10:00.000Z',
                endTime: '2019-01-22T21:12:00.000Z',
                status: 'SUCCESS'
            };

            event1.getMetrics = sinon.stub().resolves([build14, build12, build11]);
            metrics[0].builds = [build14, build12, build11];
            eventFactoryMock.list.resolves([event1, event2]);

            return pipeline.getMetrics({ startTime, endTime }).then(result => {
                assert.calledOnce(event1.getMetrics);
                assert.calledOnce(event2.getMetrics);
                assert.deepEqual(result, metrics);
            });
        });

        it('does not fail if empty builds', () => {
            eventFactoryMock.list.resolves([event1, event2]);
            event1.getMetrics = sinon.stub().resolves([]);
            metrics = metrics.slice(1);

            return pipeline.getMetrics({ startTime, endTime }).then(result => {
                assert.deepEqual(result, metrics);
            });
        });

        it('works with no startTime or endTime params passed in', () => {
            const eventListConfig = {
                params: {
                    pipelineId: testId,
                    type: 'pipeline'
                },
                sort: 'ascending',
                sortBy: 'id',
                paginate: {
                    page: DEFAULT_PAGE,
                    count: MAX_METRIC_GET_COUNT
                },
                readOnly: true
            };

            eventFactoryMock.list.resolves([event1, event2]);

            return pipeline.getMetrics().then(result => {
                assert.calledWith(eventFactoryMock.list, eventListConfig);
                assert.deepEqual(result, metrics);
            });
        });

        it('rejects with errors', () => {
            eventFactoryMock.list.rejects(new Error('cannotgetit'));

            return pipeline
                .getMetrics({ startTime, endTime })
                .then(() => {
                    assert.fail('Should not get here');
                })
                .catch(err => {
                    assert.instanceOf(err, Error);
                    assert.equal(err.message, 'cannotgetit');
                });
        });
    });
});
