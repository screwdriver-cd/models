'use strict';

const {
    TRIGGER,
    EXTERNAL_TRIGGER,
    COMMIT_TRIGGER,
    PR_TRIGGER,
    RELEASE_TRIGGER,
    TAG_TRIGGER,
    QUALIFIED_STAGE_NAME,
    STAGE_SETUP_TEARDOWN_JOB_NAME,
    PR_CLOSED_TRIGGER
} = require('screwdriver-data-schema').config.regex;
const workflowParser = require('screwdriver-workflow-parser');
const logger = require('screwdriver-logger');
const hoek = require('@hapi/hoek');
const BaseFactory = require('./baseFactory');
const Event = require('./event');
const { getStageName, getFullStageJobName } = require('./helper');
let instance;

/**
 * Get triggered jobs to start that are enabled
 * @method getJobsFromTrigger
 * @param  {Object}   config
 * @param  {String}   config.branch                         triggered branch name
 * @param  {Array}    config.jobs                           Array of job objects
 * @param  {Object}   config.pipelineConfig
 * @param  {Object}   config.pipelineConfig.workflowGraph   Object with nodes and edges that represent the order of jobs
 * @param  {String}   config.startFrom                      Startfrom (e.g. ~commit, ~pr, ~sd@123:main, etc)
 * @param  {String}   config.releaseName                    SCM webhook releaseName
 * @param  {String}   config.ref                            SCM webhook ref
 * @return {Array}                                          Array of commit jobs to start
 */
function getJobsFromTrigger(config) {
    const { jobs, pipelineConfig, startFrom, branch, releaseName, ref } = config;
    const shouldGetJobs = [
        EXTERNAL_TRIGGER.test(startFrom),
        COMMIT_TRIGGER.test(startFrom),
        RELEASE_TRIGGER.test(startFrom),
        TAG_TRIGGER.test(startFrom),
        PR_CLOSED_TRIGGER.test(startFrom),
        startFrom === '~subscribe'
    ];

    if (!shouldGetJobs.some(t => t === true)) {
        return [];
    }

    let nextJobs = workflowParser.getNextJobs(pipelineConfig.workflowGraph, {
        trigger: startFrom
    });

    if (startFrom === '~commit') {
        nextJobs = nextJobs.concat(
            workflowParser.getNextJobs(pipelineConfig.workflowGraph, {
                trigger: `~commit:${branch}`
            })
        );
    }

    if (startFrom.match(RELEASE_TRIGGER)) {
        nextJobs = nextJobs.concat(
            workflowParser.getNextJobs(pipelineConfig.workflowGraph, {
                trigger: `~release:${releaseName}`
            })
        );
    }

    if (startFrom.match(TAG_TRIGGER)) {
        nextJobs = nextJobs.concat(
            workflowParser.getNextJobs(pipelineConfig.workflowGraph, {
                trigger: `~tag:${ref}`
            })
        );
    }

    if (startFrom === '~subscribe') {
        nextJobs = nextJobs.concat(
            workflowParser.getNextJobs(pipelineConfig.workflowGraph, {
                trigger: '~subscribe'
            })
        );
    }

    if (startFrom.match(PR_CLOSED_TRIGGER)) {
        nextJobs = nextJobs.concat(
            workflowParser.getNextJobs(pipelineConfig.workflowGraph, {
                trigger: startFrom
            })
        );
    }

    return jobs.filter(j => nextJobs.includes(j.name) && j.state === 'ENABLED' && !j.archived);
}

/**
 * Get jobs from job name to start that are enabled
 * @method getJobsFromJobName
 * @param  {Object}   config
 * @param  {Array}    config.jobs      Array of job objects
 * @param  {String}   config.startFrom Startfrom (e.g. ~commit, ~pr, etc)
 * @return {Array}                     Array of jobs to start
 */
