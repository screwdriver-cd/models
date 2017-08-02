'use strict';

const assert = require('chai').assert;
const sinon = require('sinon');
const mockery = require('mockery');

sinon.assert.expose(assert, { prefix: '' });

describe('Event Factory', () => {
    const dateNow = 1234567;
    const nowTime = (new Date(dateNow)).toISOString();
    let EventFactory;
    let datastore;
    let factory;
    let pipelineFactoryMock;
    let scm;
    let Event;

    before(() => {
        mockery.enable({
            useCleanCache: true,
            warnOnUnregistered: false
        });
    });

    beforeEach(() => {
        datastore = {
            save: sinon.stub()
        };
        pipelineFactoryMock = {
            get: sinon.stub()
        };
        scm = {
            decorateAuthor: sinon.stub(),
            decorateCommit: sinon.stub(),
            getDisplayName: sinon.stub()
        };

        mockery.registerMock('./pipelineFactory', {
            getInstance: sinon.stub().returns(pipelineFactoryMock)
        });

        // eslint-disable-next-line global-require
        Event = require('../../lib/event');
        // eslint-disable-next-line global-require
        EventFactory = require('../../lib/eventFactory');

        factory = new EventFactory({ datastore, scm });
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
        it('should return a Event', () => {
            const model = factory.createClass({
                id: 'abc123'
            });

            assert.instanceOf(model, Event);
        });
    });

    describe('create', () => {
        let sandbox;

        beforeEach(() => {
            sandbox = sinon.sandbox.create({
                useFakeTimers: false
            });
            sandbox.useFakeTimers(dateNow);
        });

        afterEach(() => {
            sandbox.restore();
        });

        const pipelineId = '12345f642bbfd1886623964b4cff12db59869e5d';
        const sha = 'ccc49349d3cffbd12ea9e3d41521480b4aa5de5f';
        const displayName = 'github';
        const scmContext = 'github:github.com';
        const creator = {
            avatar: 'https://avatars.githubusercontent.com/u/2042?v=3',
            name: 'St John',
            url: 'https://github.com/stjohn',
            username: 'stjohn'
        };
        const commit = {
            author: {
                avatar: 'https://avatars.githubusercontent.com/u/1234567?v=3',
                name: 'Batman',
                url: 'https://internal-ghe.mycompany.com/imbatman',
                username: 'imbatman'
            },
            message: 'some commit message that is here',
            url: 'https://link.to/commitDiff'
        };
        let config;
        let expected;

        beforeEach(() => {
            config = {
                pipelineId,
                sha,
                workflow: ['main', 'publish'],
                username: 'stjohn',
                scmContext
            };

            expected = {
                pipelineId,
                sha,
                type: 'pipeline',
                workflow: ['main', 'publish'],
                causeMessage: 'Started by github:stjohn',
                createTime: nowTime,
                creator,
                commit
            };

            pipelineFactoryMock.get.withArgs(pipelineId).resolves({
                pipelineId,
                scmUri: 'github.com:1234:branch',
                scmContext,
                token: Promise.resolve('foo')
            });
            scm.decorateAuthor.resolves(creator);
            scm.decorateCommit.resolves(commit);
            scm.getDisplayName.returns(displayName);
            datastore.save.resolves({ id: 'xzy1234' });
        });

        it('should create an Event', () =>
            factory.create(config).then((model) => {
                assert.instanceOf(model, Event);
                assert.calledWith(scm.decorateAuthor, {
                    username: 'stjohn',
                    scmContext,
                    token: 'foo'
                });
                assert.calledWith(scm.decorateCommit, {
                    scmUri: 'github.com:1234:branch',
                    scmContext,
                    sha: 'ccc49349d3cffbd12ea9e3d41521480b4aa5de5f',
                    token: 'foo'
                });
                Object.keys(expected).forEach((key) => {
                    if (key === 'workflow') {
                        assert.deepEqual(model[key], expected[key]);
                    } else {
                        assert.strictEqual(model[key], expected[key]);
                    }
                });
            })
        );
    });

    describe('getInstance', () => {
        let config;

        beforeEach(() => {
            config = { datastore, scm: {} };
        });

        it('should utilize BaseFactory to get an instance', () => {
            const f1 = EventFactory.getInstance(config);
            const f2 = EventFactory.getInstance(config);

            assert.instanceOf(f1, EventFactory);
            assert.instanceOf(f2, EventFactory);

            assert.equal(f1, f2);
        });

        it('should throw when config does not have everything necessary', () => {
            assert.throw(EventFactory.getInstance,
                Error, 'No scm plugin provided to EventFactory');

            assert.throw(() => {
                EventFactory.getInstance({ datastore });
            }, Error, 'No scm plugin provided to EventFactory');

            assert.throw(() => {
                EventFactory.getInstance({ scm: {} });
            }, Error, 'No datastore provided to EventFactory');
        });
    });
});
