'use strict';

const schema = require('screwdriver-data-schema');
const hoek = require('@hapi/hoek');
const dayjs = require('dayjs');
const formatDate = dateTime => dayjs(dateTime).format('YYYY-MM-DD');
const TEMPLATE_NAME_REGEX_WITH_NAMESPACE = schema.config.regex.FULL_TEMPLATE_NAME_WITH_NAMESPACE;
const ARM_CONTAINER = 'ARM_CONTAINER';
const DEFAULT_KEY = 'default';
const EXECUTOR_ANNOTATION = 'screwdriver.cd/executor';
const EXECUTOR_ANNOTATION_BETA = 'beta.screwdriver.cd/executor';
const SCM_ORG_REGEX = /^([^/]+)\/.*/;

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
 * Convert value to Boolean
 * @method convertToBool
 * @param {(Boolean|String)} value
 * @return {Boolean}
 */
function convertToBool(value) {
    if (typeof value === 'boolean') {
        return value;
    }

    // trueList refers to https://yaml.org/type/bool.html
    const trueList = ['on', 'true', 'yes', 'y'];
    const lowerValue = String(value).toLowerCase();

    return trueList.includes(lowerValue);
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
            const [, namespace, name] = TEMPLATE_NAME_REGEX_WITH_NAMESPACE.exec(config.name);

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
    const { length } = builds;

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

    return getAllRecords.call(this, funcName, aggregateInterval, opts, resultArray, currentDate, currentIndex);
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

    for (const element of clusters) {
        sum += element.weightage;

        if (number < sum) return element.name;
    }

    return clusters[0].name;
}

/**
 * List all build clusters and return them by group
 */
async function listBuildClustersByGroup() {
    // Lazy load factory dependency to prevent circular dependency issues
    // https://nodejs.org/api/modules.html#modules_cycles
    // eslint-disable-next-line global-require
    const BuildClusterFactory = require('./buildClusterFactory');
    const buildClusterFactory = BuildClusterFactory.getInstance();

    const allBuildClusters = await buildClusterFactory.list();

    const allBuildClustersByGroup = allBuildClusters.reduce((acc, c) => {
        const group = c.group || DEFAULT_KEY;

        acc[group] = acc[group] || [];
        acc[group].push(c);

        return acc;
    }, Object.create({}));

    if (!allBuildClustersByGroup.default) {
        allBuildClustersByGroup.default = [];
    }

    return allBuildClustersByGroup;
}

/**
 * check if pipeline is authorized to use the build cluster
 * @param {String} pipelineName the name of pipeline
 * @param {Object} buildCluster the build cluster
 * @return {Boolean}
 */
function checkScmOrgPermission(pipelineName, buildCluster) {
    // Check if this pipeline's org is authorized to use the build cluster
    // pipeline name example: screwdriver-cd/ui
    const matched = pipelineName.match(SCM_ORG_REGEX);
    const org = matched ? matched[1] : '';

    return buildCluster.scmOrganizations.includes(org);
}

/**
 * helper function to filter build clusters by active and managed status
 * @param {Array} allBuildClusters list of all build clusters
 * @param {String} scmContext the scm context
 * @param {Boolean} managedByScrewdriver is managed by screwdriver or external
 * @returns Array of all active build clusters
 */
function getAllActiveBuildClusters(allBuildClusters, scmContext, managedByScrewdriver) {
    return allBuildClusters.filter(
        cluster =>
            cluster.managedByScrewdriver === managedByScrewdriver &&
            cluster.isActive === true &&
            cluster.scmContext === scmContext
    );
}

/**
 * helper function to find build cluster by name
 * @param {Array} allBuildClusters list of all build clusters
 * @param {String} buildClusterName the build cluster name
 * @param {String} scmContext the scm context
 * @returns A build cluster object
 */
function findBuildCluster(allBuildClusters, buildClusterName, scmContext) {
    return allBuildClusters.find(cluster => cluster.name === buildClusterName && cluster.scmContext === scmContext);
}

/**
 * Get managed build cluster name based on annotations
 * @method getManagedBuildClusterName
 * @param  {Object}             config
 * @param  {Object}             config.annotations              Annotations for the job
 * @param  {PipelineModel}      config.pipeline                 Pipeline model
 * @param  {Object}             config.provider                 provider configuration
 * @param  {isPipelineUpdate}   from pipeline update
 * @return {String}             Build cluster name
 */
