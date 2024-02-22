'use strict';

const { assert } = require('chai');
const sinon = require('sinon');
const schema = require('screwdriver-data-schema');
const rewiremock = require('rewiremock/node');

sinon.assert.expose(assert, { prefix: '' });
const WORKFLOWGRAPH_WITH_STAGES = require('../data/workflowGraphWithStages.json');

describe('Event Model', () => {
    let buildFactoryMock;
    let stageFactoryMock;
    let stageBuildFactoryMock;
    let EventModel;
    let datastore;
    let event;
    let BaseModel;
    let createConfig;
    let mockStages;
    let mockStageBuild;

    beforeEach(() => {
        mockStages = [
            {
                id: 555,
                pipelineId: 123345,
                name: 'deploy',
                jobIds: [1, 2, 3, 4],
                description: 'Deploys canary jobs',
                setup: [222],
                teardown: [333]
            }
        ];
        mockStageBuild = {
            id: 8888,
            stageId: 555
        };
        datastore = {};
        buildFactoryMock = {
            list: sinon.stub().resolves(null)
        };
        stageFactoryMock = {
            list: sinon.stub().resolves(mockStages)
        };
        stageBuildFactoryMock = {
            list: sinon.stub().resolves([mockStageBuild])
        };

        rewiremock('../../lib/buildFactory').with({
            getInstance: sinon.stub().returns(buildFactoryMock)
        });
        rewiremock('../../lib/stageFactory').with({
            getInstance: sinon.stub().returns(stageFactoryMock)
        });
        rewiremock('../../lib/stageBuildFactory').with({
            getInstance: sinon.stub().returns(stageBuildFactoryMock)
        });
        rewiremock.enable();

        // eslint-disable-next-line global-require
        EventModel = require('../../lib/event');

        createConfig = {
            id: 1234,
            pipelineId: 12345,
            workflowGraph: WORKFLOWGRAPH_WITH_STAGES,
            datastore
        };
        event = new EventModel(createConfig);
    });

    afterEach(() => {
        datastore = null;
        rewiremock.disable();
    });

    it('is constructed properly', () => {
        rewiremock.disable();
        // eslint-disable-next-line global-require
        EventModel = require('../../lib/event');
        // eslint-disable-next-line global-require
        BaseModel = require('../../lib/base');
        event = new EventModel(createConfig);
        assert.instanceOf(event, EventModel);
        assert.instanceOf(event, BaseModel);
        schema.models.event.allKeys.forEach(key => {
            assert.strictEqual(event[key], createConfig[key]);
        });
    });

    describe('getStageBuilds', () => {
        it('resolves with stage builds', () => {
            const expectedStageBuildConfig = {
                params: {
                    eventId: 1234
                }
            };
            const expectedStageBuilds = [
                {
                    id: 8888,
                    stageId: 555
                }
            ];

            return event.getStageBuilds().then(result => {
                assert.calledWith(stageBuildFactoryMock.list, expectedStageBuildConfig);
                assert.deepEqual(result, expectedStageBuilds);
            });
        });
    });

    describe('getBuilds', () => {
        it('use the default config when not passed in', () => {
            const expected = {
                params: {
                    eventId: 1234
                }
            };

            return event.getBuilds().then(() => {
                assert.calledWith(buildFactoryMock.list, expected);
            });
        });

        it('merges the passed in config with the default config', () => {
            const startTime = '2019-01-20T12:00:00.000Z';
            const endTime = '2019-01-30T12:00:00.000Z';
            const expected = {
                params: {
                    eventId: 1234
                },
                startTime,
                endTime
            };

            return event
                .getBuilds({
                    startTime,
                    endTime
                })
                .then(() => {
                    assert.calledWith(buildFactoryMock.list, expected);
                });
        });

        it('rejects with errors', () => {
            buildFactoryMock.list.rejects(new Error('cannotgetit'));

            return event
                .getBuilds()
                .then(() => {
                    assert.fail('Should not get here');
                })
                .catch(err => {
                    assert.instanceOf(err, Error);
                    assert.equal(err.message, 'cannotgetit');
                });
        });
    });

    describe('get metrics', () => {
        const startTime = '2019-01-20T12:00:00.000Z';
        const endTime = '2019-01-30T12:00:00.000Z';
        const build1 = {
            id: 11,
            eventId: 1234,
            jobId: 2222,
            createTime: '2019-01-22T21:00:00.000Z',
            startTime: '2019-01-22T21:08:00.000Z',
            endTime: '2019-01-22T21:30:00.000Z',
            status: 'SUCCESS',
            meta: {
                foo: 'bar'
            }
        };
        const build2 = {
            id: 12,
            jobId: 2222,
            eventId: 1234,
            createTime: '2019-01-22T21:00:00.000Z',
            startTime: '2019-01-22T21:20:00.000Z',
            endTime: '2019-01-22T22:30:00.000Z',
            status: 'FAILURE',
            stats: {
                queueEnterTime: '2019-01-22T21:02:00.000Z',
                imagePullStartTime: '2019-01-22T21:10:00.000Z'
            },
            meta: {
                foo: 'bar'
            }
        };
        const duration1 = (new Date(build1.endTime) - new Date(build1.startTime)) / 1000;
        const duration2 = (new Date(build2.endTime) - new Date(build2.startTime)) / 1000;
        let metrics;

        beforeEach(() => {
            metrics = [
                {
                    id: build1.id,
                    jobId: build2.jobId,
                    eventId: build1.eventId,
                    createTime: build1.createTime,
                    startTime: build1.startTime,
                    endTime: build1.endTime,
                    status: build1.status,
                    duration: duration1,
                    imagePullTime: undefined,
                    queuedTime: undefined,
                    meta: build1.meta
                },
                {
                    id: build2.id,
                    jobId: build2.jobId,
                    eventId: build2.eventId,
                    createTime: build2.createTime,
                    startTime: build2.startTime,
                    endTime: build2.endTime,
                    status: build2.status,
                    duration: duration2,
                    imagePullTime: 600,
                    queuedTime: 480,
                    meta: build2.meta
                }
            ];
        });

        it('generates metrics', () => {
            const buildListConfig = {
                params: {
                    eventId: 1234
                },
                startTime,
                endTime,
                sort: 'ascending',
                sortBy: 'id',
                readOnly: true
            };

            buildFactoryMock.list.resolves([build1, build2]);

            return event.getMetrics({ startTime, endTime }).then(result => {
                assert.calledWith(buildFactoryMock.list, buildListConfig);
                assert.deepEqual(result, metrics);
            });
        });

        it('does not fail if empty builds', () => {
            buildFactoryMock.list.resolves([]);

            return event.getMetrics({ startTime, endTime }).then(result => {
                assert.deepEqual(result, []);
            });
        });

        it('works with no startTime or endTime params passed in', () => {
            const buildListConfig = {
                params: {
                    eventId: 1234
                },

                sort: 'ascending',
                sortBy: 'id',
                readOnly: true
            };

            buildFactoryMock.list.resolves([build1, build2]);

            return event.getMetrics().then(result => {
                assert.calledWith(buildFactoryMock.list, buildListConfig);
                assert.deepEqual(result, metrics);
            });
        });

        it('rejects with errors', () => {
            buildFactoryMock.list.rejects(new Error('cannotgetit'));

            return event
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
