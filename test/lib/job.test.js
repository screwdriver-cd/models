'use strict';

const assert = require('chai').assert;
const mockery = require('mockery');
const sinon = require('sinon');
const schema = require('screwdriver-data-schema');
const hoek = require('hoek');

sinon.assert.expose(assert, { prefix: '' });

describe('Job Model', () => {
    const token = 'tokengenerated';
    const apiUri = 'https://notify.com/some/endpoint';
    let pipelineFactoryMock;
    let buildFactoryMock;
    let JobModel;
    let datastore;
    let job;
    let BaseModel;
    let config;
    let executorMock;
    let tokenGen;

    const decorateBuildMock = (build) => {
        const decorated = hoek.clone(build);

        decorated.remove = sinon.stub().returns(null);

        return decorated;
    };

    const getBuildMocks = (b) => {
        if (Array.isArray(b)) {
            return b.map(decorateBuildMock);
        }

        return decorateBuildMock(b);
    };

    const build1 = getBuildMocks({
        id: 1,
        jobId: '1234',
        status: 'RUNNING'
    });
    const build2 = getBuildMocks({
        id: 2,
        jobId: '1234',
        status: 'QUEUED'
    });
    const build3 = getBuildMocks({
        id: 3,
        jobId: '1234',
        status: 'SUCCESS'
    });
    const pipelineMock = {
        secrets: Promise.resolve([
            {
                name: 'NORMAL',
                value: '1',
                allowInPR: true
            },
            {
                name: 'NOPR',
                value: '2',
                allowInPR: false
            },
            {
                name: 'NOTINJOB',
                value: '3',
                allowInPR: true
            }
        ])
    };

    before(() => {
        mockery.enable({
            useCleanCache: true,
            warnOnUnregistered: false
        });
    });

    beforeEach(() => {
        datastore = {
            update: sinon.stub(),
            remove: sinon.stub().resolves(null)
        };
        pipelineFactoryMock = {
            get: sinon.stub().resolves(pipelineMock)
        };

        buildFactoryMock = {
            list: sinon.stub().resolves(null)
        };

        executorMock = {
            startPeriodic: sinon.stub().resolves(null),
            stopPeriodic: sinon.stub().resolves(null)
        };

        tokenGen = sinon.stub().returns(token);

        mockery.registerMock('./pipelineFactory', {
            getInstance: sinon.stub().returns(pipelineFactoryMock)
        });

        mockery.registerMock('./buildFactory', {
            getInstance: sinon.stub().returns(buildFactoryMock)
        });

        // eslint-disable-next-line global-require
        JobModel = require('../../lib/job');
        // eslint-disable-next-line global-require
        BaseModel = require('../../lib/base');

        config = {
            datastore,
            executor: executorMock,
            tokenGen,
            id: '1234',
            name: 'main',
            pipelineId: 'abcd',
            permutations: [
                {
                    secrets: [
                        'NORMAL',
                        'NOPR'
                    ]
                }
            ],
            apiUri,
            state: 'ENABLED'
        };

        job = new JobModel(config);
    });

    afterEach(() => {
        datastore = null;
        mockery.deregisterAll();
        mockery.resetCache();
    });

    after(() => {
        mockery.disable();
    });

    it('is constructed properly', () => {
        assert.instanceOf(job, BaseModel);
        assert.isFunction(job.update);
        assert.isUndefined(job.apiUri);
        assert.isUndefined(job.tokenGen);

        schema.models.job.allKeys.forEach((key) => {
            assert.strictEqual(job[key], config[key]);
        });
    });

    it('has a pipeline getter', () => {
        // when we fetch a pipeline it resolves to a promise
        assert.isFunction(job.pipeline.then);
        // and a factory is called to create that promise
        assert.calledWith(pipelineFactoryMock.get, config.pipelineId);

        // When we call job.pipeline again it is still a promise
        assert.isFunction(job.pipeline.then);
        // ...but the factory was not recreated, since the promise is stored
        // as the model's pipeline property, now
        assert.calledOnce(pipelineFactoryMock.get);
    });

    it('can get secrets', () => (
        job.secrets.then((secrets) => {
            assert.isArray(secrets);
            assert.equal(secrets.length, 2);
        })
    ));

    it('throws error if pipeline missing', () => {
        pipelineFactoryMock.get.resolves(null);

        return job.secrets.then(() => {
            assert.fail('nope');
        }).catch((err) => {
            assert.equal('Pipeline does not exist', err.message);
        });
    });

    it('can get PR secrets', () => {
        const prConfig = {
            datastore,
            id: '1234',
            name: 'PR-1',
            pipelineId: 'abcd',
            state: 'ENABLED',
            permutations: [
                {
                    secrets: [
                        'NORMAL',
                        'NOPR'
                    ]
                }
            ]
        };
        const prJob = new JobModel(prConfig);

        return prJob.secrets.then((secrets) => {
            assert.isArray(secrets);
            assert.equal(secrets.length, 1);
        });
    });

    describe('isPR', () => {
        it('returns false if job is not a PR', () => {
            assert.isFalse(job.isPR());
        });

        it('returns true if job is a PR', () => {
            const prConfig = {
                datastore,
                id: '1234',
                name: 'PR-1',
                pipelineId: 'abcd',
                state: 'ENABLED'
            };
            const prJob = new JobModel(prConfig);

            assert.isTrue(prJob.isPR());
        });
    });

    describe('prNum', () => {
        it('returns null if job is not a PR', () => {
            assert.equal(job.prNum, null);
        });

        it('returns PR number if job is a PR', () => {
            const prConfig = {
                datastore,
                id: '1234',
                name: 'PR-142',
                pipelineId: 'abcd',
                state: 'ENABLED'
            };
            const prJob = new JobModel(prConfig);

            assert.equal(prJob.prNum, 142);
        });
    });

    describe('getBuilds', () => {
        it('use the default config when not passed in', () => {
            const expected = {
                params: {
                    jobId: '1234'
                },
                sort: 'descending',
                paginate: {
                    page: 1,
                    count: 50
                }
            };

            return job.getBuilds().then(() => {
                assert.calledWith(buildFactoryMock.list, expected);
            });
        });

        it('merge the passed in config with the default config', () => {
            const expected = {
                params: {
                    jobId: '1234'
                },
                sort: 'ascending',
                paginate: {
                    page: 1,
                    count: 100
                }
            };

            return job.getBuilds({
                sort: 'Ascending',
                paginate: {
                    count: 100
                }
            }).then(() => {
                assert.calledWith(buildFactoryMock.list, expected);
            });
        });
    });

    describe('getRunningBuilds', () => {
        it('gets all running builds', () => {
            const expectedFirstCall = {
                params: {
                    jobId: '1234',
                    status: 'RUNNING'
                },
                sort: 'descending',
                paginate: {
                    page: 1,
                    count: 50
                }
            };
            const expectedSecondCall = Object.assign({}, expectedFirstCall, {
                params: { jobId: '1234', status: 'QUEUED' } });

            buildFactoryMock.list.onCall(0).resolves([build1]);
            buildFactoryMock.list.onCall(1).resolves([build2]);

            return job.getRunningBuilds().then((builds) => {
                assert.calledWith(buildFactoryMock.list.firstCall, expectedFirstCall);
                assert.calledWith(buildFactoryMock.list.secondCall, expectedSecondCall);
                assert.deepEqual(builds, [build1, build2]);
            });
        });
    });

    describe('getLastSuccessfulBuild', () => {
        it('gets last successful build', () => {
            buildFactoryMock.list.resolves([build3]);

            const expected = {
                params: {
                    jobId: '1234',
                    status: 'SUCCESS'
                },
                sort: 'descending',
                paginate: {
                    page: 1,
                    count: 50
                }
            };

            return job.getLastSuccessfulBuild().then((successfulBuild) => {
                assert.calledWith(buildFactoryMock.list, expected);
                assert.equal(successfulBuild, build3);
            });
        });
    });

    describe('update', () => {
        it('Update a job', () => {
            job.state = 'DISABLED';

            datastore.update.resolves(null);

            return job.update()
                .then(() => {
                    assert.calledWith(executorMock.startPeriodic, {
                        pipeline: pipelineMock,
                        job,
                        tokenGen,
                        apiUri,
                        isUpdate: true
                    });
                    assert.calledOnce(datastore.update);
                });
        });
    });

    describe('remove', () => {
        afterEach(() => {
            buildFactoryMock.list.reset();
            build1.remove.reset();
            build2.remove.reset();
        });

        it('remove builds recursively', () => {
            let i;

            for (i = 0; i < 4; i += 1) {
                buildFactoryMock.list.onCall(i).resolves([build1, build2]);
            }

            buildFactoryMock.list.onCall(i).resolves([]);

            return job.remove().then(() => {
                assert.callCount(buildFactoryMock.list, 5);
                assert.callCount(build1.remove, 4); // remove builds recursively
                assert.callCount(build2.remove, 4);
                assert.calledOnce(datastore.remove); // remove the job
                assert.notCalled(executorMock.stopPeriodic);
            });
        });

        it('remove periodic job', () => {
            buildFactoryMock.list.resolves([]);
            job.permutations = [{
                annotations: {
                    'screwdriver.cd/buildPeriodically': 'H * * * *'
                }
            }];

            return job.remove().then(() => {
                assert.calledOnce(datastore.remove); // remove the job
                assert.calledOnce(executorMock.stopPeriodic);
            });
        });

        it('fail if getBuilds returns error', () => {
            buildFactoryMock.list.rejects(new Error('error'));

            return job.remove().then(() => {
                assert.fail('should not get here');
            }).catch((err) => {
                assert.isOk(err);
                assert.equal(err.message, 'error');
            });
        });

        it('fail if build.remove returns error', () => {
            build1.remove.rejects(new Error('error removing build'));
            buildFactoryMock.list.resolves([build1, build2]);

            return job.remove().then(() => {
                assert.fail('should not get here');
            }).catch((err) => {
                assert.isOk(err);
                assert.equal(err.message, 'error removing build');
            });
        });
    });
});