function getJobsFromJobName(config) {
    const { jobs, startFrom } = config;
    const isCommitTrigger = COMMIT_TRIGGER.test(startFrom);
    const isPRTrigger = PR_TRIGGER.test(startFrom);

    if (isCommitTrigger || isPRTrigger) {
        return [];
    }

    return jobs.filter(j => {
        if (j.name !== startFrom || j.archived) {
            return false;
        }

        if (j.isPR()) {
            // Make sure original job is also not disabled/archived
            // If the original job does not exist, it will be enabled
            const originalJobName = j.parsePRJobName('job');
            const originalJob = jobs.find(o => o.name === originalJobName);
            const originalJobEnabled = originalJob ? originalJob.state === 'ENABLED' : true;
            const originalJobNotArchived = originalJob ? !originalJob.archived : true;

            return originalJobEnabled && originalJobNotArchived;
        }

        return j.state === 'ENABLED';
    });
}

/**
 * Get PR jobs to start that are enabled
 * @method getJobsFromPR
 * @param  {Object}    config
 * @param  {Array}     config.jobs                           Array of job objects
 * @param  {Number}    config.prNum                          PR number
 * @param  {Object}    config.pipelineConfig
 * @param  {Object}    config.pipelineConfig.workflowGraph   Object with nodes and edges that represent the order of jobs
 * @param  {String}    config.startFrom                      Startfrom (e.g. ~commit, ~pr, etc)
 * @param  {Boolean}   config.chainPR                        Flag of triggering subsequent job after pull request job
 * @param  {String}    config.branch                         triggered branch name
 * @resolves {Array}                                         Array of PR jobs to start
 */
function getJobsFromPR(config) {
    const { jobs, prNum, pipelineConfig, startFrom, chainPR, branch } = config;
    const isPRTrigger = PR_TRIGGER.test(startFrom);

    if (!isPRTrigger) {
        return [];
    }

    let nextJobs = workflowParser.getNextJobs(pipelineConfig.workflowGraph, {
        trigger: startFrom,
        prNum,
        chainPR
    });

    if (startFrom === '~pr') {
        nextJobs = nextJobs.concat(
            workflowParser.getNextJobs(pipelineConfig.workflowGraph, {
                trigger: `~pr:${branch}`,
                prNum,
                chainPR
            })
        );
    }

    const jobsToStart = jobs.filter(j => nextJobs.includes(j.name));

    return jobsToStart.filter(j => {
        // Handle PR jobs with PR-#: prefix
        // Make sure original job is also not disabled
        const originalJobName = j.parsePRJobName('job');
        const originalJob = jobs.find(o => o.name === originalJobName);
        const originalJobEnabled = originalJob ? originalJob.state === 'ENABLED' : true;
        const originalJobNotArchived = originalJob ? !originalJob.archived : true;

        return !j.archived && originalJobEnabled && originalJobNotArchived;
    });
}

/**
 * Starts the build if the changed file is part of the sourcePaths, or if there is no sourcePaths
 * @method startBuild
 * @param  {Object}   config                    configuration object
 * @param  {Object}   config.buildConfig        Build Config to create the build with
 * @param  {String}   config.startFrom          Startfrom (e.g. ~commit, ~pr, etc)
 * @param  {Array}    config.changedFiles       List of files that were changed
 * @param  {Array}    config.sourcePaths        List of source paths
 * @param  {Boolean}  [config.webhooks]         If the create came from a webhook (pr or push) or not
 * @param  {Boolean}  [config.isPR]             Is it PR?
 * @param  {Object}   [config.decoratedCommit]  Decorated commit object
 * @param  {String}   [config.rootDir]          Root directory
 * @return {Promise}
 */
