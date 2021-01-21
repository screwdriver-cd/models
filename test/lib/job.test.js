'use strict';

const { assert } = require('chai');
const mockery = require('mockery');
const sinon = require('sinon');
const schema = require('screwdriver-data-schema');
const hoek = require('@hapi/hoek');
const rewire = require('rewire');
const dayjs = require('dayjs');
const MAX_COUNT = 1000;
const FAKE_MAX_COUNT = 5;

sinon.assert.expose(assert, { prefix: '' });

describe('Job Model', () => {
    const token = 'tokengenerated';
    const apiUri = 'https://notify.com/some/endpoint';
    let pipelineFactoryMock;
    let jobFactoryMock;
    let buildFactoryMock;
    let JobModel;
    let datastore;
    let job;
    let BaseModel;
    let config;
    let executorMock;
    let tokenGen;

    const decorateBuildMock = build => {
        const decorated = hoek.clone(build);

        decorated.remove = sinon.stub().returns(null);

        return decorated;
    };

    const getBuildMocks = b => {
        if (Array.isArray(b)) {
            return b.map(decorateBuildMock);
        }

        return decorateBuildMock(b);
    };

    const sha = 'ccc49349d3cffbd12ea9e3d41521480b4aa5de5f';

    const stepMetrics = [
        {
            id: 1,
            name: 'sd-setup',
            code: 0,
            duration: 5,
            createTime: '2019-01-22T21:10:00.000Z'
        },
        {
            id: 2,
            name: 'test',
            code: 0,
            duration: 10,
            createTime: '2019-01-22T21:11:00.000Z'
        },
        {
            id: 3,
            name: 'sd-teardown',
            code: 0,
            duration: 2,
            createTime: '2019-01-22T21:12:00.000Z'
        }
    ];
    const build1 = getBuildMocks({
        id: 1,
        jobId: 1234,
        sha,
        status: 'RUNNING',
        createTime: '2019-01-22T21:00:00.000Z',
        startTime: '2019-01-22T21:08:00.000Z',
        getMetrics: sinon.stub().returns(stepMetrics)
    });
    const build2 = getBuildMocks({
        id: 2,
        jobId: 1234,
        sha,
        status: 'QUEUED',
        getMetrics: sinon.stub().returns([])
    });
    const build3 = getBuildMocks({
        id: 3,
        jobId: 1234,
        sha,
        status: 'SUCCESS',
        createTime: '2019-01-22T21:00:00.000Z',
        startTime: '2019-01-22T21:21:00.000Z',
        endTime: '2019-01-22T22:30:00.000Z',
        getMetrics: sinon.stub().returns(stepMetrics)
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
    const jobMock = Promise.resolve({
        name: 'job',
        permutations: [
            {
                annotations: { 'screwdriver.cd/buildPeriodically': 'H 9 * * *' }
            }
        ]
    });

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

        jobFactoryMock = {
            get: sinon.stub().resolves(jobMock)
        };

        buildFactoryMock = {
            list: sinon.stub().resolves(null)
        };

        executorMock = {
            startPeriodic: sinon.stub().resolves(null),
            stopPeriodic: sinon.stub().resolves(null),
            stop: sinon.stub().resolves(null)
        };

        tokenGen = sinon.stub().returns(token);

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
        JobModel = require('../../lib/job');

        // eslint-disable-next-line global-require
        BaseModel = require('../../lib/base');

        config = {
            datastore,
            executor: executorMock,
            tokenGen,
            id: 1234,
            name: 'main',
            pipelineId: 9876,
            permutations: [
                {
                    secrets: ['NORMAL', 'NOPR']
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

        schema.models.job.allKeys.forEach(key => {
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

    it('can get secrets', () =>
        job.secrets.then(secrets => {
            assert.isArray(secrets);
            assert.equal(secrets.length, 2);
        }));

    it('throws error if pipeline missing', () => {
        pipelineFactoryMock.get.resolves(null);

        return job.secrets
            .then(() => {
                assert.fail('nope');
            })
            .catch(err => {
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
                    secrets: ['NORMAL', 'NOPR']
                }
            ]
        };
        const prJob = new JobModel(prConfig);

        return prJob.secrets.then(secrets => {
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
                paginate: {
                    count: 10
                },
                params: {
                    jobId: 1234
                },
                sort: 'descending'
            };

            return job.getBuilds().then(() => {
                assert.calledWith(buildFactoryMock.list, expected);
            });
        });

        it('merge the passed in config with the default config', () => {
            const expected = {
                params: {
                    jobId: 1234
                },
                sort: 'ascending',
                paginate: {
                    page: 1,
                    count: 100,
                    startTime: '2019-01-22T21:00:00.000Z',
                    status: 'SUCCESS'
                }
            };

            return job
                .getBuilds({
                    sort: 'Ascending',
                    paginate: {
                        page: 1,
                        count: 100,
                        startTime: '2019-01-22T21:00:00.000Z',
                        status: 'SUCCESS'
                    }
                })
                .then(() => {
                    assert.calledWith(buildFactoryMock.list, expected);
                });
        });
    });

    describe('getRunningBuilds', () => {
        it('gets all running builds', () => {
            const expectedFirstCall = {
                paginate: {
                    count: 10
                },
                params: {
                    jobId: 1234,
                    status: 'RUNNING'
                },
                sort: 'descending'
            };
            const expectedSecondCall = { ...expectedFirstCall, params: { jobId: 1234, status: 'QUEUED' } };

            buildFactoryMock.list.onCall(0).resolves([build1]);
            buildFactoryMock.list.onCall(1).resolves([build2]);

            return job.getRunningBuilds().then(builds => {
                assert.calledWith(buildFactoryMock.list.firstCall, expectedFirstCall);
                assert.calledWith(buildFactoryMock.list.secondCall, expectedSecondCall);
                assert.deepEqual(builds, [build1, build2]);
            });
        });
    });

    describe('getLatestBuild', () => {
        it('gets latest build', () => {
            buildFactoryMock.list.resolves([build3]);

            const expected = {
                paginate: {
                    count: 10
                },
                params: {
                    jobId: 1234
                },
                sort: 'descending'
            };

            return job.getLatestBuild().then(latestBuild => {
                assert.calledWith(buildFactoryMock.list, expected);
                assert.equal(latestBuild, build3);
            });
        });

        it('gets last queued build', () => {
            buildFactoryMock.list.resolves([build2]);

            const expected = {
                paginate: {
                    count: 10
                },
                params: {
                    jobId: 1234,
                    status: 'QUEUED'
                },
                sort: 'descending'
            };

            return job.getLatestBuild({ status: 'QUEUED' }).then(queueBuild => {
                assert.calledWith(buildFactoryMock.list, expected);
                assert.equal(queueBuild, build2);
            });
        });

        it('gets last failure build that does not exists', () => {
            buildFactoryMock.list.resolves([]);

            const expected = {
                paginate: {
                    count: 10
                },
                params: {
                    jobId: 1234,
                    status: 'FAILURE'
                },
                sort: 'descending'
            };

            return job.getLatestBuild({ status: 'FAILURE' }).then(failureBuild => {
                assert.calledWith(buildFactoryMock.list, expected);
                assert.isEmpty(failureBuild);
            });
        });
    });

    describe('update', () => {
        it('Update a job and remove periodic, when job is disabled', () => {
            const oldJob = Object.assign({}, job);

            oldJob.permutations = [
                {
                    annotations: {}
                }
            ];
            oldJob.state = 'ENABLED';
            jobFactoryMock.get.resolves(oldJob);

            job.state = 'DISABLED';
            job.permutations = [
                {
                    annotations: {
                        'screwdriver.cd/buildPeriodically': 'H * * * *'
                    }
                }
            ];

            datastore.update.resolves(null);
            pipelineFactoryMock.get.resolves({
                ...pipelineMock,
                id: 9876
            });

            return job.update().then(() => {
                assert.notCalled(executorMock.startPeriodic);
                assert.calledWith(executorMock.stopPeriodic, {
                    pipelineId: 9876,
                    jobId: build1.jobId,
                    token: 'tokengenerated'
                });
                assert.calledOnce(datastore.update);
            });
        });

        it('does not start periodic when new and old settings are undefined and job is enabled', () => {
            const oldJob = Object.assign({}, job);

            oldJob.permutations = [
                {
                    annotations: {}
                }
            ];
            oldJob.state = 'DISABLED';
            jobFactoryMock.get.resolves(oldJob);

            job.permutations = [
                {
                    annotations: {}
                }
            ];
            job.state = 'ENABLED';
            datastore.update.resolves(job);

            return job.update().then(() => {
                assert.notCalled(executorMock.startPeriodic);
                assert.notCalled(executorMock.stopPeriodic);
                assert.calledOnce(datastore.update);
            });
        });

        it('removes periodic when new and old settings are undefined and job is disabled', () => {
            const oldJob = Object.assign({}, job);

            oldJob.permutations = [
                {
                    annotations: {}
                }
            ];
            oldJob.state = 'ENABLED';
            jobFactoryMock.get.resolves(oldJob);
            pipelineFactoryMock.get.resolves({
                ...pipelineMock,
                id: 9876
            });

            job.permutations = [
                {
                    annotations: {}
                }
            ];
            job.state = 'DISABLED';
            datastore.update.resolves(job);

            return job.update().then(() => {
                assert.notCalled(executorMock.startPeriodic);
                assert.calledWith(executorMock.stopPeriodic, {
                    pipelineId: 9876,
                    jobId: build1.jobId,
                    token: 'tokengenerated'
                });
                assert.calledOnce(datastore.update);
            });
        });

        it('starts a periodic job when new periodic settings is added', () => {
            job.state = 'ENABLED';
            job.permutations = [
                {
                    annotations: {
                        'screwdriver.cd/buildPeriodically': 'H * * * *'
                    }
                }
            ];

            datastore.update.resolves(null);

            return job.update().then(() => {
                assert.notCalled(executorMock.stopPeriodic);
                assert.calledWith(executorMock.startPeriodic, {
                    pipeline: pipelineMock,
                    job,
                    tokenGen,
                    apiUri,
                    isUpdate: true,
                    token: 'tokengenerated'
                });
                assert.calledOnce(datastore.update);
            });
        });

        it('no change of buildPeriodically', () => {
            job.permutations = [
                {
                    annotations: {
                        'screwdriver.cd/buildPeriodically': 'H 9 * * *'
                    }
                }
            ];

            datastore.update.resolves(null);

            return job.update().then(() => {
                assert.notCalled(executorMock.startPeriodic);
                assert.notCalled(executorMock.stopPeriodic);
                assert.calledOnce(datastore.update);
                assert.notCalled(datastore.remove);
            });
        });

        it('remove periodic job if settings is removed', () => {
            job.permutations = [{}];

            datastore.update.resolves(null);

            return job.update().then(() => {
                assert.calledOnce(executorMock.stopPeriodic);
                assert.calledOnce(datastore.update);
            });
        });

        it('remove archived periodic job', () => {
            job.permutations = [{}];
            job.archived = true;
            datastore.update.resolves(null);

            return job.update().then(() => {
                assert.calledOnce(executorMock.stopPeriodic);
                assert.calledOnce(datastore.update);
            });
        });

        it('state disabled->enabled should start periodic job', () => {
            const oldJob = Object.assign({}, job);

            oldJob.permutations = [
                {
                    annotations: {
                        'screwdriver.cd/buildPeriodically': 'H 9 * * *'
                    }
                }
            ];
            oldJob.state = 'DISABLED';
            jobFactoryMock.get.resolves(oldJob);

            job.permutations = [
                {
                    annotations: {
                        'screwdriver.cd/buildPeriodically': 'H 9 * * *'
                    }
                }
            ];
            job.state = 'ENABLED';
            datastore.update.resolves(job);

            return job.update().then(() => {
                assert.calledOnce(executorMock.startPeriodic);
                assert.calledOnce(datastore.update);
            });
        });

        it('state archived->unarchived should start periodic job', () => {
            const oldJob = Object.assign({}, job);

            oldJob.permutations = [
                {
                    annotations: {
                        'screwdriver.cd/buildPeriodically': 'H 9 * * *'
                    }
                }
            ];
            oldJob.state = 'ENABLED';
            oldJob.archived = true;
            jobFactoryMock.get.resolves(oldJob);

            job.permutations = [
                {
                    annotations: {
                        'screwdriver.cd/buildPeriodically': 'H 9 * * *'
                    }
                }
            ];
            job.state = 'ENABLED';
            job.archived = false;
            datastore.update.resolves(job);

            return job.update().then(() => {
                assert.calledOnce(executorMock.startPeriodic);
                assert.calledOnce(datastore.update);
            });
        });
    });

    describe('remove', () => {
        afterEach(() => {
            buildFactoryMock.list.reset();
            build1.remove.reset();
            build2.remove.reset();
            build3.remove.reset();
        });

        it('remove builds recursively', () => {
            let i;

            for (i = 0; i < 4; i += 1) {
                buildFactoryMock.list.onCall(i).resolves([build1, build2, build3]);
            }

            buildFactoryMock.list.onCall(i).resolves([]);

            return job.remove().then(() => {
                assert.callCount(buildFactoryMock.list, 5);
                assert.callCount(build1.remove, 4); // remove builds recursively
                assert.callCount(build2.remove, 4);
                assert.callCount(build3.remove, 4);
                assert.calledOnce(datastore.remove); // remove the job
                assert.callCount(executorMock.stop, 8);
                assert.notCalled(executorMock.stopPeriodic);
            });
        });

        it('remove periodic job', () => {
            buildFactoryMock.list.resolves([]);
            job.permutations = [
                {
                    annotations: {
                        'screwdriver.cd/buildPeriodically': 'H * * * *'
                    }
                }
            ];

            return job.remove().then(() => {
                assert.calledOnce(datastore.remove); // remove the job
                assert.calledOnce(executorMock.stopPeriodic);
            });
        });

        it('fail if getBuilds returns error', () => {
            buildFactoryMock.list.rejects(new Error('error'));

            return job
                .remove()
                .then(() => {
                    assert.fail('should not get here');
                })
                .catch(err => {
                    assert.isOk(err);
                    assert.equal(err.message, 'error');
                });
        });

        it('fail if build.remove returns error', () => {
            build1.remove.rejects(new Error('error removing build'));
            buildFactoryMock.list.resolves([build1, build2]);

            return job
                .remove()
                .then(() => {
                    assert.fail('should not get here');
                })
                .catch(err => {
                    assert.isOk(err);
                    assert.equal(err.message, 'error removing build');
                });
        });
    });

    describe('get build metrics', () => {
        const startTime = '2019-01-20T12:00:00.000Z';
        const endTime = '2019-01-30T12:00:00.000Z';
        const duration3 = dayjs(build3.endTime).diff(dayjs(build3.startTime), 'second');
        let metrics;

        beforeEach(() => {
            metrics = [
                {
                    id: build1.id,
                    eventId: build1.eventId,
                    jobId: build1.jobId,
                    createTime: build1.createTime,
                    sha: build1.sha,
                    status: build1.status,
                    duration: null,
                    steps: stepMetrics
                },
                {
                    id: build2.id,
                    eventId: build2.eventId,
                    jobId: build2.jobId,
                    createTime: build2.createTime,
                    sha: build2.sha,
                    status: build2.status,
                    duration: null,
                    steps: []
                },
                {
                    id: build3.id,
                    eventId: build3.eventId,
                    jobId: build3.jobId,
                    createTime: build3.createTime,
                    sha: build3.sha,
                    status: build3.status,
                    duration: duration3,
                    steps: stepMetrics
                }
            ];
        });

        it('generates metrics', () => {
            const buildListConfig = {
                params: {
                    jobId: 1234
                },
                startTime,
                endTime,
                sort: 'ascending',
                sortBy: 'id',
                paginate: {
                    count: MAX_COUNT
                },
                readOnly: true
            };

            buildFactoryMock.list.resolves([build1, build2, build3]);

            return job.getMetrics({ startTime, endTime }).then(result => {
                assert.calledWith(buildFactoryMock.list, buildListConfig);
                assert.deepEqual(result, metrics);
            });
        });

        describe('aggregate metrics', () => {
            const RewireJobModel = rewire('../../lib/job');

            // eslint-disable-next-line no-underscore-dangle
            RewireJobModel.__set__('MAX_COUNT', FAKE_MAX_COUNT);
            let buildListConfig;

            beforeEach(() => {
                job = new RewireJobModel(config);
                buildListConfig = {
                    params: {
                        jobId: 1234
                    },
                    startTime,
                    endTime,
                    sort: 'ascending',
                    sortBy: 'id',
                    paginate: {
                        page: 1,
                        count: FAKE_MAX_COUNT
                    },
                    readOnly: true
                };

                const testBuilds = [];
                let currentDay = build3.createTime;

                // generate 8 mock builds
                for (let i = 0; i < 8; i += 1) {
                    testBuilds.push({ ...build3 });
                    testBuilds[i].id = i;

                    if (i % 3 === 0) {
                        currentDay = dayjs(currentDay).add(2, 'day');
                    }

                    testBuilds[i].createTime = currentDay.toISOString();

                    // testBuilds' durations are 10, 11, 12, 13 ... 17
                    testBuilds[i].startTime = dayjs(currentDay)
                        .add(10, 'minute')
                        .toISOString();
                    testBuilds[i].endTime = dayjs(currentDay)
                        .add(20 + i, 'minute')
                        .toISOString();
                }

                buildFactoryMock.list.onCall(0).resolves(testBuilds.slice(0, 5));
                buildFactoryMock.list.onCall(1).resolves(testBuilds.slice(5, testBuilds.length));
            });

            it('generates daily aggregated metrics', () => {
                metrics = [
                    {
                        createTime: '2019-01-24T21:00:00.000Z',
                        duration: 660
                    },
                    {
                        createTime: '2019-01-26T21:00:00.000Z',
                        duration: 840
                    },
                    {
                        createTime: '2019-01-28T21:00:00.000Z',
                        duration: 990
                    }
                ];

                return job.getMetrics({ startTime, endTime, aggregateInterval: 'day' }).then(result => {
                    assert.calledTwice(buildFactoryMock.list);
                    assert.calledWith(buildFactoryMock.list.firstCall, buildListConfig);

                    buildListConfig.paginate.page = 2;
                    assert.calledWith(buildFactoryMock.list.secondCall, buildListConfig);

                    assert.deepEqual(result, metrics);
                });
            });

            it('generates monthly aggregated metrics', () => {
                metrics = [
                    {
                        createTime: '2019-01-24T21:00:00.000Z',
                        duration: 810
                    }
                ];

                return job.getMetrics({ startTime, endTime, aggregateInterval: 'month' }).then(result => {
                    assert.calledTwice(buildFactoryMock.list);
                    assert.calledWith(buildFactoryMock.list.firstCall, buildListConfig);

                    buildListConfig.paginate.page = 2;
                    assert.calledWith(buildFactoryMock.list.secondCall, buildListConfig);

                    assert.deepEqual(result, metrics);
                });
            });

            it('filters out bad values', () => {
                const badBuild = { ...build3 };

                delete badBuild.endTime;

                buildFactoryMock.list.onCall(0).resolves([build3, badBuild]);

                metrics = [
                    {
                        createTime: '2019-01-22T21:00:00.000Z',
                        duration: 4140
                    }
                ];

                return job.getMetrics({ startTime, endTime, aggregateInterval: 'month' }).then(result => {
                    assert.calledOnce(buildFactoryMock.list);
                    assert.calledWith(buildFactoryMock.list.firstCall, buildListConfig);
                    assert.deepEqual(result, metrics);
                });
            });
        });

        it('does not fail if empty builds', () => {
            buildFactoryMock.list.resolves([]);

            return job.getMetrics({ startTime, endTime }).then(result => {
                assert.deepEqual(result, []);
            });
        });

        it('works with no startTime or endTime params passed in', () => {
            const buildListConfig = {
                params: {
                    jobId: 1234
                },
                sort: 'ascending',
                sortBy: 'id',
                paginate: {
                    count: MAX_COUNT
                },
                readOnly: true
            };

            buildFactoryMock.list.resolves([build1, build2, build3]);

            return job.getMetrics().then(result => {
                assert.calledWith(buildFactoryMock.list, buildListConfig);
                assert.deepEqual(result, metrics);
            });
        });

        it('rejects with errors', () => {
            buildFactoryMock.list.rejects(new Error('cannotgetit'));

            return job
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
