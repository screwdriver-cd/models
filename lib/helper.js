'use strict';

/**
 * Get the value of the annotation that matches name
 * @method getAnnotations
 * @param  {Object} perm    Object that contains the annotation
 * @param  {String} name    Annotation name
 * @return {String}         Value of annotation
 */
function getAnnotations(perm, name) {
    return perm.annotations && perm.annotations[name];
}

/**
 * Get Build timeout
 * Get a build timeout value from annotations or executor config
 * buildTimeout setting is configured only in k8s or k8s-vm executor
 * @method getBuildTimeout
 * @param  {Object}   executor     executor
 * @param  {Object}   annotations  annotations
 * @return {Integer}               build time out (minutes)
 */
function getBuildTimeout(executor, annotations) {
    const ANNOTATE_BUILD_TIMEOUT = 'beta.screwdriver.cd/timeout';
    const DEFAULT_BUILD_TIMEOUT = 90; // 90 minutes

    const buildTimeout = (executor.kubernetes && executor.kubernetes.buildTimeout)
        ? executor.kubernetes.buildTimeout
        : DEFAULT_BUILD_TIMEOUT;

    const maxBuildTimeout = (executor.kubernetes && executor.kubernetes.maxBuildTimeout)
        ? executor.kubernetes.maxBuildTimeout
        : DEFAULT_BUILD_TIMEOUT;

    return annotations[ANNOTATE_BUILD_TIMEOUT] && isFinite(annotations[ANNOTATE_BUILD_TIMEOUT])
        ? Math.min(annotations[ANNOTATE_BUILD_TIMEOUT], maxBuildTimeout)
        : buildTimeout;
}

module.exports = {
    getAnnotations,
    getBuildTimeout
};