function startBuild(config) {
    /* eslint-disable global-require */
    const BuildFactory = require('./buildFactory');
    const buildFactory = BuildFactory.getInstance();
    /* eslint-enable global-require */
    const {
        buildConfig,
        changedFiles,
        startFrom,
        sourcePaths,
        webhooks,
        isPR,
        decoratedCommit,
        subscribedConfigSha,
        subscribedSourceUrl,
        rootDir
    } = config;
    const isReleaseTrigger = RELEASE_TRIGGER.test(startFrom);
    const isTagTrigger = TAG_TRIGGER.test(startFrom);
    let hasChangeInSourcePaths = true;

    buildConfig.environment = {};
    buildConfig.subscribedConfigSha = subscribedConfigSha;

    // Only check if sourcePaths or rootDir is set
    // and is not a releaseTrigger and is not a tagTrigger
    // and webhooks or is a PR
    if ((webhooks || isPR) && !(isReleaseTrigger || isTagTrigger) && (sourcePaths || rootDir)) {
        if (!changedFiles) {
            throw new Error('Your SCM does not support Source Paths');
        }

        const paths = sourcePaths || [];

        // Add rootDir as a sourcePath if no sourcePaths
        if (rootDir && paths.length === 0) {
            paths.push(`${rootDir}/`);
        }

        hasChangeInSourcePaths = changedFiles.some(file => {
            const isFileMatch = paths.some(source => {
                // source path is exclude expression
                if (source.startsWith('!')) {
                    return false;
                }

                let isMatch = false;

                // source path is a file
                if (source.slice(-1) !== '/') {
                    isMatch = file === source;
                    // source path is a directory
                } else {
                    isMatch = file.startsWith(source);
                }

                // Set env var
                if (isMatch) {
                    buildConfig.environment.SD_SOURCE_PATH = source;
                }

                return isMatch;
            });
            const isFileExclude = paths.some(source => {
                // source path is not exclude expression
                if (!source.startsWith('!')) {
                    return false;
                }

                let isMatchExclude = false;

                // source path is a file
                if (source.slice(-1) !== '/') {
                    isMatchExclude = '!'.concat(file) === source;
                    // source path is a directory
                } else {
                    isMatchExclude = '!'.concat(file).startsWith(source);
                }

                return isMatchExclude;
            });

            // sourcePath is only exclude
            const onlyExclude = paths.every(source => source.startsWith('!') === true);

            if (onlyExclude && !isFileExclude) {
                return true;
            }

            return isFileMatch && !isFileExclude;
        });
    }

    buildConfig.meta = {
        commit: {
            ...decoratedCommit,
            changedFiles: changedFiles ? changedFiles.join(',') : ''
        },
        ...buildConfig.meta,
        subscribedConfigSha,
        subscribedSourceUrl: subscribedConfigSha ? subscribedSourceUrl : undefined
    };

    return hasChangeInSourcePaths ? buildFactory.create(buildConfig) : null;
}

/**
 * Create builds associated with this event
 * For example, if startFrom ~commit, then create builds with jobs that have requires: ~commit
 * @method createBuilds
 * @param  {Object}   config
 * @param  {Object}   config.eventConfig
 * @param  {String}   config.eventConfig.sha                 SHA this project was built on
 * @param  {String}   config.eventConfig.username            Username of the user that creates this event
 * @param  {String}   config.eventConfig.scmContext          The scm context to which user belongs
 * @param  {String}   [config.eventConfig.prRef]             Ref if it's a PR event
 * @param  {Number}   [config.eventConfig.prNum]             PR number if it's a PR event
 * @param  {String}   [config.eventConfig.startFrom]         Where the event starts from (jobname or ~commit, ~pr, etc)
 *                                                           (Optional for backwards compatibility)
 * @param  {String}   [config.eventConfig.causeMessage]      Message that describes why the event was created
 * @param  {String}   [config.parentBuildId]                 Id of the build that starts this event
 * @param  {Number}   config.eventId                         Event id
 * @param  {Pipeline} config.pipeline                        Pipeline to create builds
 * @param  {Object}   config.pipelineConfig
 * @param  {String}   config.pipelineConfig.causeMessage     Message that describes why the event was created
 * @param  {Object}   [config.pipelineConfig.workflowGraph]  Object with nodes and edges that represent the order of jobs
 * @param  {Array}    [config.changedFiles]                  Array of files that were changed
 * @param  {Boolean}  [config.webhooks]                      If the create came from a webhook (pr or push) or not
 * @param  {String}   [config.releaseName]                   SCM webhook releaseName
 * @param  {String}   [config.ref]                           SCM webhook ref
 * @param  {Boolean}  [config.isPR]                          Is it PR?
 * @param  {Object}   [config.decoratedCommit]               Decorated commit object
 * @param  {Object}   [config.pipeline]                      Default pipeline config from database
 * @param  {Object}   [config.pipelineConfig]                Current Pipeline config
 */
