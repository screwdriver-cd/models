'use strict';
const assert = require('chai').assert;
const mockery = require('mockery');
const schema = require('screwdriver-data-schema');
const sinon = require('sinon');
let startStub;

require('sinon-as-promised');
sinon.assert.expose(assert, { prefix: '' });

class Build {
    constructor(config) {
        this.jobId = config.id;
        this.number = config.number;
        this.container = config.container;
        this.executor = config.executor;
        this.apiUri = config.apiUri;
        this.tokenGen = config.tokenGen;

        this.start = startStub.resolves(this);
    }
}

describe('Build Factory', () => {
    let BuildFactory;
    let datastore;
    let executor;
    let hashaMock;
    let jobFactoryMock;
    let userFactoryMock;
    let scmMock;
    let factory;
    let jobFactory;
    const apiUri = 'https://notify.com/some/endpoint';
    const tokenGen = sinon.stub();

    before(() => {
        mockery.enable({
            useCleanCache: true,
            warnOnUnregistered: false
        });
    });

    beforeEach(() => {
        executor = {};
        datastore = {
            save: sinon.stub(),
            scan: sinon.stub()
        };
        hashaMock = {
            sha1: sinon.stub()
        };
        jobFactoryMock = {
            get: sinon.stub()
        };
        userFactoryMock = {
            get: sinon.stub()
        };
        scmMock = {
            getCommitSha: sinon.stub()
        };
        jobFactory = {
            getInstance: sinon.stub().returns(jobFactoryMock)
        };
        startStub = sinon.stub();

        // Fixing mockery issue with duplicate file names
        // by re-registering data-schema with its own implementation
        mockery.registerMock('screwdriver-data-schema', schema);

        mockery.registerMock('screwdriver-hashr', hashaMock);
        mockery.registerMock('./jobFactory', jobFactory);
        mockery.registerMock('./userFactory', {
            getInstance: sinon.stub().returns(userFactoryMock)
        });
        mockery.registerMock('./build', Build);

        // eslint-disable-next-line global-require
        BuildFactory = require('../../lib/buildFactory');

        factory = new BuildFactory({ datastore, executor, scmPlugin: scmMock });
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
        it('should return a Build', () => {
            const model = factory.createClass({});

            assert.instanceOf(model, Build);
            assert.deepEqual(model.executor, executor);
            assert.strictEqual(model.apiUri, apiUri);
            assert.deepEqual(model.tokenGen, tokenGen);
        });
    });

    describe('create', () => {
        let sandbox;
        const testId = 'd398fb192747c9a0124e9e5b4e6e8e841cf8c71c';
        const jobId = '62089f642bbfd1886623964b4cff12db59869e5d';
        const sha = 'ccc49349d3cffbd12ea9e3d41521480b4aa5de5f';
        const scmUrl = 'git@github.com:screwdriver-cd/models.git#master';
        const username = 'i_made_the_request';
        const dateNow = Date.now();
        const isoTime = (new Date(dateNow)).toISOString();
        const container = 'node:4';
        const steps = [
            { name: 'sd-setup' },
            { name: 'init' },
            { name: 'test' },
            { name: 'sd-teardown' }
        ];
        const permutations = [{
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
        }];

        const saveConfig = {
            table: 'builds',
            params: {
                id: testId,
                data: {
                    cause: 'Started by user i_made_the_request',
                    createTime: isoTime,
                    number: dateNow,
                    status: 'QUEUED',
                    container,
                    steps,
                    jobId,
                    sha
                }
            }
        };

        beforeEach(() => {
            scmMock.getCommitSha.resolves(sha);

            sandbox = sinon.sandbox.create({
                useFakeTimers: false
            });
            sandbox.useFakeTimers(dateNow);

            hashaMock.sha1.returns(testId);

            jobFactoryMock.get.resolves({
                permutations
            });
        });

        afterEach(() => {
            sandbox.restore();
        });

        it('creates a new build in the datastore, without looking up sha', () => {
            const expected = {};

            datastore.save.yieldsAsync(null, expected);

            return factory.create({ username, jobId, sha }).then(model => {
                assert.instanceOf(model, Build);
                assert.calledOnce(jobFactory.getInstance);
                assert.calledWith(jobFactoryMock.get, jobId);
                assert.calledWith(datastore.save, saveConfig);
                assert.strictEqual(model.container, container);
                assert.strictEqual(model.apiUri, apiUri);
                assert.deepEqual(model.tokenGen, tokenGen);
                assert.notCalled(userFactoryMock.get);
            });
        });

        it('ignores extraneous parameters', () => {
            const expected = {};
            const garbage = 'garbageData';

            datastore.save.yieldsAsync(null, expected);

            return factory.create({ garbage, username, jobId, sha }).then(() => {
                assert.calledWith(datastore.save, saveConfig);
            });
        });

        it('creates a new build in the datastore, looking up sha', () => {
            const expected = {};
            const user = { unsealToken: sinon.stub().resolves('foo') };

            datastore.save.yieldsAsync(null, expected);

            const jobMock = {
                permutations,
                pipeline: Promise.resolve({ scmUrl })
            };

            jobFactoryMock.get.resolves(jobMock);
            userFactoryMock.get.resolves(user);

            return factory.create({ username, jobId }).then(model => {
                assert.calledWith(datastore.save, saveConfig);
                assert.instanceOf(model, Build);
                assert.calledOnce(jobFactory.getInstance);
                assert.calledWith(jobFactoryMock.get, jobId);
                assert.calledWith(userFactoryMock.get, { username });
                assert.calledWith(scmMock.getCommitSha, {
                    token: 'foo',
                    scmUrl
                });
                assert.calledOnce(startStub);
            });
        });

        it('properly handles rejection due to missing job model', () => {
            jobFactoryMock.get.resolves(null);

            return factory.create({ username, jobId }).catch(err => {
                assert.instanceOf(err, Error);
                assert.strictEqual(err.message, 'Job does not exist');
            });
        });

        it('properly handles rejection due to missing user model', () => {
            userFactoryMock.get.resolves(null);

            return factory.create({ username, jobId }).catch(err => {
                assert.instanceOf(err, Error);
                assert.strictEqual(err.message, 'User does not exist');
            });
        });

        it('properly handles rejection due to missing pipeline model', () => {
            const jobMock = {
                permutations,
                pipeline: Promise.resolve(null)
            };

            userFactoryMock.get.resolves({});
            jobFactoryMock.get.resolves(jobMock);

            return factory.create({ username, jobId }).catch(err => {
                assert.instanceOf(err, Error);
                assert.strictEqual(err.message, 'Pipeline does not exist');
            });
        });
    });

    describe('getBuildsForJobId', () => {
        const config = {
            jobId: 'jobId',
            paginate: {
                page: 1,
                count: 25
            }
        };
        const buildData = [{
            jobId: 'jobId',
            number: 1
        }, {
            jobId: 'jobId',
            number: 3
        }, {
            jobId: 'jobId',
            number: 2
        }];

        beforeEach(() => {
            datastore.scan.yieldsAsync(null, buildData);
        });

        it('promises to call getBuildsForJobId', () =>
            factory.getBuildsForJobId(config)
                .then((builds) => {
                    assert.isArray(builds);
                    assert.calledWith(datastore.scan, {
                        table: 'builds',
                        params: {
                            jobId: 'jobId'
                        },
                        paginate: {
                            page: 1,
                            count: 25
                        }
                    });

                    // make result is sorted Build models
                    builds.forEach((model, iter) => {
                        assert.instanceOf(model, Build);
                        // TODO: should these be sorted decending?
                        assert.equal(model.number, iter + 1);
                    });
                })
        );

        it('rejects when datastore.scan fails', () => {
            const expectedError = new Error('noBuildsNoJobsNoService');

            datastore.scan.yieldsAsync(expectedError);

            return factory.getBuildsForJobId(config)
                .then(() => {
                    assert.fail('This should not fail the test');
                })
                .catch((err) => {
                    assert.deepEqual(err, expectedError);
                });
        });
    });

    describe('getInstance', () => {
        let config;

        beforeEach(() => {
            config = { datastore, executor, scmPlugin: {} };
        });

        it('should utilize BaseFactory to get an instance', () => {
            const f1 = BuildFactory.getInstance(config);
            const f2 = BuildFactory.getInstance(config);

            assert.instanceOf(f1, BuildFactory);
            assert.instanceOf(f2, BuildFactory);

            assert.equal(f1, f2);
        });

        it('should throw when config does not have everything necessary', () => {
            assert.throw(BuildFactory.getInstance,
                Error, 'No executor provided to BuildFactory');

            assert.throw(() => {
                BuildFactory.getInstance({ executor, scm: {} });
            }, Error, 'No datastore provided to BuildFactory');
        });
    });
});
