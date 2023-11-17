'use strict';

const { assert } = require('chai');
const sinon = require('sinon');

sinon.assert.expose(assert, { prefix: '' });

describe('TemplateTag Factory', () => {
    let JobTemplateTagFactory;
    let datastore;
    let factory;

    beforeEach(() => {
        datastore = {
            save: sinon.stub(),
            get: sinon.stub(),
            scan: sinon.stub()
        };

        // eslint-disable-next-line global-require
        JobTemplateTagFactory = require('../../lib/jobTemplateTagFactory');

        factory = new JobTemplateTagFactory({ datastore });
    });

    afterEach(() => {
        datastore = null;
    });

    describe('getTemplateType', () => {
        it('should get an template type', () => {
            const type = factory.getTemplateType();

            assert.equal(type, 'JOB');
        });
    });

    describe('getInstance', () => {
        it('should throw when config not supplied', () => {
            assert.throw(JobTemplateTagFactory.getInstance, Error, 'No datastore provided to JobTemplateTagFactory');
        });

        it('should get an instance', () => {
            const config = { datastore };
            const f1 = JobTemplateTagFactory.getInstance(config);
            const f2 = JobTemplateTagFactory.getInstance(config);

            assert.instanceOf(f1, JobTemplateTagFactory);
            assert.instanceOf(f2, JobTemplateTagFactory);

            assert.equal(f1, f2);
        });
    });
});
