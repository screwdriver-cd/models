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
});
