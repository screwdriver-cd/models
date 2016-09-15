'use strict';
const assert = require('chai').assert;
const mockery = require('mockery');
const sinon = require('sinon');
const schema = require('screwdriver-data-schema');

sinon.assert.expose(assert, { prefix: '' });
require('sinon-as-promised');

describe('Job Model', () => {
    let pipelineFactoryMock;
    let buildFactoryMock;
    let JobModel;
    let datastore;
    let job;
    let BaseModel;
    let config;

    before(() => {
        mockery.enable({
            useCleanCache: true,
            warnOnUnregistered: false
        });
    });

    beforeEach(() => {
        datastore = {
            update: sinon.stub()
        };
        pipelineFactoryMock = {
            get: sinon.stub().resolves({
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
            })
        };

        buildFactoryMock = {
            list: sinon.stub().resolves(null)
        };

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
        }).catch(err => {
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
});
