'use strict';
const assert = require('chai').assert;
const mockery = require('mockery');
const schema = require('screwdriver-data-schema');
const sinon = require('sinon');

require('sinon-as-promised');
sinon.assert.expose(assert, { prefix: '' });

const startStub = sinon.stub().resolves('foo');

class Build {
    constructor(config) {
        this.datastore = config.datastore;
        this.executor = config.executor;
        this.jobId = config.id;
        this.number = config.number;
    }

    start() {
        return startStub.apply(startStub, arguments);
    }
}

describe('Build Factory', () => {
    let BuildFactory;
    let datastore;
    let executor;
    let hashaMock;
    let jobFactoryMock;
    let userFactoryMock;
    let githubMock;
    let factory;
    let jobFactory;

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
        githubMock = {
            run: sinon.stub(),
            getInfo: sinon.stub()
        };
        jobFactory = {
            getInstance: sinon.stub().returns(jobFactoryMock)
        };

        // Fixing mockery issue with duplicate file names
        // by re-registering data-schema with its own implementation
        mockery.registerMock('screwdriver-data-schema', schema);

        mockery.registerMock('screwdriver-hashr', hashaMock);
        mockery.registerMock('./jobFactory', jobFactory);
        mockery.registerMock('./userFactory', {
            getInstance: sinon.stub().returns(userFactoryMock)
        });
        mockery.registerMock('./github', githubMock);
        mockery.registerMock('./build', Build);

        // eslint-disable-next-line global-require
        BuildFactory = require('../../lib/buildFactory');

        factory = new BuildFactory({ datastore, executor });
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
        });
    });

    describe('create', () => {
        let sandbox;
        let tokenGen;
        const apiUri = 'https://notify.com/some/endpoint';
        const testId = 'd398fb192747c9a0124e9e5b4e6e8e841cf8c71c';
        const jobId = '62089f642bbfd1886623964b4cff12db59869e5d';
        const sha = 'ccc49349d3cffbd12ea9e3d41521480b4aa5de5f';
        const scmUrl = 'git@github.com:screwdriver-cd/models.git#master';
        const username = 'i_made_the_request';
        const dateNow = Date.now();

        const saveConfig = {
            table: 'builds',
            params: {
                id: testId,
                data: {
                    cause: 'Started by user i_made_the_request',
                    container: 'node:4',
                    createTime: dateNow,
                    number: dateNow,
                    status: 'QUEUED',
                    jobId,
                    sha
                }
            }
        };

        beforeEach(() => {
            sandbox = sinon.sandbox.create({
                useFakeTimers: false
            });
            sandbox.useFakeTimers(dateNow);

            hashaMock.sha1.returns(testId);

            tokenGen = sinon.stub();
        });

        afterEach(() => {
            sandbox.restore();
        });

        it('creates a new build in the datastore, without looking up sha', () => {
            const expected = {};

            datastore.save.yieldsAsync(null, expected);

            return factory.create({ apiUri, username, jobId, sha }).then(model => {
                assert.isTrue(datastore.save.calledWith(saveConfig));
                assert.instanceOf(model, Build);
                assert.deepEqual(model.datastore, datastore);
                assert.deepEqual(model.executor, executor);
                assert.isFalse(jobFactoryMock.get.called);
                assert.isFalse(userFactoryMock.get.called);
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
            const user = {};

            datastore.save.yieldsAsync(null, expected);

            const jobMock = {
                pipeline: new Promise(resolves => resolves({ scmUrl }))
            };

            jobFactoryMock.get.resolves(jobMock);
            userFactoryMock.get.resolves(user);
            githubMock.getInfo.returns({
                user: 'screwdriver-cd',
                repo: 'models'
            });
            githubMock.run.resolves({
                commit: { sha }
            });

            return factory.create({ apiUri, username, jobId, tokenGen }).then(model => {
                assert.isTrue(datastore.save.calledWith(saveConfig));
                assert.instanceOf(model, Build);
                assert.calledOnce(jobFactory.getInstance);
                assert.calledWith(jobFactoryMock.get, jobId);
                assert.calledWith(userFactoryMock.get, { username });
                assert.calledWith(githubMock.run, {
                    user,
                    action: 'getBranch',
                    params: {
                        user: 'screwdriver-cd',
                        repo: 'models'
                    }
                });
                assert.calledWith(startStub, {
                    apiUri,
                    tokenGen
                });
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
        it('should encapsulate new, and act as a singleton', () => {
            const f1 = BuildFactory.getInstance({ datastore, executor });
            const f2 = BuildFactory.getInstance({ datastore, executor });

            assert.equal(f1, f2);
        });

        it('should not require config on second call', () => {
            const f1 = BuildFactory.getInstance({ datastore, executor });
            const f2 = BuildFactory.getInstance();

            assert.equal(f1, f2);
        });

        it('should throw when config not supplied', () => {
            assert.throw(BuildFactory.getInstance, Error, 'No datastore provided to BuildFactory');
            assert.throw(() => { BuildFactory.getInstance({ datastore }); },
                Error,
                'No executor provided to BuildFactory'
            );
        });
    });
});
