'use strict';
const assert = require('chai').assert;
const mockery = require('mockery');
const sinon = require('sinon');
const hoek = require('hoek');
const schema = require('screwdriver-data-schema');

require('sinon-as-promised');
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

    const dateNow = 1111111111;
    const scmUrl = 'git@github.com:screwdriver-cd/data-model.git#master';
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

        return decorated;
    };

    const getJobMocks = (j) => {
        if (Array.isArray(j)) {
            return jobs.map(decorateJobMock);
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
        datastore = {
            get: sinon.stub(),
            save: sinon.stub(),
            update: sinon.stub()
        };
        hashaMock = {
            sha1: sinon.stub()
        };
        jobFactoryMock = {
            create: sinon.stub(),
            list: sinon.stub()
        };
        userFactoryMock = {
            get: sinon.stub()
        };
        secretFactoryMock = {
            list: sinon.stub()
        };
        scmMock = {
            getFile: sinon.stub(),
            getRepoId: sinon.stub()
        };
        parserMock = sinon.stub();

        // jobModelFactory = sinon.stub().returns(jobModelMock);
        mockery.registerMock('./jobFactory', {
            getInstance: sinon.stub().returns(jobFactoryMock) });
        mockery.registerMock('./userFactory', {
            getInstance: sinon.stub().returns(userFactoryMock)
        });
        mockery.registerMock('./secretFactory', {
            getInstance: sinon.stub().returns(secretFactoryMock) });

        mockery.registerMock('screwdriver-hashr', hashaMock);
        mockery.registerMock('screwdriver-config-parser', parserMock);

        // eslint-disable-next-line global-require
        PipelineModel = require('../../lib/pipeline');
        // eslint-disable-next-line global-require
        BaseModel = require('../../lib/base');

        pipelineConfig = {
            datastore,
            id: testId,
            scmUrl,
            createTime: dateNow,
            admins,
            scmPlugin: scmMock
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

    describe('refreshScmRepo', () => {
        beforeEach(() => {
            scmMock.getRepoId.resolves({ name: 'foo' });
            userFactoryMock.get.withArgs({ username: 'batman' }).resolves({
                unsealToken: sinon.stub().resolves('foo')
            });
        });

        it('stores scmRepo to pipeline', () => {
            const newScmUrl = 'git@github.com:screwdriver-cd/data-model.git#foobar';

            pipeline.scmUrl = newScmUrl;

            return pipeline.refreshScmRepo().then(() => {
                assert.calledWith(scmMock.getRepoId, {
                    scmUrl: newScmUrl,
                    token: 'foo'
                });
                assert.deepEqual(pipeline.scmRepo, { name: 'foo' });
            });
        });

        it('skips storing scmRepo to pipeline if no changes', () => {
            pipeline.scmRepo = { name: 'bar' };

            return pipeline.refreshScmRepo().then(() => {
                assert.notCalled(scmMock.getRepoId);
                assert.deepEqual(pipeline.scmRepo, { name: 'bar' });
            });
        });
    });

    describe('sync', () => {
        let publishMock;
        let mainMock;

        beforeEach(() => {
            datastore.update.resolves(null);
            scmMock.getFile.resolves('superyamlcontent');
            scmMock.getRepoId.resolves({ name: 'foo' });
            parserMock.withArgs('superyamlcontent').yieldsAsync(null, PARSED_YAML);
            userFactoryMock.get.withArgs({ username: 'batman' }).resolves({
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

        it('store workflow to pipeline', () => {
            jobs = [];
            jobFactoryMock.list.resolves(jobs);
            jobFactoryMock.create.withArgs(publishMock).resolves(publishMock);
            jobFactoryMock.create.withArgs(mainMock).resolves(mainMock);

            return pipeline.sync().then(() => {
                assert.deepEqual(pipeline.workflow, ['main', 'publish']);
            });
        });

        it('store scmRepo to pipeline', () => {
            const newScmUrl = 'git@github.com:screwdriver-cd/data-model.git#foobar';

            jobs = [];
            jobFactoryMock.list.resolves(jobs);
            jobFactoryMock.create.withArgs(publishMock).resolves(publishMock);
            jobFactoryMock.create.withArgs(mainMock).resolves(mainMock);
            pipeline.scmUrl = newScmUrl;

            return pipeline.sync().then(() => {
                assert.calledWith(scmMock.getRepoId, {
                    scmUrl: newScmUrl,
                    token: 'foo'
                });
                assert.deepEqual(pipeline.scmRepo, { name: 'foo' });
            });
        });

        it('skips storing scmRepo to pipeline if no changes', () => {
            jobs = [];
            jobFactoryMock.list.resolves(jobs);
            jobFactoryMock.create.withArgs(publishMock).resolves(publishMock);
            jobFactoryMock.create.withArgs(mainMock).resolves(mainMock);
            pipeline.scmRepo = { name: 'bar' };

            return pipeline.sync().then(() => {
                assert.notCalled(scmMock.getRepoId);
            });
        });

        it('creates new jobs', () => {
            jobs = [];
            jobFactoryMock.list.resolves(jobs);
            jobFactoryMock.create.withArgs(publishMock).resolves(publishMock);
            jobFactoryMock.create.withArgs(mainMock).resolves(mainMock);

            return pipeline.sync()
                .then(p => {
                    assert.equal(p.id, testId);
                    assert.calledWith(scmMock.getFile, {
                        scmUrl,
                        path: 'screwdriver.yaml',
                        token: 'foo'
                    });
                    assert.calledWith(parserMock, 'superyamlcontent');
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
                .catch(err => {
                    assert.deepEqual(err, error);
                });
        });
    });

    describe('get admin', () => {
        it('has an admin getter', () => {
            userFactoryMock.get.resolves(null);
            // when we fetch a user it resolves to a promise
            assert.isFunction(pipeline.admin.then);
            // and a factory is called to create that promise
            assert.calledWith(userFactoryMock.get, { username: 'batman' });

            // When we call pipeline.admin again it is still a promise
            assert.isFunction(pipeline.admin.then);
            // ...but the factory was not recreated, since the promise is stored
            // as the model's pipeline property, now
            assert.calledOnce(userFactoryMock.get);
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
    });

    describe('get active jobs', () => {
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

            const jobList = [publishJob, blahJob, mainJob, pr10, pr3];
            const expectedJobs = [mainJob, pr3, pr10];

            pipeline.workflow = ['main'];
            jobFactoryMock.list.resolves(jobList);

            return pipeline.getJobs().then((result) => {
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

    describe('getConfiguration', () => {
        beforeEach(() => {
            scmMock.getFile.resolves('superyamlcontent');
            parserMock.withArgs('superyamlcontent').yieldsAsync(null, PARSED_YAML);
            userFactoryMock.get.withArgs({ username: 'batman' }).resolves({
                unsealToken: sinon.stub().resolves('foo')
            });
        });

        it('gets pipeline config', () =>
            pipeline.getConfiguration()
                .then(config => {
                    assert.equal(config, PARSED_YAML);
                    assert.calledWith(scmMock.getFile, {
                        scmUrl,
                        path: 'screwdriver.yaml',
                        token: 'foo'
                    });
                    assert.calledWith(parserMock, 'superyamlcontent');
                })
        );

        it('gets pipeline config from an alternate ref', () =>
            pipeline.getConfiguration('foobar')
                .then(config => {
                    assert.equal(config, PARSED_YAML);
                    assert.calledWith(scmMock.getFile, {
                        scmUrl: 'foobar',
                        path: 'screwdriver.yaml',
                        token: 'foo'
                    });
                    assert.calledWith(parserMock, 'superyamlcontent');
                })
        );

        it('catches errors', () => {
            parserMock.yieldsAsync(new Error('cannotparseit'));

            return pipeline.getConfiguration('foobar')
                .catch(err => {
                    assert.instanceOf(err, Error);
                    assert.equal(err.message, 'cannotparseit');
                });
        });
    });
});