function createBuilds(config) {
    const {
        decoratedCommit,
        subscribedConfigSha,
        subscribedSourceUrl,
        eventConfig,
        eventId,
        pipeline,
        pipelineConfig,
        changedFiles,
        webhooks,
        isPR,
        releaseName,
        ref
    } = config;
    let { startFrom } = eventConfig;
    let rootDir = '';

    if (!startFrom) {
        return null;
    }

    // If startFrom is a stage, point it to stage setup job
    if (QUALIFIED_STAGE_NAME.test(startFrom)) {
        startFrom = `${startFrom}:setup`;
    }

    const stageName = getStageName(pipelineConfig.workflowGraph, startFrom);

    // if the startFrom is a stage job, replace it to the setup of the same stage
    if (stageName && !STAGE_SETUP_TEARDOWN_JOB_NAME.test(startFrom)) {
        startFrom = getFullStageJobName({ stageName, jobName: 'setup' });
    }

    return Promise.all([pipeline.branch, pipeline.getJobs(), pipeline.rootDir])
        .then(([branch, jobs, root]) => {
            rootDir = root;
            // When startFrom is ~commit, ~release, ~tag, ~sd@
            const jobsFromTrigger = getJobsFromTrigger({
                jobs,
                pipelineConfig,
                startFrom,
                branch,
                releaseName,
                ref
            });
            // When startFrom is a job name
            const jobsFromJobName = getJobsFromJobName({
                jobs,
                startFrom
            });
            // When startFrom is ~pr
            const jobsFromPR = getJobsFromPR({
                jobs,
                prNum: eventConfig.prNum,
                pipelineConfig,
                startFrom,
                chainPR: pipeline.chainPR,
                branch
            });

            return Promise.all([jobsFromTrigger, jobsFromJobName, jobsFromPR]).then(result =>
                result.reduce((a, b) => a.concat(b))
            );
        })
        .then(jobsToStart => {
            // No jobs to start (eg: when jobs are disabled or startFrom is not valid)
            if (jobsToStart.length === 0) {
                logger.warn(`No jobs to start in event ${eventId}.`);

                return null;
            }

            // Start builds
            return Promise.all(
                jobsToStart.map(j => {
                    const buildConfig = {
                        jobId: j.id,
                        eventId,
                        causeMessage: pipelineConfig.causeMessage,
                        ...eventConfig
                    };

                    buildConfig.configPipelineSha = pipelineConfig.configPipelineSha;

                    const { annotations, freezeWindows } = j.permutations[0];
                    const isVirtualJob = annotations ? annotations['screwdriver.cd/virtualJob'] === true : false;
                    const hasFreezeWindows = freezeWindows ? freezeWindows.length > 0 : false;

                    // Bypass execution of the build if the job is virtual
                    buildConfig.start = !isVirtualJob || hasFreezeWindows;

                    return startBuild({
                        decoratedCommit,
                        subscribedConfigSha,
                        subscribedSourceUrl,
                        buildConfig,
                        startFrom,
                        changedFiles,
                        sourcePaths: j.permutations[0].sourcePaths, // TODO: support matrix job
                        webhooks,
                        isPR,
                        rootDir
                    });
                })
            ).then(buildsCreated => {
                const builds = buildsCreated.filter(b => b !== null);

                if (builds.length === 0) {
                    logger.info(`No jobs ever started in event ${eventId}.`);

                    return null;
                }

                return builds;
            });
        });
}

/**
 * Get the latest workflowGraph
 * @method getLatestWorkflowGraph
 * @param  {Object}         config
 * @param  {Pipeline}       config.pipeline            Pipeline
 * @param  {Object}         config.eventConfig
 * @param  {Boolean}        config.subscribedEvent     Flag specifying whether this is a subscribed event
 * @param  {String}         [config.eventConfig.prRef] PR ref
 * @resolves {Object}                                  Resolves with workflowGraph
 */
