'use strict';

const schema = require('screwdriver-data-schema');
const dayjs = require('dayjs');
const TEMPLATE_NAME_REGEX_WITH_NAMESPACE = schema.config.regex.FULL_TEMPLATE_NAME_WITH_NAMESPACE;
const formatDate = dateTime => dayjs(dateTime).format('YYYY-MM-DD');

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

/**
 * recursively fetching records (ex: builds/events) until the end
 * @method getAllRecords
 * @param  {String}       funcName            Function to fetch. For example: 'getBuilds'
 * @param  {String}       aggregateInterval   Aggregate data by day/month/week/year
 * @param  {Object}       opts                opts to pass into scan function
 * @param  {Array}        resultArray         Result so far
 * @param  {String}       date                Current date for aggregation
 * @param  {Number}       index               Current index (each index is a different date)
 * @return {Array}                            Array where each element is an array of records belong to the same date
 */
async function getAllRecords(funcName, aggregateInterval, opts, resultArray, date, index) {
    if (!['day', 'week', 'month', 'year'].includes(aggregateInterval)) {
        throw new Error('Invalid aggregation option. ' +
            `${aggregateInterval} is not one of these values ['day', 'week', 'month', 'year']`);
    }
    const builds = await this[funcName](opts);
    const length = builds.length;

    if (length === 0) {
        return resultArray;
    }

    let currentDate = date || formatDate(builds[0].createTime);
    let currentIndex = index || 0;

    // Create an array where each element is an array of builds of the same date
    for (let i = 0; i < length; i += 1) {
        const currentBuild = builds[i];
        const buildDate = formatDate(currentBuild.createTime);

        if (!dayjs(buildDate).isSame(dayjs(currentDate), aggregateInterval)) {
            currentIndex += 1;
            currentDate = buildDate;
            resultArray.push([]);
        }

        resultArray[currentIndex].push(currentBuild);
    }
    // last page
    if (length < opts.paginate.count) {
        return resultArray;
    }

    // might have more data, continue fetching
    opts.paginate.page += 1;

    return getAllRecords.call(this,
        funcName, aggregateInterval, opts, resultArray, currentDate, currentIndex);
}

module.exports = {
    getAnnotations,
    parseTemplateConfigName,
    getAllRecords
};
