'use strict';

const assert = require('chai').assert;
let helper;
let executor;
let annotations;

describe('Helper', () => {
    beforeEach(() => {
        // eslint-disable-next-line global-require
        helper = require('../../lib/helper');
        executor = {};
        annotations = {};
    });

    describe('getBuildTimeout', () => {
        it('should use cluster config setting if buildTimeout is configured in executor', () => {
            executor = {
                kubernetes: {
                    buildTimeout: 100,
                    maxBuildTimeout: 150
                }
            };

            // annotation is configured, and it is within maxBuildtimeout
            annotations = { 'beta.screwdriver.cd/timeout': 149 };
            assert.strictEqual(helper.getBuildTimeout(executor, annotations), 149);

            // annotation is configured, and it is over maxBuildtimeout
            annotations = { 'beta.screwdriver.cd/timeout': 151 };
            assert.strictEqual(helper.getBuildTimeout(executor, annotations), 150);

            // annotation is not configured
            annotations = {};
            assert.strictEqual(helper.getBuildTimeout(executor, annotations), 100);
        });

        it('should use default build timeout setting if it is not configured in executor', () => {
            // annotation is configured, and it is within maxBuildtimeout
            annotations = { 'beta.screwdriver.cd/timeout': 119 };
            assert.strictEqual(helper.getBuildTimeout(executor, annotations), 119);

            // annotation is configured, and it is over maxBuildtimeout
            annotations = { 'beta.screwdriver.cd/timeout': 121 };
            assert.strictEqual(helper.getBuildTimeout(executor, annotations), 120);

            // annotation is not configured
            annotations = {};
            assert.strictEqual(helper.getBuildTimeout(executor, annotations), 90);
        });
    });
});
