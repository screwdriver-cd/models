'use strict';

const { assert } = require('chai');
const mockery = require('mockery');
const sinon = require('sinon');
const schema = require('screwdriver-data-schema');
const { getQueries, PR_JOBS_FOR_PIPELINE_SYNC } = require('../../lib/rawQueries');

class Job {
    constructor(config) {
        this.apiUri = config.apiUri;
        this.executor = config.executor;
        this.tokenGen = config.tokenGen;
    }
}

sinon.assert.expose(assert, { prefix: '' });

describe('Job Factory', () => {
    let JobFactory;
    let datastore;
    let factory;
    let executor;
    let pipelineFactoryMock;
    let apiUri;
    const tokenGen = sinon.stub();

    before(() => {
        mockery.enable({
            useCleanCache: true,
            warnOnUnregistered: false
        });
    });

    beforeEach(() => {
        datastore = {
            save: sinon.stub(),
            scan: sinon.stub(),
            get: sinon.stub(),
            query: sinon.stub()
        };
        pipelineFactoryMock = {
            get: sinon.stub().resolves({ id: 9999 })
        };
        executor = {
            startPeriodic: sinon.stub().resolves(),
            cleanUp: sinon.stub().resolves()
        };
        apiUri = 'https://notify.com/some/endpoint';

        // Fixing mockery issue with duplicate file names
        // by re-registering data-schema with its own implementation
        mockery.registerMock('screwdriver-data-schema', schema);
        mockery.registerMock('./job', Job);

        mockery.registerMock('./pipelineFactory', {
            getInstance: sinon.stub().returns(pipelineFactoryMock)
        });

        // eslint-disable-next-line global-require
        JobFactory = require('../../lib/jobFactory');

        factory = new JobFactory({ datastore, executor });
        factory.apiUri = apiUri;
        factory.tokenGen = tokenGen;
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
        it('should return a Job', () => {
            const model = factory.createClass({
                name: 'main',
                pipelineId: 1234,
                state: 'ENABLED',
                id: 'abcd'
            });

            assert.instanceOf(model, Job);
            assert.deepEqual(model.executor, executor);
            assert.strictEqual(model.apiUri, apiUri);
            assert.deepEqual(model.tokenGen, tokenGen);
        });
    });

    describe('create', () => {
        const jobId = 123;
        const pipelineId = 9999;
        const name = 'main';
        const saveConfig = {
            table: 'jobs',
            params: {
                name,
                pipelineId,
                state: 'ENABLED',
                archived: false
            }
        };
        const permutations = [
            {
                commands: [
                    { command: 'npm install', name: 'init' },
                    { command: 'npm test', name: 'test' }
                ],
                image: 'node:4'
            }
        ];

        it('creates a new job in the datastore', () => {
            const expected = {
                name,
                pipelineId,
                state: 'ENABLED',
                archived: false,
                id: jobId,
                permutations
            };

            datastore.save.resolves(expected);
            saveConfig.params.permutations = permutations;

            return factory
                .create({
                    pipelineId,
                    name,
                    permutations
                })
                .then(model => {
                    assert.calledWith(datastore.save, saveConfig);
                    assert.instanceOf(model, Job);
                });
        });

        it('creates a new DISABLED job in the datastore', () => {
            const permutationsWithAnnotation = [
                {
                    commands: [
                        { command: 'npm install', name: 'init' },
                        { command: 'npm test', name: 'test' }
                    ],
                    image: 'node:4',
                    annotations: {
                        'screwdriver.cd/jobDisabledByDefault': 'true'
                    }
                }
            ];
            const expected = {
                name,
                pipelineId,
                state: 'DISABLED',
                archived: false,
                id: jobId,
                permutations: permutationsWithAnnotation
            };

            datastore.save.resolves(expected);

            return factory
                .create({
                    pipelineId,
                    name,
                    permutations: permutationsWithAnnotation
                })
                .then(model => {
                    assert.calledWith(datastore.save, {
                        table: 'jobs',
                        params: {
                            name,
                            pipelineId,
                            state: 'DISABLED',
                            archived: false,
                            permutations: permutationsWithAnnotation
                        }
                    });
                    assert.instanceOf(model, Job);
                });
        });

        it('creates a new ENABLED job in the datastore', () => {
            const permutationsWithAnnotation = [
                {
                    commands: [
                        { command: 'npm install', name: 'init' },
                        { command: 'npm test', name: 'test' }
                    ],
                    image: 'node:4',
                    annotations: {
                        'screwdriver.cd/jobDisabledByDefault': 'true'
                    }
                }
            ];
            const expected = {
                name: 'PR-1:main',
                pipelineId,
                state: 'ENABLED',
                archived: false,
                id: jobId,
                permutations: permutationsWithAnnotation
            };

            datastore.save.resolves(expected);

            return factory
                .create({
                    pipelineId,
                    name: 'PR-1:main',
                    permutations: permutationsWithAnnotation
                })
                .then(model => {
                    assert.calledWith(datastore.save, {
                        table: 'jobs',
                        params: {
                            name: 'PR-1:main',
                            pipelineId,
                            state: 'ENABLED',
                            archived: false,
                            permutations: permutationsWithAnnotation
                        }
                    });
                    assert.instanceOf(model, Job);
                });
        });

        it('calls executor to create a periodic job', () => {
            const tokenGenFunc = () => 'bar';
            const periodicPermutations = [
                {
                    annotations: { 'screwdriver.cd/buildPeriodically': 'H * * * *' },
                    ...permutations[0]
                }
            ];

            factory.tokenGen = tokenGenFunc;

            const expected = {
                name,
                pipelineId,
                state: 'ENABLED',
                archived: false,
                id: jobId,
                permutations: periodicPermutations
            };

            datastore.save.resolves(expected);
            saveConfig.params.permutations = periodicPermutations;

            return factory
                .create({
                    pipelineId,
                    name,
                    permutations: periodicPermutations
                })
                .then(model => {
                    assert.calledWith(datastore.save, saveConfig);
                    assert.instanceOf(model, Job);
                    assert.calledWith(pipelineFactoryMock.get, pipelineId);
                    assert.calledWith(executor.startPeriodic, {
                        pipeline: { id: 9999 },
                        job: model,
                        tokenGen: tokenGenFunc,
                        token: 'bar',
                        apiUri
                    });
                });
        });

        it('does not create a periodic job if job is PR', () => {
            const tokenGenFunc = () => 'bar';
            const periodicPermutations = [
                {
                    annotations: { 'screwdriver.cd/buildPeriodically': 'H * * * *' },
                    ...permutations[0]
                }
            ];

            factory.tokenGen = tokenGenFunc;

            const expected = {
                name: 'PR-1:main',
                pipelineId,
                state: 'ENABLED',
                archived: false,
                id: jobId,
                permutations: periodicPermutations
            };

            datastore.save.resolves(expected);
            saveConfig.params.permutations = periodicPermutations;
            saveConfig.params.name = 'PR-1:main';

            return factory
                .create({
                    pipelineId,
                    name: 'PR-1:main',
                    permutations: periodicPermutations
                })
                .then(model => {
                    assert.calledWith(datastore.save, saveConfig);
                    assert.instanceOf(model, Job);
                    assert.notCalled(pipelineFactoryMock.get);
                    assert.notCalled(executor.startPeriodic);
                });
        });
    });

    describe('getInstance', () => {
        let config;

        beforeEach(() => {
            config = { datastore, scm: {} };
        });

        it('should utilize BaseFactory to get an instance', () => {
            const f1 = JobFactory.getInstance(config);
            const f2 = JobFactory.getInstance(config);

            assert.instanceOf(f1, JobFactory);
            assert.instanceOf(f2, JobFactory);

            assert.equal(f1, f2);
        });

        it('should throw when config not supplied', () => {
            assert.throw(JobFactory.getInstance, Error, 'No datastore provided to JobFactory');
        });
    });

    describe('cleanUp', () => {
        it('should call cleanUp', () => {
            factory.cleanUp().then(() => {
                assert.calledWith(executor.cleanUp);
            });
        });
    });

    describe('getPullRequestJobsForPipelineSync', () => {
        let config;

        beforeEach(() => {
            sinon.stub(JobFactory.prototype, 'query').returns();

            config = {
                pipelineId: '12345'
            };
        });

        it('returns pull request jobs for specified pipelineId when there are open pull requests', () => {
            config.prNames = ['PR-2', 'PR-3'];
            const expectedQueryConfig = {
                queries: getQueries('', PR_JOBS_FOR_PIPELINE_SYNC),
                replacements: {
                    pipelineId: config.pipelineId,
                    prNames: ['PR-2', 'PR-3']
                },
                rawResponse: false,
                table: 'jobs'
            };

            const returnValue = [
                // jobs of closed PR (always only unarchived)
                {
                    id: 20,
                    prParentJobId: 1,
                    name: 'PR-1:component',
                    archived: false
                },
                // jobs of open PR (archived and unarchived)
                {
                    id: 30,
                    prParentJobId: 1,
                    name: 'PR-2:component',
                    archived: false
                },
                {
                    id: 31,
                    prParentJobId: 2,
                    name: 'PR-2:publish',
                    archived: true
                },
                // jobs of open PR (all archived)
                {
                    id: 40,
                    prParentJobId: 1,
                    name: 'PR-3:component',
                    archived: false
                },
                {
                    id: 41,
                    prParentJobId: 2,
                    name: 'PR-3:publish',
                    archived: false
                }
            ];

            datastore.query.resolves(returnValue);

            return factory.getPullRequestJobsForPipelineSync(config).then(jobsForSync => {
                jobsForSync.forEach(j => {
                    assert.instanceOf(j, Job);
                });
                assert.calledWith(datastore.query, expectedQueryConfig);
            });
        });

        describe('should set prNames to null in the query config', () => {
            let expectedQueryConfig;

            beforeEach(() => {
                expectedQueryConfig = {
                    queries: getQueries('', PR_JOBS_FOR_PIPELINE_SYNC),
                    replacements: {
                        pipelineId: config.pipelineId,
                        prNames: null
                    },
                    rawResponse: false,
                    table: 'jobs'
                };

                const returnValue = [
                    // only unarchived jobs of all closed PRs
                    {
                        id: 20,
                        prParentJobId: 1,
                        name: 'PR-1:component',
                        archived: false
                    },
                    {
                        id: 30,
                        prParentJobId: 1,
                        name: 'PR-2:component',
                        archived: false
                    },
                    {
                        id: 40,
                        prParentJobId: 1,
                        name: 'PR-3:component',
                        archived: false
                    },
                    {
                        id: 41,
                        prParentJobId: 2,
                        name: 'PR-3:publish',
                        archived: false
                    }
                ];

                datastore.query.resolves(returnValue);
            });

            it('when prNames is empty', () => {
                config.prNames = [];

                return factory.getPullRequestJobsForPipelineSync(config).then(jobsForSync => {
                    jobsForSync.forEach(j => {
                        assert.instanceOf(j, Job);
                    });
                    assert.calledWith(datastore.query, expectedQueryConfig);
                });
            });

            it('when prNames is null', () => {
                config.prNames = null;

                return factory.getPullRequestJobsForPipelineSync(config).then(jobsForSync => {
                    jobsForSync.forEach(j => {
                        assert.instanceOf(j, Job);
                    });
                    assert.calledWith(datastore.query, expectedQueryConfig);
                });
            });

            it('when prNames is undefined', () => {
                config.prNames = undefined;

                return factory.getPullRequestJobsForPipelineSync(config).then(jobsForSync => {
                    jobsForSync.forEach(j => {
                        assert.instanceOf(j, Job);
                    });
                    assert.calledWith(datastore.query, expectedQueryConfig);
                });
            });
        });
    });
});
