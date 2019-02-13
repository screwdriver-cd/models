'use strict';

const assert = require('chai').assert;
const mockery = require('mockery');
const sinon = require('sinon');
const schema = require('screwdriver-data-schema');

sinon.assert.expose(assert, { prefix: '' });

describe('Event Model', () => {
    let buildFactoryMock;
    let EventModel;
    let datastore;
    let event;
    let BaseModel;
    let createConfig;

    before(() => {
        mockery.enable({
            useCleanCache: true,
            warnOnUnregistered: false
        });
    });

    beforeEach(() => {
        datastore = {};
        buildFactoryMock = {
            list: sinon.stub().resolves(null)
        };

        mockery.registerMock('./buildFactory', {
            getInstance: sinon.stub().returns(buildFactoryMock)
        });

        // eslint-disable-next-line global-require
        EventModel = require('../../lib/event');

        // eslint-disable-next-line global-require
        BaseModel = require('../../lib/base');

        createConfig = {
            id: 1234,
            datastore
        };
        event = new EventModel(createConfig);
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
        assert.instanceOf(event, EventModel);
        assert.instanceOf(event, BaseModel);
        schema.models.event.allKeys.forEach((key) => {
            assert.strictEqual(event[key], createConfig[key]);
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

            return event.getBuilds({
                startTime,
                endTime
            }).then(() => {
                assert.calledWith(buildFactoryMock.list, expected);
            });
        });

        it('rejects with errors', () => {
            buildFactoryMock.list.rejects(new Error('cannotgetit'));

            return event.getBuilds()
                .then(() => {
                    assert.fail('Should not get here');
                }).catch((err) => {
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
            createTime: '2019-01-22T21:00:00.000Z',
            startTime: '2019-01-22T21:08:00.000Z',
            endTime: '2019-01-22T21:30:00.000Z',
            status: 'SUCCESS'
        };
        const build2 = {
            id: 12,
            createTime: '2019-01-22T21:00:00.000Z',
            startTime: '2019-01-22T21:21:00.000Z',
            endTime: '2019-01-22T22:30:00.000Z',
            status: 'FAILURE'
        };
        const duration1 = (new Date(build1.endTime) - new Date(build1.startTime)) / 1000;
        const duration2 = (new Date(build2.endTime) - new Date(build2.startTime)) / 1000;
        let metrics;

        beforeEach(() => {
            metrics = [{
                id: build1.id,
                createTime: build1.createTime,
                status: build1.status,
                duration: duration1
            }, {
                id: build2.id,
                createTime: build2.createTime,
                status: build2.status,
                duration: duration2
            }];
        });

        it('generates metrics', () => {
            const buildListConfig = {
                params: {
                    eventId: 1234
                },
                startTime,
                endTime
            };

            buildFactoryMock.list.resolves([build1, build2]);

            return event.getBuildMetrics({ startTime, endTime }).then((result) => {
                assert.calledWith(buildFactoryMock.list, buildListConfig);
                assert.deepEqual(result, metrics);
            });
        });

        it('does not fail if empty builds', () => {
            buildFactoryMock.list.resolves([]);

            return event.getBuildMetrics({ startTime, endTime }).then((result) => {
                assert.deepEqual(result, []);
            });
        });

        it('works with no startTime or endTime params passed in', () => {
            const buildListConfig = {
                params: {
                    eventId: 1234
                }
            };

            buildFactoryMock.list.resolves([build1, build2]);

            return event.getBuildMetrics().then((result) => {
                assert.calledWith(buildFactoryMock.list, buildListConfig);
                assert.deepEqual(result, metrics);
            });
        });

        it('rejects with errors', () => {
            buildFactoryMock.list.rejects(new Error('cannotgetit'));

            return event.getBuildMetrics({ startTime, endTime })
                .then(() => {
                    assert.fail('Should not get here');
                }).catch((err) => {
                    assert.instanceOf(err, Error);
                    assert.equal(err.message, 'cannotgetit');
                });
        });
    });
});
