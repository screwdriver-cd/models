'use strict';
const assert = require('chai').assert;
const mockery = require('mockery');
const sinon = require('sinon');
const Joi = require('joi');

require('sinon-as-promised');
sinon.assert.expose(assert, { prefix: '' });

describe('Pipeline Model', () => {
    let PipelineModel;
    let datastore;
    let hashaMock;
    let jobModelMock;
    let jobModelFactory;
    let pipeline;
    let schemaMock;

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
        schemaMock = {
            models: {
                pipeline: {
                    base: {
                        id: Joi.string(),
                        scmUrl: Joi.string()
                    },
                    keys: ['scmUrl'],
                    tableName: 'pipelines'
                },
                job: {
                    base: {
                        id: Joi.string(),
                        name: Joi.string(),
                        pipelineId: Joi.string()
                    },
                    keys: ['pipelineId', 'name'],
                    tableName: 'jobs'
                }
            },
            config: {
                regex: {
                    SCM_URL: /^git@([^:]+):([^\/]+)\/(.+?)\.git(#.+)?$/
                }
            }
        };
        jobModelMock = {
            create: sinon.stub()
        };
        jobModelFactory = sinon.stub().returns(jobModelMock);
        mockery.registerMock('./job', jobModelFactory);

        mockery.registerMock('screwdriver-hashr', hashaMock);
        mockery.registerMock('screwdriver-data-schema', schemaMock);

        // eslint-disable-next-line global-require
        PipelineModel = require('../../lib/pipeline');

        pipeline = new PipelineModel(datastore);
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
        assert.isFunction(pipeline.get);
        assert.isFunction(pipeline.update);
        assert.isFunction(pipeline.list);
    });

    describe('create', () => {
        let sandbox;
        let config;
        const dateNow = 1111111111;
        const scmUrl = 'git@github.com:screwdriver-cd/data-model.git#master';
        const testId = 'd398fb192747c9a0124e9e5b4e6e8e841cf8c71c';
        const admins = ['me'];

        beforeEach(() => {
            sandbox = sinon.sandbox.create({
                useFakeTimers: false
            });
            hashaMock.sha1.withArgs({
                scmUrl
            }).returns(testId);

            config = {
                table: 'pipelines',
                params: {
                    id: 'd398fb192747c9a0124e9e5b4e6e8e841cf8c71c',
                    data: {
                        admins,
                        createTime: dateNow,
                        scmUrl,
                        configUrl: scmUrl
                    }
                }
            };
        });

        afterEach(() => {
            sandbox.restore();
        });

        it('returns error when the datastore fails to save', (done) => {
            const testError = new Error('datastoreSaveError');

            datastore.save.yieldsAsync(testError);

            pipeline.create({ scmUrl, admins }, (error) => {
                assert.isOk(error);
                assert.equal(error.message, 'datastoreSaveError');
                done();
            });
        });

        it('and correct pipeline data', (done) => {
            sandbox.useFakeTimers(dateNow);
            datastore.save.yieldsAsync(null);

            pipeline.create({ scmUrl, admins }, () => {
                assert.calledWith(datastore.save, config);
                done();
            });

            process.nextTick(() => {
                sandbox.clock.tick();
            });
        });

        it('promises to create the pipeline data', () => {
            sandbox.useFakeTimers(dateNow);
            datastore.save.yieldsAsync(null);

            return pipeline.create({ scmUrl, admins })
                .then(() => {
                    assert.calledWith(datastore.save, config);
                });
        });

        it('rejects to create pipeline data when datastore fails', () => {
            const errorMessage = 'expectedErrorMessage';

            sandbox.useFakeTimers(dateNow);
            datastore.save.yieldsAsync(new Error(errorMessage));

            return pipeline.create({ scmUrl, admins })
                .then(() => {
                    assert.fail('this should not cause the build to fail');
                })
                .catch((err) => {
                    assert.strictEqual(err.message, errorMessage);
                });
        });
    });

    describe('sync', () => {
        const scmUrl = 'git@github.com:screwdriver-cd/data-model.git#master';
        const pipelineId = 'd398fb192747c9a0124e9e5b4e6e8e841cf8c71c';

        it('creates the main job if pipeline exists', (done) => {
            hashaMock.sha1.returns(pipelineId);
            datastore.get.yieldsAsync(null, { id: pipelineId });
            jobModelMock.create.yieldsAsync(null, 'jobCreateResult');

            pipeline.sync({ scmUrl }, (err, data) => {
                assert.isNull(err);
                assert.strictEqual(data, 'jobCreateResult');

                assert.calledWith(hashaMock.sha1, {
                    scmUrl
                });
                assert.calledWith(jobModelMock.create, {
                    pipelineId,
                    name: 'main'
                });
                done();
            });
        });

        it('returns error if datastore explodes', (done) => {
            const err = new Error('blah');

            datastore.get.yieldsAsync(err);
            pipeline.sync({ scmUrl }, (error) => {
                assert.deepEqual(error, err);
                done();
            });
        });

        it('returns null if pipeline does not exist', (done) => {
            datastore.get.yieldsAsync(null, null);
            pipeline.sync({ scmUrl }, (error, data) => {
                assert.isNull(error);
                assert.isNull(data);
                done();
            });
        });

        it('promises to create main job if pipeline exists', () => {
            hashaMock.sha1.returns(pipelineId);
            datastore.get.yieldsAsync(null, { id: pipelineId });
            // jobModelMock.create.yieldsAsync(null, 'jobCreateResult');
            jobModelMock.create.resolves('jobCreateResult');

            return pipeline.sync({ scmUrl })
                .then((data) => {
                    assert.strictEqual(data, 'jobCreateResult');
                });
        });

        it('rejects to create if datastore explodes', () => {
            const expectedError = new Error('datastoreKaboom');

            datastore.get.yieldsAsync(expectedError);

            return pipeline.sync({ scmUrl })
                .then(() => {
                    assert.fail('This should not fail the test');
                })
                .catch((err) => {
                    assert.deepEqual(err, expectedError);
                });
        });
    });

    describe('formatScmUrl', () => {
        const scmUrl = 'git@github.com:screwdriver-cd/HASHR.git';
        const scmUrlBranch = 'git@github.com:screwdriver-cd/HASHR.git#foo';
        const formattedScmUrl = 'git@github.com:screwdriver-cd/hashr.git#master';
        const formattedScmUrlBranch = 'git@github.com:screwdriver-cd/hashr.git#foo';

        it('adds master branch when there is no branch specified', (done) => {
            const result = pipeline.formatScmUrl(scmUrl);

            assert.equal(result, formattedScmUrl, 'scmUrl is not formatted correctly');
            done();
        });

        it('does not add master branch when there is a branch specified', (done) => {
            const result = pipeline.formatScmUrl(scmUrlBranch);

            assert.equal(result, formattedScmUrlBranch, 'scmUrl is not formatted correctly');
            done();
        });
    });

    describe('getAdmin', () => {
        const pipelineId = 'd398fb192747c9a0124e9e5b4e6e8e841cf8c71c';

        beforeEach(() => {
            datastore.get.yieldsAsync(null, { admins: { batman: true } });
        });

        it('returns error if cannot get pipeline', (done) => {
            const error = new Error('blah');

            datastore.get.yieldsAsync(error);
            pipeline.getAdmin(pipelineId, (err) => {
                assert.isOk(err);
                done();
            });
        });

        it('returns admin of pipeline', (done) => {
            pipeline.getAdmin(pipelineId, (err, admin) => {
                assert.isNull(err);
                assert.equal(admin, 'batman');
                done();
            });
        });

        it('promises to return admins', () =>
            pipeline.getAdmin(pipelineId)
                .then((admin) => {
                    assert.equal(admin, 'batman');
                })
        );

        it('rejects when it cannot get the pipeline', () => {
            const expectedError = new Error('marioFail');

            datastore.get.yieldsAsync(expectedError);

            return pipeline.getAdmin(pipelineId)
                .then(() => {
                    assert.fail('This should not fail the test');
                })
                .catch((err) => {
                    assert.deepEqual(err, expectedError);
                });
        });
    });
});
