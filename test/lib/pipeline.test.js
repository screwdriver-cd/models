'use strict';
const assert = require('chai').assert;
const mockery = require('mockery');
const sinon = require('sinon');
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

    const dateNow = 1111111111;
    const scmUrl = 'git@github.com:screwdriver-cd/data-model.git#master';
    const testId = 'd398fb192747c9a0124e9e5b4e6e8e841cf8c71c';
    const admins = { batman: true };
    let jobs;
    let pipelineConfig;

    before(() => {
        mockery.enable({
            useCleanCache: true,
            warnOnUnregistered: false
        });
    });

    beforeEach(() => {
        datastore = {
            get: sinon.stub(),
            save: sinon.stub()
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
        scmMock = {
            getFile: sinon.stub()
        };
        parserMock = sinon.stub();

        // jobModelFactory = sinon.stub().returns(jobModelMock);
        mockery.registerMock('./jobFactory', {
            getInstance: sinon.stub().returns(jobFactoryMock) });
        mockery.registerMock('./userFactory', {
            getInstance: sinon.stub().returns(userFactoryMock)
        });

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
            configUrl: scmUrl,
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

    describe('sync', () => {
        let publishMock;
        let mainMock;

        beforeEach(() => {
            scmMock.getFile.resolves('superyamlcontent');
            parserMock.withArgs('superyamlcontent').yieldsAsync(null, PARSED_YAML);
            userFactoryMock.get.withArgs({ username: 'batman' }).resolves({
                unsealToken: sinon.stub().resolves('foo')
            });

            publishMock = {
                pipelineId: testId,
                name: 'publish',
                containers: ['node:4']
            };
            mainMock = {
                pipelineId: testId,
                name: 'main',
                containers: ['node:4', 'node:5', 'node:6']
            };
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
                containers: ['node:3'],
                state: 'ENABLED'
            }];
            jobFactoryMock.list.resolves(jobs);
            jobs[0].isPR.returns(false);

            return pipeline.sync()
                .then(() => {
                    assert.calledOnce(jobs[0].update);
                    assert.deepEqual(jobs[0].containers, ['node:4', 'node:5', 'node:6']);
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
                    assert.equal(jobs[0].state, 'DISABLED');
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
                paginate: {
                    count: 25, // This limit is set by the matrix restriction
                    page: 1
                }
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
