'use strict';

const assert = require('chai').assert;
const mockery = require('mockery');
const sinon = require('sinon');
const hoek = require('hoek');
const schema = require('screwdriver-data-schema');

sinon.assert.expose(assert, { prefix: '' });
const PARSED_YAML = require('../data/parser');

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

    const dateNow = 1111111111;
    const scmUri = 'github.com:12345:master';
    const scmContext = 'github:github.com';
    const testId = 'd398fb192747c9a0124e9e5b4e6e8e841cf8c71c';
    const admins = { batman: true };
    const paginate = {
        page: 1,
        count: 50
    };
    let jobs;
    let pipelineConfig;

    const decorateJobMock = (job) => {
        const decorated = hoek.clone(job);

        decorated.isPR = sinon.stub().returns(false);
        decorated.prNum = null;
        decorated.remove = sinon.stub().resolves(null);

        return decorated;
    };

    const getJobMocks = (j) => {
        if (Array.isArray(j)) {
            return j.map(decorateJobMock);
        }

        return decorateJobMock(j);
    };

    const publishJob = getJobMocks({
        id: 'ae4b71b93b39fb564b5b5c50d71f1a988f400aa3',
        name: 'publish'
    });
    const blahJob = getJobMocks({
        id: '12855123cc7f1b808aac07feff24d7d5362cc215',
        name: 'blah'    // This job is not in workflow
    });
    const mainJob = getJobMocks({
        id: '2s780cf3059eadfed0c60c0dd0194146105ae46c',
        name: 'main'
    });
    const pr10 = getJobMocks({
        id: '5eee38381388b6f30efdd5c5c6f067dbf32c0bb3',
        name: 'PR-10'
    });
    const pr3 = getJobMocks({
        id: 'fbbef3051eae334be97dea11d895cbbb6735987f',
        name: 'PR-3'
    });

    pr10.isPR.returns(true);
    pr3.isPR.returns(true);
    pr10.prNum = 10;
    pr3.prNum = 3;

    before(() => {
        mockery.enable({
            useCleanCache: true,
            warnOnUnregistered: false
        });
    });

    beforeEach(() => {
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
            get: sinon.stub()
        };
        secretFactoryMock = {
            list: sinon.stub()
        };
        templateFactoryMock = {
        };
        scmMock = {
            addWebhook: sinon.stub(),
            getFile: sinon.stub(),
            decorateUrl: sinon.stub(),
            getOpenedPRs: sinon.stub(),
            getPrInfo: sinon.stub()
        };
        parserMock = sinon.stub();

        // jobModelFactory = sinon.stub().returns(jobModelMock);
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

        mockery.registerMock('screwdriver-hashr', hashaMock);
        mockery.registerMock('screwdriver-config-parser', parserMock);

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

    describe('addWebhook', () => {
        beforeEach(() => {
            userFactoryMock.get.withArgs({ username: 'batman', scmContext }).resolves({
                unsealToken: sinon.stub().resolves('foo')
            });
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

    describe('sync', () => {
        let publishMock;
        let mainMock;

        beforeEach(() => {
            datastore.update.resolves(null);
            scmMock.getFile.resolves('superyamlcontent');
            scmMock.addWebhook.resolves();
            parserMock.withArgs('superyamlcontent', templateFactoryMock).resolves(PARSED_YAML);
            userFactoryMock.get.withArgs({ username: 'batman', scmContext }).resolves({
                unsealToken: sinon.stub().resolves('foo')
            });

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

        it('stores workflow to pipeline', () => {
            jobs = [];
            jobFactoryMock.list.resolves(jobs);
            jobFactoryMock.create.withArgs(publishMock).resolves(publishMock);
            jobFactoryMock.create.withArgs(mainMock).resolves(mainMock);

            return pipeline.sync().then(() => {
                assert.deepEqual(pipeline.workflow, ['main', 'publish']);
            });
        });

        it('stores workflowGraph to pipeline', () => {
            jobs = [{
                update: sinon.stub().resolves(null),
                isPR: sinon.stub(),
                id: 1,
                name: 'main',
                permutations: ['node:3'],
                state: 'ENABLED'
            },
            {
                update: sinon.stub().resolves(null),
                isPR: sinon.stub(),
                id: 2,
                name: 'publish',
                permutations: ['node:3'],
                state: 'ENABLED'
            }];
            jobFactoryMock.list.resolves(jobs);

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
            jobs = [{
                update: sinon.stub().resolves(null),
                isPR: sinon.stub(),
                name: 'main',
                permutations: ['node:3'],
                state: 'ENABLED'
            }];
            jobFactoryMock.list.resolves(jobs);
            jobs[0].isPR.returns(false);

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
                });
        });

        it('disable jobs if they are not in the config', () => {
            jobs = [{
                update: sinon.stub().resolves(null),
                isPR: sinon.stub(),
                name: 'banana',
                state: 'ENABLED'
            }];
            jobFactoryMock.list.resolves(jobs);
            jobs[0].isPR.returns(false);

            return pipeline.sync()
                .then(() => {
                    assert.calledOnce(jobs[0].update);
                    assert.equal(jobs[0].archived, true);
                });
        });

        it('does nothing if the job is a PR job', () => {
            jobs = [{
                update: sinon.stub().resolves(null),
                isPR: sinon.stub(),
                name: 'PR-1',
                state: 'ENABLED'
            }];
            jobFactoryMock.list.resolves(jobs);
            jobs[0].isPR.returns(true);

            return pipeline.sync()
                .then(() => {
                    assert.notCalled(jobs[0].update);
                });
        });

        it('returns error if something explodes', () => {
            const error = new Error('blah');

            jobFactoryMock.create.rejects(error);

            return pipeline.sync()
                .catch((err) => {
                    assert.deepEqual(err, error);
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
            userFactoryMock.get.withArgs({ username: 'batman', scmContext }).resolves({
                unsealToken: sinon.stub().resolves('foo')
            });
            prJob = {
                update: sinon.stub().resolves(null),
                isPR: sinon.stub().returns(true),
                name: 'PR-1',
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
            });
        });

        it('update PR config for multiple PR jobs', () => {
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
                assert.deepEqual(firstPRJob.permutations, PARSED_YAML.jobs.main);
                assert.deepEqual(secondPRJob.permutations, PARSED_YAML.jobs.publish);
            });
        });

        it('returns error if fails to get configuration', () => {
            const error = new Error('fails to get config');

            scmMock.getFile.rejects(error);

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
            userFactoryMock.get.withArgs({ username: 'batman', scmContext }).resolves({
                unsealToken: sinon.stub().resolves('foo')
            });
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
        it('has an admin getter', () => {
            userFactoryMock.get.resolves(null);
            // when we fetch a user it resolves to a promise
            assert.isFunction(pipeline.admin.then);
            // and a factory is called to create that promise
            assert.calledWith(userFactoryMock.get, { username: 'batman', scmContext });

            // When we call pipeline.admin again it is still a promise
            assert.isFunction(pipeline.admin.then);
            // ...but the factory was not recreated, since the promise is stored
            // as the model's pipeline property, now
            assert.calledOnce(userFactoryMock.get);
        });
    });

    describe('get token', () => {
        beforeEach(() => {
            userFactoryMock.get.resolves({
                unsealToken: sinon.stub().resolves('foo')
            });
        });

        it('has an token getter', () =>
            pipeline.token.then((token) => {
                assert.equal(token, 'foo');
            })
        );
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
    });

    describe('get jobs', () => {
        it('Get jobs in workflow in order', () => {
            const expected = {
                params: {
                    pipelineId: 'd398fb192747c9a0124e9e5b4e6e8e841cf8c71c',
                    archived: false
                },
                paginate
            };

            const jobList = [publishJob, blahJob, mainJob];
            const expectedJobs = [mainJob, publishJob];

            pipeline.workflow = ['main', 'publish'];
            jobFactoryMock.list.resolves(jobList);

            return pipeline.getJobs().then((result) => {
                assert.calledWith(jobFactoryMock.list, expected);
                assert.deepEqual(result, expectedJobs);
            });
        });

        it('Get PR jobs and sort them by name', () => {
            const expected = {
                params: {
                    pipelineId: 'd398fb192747c9a0124e9e5b4e6e8e841cf8c71c',
                    archived: false
                },
                paginate
            };
            const jobList = [publishJob, blahJob, mainJob, pr10, pr3];
            const expectedJobs = [mainJob, pr3, pr10];

            pipeline.workflow = ['main'];
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
                    pipelineId: 'd398fb192747c9a0124e9e5b4e6e8e841cf8c71c',
                    archived: false
                },
                paginate
            };
            const jobList = [publishJob, blahJob, mainJob, pr10, pr3];
            const expectedJobs = [pr3, pr10];

            pipeline.workflow = ['main', 'publish', 'blah'];
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
                    pipelineId: 'd398fb192747c9a0124e9e5b4e6e8e841cf8c71c',
                    archived: false
                },
                paginate
            };
            const jobList = [publishJob, blahJob, mainJob, pr10, pr3];
            const expectedJobs = [mainJob, publishJob, blahJob];

            pipeline.workflow = ['main', 'publish', 'blah'];
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
                    pipelineId: 'd398fb192747c9a0124e9e5b4e6e8e841cf8c71c',
                    archived: true
                },
                paginate
            };

            const jobList = [blahJob, publishJob];

            jobFactoryMock.list.resolves(jobList);

            return pipeline.getJobs(config).then((result) => {
                assert.calledWith(jobFactoryMock.list, expected);
                assert.deepEqual(result, [blahJob, publishJob]);
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
                    pipelineId: 'd398fb192747c9a0124e9e5b4e6e8e841cf8c71c',
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
                    pipelineId: 'd398fb192747c9a0124e9e5b4e6e8e841cf8c71c',
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
            userFactoryMock.get.withArgs({ username: 'batman', scmContext }).resolves({
                unsealToken: sinon.stub().resolves('foo')
            });
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
            pipeline.getConfiguration('bar')
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

        it('converts fetch errors to empty file', () => {
            scmMock.getFile.rejects(new Error('cannotgetit'));

            return pipeline.getConfiguration('foobar')
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
                    id: 'd398fb192747c9a0124e9e5b4e6e8e841cf8c71c',
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
                unsealToken: sinon.stub().resolves('foo')
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
                    id: 'd398fb192747c9a0124e9e5b4e6e8e841cf8c71c',
                    scmContext
                },
                table: 'pipelines'
            };

            scmMock.decorateUrl.resolves(scmRepo);
            userFactoryMock.get.withArgs({ username: 'd2lam' }).resolves({
                unsealToken: sinon.stub().resolves('foo')
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
            username: 'd2lam',
            workflow: ['main']
        };
        const secret = {
            name: 'TEST',
            value: 'testvalue',
            allowInPR: true,
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
        });

        afterEach(() => {
            eventFactoryMock.list.reset();
            jobFactoryMock.list.reset();
            publishJob.remove.reset();
            mainJob.remove.reset();
            blahJob.remove.reset();
        });

        it('remove secrets', () =>
            pipeline.remove().then(() => {
                assert.calledOnce(secretFactoryMock.list);
                assert.calledOnce(secret.remove);
            })
        );

        it('remove jobs recursively', () => {
            const nonArchived = hoek.clone(archived);
            let i;

            nonArchived.params.archived = false;
            pipeline.workflow = ['main', 'publish'];

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
    });
});