function getLatestWorkflowGraph(config) {
    const { pipeline, eventConfig } = config;

    // Experimental feature turned off
    if (config.subscribedEvent) {
        eventConfig.prRef = false;
    }

    if (eventConfig.prRef) {
        return pipeline
            .getConfiguration({
                ref: eventConfig.prRef,
                isPR: true
            })
            .then(c => c.workflowGraph);
    }

    // For everything else
    return Promise.resolve(pipeline.workflowGraph);
}

/**
 * Update the workflowGraph
 * @method updateWorkflowGraph
 * @param  {Object}         config
 * @param  {Pipeline}       config.pipeline            Pipeline
 * @param  {Number}         config.pipeline.id         Pipeline id
 * @param  {Object}         config.eventConfig
 * @param  {Number}         [config.eventConfig.prRef] Ref if it's a PR event
 * @param  {Number}         [config.eventConfig.prNum] PR number if it's a PR event
 * @param  {Object}         config.workflowGraph       WorkflowGraph
 * @resolves {Object}                                  Resolves with workflowGraph
 */
function updateWorkflowGraph(config) {
    const { pipeline, eventConfig, workflowGraph } = config;
    const startNode = eventConfig.startFrom;

    // If the start node is missing in the workflowGraph, add it as a detached node
    if (TRIGGER.test(startNode) && !workflowGraph.nodes.find(n => n.name === startNode)) {
        workflowGraph.nodes.push({ name: startNode });
    }

    if (eventConfig.prRef && pipeline.chainPR) {
        // eslint-disable-next-line global-require
        const JobFactory = require('./jobFactory');
        const jobFactory = JobFactory.getInstance();

        return jobFactory
            .list({
                params: { pipelineId: pipeline.id, archived: false },
                search: { field: 'name', keyword: `PR-${eventConfig.prNum}:%` }
            })
            .then(chainedPRJobs => {
                const { nodes } = workflowGraph;

                chainedPRJobs.forEach(job => {
                    // Add jobId to workflowGraph.nodes
                    nodes.forEach(node => {
                        if (`PR-${eventConfig.prNum}:${node.name}` === job.name) {
                            node.id = job.id;
                        }
                    });
                });

                return workflowGraph;
            });
    }

    return Promise.resolve(workflowGraph);
}

/**
 * Determines the parameters for the build by compiling the list of parameters with default values from the
 * `defaultParameters` and override the values if specified in `eventParameters`. Parameters from `eventParameters` are
 * dropped if matching definition is not found in `defaultParameters`.
 * @param {Object} defaultParameters Default Pipeline or Job parameter definitions
 * @param {Object} eventParameters   Customized build parameters
 * @resolves {Object}
 */
function validateAndMergeParameters(defaultParameters, eventParameters) {
    const allowedParameters = Object.create(null);

    if (defaultParameters) {
        Object.entries(defaultParameters).forEach(([name, val]) => {
            let defaultParameterValue = val;

            if (typeof val === 'object') {
                if (Array.isArray(val)) {
                    defaultParameterValue = val[0];
                } else {
                    defaultParameterValue = val.value;
                    if (Array.isArray(val.value)) {
                        defaultParameterValue = val.value[0];
                    }
                }
            }

            allowedParameters[name] = { value: defaultParameterValue, default: defaultParameterValue };
            if (eventParameters) {
                let actualParameterValue = eventParameters[name];

                if (typeof actualParameterValue === 'object') {
                    actualParameterValue = actualParameterValue.value;
                }

                if (actualParameterValue !== undefined) {
                    allowedParameters[name] = { value: actualParameterValue, default: defaultParameterValue };
                }
            }
        });
    }

    return allowedParameters;
}

/**
 * Standardize job parameters
 * @param  {Object}         config
 * @param  {Pipeline}       config.pipeline                      Pipeline
 * @param  {Object}         [config.pipeline.parameters]         Default build parameters
 * @param  {Object}         config.eventConfig
 * @param  {Object}         [config.eventConfig.meta.parameters] Customized build parameters
 * @resolves {Object}
 */
