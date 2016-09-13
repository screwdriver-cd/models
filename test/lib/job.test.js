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
            list: sinon.stub()
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

    it('can get secrets', () =>
        job.secrets.then((secrets) => {
            assert.isArray(secrets);
            assert.equal(secrets.length, 2);
        })
    );

    it('can get all builds', () => {
        const listConfig = {
            params: {
                jobId: '1234'
            },
            paginate: {
                count: 25,
                page: 1
            }
        };
        const build1 = {
            id: '9e7a7d519e3f2e29b840d5145c731f28193c9aw4',
            createTime: '2016-08-18T23:59:23.058Z'
        };
        const build2 = {
            id: '21fa4354ce6fc5b7249835d483f65916b3e5a34s',
            createTime: '2016-08-18T23:59:21.888Z'
        };
        const build3 = {
            id: '78855123cc7f1b808aac07feff24d7d5362cc312',
            createTime: '2016-09-13T00:16:20.102Z'
        };

        buildFactoryMock.list.resolves([build1, build2, build3]);
        const expected = [build3, build1, build2];

        return job.builds.then((buildList) => {
            assert.calledWith(buildFactoryMock.list, listConfig);
            // the builds should be sorted
            assert.deepEqual(buildList, expected);

            return job.builds;
            // When we call job.builds again, the factory is not recreated
        }).then(() => assert.calledOnce(buildFactoryMock.list));
    });

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

    it('isPR returns false if job is not a PR', () => {
        assert.isFalse(job.isPR());
    });

    it('isPR returns true if job is a PR', () => {
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
