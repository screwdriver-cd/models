'use strict';

const assert = require('chai').assert;
const mockery = require('mockery');
const sinon = require('sinon');
const schema = require('screwdriver-data-schema');

sinon.assert.expose(assert, { prefix: '' });

describe('Command Model', () => {
    let CommandModel;
    let datastore;
    let command;
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
        // eslint-disable-next-line global-require
        CommandModel = require('../../lib/command');

        // eslint-disable-next-line global-require
        BaseModel = require('../../lib/base');

        createConfig = {
            datastore,
            id: 12345,
            namespace: 'testCommandNS',
            name: 'testCommand',
            version: '1.3',
            maintainer: 'foo@bar.com',
            description: 'this is a command',
            format: 'habitat',
            habitat: {
                mode: 'remote',
                package: 'core/git/2.14.1',
                command: 'git'
            },
            docker: {
                image: 'chefdk:1.2.3',
                command: 'knife'
            },
            binary: {
                file: './foobar.sh'
            },
            pipelineId: '8765'
        };
        command = new CommandModel(createConfig);
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
        assert.instanceOf(command, CommandModel);
        assert.instanceOf(command, BaseModel);
        schema.models.command.allKeys.forEach((key) => {
            assert.strictEqual(command[key], createConfig[key]);
        });
    });
});
