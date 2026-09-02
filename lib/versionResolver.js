'use strict';

const { compareVersions } = require('compare-versions');
const schema = require('screwdriver-data-schema');

const EXACT_VERSION_REGEX = schema.config.regex.EXACT_VERSION;
const VERSION_REGEX = schema.config.regex.VERSION;

/**
 * Resolve a model from a version or tag
 * @param {Object} config Resolver configuration
 * @returns {Promise<Object|null|undefined>} Resolved model
 */
async function resolveVersionedModel({ versionOrTag, getExactVersion, getTag, getLatestVersion, listVersions }) {
    const isExactVersion = Boolean(versionOrTag && EXACT_VERSION_REGEX.test(versionOrTag));
    const isVersion = Boolean(versionOrTag && VERSION_REGEX.test(versionOrTag));

    // A full version with major, minor, and patch components
    // example: 'chef/publish@1.2.0'
    if (isExactVersion) {
        return getExactVersion(versionOrTag);
    }

    // A non-version string that should be treated as a tag
    // example: 'chef/publish@stable', 'chef/publish@latest'
    if (versionOrTag && !isVersion) {
        const tag = await getTag(versionOrTag);

        return tag ? getExactVersion(tag.version) : null;
    }

    // No version or tag is specified
    // example: 'chef/publish@'
    if (!versionOrTag) {
        return getLatestVersion();
    }

    // A partial version containing only a major or major and minor
    // example: 'chef/publish@1', 'chef/publish@1.2'
    const candidates = await listVersions();
    // Add a trailing separator so that '1' does not match '10' and '1.2' does not match '1.20'
    const matched = candidates.filter(candidate => candidate.version.concat('.').startsWith(versionOrTag.concat('.')));

    // Sort matching candidates by semver in descending order and return the latest version
    matched.sort((a, b) => compareVersions(b.version, a.version));

    return matched[0] || null;
}

module.exports = resolveVersionedModel;
