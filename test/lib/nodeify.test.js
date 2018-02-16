'use strict';

const assert = require('chai').assert;
const nodeify = require('../../lib/nodeify');
const sinon = require('sinon');

sinon.assert.expose(assert, { prefix: '' });

describe('nodeify', () => {
    let fakeFunction;

    beforeEach(() => {
        fakeFunction = sinon.stub();

        fakeFunction.yieldsAsync();
    });

    describe('callback', () => {
        it('invokes the callback', (done) => {
            nodeify(fakeFunction, 1, 2, 3, 4, 5, () => {
                assert.calledWith(fakeFunction, 1, 2, 3, 4, 5);
                done();
            });
        });

        it('handles 0 arguments', (done) => {
            nodeify(fakeFunction, () => {
                assert.calledWith(fakeFunction);
                done();
            });
        });
    });

    describe('promises', () => {
        it('promises when not given a callback', () =>
            nodeify(fakeFunction, 1, 2, 3, 4, 5)
                .then(() => {
                    assert.calledWith(fakeFunction, 1, 2, 3, 4, 5);
                })
        );

        it('promises to handle 0 arguments', () =>
            nodeify(fakeFunction)
                .then(() => {
                    assert.calledWith(fakeFunction);
                })
        );

        it('rejects when the given function returns an error', () => {
            const expectedError = new Error('wittyErrorMessage');

            fakeFunction.yieldsAsync(expectedError);

            return nodeify(fakeFunction, 1, 2, 3, 4, 5)
                .then(() => {
                    assert.fail('this should not fail the test');
                })
                .catch((err) => {
                    assert.deepEqual(err, expectedError);
                });
        });
    });

    describe('withContext', () => {
        const args = [
            'firstArg',
            'secondArg'
        ];
        let context;
        const expectedData = 'theDataReturnedFromMagicalMethod';

        beforeEach(() => {
            context = {
                magicalMethod: sinon.stub()
            };

            context.magicalMethod.yieldsAsync(null, expectedData);
        });

        it('invokes the function with context', (done) => {
            nodeify.withContext(context, 'magicalMethod', args, (err, data) => {
                assert.isNull(err);
                assert.deepEqual(data, expectedData);
                assert.calledWith(context.magicalMethod, args[0], args[1]);
                done();
            });
        });

        it('promises to invoke the function with context', () =>
            nodeify.withContext(context, 'magicalMethod', args)
                .then((data) => {
                    assert.deepEqual(data, expectedData);
                })
        );
    });

    describe('fail', () => {
        it('invokes the callback with a failure', (done) => {
            const expectedError = new Error('hanShotSecond');

            nodeify.fail(expectedError, (err) => {
                assert.deepEqual(err, expectedError);
                done();
            });
        });

        it('rejects with a failure', () => {
            const expectedError = new Error('sarlackAteTheFett');

            return nodeify.fail(expectedError)
                .then(() => {
                    assert.fail('This should not fail the test');
                })
                .catch((err) => {
                    assert.deepEqual(err, expectedError);
                });
        });
    });

    describe('success', () => {
        it('invokes the callback with data', (done) => {
            const expectedData = { dps: 'DamagePerSecond' };

            nodeify.success(expectedData, (err, data) => {
                assert.isNull(err);
                assert.deepEqual(data, expectedData);
                done();
            });
        });

        it('promises with the given data', () => {
            const expectedData = { paladin: 'overPowered' };

            return nodeify.success(expectedData)
                .then((data) => {
                    assert.deepEqual(data, expectedData);
                });
        });
    });
});
