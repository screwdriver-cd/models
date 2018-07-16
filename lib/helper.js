'use strict';

const schema = require('screwdriver-data-schema');
const TEMPLATE_NAME_REGEX_WITH_NAMESPACE = schema.config.regex.FULL_TEMPLATE_NAME_WITH_NAMESPACE;

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
 * Returns an object with the parsed name and namespace to be merged with
 * the original config for template or templateTag creation
 * @param  {Object} config
 * @param  {String} config.name         Template name
 * @param  {String} [config.namespace]  Template namespace
 * @return {Object}                     Object that contains parsed name and namespace
 */
function parseTemplateConfigName(config) {
    // Set namespace if it doesn't already exist
    if (!config.namespace) {
        const slashIndex = config.name.indexOf('/');

        // Use string in front of slash for namespace if namespace is implicit
        if (slashIndex > -1) {
            const [, namespace, name]
                = TEMPLATE_NAME_REGEX_WITH_NAMESPACE.exec(config.name);

            return {
                namespace,
                name
            };
        }

        // Set namespace to default if no slash in name
        return {
            namespace: 'default'
        };
    }

    // No change
    return {};
}

module.exports = {
    getAnnotations,
    parseTemplateConfigName
};
