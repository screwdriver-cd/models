'use strict';
const assert = require('chai').assert;
const mockery = require('mockery');
const sinon = require('sinon');

sinon.assert.expose(assert, { prefix: '' });

describe.only('Model Factory', () => {
    before(() => {
        mockery.enable({
            useCleanCache: true,
            warnOnUnregistered: false
        });
    });

    afterEach(() => {
        mockery.deregisterAll();
        mockery.resetCache();
    });

    after(() => {
        mockery.disable();
    });

    describe('getBuild', () => {
        let buildConstructorMock;
        const datastore = sinon.stub();
        const executor = sinon.stub();
        let factory;
        const password = sinon.stub();

        beforeEach(() => {
            buildConstructorMock = sinon.stub();
            mockery.registerMock('./build', buildConstructorMock);

            // eslint-disable-next-line global-require
            factory = require('../../lib/factory');

            factory.configureBuildModel(datastore, executor, password);
        });

        it('configures the build model', () => {
            assert.calledWith(buildConstructorMock, datastore, executor, password);
        });

        it('generates a single build model', () => {
            const firstModel = factory.getBuildModel();
            const secondModel = factory.getBuildModel();

            assert.strictEqual(firstModel, secondModel);
        });
    });
});
