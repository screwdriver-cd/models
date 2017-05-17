'use strict';

const assert = require('chai').assert;
const sinon = require('sinon');
const mockery = require('mockery');
const schema = require('screwdriver-data-schema');
const BaseModel = require('../../lib/base');
const TokenModel = require('../../lib/token');

sinon.assert.expose(assert, { prefix: '' });
require('sinon-as-promised');

describe('Token Model', () => {
    const password = 'password';
    let datastore;
    let createConfig;
    let token;

    before(() => {
        mockery.enable({
            useCleanCache: true,
            warnOnUnregistered: false
        });
        datastore = {
            update: sinon.stub()
        };
    });

    beforeEach(() => {
        datastore.update.resolves({});

        createConfig = {
            datastore,
            userId: 12345,
            uuid: '1a2b3c',
            id: 6789,
            name: 'Mobile client auth token',
            description: 'For the mobile app',
            lastUsed: '2017-05-10T01:49:59.327Z',
            password
        };
        token = new TokenModel(createConfig);
    });

    after(() => {
        mockery.disable();
    });

    it('is constructed properly', () => {
        assert.instanceOf(token, TokenModel);
        assert.instanceOf(token, BaseModel);
        schema.models.token.allKeys.forEach((key) => {
            assert.strictEqual(token[key], createConfig[key]);
        });
    });

    describe('update', () => {
        it('promises to update a token', () => {
            const newTimestamp = '2017-05-13T02:01:17.588Z';

            token.lastUsed = newTimestamp;

            return token.update()
            .then(() => {
                assert.calledWith(datastore.update, {
                    table: 'tokens',
                    params: {
                        id: 6789,
                        lastUsed: newTimestamp
                    }
                });
            });
        });
    });
});
