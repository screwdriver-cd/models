'use strict';

const { assert } = require('chai');
const sinon = require('sinon');
const resolveVersionedModel = require('../../lib/versionResolver');

sinon.assert.expose(assert, { prefix: '' });

describe('Version Resolver', () => {
    let getExactVersion;
    let getTag;
    let getLatestVersion;
    let listVersions;
    let resolverConfig;

    beforeEach(() => {
        getExactVersion = sinon.stub();
        getTag = sinon.stub();
        getLatestVersion = sinon.stub();
        listVersions = sinon.stub();
        resolverConfig = { getExactVersion, getTag, getLatestVersion, listVersions };
    });

    it('gets an exact version without calling other callbacks', async () => {
        const expected = { version: '1.2.3' };

        getExactVersion.resolves(expected);

        const result = await resolveVersionedModel({ ...resolverConfig, versionOrTag: '1.2.3' });

        assert.strictEqual(result, expected);
        assert.calledOnce(getExactVersion);
        assert.calledWith(getExactVersion, '1.2.3');
        assert.notCalled(getTag);
        assert.notCalled(getLatestVersion);
        assert.notCalled(listVersions);
    });

    it('resolves a tag and gets its exact version', async () => {
        const expected = { version: '2.3.4' };

        getTag.resolves({ version: '2.3.4' });
        getExactVersion.resolves(expected);

        const result = await resolveVersionedModel({ ...resolverConfig, versionOrTag: 'stable' });

        assert.strictEqual(result, expected);
        assert.calledOnce(getTag);
        assert.calledWith(getTag, 'stable');
        assert.calledOnce(getExactVersion);
        assert.calledWith(getExactVersion, '2.3.4');
        assert.notCalled(getLatestVersion);
        assert.notCalled(listVersions);
    });

    it('returns null when a tag does not exist', async () => {
        getTag.resolves(null);

        const result = await resolveVersionedModel({ ...resolverConfig, versionOrTag: 'missing' });

        assert.isNull(result);
        assert.calledOnce(getTag);
        assert.calledWith(getTag, 'missing');
        assert.notCalled(getExactVersion);
        assert.notCalled(getLatestVersion);
        assert.notCalled(listVersions);
    });

    it('returns the latest-version callback result without changing it', async () => {
        getLatestVersion.resolves(undefined);

        const result = await resolveVersionedModel({ ...resolverConfig, versionOrTag: undefined });

        assert.isUndefined(result);
        assert.calledOnce(getLatestVersion);
        assert.notCalled(getExactVersion);
        assert.notCalled(getTag);
        assert.notCalled(listVersions);
    });

    it('returns the highest version within the requested major', async () => {
        const candidates = [{ version: '1.2.0' }, { version: '10.20.0' }, { version: '1.10.0' }];

        listVersions.resolves(candidates);

        const result = await resolveVersionedModel({ ...resolverConfig, versionOrTag: '1' });

        assert.strictEqual(result, candidates[2]);
        assert.calledOnce(listVersions);
        assert.notCalled(getExactVersion);
        assert.notCalled(getTag);
        assert.notCalled(getLatestVersion);
    });

    it('returns the highest semver within the requested minor', async () => {
        const candidates = [{ version: '1.2.3' }, { version: '1.20.30' }, { version: '1.2.20' }];

        listVersions.resolves(candidates);

        const result = await resolveVersionedModel({ ...resolverConfig, versionOrTag: '1.2' });

        assert.strictEqual(result, candidates[2]);
        assert.calledOnce(listVersions);
        assert.notCalled(getExactVersion);
        assert.notCalled(getTag);
        assert.notCalled(getLatestVersion);
    });

    it('returns null when no partial version matches', async () => {
        listVersions.resolves([{ version: '2.0.0' }]);

        const result = await resolveVersionedModel({ ...resolverConfig, versionOrTag: '1.2' });

        assert.isNull(result);
        assert.calledOnce(listVersions);
        assert.notCalled(getExactVersion);
        assert.notCalled(getTag);
        assert.notCalled(getLatestVersion);
    });
});
