'use strict';

const schema = require('screwdriver-data-schema');
const hoek = require('hoek');
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

/**
 * Pick a random cluster from the array based on their weightage
 * @method getRandomCluster
 * @param  {Array}          clusters    An array of build clusters
 * @return {String}                     Name of the picked cluster
 */
function getRandomCluster(clusters) {
    // Add up all the weightage, and generate a random number between (0, totalWeight - 1)
    const totalWeight = clusters.reduce((prev, cur) => prev + cur.weightage, 0);
    const number = Math.floor(Math.random() * totalWeight);
    let sum = 0;

    for (let i = 0; i < clusters.length; i += 1) {
        sum += clusters[i].weightage;

        if (number < sum) return clusters[i].name;
    }

    return clusters[0].name;
}

/**
 * Get build cluster name based on annotations
 * @method getBuildClusterName
 * @param  {Object}             config
 * @param  {Object}             config.annotations              Annotations for the job
 * @param  {PipelineModel}      config.pipeline                 Pipeline model
 * @param  {isPipelineUpdate}   from pipeline update
 * @return {String}             Build cluster name
 */
async function getBuildClusterName({ annotations, pipeline, isPipelineUpdate = false }) {
    const buildClusterAnnotation = 'screwdriver.cd/buildCluster';
    const pipelineAnnotations = hoek.reach(pipeline, 'annotations', { default: {} });
    let buildClusterName;

    if (annotations) {
        buildClusterName = annotations[buildClusterAnnotation] || '';
    }

    if (!buildClusterName && pipelineAnnotations) {
        buildClusterName = pipelineAnnotations[buildClusterAnnotation] || '';
    }

    // Lazy load factory dependency to prevent circular dependency issues
    // https://nodejs.org/api/modules.html#modules_cycles
    // eslint-disable-next-line global-require
    const BuildClusterFactory = require('./buildClusterFactory');
    const buildClusterFactory = BuildClusterFactory.getInstance();
    const allBuildClusters = await buildClusterFactory.list();
    const activeManagedBuildClusters = allBuildClusters.filter(cluster =>
        cluster.managedByScrewdriver === true && cluster.isActive === true &&
        cluster.scmContext === pipeline.scmContext);
    const activeExternalBuildClusters = allBuildClusters.filter(cluster =>
        cluster.managedByScrewdriver === false && cluster.isActive === true &&
        cluster.scmContext === pipeline.scmContext);

    if (!buildClusterName) {
        if (activeManagedBuildClusters.length === 0) {
            return '';
        }

        return getRandomCluster(activeManagedBuildClusters);
    }

    let buildCluster = allBuildClusters.filter(cluster => cluster.name === buildClusterName &&
        cluster.scmContext === pipeline.scmContext);

    if (buildCluster.length === 0) {
        // eslint-disable-next-line max-len
        throw new Error(`Cluster specified in screwdriver.cd/buildCluster ${buildClusterName} ` +
            `for scmContext ${pipeline.scmContext} does not exist.`);
    }

    buildCluster = buildCluster[0];
    // Check if this pipeline's org is authorized to use the build cluster
    // pipeline name example: screwdriver-cd/ui
    const regex = /^([^/]+)\/.*/;
    const matched = pipeline.name.match(regex);
    const org = matched ? matched[1] : '';

    if (buildCluster.scmContext !== pipeline.scmContext
        || (buildCluster.managedByScrewdriver === false
            && !buildCluster.scmOrganizations.includes(org))) {
        throw new Error('This pipeline is not authorized to use this build cluster.');
    }

    if (!buildCluster.isActive && !isPipelineUpdate) {
        if (buildCluster.managedByScrewdriver) {
            return getRandomCluster(activeManagedBuildClusters);
        }

        if (!buildCluster.managedByScrewdriver) {
            return getRandomCluster(activeExternalBuildClusters);
        }
    }

    return buildCluster.name;
}

module.exports = {
    getAnnotations,
    parseTemplateConfigName,
    getAllRecords,
    getBuildClusterName
};