async function getJobParameters(config) {
    const { pipeline, eventConfig } = config;
    const allowedParameters = Object.create(null);

    const jobs = await pipeline.getJobs();

    jobs.forEach(job => {
        const jobParameters = job.permutations[0].parameters; // TODO: Revisit while supporting matrix job

        if (!jobParameters) return;

        if (eventConfig.prNum) {
            // For PR events, include only the parameters of the PR job for that PR
            if (parseInt(eventConfig.prNum, 10) === job.prNum) {
                const baseJobName = job.parsePRJobName('job');

                allowedParameters[baseJobName] = validateAndMergeParameters(
                    jobParameters,
                    hoek.reach(eventConfig, `meta.parameters.${baseJobName}`)
                );
            }
        } else if (job.prParentJobId === null || job.prParentJobId === undefined) {
            // If not PR events, only include non-PR jobs
            allowedParameters[job.name] = validateAndMergeParameters(
                jobParameters,
                hoek.reach(eventConfig, `meta.parameters.${job.name}`)
            );
        }
    });

    return allowedParameters;
}

/**
 * Standardize event parameters
 * @method updateEventParameters
 * @param  {Object}         config
 * @param  {Pipeline}       config.pipeline                      Pipeline
 * @param  {Object}         [config.pipeline.parameters]         Default build parameters
 * @param  {Object}         config.eventConfig
 * @param  {Object}         [config.eventConfig.meta.parameters] Customized build parameters
 * @resolves {Object}                                            Resolves with standardized parameters
 */
async function updateEventParameters(config) {
    const { pipeline, eventConfig } = config;

    const jobParameters = await getJobParameters(config);
    const pipelineParameters = validateAndMergeParameters(
        pipeline.parameters,
        hoek.reach(eventConfig, 'meta.parameters')
    );

    const allowedParameters = hoek.merge(pipelineParameters, jobParameters);

    return Object.keys(allowedParameters).length === 0 ? null : allowedParameters;
}

class EventFactory extends BaseFactory {
    /**
     * Construct a EventFactory object
     * @method constructor
     * @param  {Object}    config
     * @param  {Object}    config.datastore     Object that will perform operations on the datastore
     */
    constructor(config) {
        super('event', config);
    }

    /**
     * Instantiate an Event class
     * @method createClass
     * @param  {Object}     config
     * @return {Event}
     */
    createClass(config) {
        return new Event(config);
    }

    /**
     * Get latest commit sha given pipelineId
     * @method _getCommitSha
     * @param  {Number}     pipelineId
     * @return {Promise}
     */
    async _getCommitSha(pipelineId) {
        // eslint-disable-next-line global-require
        const PipelineFactory = require('./pipelineFactory');
        const pipelineFactory = PipelineFactory.getInstance();
        const pipeline = await pipelineFactory.get(pipelineId);
        const token = await pipeline.token;
        const scmConfig = {
            scmContext: pipeline.scmContext,
            scmUri: pipeline.scmUri,
            token
        };

        return pipelineFactory.scm.getCommitSha(scmConfig);
    }