async function getManagedBuildClusterName({ annotations, pipeline, isPipelineUpdate, provider }) {
    const allBuildClustersByGroup = await listBuildClustersByGroup();
    const buildClusterAnnotation = 'screwdriver.cd/buildCluster';
    const pipelineAnnotations = hoek.reach(pipeline, 'annotations', { default: {} });
    let buildClusterName;

    if (annotations) {
        buildClusterName = annotations[buildClusterAnnotation] || '';
    }

    if (!buildClusterName && pipelineAnnotations) {
        buildClusterName = pipelineAnnotations[buildClusterAnnotation] || '';
    }

    let groupName = buildClusterName ? buildClusterName.split('.')[0] : DEFAULT_KEY;

    if (provider) {
        buildClusterName = `${provider.name}.${provider.buildRegion}.${provider.executor}.${provider.accountId}`;
        groupName = `${provider.name}.${provider.executor}`;
    }

    let allBuildClusters = allBuildClustersByGroup[groupName];

    if (!allBuildClusters) {
        allBuildClusters = allBuildClustersByGroup.default;
        groupName = DEFAULT_KEY;
    }

    const activeManagedBuildClusters = getAllActiveBuildClusters(allBuildClusters, pipeline.scmContext, true);

    if (!buildClusterName) {
        if (activeManagedBuildClusters.length === 0) {
            return '';
        }

        return getRandomCluster(activeManagedBuildClusters);
    }

    const buildCluster = findBuildCluster(allBuildClusters, buildClusterName, pipeline.scmContext);

    if (!buildCluster) {
        throw new Error(
            `Cluster specified in screwdriver.cd/buildCluster ${buildClusterName} ` +
                `for scmContext ${pipeline.scmContext} and group ${groupName} does not exist.`
        );
    }

    if (
        buildCluster.scmContext !== pipeline.scmContext ||
        (buildCluster.managedByScrewdriver === false && !checkScmOrgPermission(pipeline.name, buildCluster))
    ) {
        throw new Error('This pipeline is not authorized to use this build cluster.');
    }

    if (!buildCluster.isActive && !isPipelineUpdate) {
        if (buildCluster.managedByScrewdriver) {
            return getRandomCluster(activeManagedBuildClusters);
        }
        const activeExternalBuildClusters = getAllActiveBuildClusters(allBuildClusters, pipeline.scmContext, false);

        return getRandomCluster(activeExternalBuildClusters);
    }

    return buildCluster.name;
}

/**
 * Get build cluster name based on annotations/configuration
 * @method getBuildClusterName
 * @param  {Object}             config
 * @param  {Object}             config.annotations              Annotations for the job
 * @param  {PipelineModel}      config.pipeline                 Pipeline model
 * @param  {Boolean}            config.isPipelineUpdate         from pipeline update
 * @param  {Object}             config.provider                 provider configuration
 * @param  {Boolean}            multiBuildClusterEnabled        Is multiBuildClusterEnabled flag in config
 * @return {String}             Build cluster name
 */
async function getBuildClusterName({
    annotations,
    pipeline,
    isPipelineUpdate = false,
    multiBuildClusterEnabled,
    provider
}) {
    let buildClusterName;

    if (multiBuildClusterEnabled) {
        buildClusterName = await getManagedBuildClusterName({
            annotations,
            pipeline,
            isPipelineUpdate,
            provider
        });
    }

    return buildClusterName;
}

/**
 * @description Gets the token from token gen fn
 * @param {Object} fn token gen
 * @param {String} jobId
 * @param {Object} pipeline
 * @return {String} A jwt token
 */
function getToken(fn, pipeline, jobId) {
    const tokenGenConfig = {
        pipelineId: pipeline.id,
        jobId
    };

    const token = fn(pipeline.username, tokenGenConfig, pipeline.scmContext, ['sdapi']);

    return token;
}

/**
 * Gets the executor name from job/pipeline annotations
 * @param {Object} annotations
 * @param {Object} pipeline
 * @param {Object} provider
 * @returns
 */
function getExecutorName(annotations, pipeline, provider) {
    if (provider) {
        if (provider.environmentType === ARM_CONTAINER) {
            return `${provider.executor}-arm64`;
        }

        return provider.executor;
    }
    const pipelineAnnotations = hoek.reach(pipeline, 'annotations', { default: {} });

    const executorFromAnnotations = annotations
        ? annotations[EXECUTOR_ANNOTATION]
        : annotations[EXECUTOR_ANNOTATION_BETA];
    const executorFromPipelineAnnotations = pipelineAnnotations
        ? pipelineAnnotations[EXECUTOR_ANNOTATION]
        : pipelineAnnotations[EXECUTOR_ANNOTATION_BETA];

    const executorName = executorFromAnnotations || executorFromPipelineAnnotations;

    return executorName || DEFAULT_KEY;
}

/**
 * Get bookend key name based on build cluster, executor and provider
 * @method getBookendKeyName
 * @param  {Object}             config
 * @param  {Object}             config.buildClusterName         Build Cluster Name
 * @param  {Object}             config.annotations              Annotations for the job
 * @param  {PipelineModel}      config.pipeline                 Pipeline model
 * @param  {Provider}           config.provider                 Provider model
 * @return {Object}             cluster env executor
 */
async function getBookendKey({ buildClusterName, annotations, pipeline, provider }) {
    const executor = getExecutorName(annotations, pipeline, provider);

    let cluster = buildClusterName;
    let env;

    if (cluster) {
        const items = cluster.split('.');

        if (items.length > 1) {
            cluster = items[0];
            env = items[1];
        }
    }

    return {
        cluster,
        env,
        executor
    };
}

module.exports = {
    getAnnotations,
    convertToBool,
    parseTemplateConfigName,
    getAllRecords,
    getBuildClusterName,
    getToken,
    getBookendKey
};