    /**
     * Create an event model
     * @method create
     * @param  {Object}  config
     * @param  {String}  [config.type = 'pipeline'] Type of event (pipeline or pr)
     * @param  {Number}  config.pipelineId          Unique id of the pipeline
     * @param  {String}  config.sha                 SHA this project was built on
     * @param  {String}  [config.configPipelineSha] SHA of the config pipeline with screwdriver.yaml
     * @param  {String}  config.username            Username of the user that creates this event
     * @param  {String}  config.scmContext          The scm context to which user belongs
     * @param  {String}  [config.prNum]             PR number if it's a PR event
     * @param  {String}  [config.prRef]             Ref if it's a PR event
     * @param  {String}  [config.prTitle]           PR title if it's a PR event
     * @param  {String}  [config.startFrom]         Where the event starts from (jobname or ~commit, ~pr, etc)
     *                                              Optional for backwards compatibility
     * @param  {String}  [config.causeMessage]      Message that describes why the event was created
     * @param  {Object}  [config.creator]           Creator of the event
     * @param  {Number}  [config.parentBuildId]     Id of the build that starts this event
     * @param  {Object}  [config.parentBuilds]      Parent builds information
     * @param  {Number}  [config.groupEventId]      Group parent event ID
     * @param  {Number}  [config.parentEventId]     Id of the parent event
     * @param  {Object}  [config.workflowGraph]     workflowGraph of parentEvent if there is a parentEvent
     * @param  {Array}   [config.changedFiles]      Array of files that were changed
     * @param  {Boolean} [config.webhooks]          If the create came from a webhook (pr or push) or not
     * @param  {Object}  [config.meta]              Metadata tied to this event
     * @param  {String}  [config.releaseName]       SCM webhook release name
     * @param  {String}  [config.ref]               SCM webhook ref
     * @param  {Object}  [config.prInfo]            PR info
     * @param  {String}  [config.skipMessage]       Message to skip starting builds
     * @param  {Boolean} [config.chainPR]           Chain PR flag
     * @return {Promise}
     */
    create(config) {
        // Lazy load factory dependency to prevent circular dependency issues
        // https://nodejs.org/api/modules.html#modules_cycles
        // eslint-disable-next-line global-require
        const PipelineFactory = require('./pipelineFactory');
        const pipelineFactory = PipelineFactory.getInstance();
        const {
            pipelineId,
            configPipelineSha,
            username,
            scmContext,
            parentEventId,
            sha,
            startFrom,
            changedFiles,
            webhooks,
            prSource,
            prInfo,
            prTitle,
            prRef,
            prNum,
            skipMessage,
            chainPR,
            groupEventId,
            releaseName,
            ref,
            subscribedEvent,
            subscribedConfigSha,
            subscribedSourceUrl
        } = config;
        const displayLabel = this.scm.getDisplayName(config);
        const displayName = displayLabel ? `${displayLabel}:${username}` : username;
        const modelConfig = {
            type: config.type || 'pipeline',
            pipelineId,
            sha,
            configPipelineSha,
            startFrom,
            causeMessage: config.causeMessage || `Started by ${displayName}`,
            creator: config.creator || null,
            meta: config.meta || {},
            pr: {},
            prNum,
            status: 'CREATED'
        };
        let prevChainPR = '';
        let decoratedCommit;

        if (groupEventId) {
            modelConfig.groupEventId = groupEventId;
        }

        return (
            pipelineFactory
                .get(pipelineId)
                // Sync pipeline to make sure workflowGraph is generated
                .then(p => {
                    prevChainPR = p.chainPR;
                    if (parentEventId) {
                        modelConfig.parentEventId = parentEventId;
                    }

                    // Sync pipeline with the parentEvent sha and create jobs based on that sha
                    if (parentEventId && !prRef) {
                        // for child pipelines restart event, sync with configPipelineSha
                        if (configPipelineSha) {
                            modelConfig.configPipelineSha = configPipelineSha;

                            return p.sync(configPipelineSha, chainPR);
                        }

                        return p.sync(config.sha, chainPR);
                    }

                    // for child pipelines, get config pipeline sha and sync with that
                    if (p.configPipelineId) {
                        // eslint-disable-next-line no-underscore-dangle
                        return this._getCommitSha(p.configPipelineId).then(commitSha => {
                            modelConfig.configPipelineSha = commitSha;

                            return p.sync(commitSha, chainPR);
                        });
                    }

                    if (startFrom && startFrom.match(PR_CLOSED_TRIGGER)) {
                        return p.sync(config.sha, chainPR);
                    }

                    return p.sync(null, chainPR);
                })
                .then(p => {
                    if (prevChainPR !== p.chainPR && !subscribedEvent) {
                        // when chainPR was changed, sync PRs.
                        return p.syncPRs();
                    }

                    return p;
                })
                .then(p => {
                    if (prInfo) {
                        if (prInfo.url) {
                            modelConfig.pr.url = prInfo.url;
                        }

                        if (prInfo.prBranchName) {
                            modelConfig.pr.prBranchName = prInfo.prBranchName;
                        }
                    }

                    if (config.baseBranch) {
                        // cases triggered by webhook or when there is a parentEvent such as restart
                        modelConfig.baseBranch = config.baseBranch;
                    } else if (prInfo && prInfo.baseBranch) {
                        // cases of PR events created from the Start button
                        modelConfig.baseBranch = prInfo.baseBranch;
                    } else if (p.scmRepo && p.scmRepo.branch) {
                        // cases triggered by remote trigger and commit events created from the Start button
                        modelConfig.baseBranch = p.scmRepo.branch;
                    }

                    if (prTitle) {
                        modelConfig.pr.title = prTitle;
                    }

                    if (prSource) {
                        modelConfig.pr.prSource = prSource;
                    }

                    if (prRef) {
                        modelConfig.pr.ref = prRef;

                        return subscribedEvent ? p : p.syncPR(prNum);
                    }

                    return p;
                })
                .then(pipeline =>
                    pipeline.token
                        .then(token => {
                            if (!modelConfig.creator) {
                                return this.scm
                                    .decorateAuthor({
                                        // decorate user who creates this event
                                        username,
                                        scmContext,
                                        token
                                    })
                                    .then(creator => {
                                        modelConfig.creator = creator;

                                        return this.scm.decorateCommit({
                                            scmUri: pipeline.scmUri,
                                            scmContext,
                                            sha,
                                            token,
                                            scmRepo: pipeline.scmRepo
                                        });
                                    });
                            }

                            return this.scm.decorateCommit({
                                scmUri: pipeline.scmUri,
                                scmContext,
                                sha,
                                token,
                                scmRepo: pipeline.scmRepo
                            });
                        })
                        .then(commit => {
                            decoratedCommit = commit;
                            modelConfig.commit = commit;
                            modelConfig.createTime = new Date().toISOString();

                            return getLatestWorkflowGraph({
                                pipeline,
                                eventConfig: config,
                                subscribedEvent
                            });
                        })
                        .then(workflowGraph =>
                            updateWorkflowGraph({
                                pipeline,
                                eventConfig: config,
                                workflowGraph
                            })
                        )
                        .then(updatedWorkflowGraph => {
                            modelConfig.workflowGraph = updatedWorkflowGraph;
                        })
                        .then(() => {
                            return updateEventParameters({
                                pipeline,
                                eventConfig: config
                            });
                        })
                        .then(updatedParameters => {
                            if (updatedParameters) {
                                modelConfig.meta.parameters = updatedParameters;
                            }

                            if (!config.meta) {
                                config.meta = modelConfig.meta;
                            }

                            return super.create(modelConfig);
                        })
                        .then(event => {
                            if (!event.groupEventId) {
                                event.groupEventId = event.id;

                                return event.update();
                            }

                            return Promise.resolve(event);
                        })
                        .then(event => {
                            if (modelConfig.type === 'pipeline') {
                                pipeline.lastEventId = event.id;
                            }

                            return pipeline
                                .update()
                                .then(p => {
                                    // Skip creating & starting builds
                                    if (skipMessage) {
                                        return null;
                                    }

                                    // Start builds
                                    return createBuilds({
                                        decoratedCommit,
                                        subscribedConfigSha,
                                        subscribedSourceUrl,
                                        eventConfig: config,
                                        eventId: event.id,
                                        pipeline: p,
                                        pipelineConfig: modelConfig,
                                        isPR: !!prInfo,
                                        changedFiles,
                                        webhooks,
                                        releaseName,
                                        ref
                                    });
                                })
                                .then(builds => {
                                    event.builds = builds;

                                    return event;
                                });
                        })
                )
        );
    }

    /**
     * Get an instance of the EventFactory
     * @method getInstance
     * @param  {Object}     config
     * @param  {Datastore}  config.datastore    A datastore instance
     * @param  {Scm}        config.scm          A scm instance
     * @return {EventFactory}
     */
    static getInstance(config) {
        if (!instance && (!config || !config.scm)) {
            throw new Error('No scm plugin provided to EventFactory');
        }
        instance = BaseFactory.getInstance(EventFactory, instance, config);

        return instance;
    }
}

module.exports = EventFactory;
