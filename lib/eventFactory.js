'use strict';

const BaseFactory = require('./baseFactory');
const Event = require('./event');
const {
    TRIGGER,
    EXTERNAL_TRIGGER,
    COMMIT_TRIGGER,
    PR_TRIGGER,
    RELEASE_TRIGGER,
    TAG_TRIGGER
} = require('screwdriver-data-schema').config.regex;
const workflowParser = require('screwdriver-workflow-parser');
const winston = require('winston');
const _ = require('lodash');

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
 * @return {Array}                                          Array of commit jobs to start
 */
function getJobsFromTrigger(config) {
    const { jobs, pipelineConfig, startFrom, branch } = config;
    const shouldGetJobs = [
        EXTERNAL_TRIGGER.test(startFrom),
        COMMIT_TRIGGER.test(startFrom),
        RELEASE_TRIGGER.test(startFrom),
        TAG_TRIGGER.test(startFrom)
    ];

    if (!shouldGetJobs.some(t => t === true)) {
        return [];
    }

    let nextJobs = workflowParser.getNextJobs(pipelineConfig.workflowGraph, {
        trigger: startFrom
    });

    if (startFrom === '~commit') {
        nextJobs = nextJobs.concat(workflowParser.getNextJobs(pipelineConfig.workflowGraph, {
            trigger: `~commit:${branch}`
        }));
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

    return jobs.filter(j => j.name === startFrom && j.state === 'ENABLED' && !j.archived);
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
        nextJobs = nextJobs.concat(workflowParser.getNextJobs(pipelineConfig.workflowGraph, {
            trigger: `~pr:${branch}`,
            prNum,
            chainPR
        }));
    }

    const jobsToStart = jobs.filter(
        j => nextJobs.includes(j.name)
    );

    return jobsToStart.filter(j => j.state === 'ENABLED' && !j.archived);
}

/**
 * Starts the build if the changed file is part of the sourcePaths, or if there is no sourcePaths
 * @method startBuild
 * @param  {Object}   config                    configuration object
 * @param  {Object}   config.buildConfig        Build Config to create the build with
 * @param  {Array}    config.changedFiles       List of files that were changed
 * @param  {Array}    config.sourcePaths        List of soure paths
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
        sourcePaths,
        webhooks,
        isPR,
        decoratedCommit,
        rootDir
    } = config;
    let hasChangeInSourcePaths = true;

    buildConfig.environment = {};

    // Only check if sourcePaths or rootDir is set
    // and webhooks or is a PR
    if ((webhooks || isPR) && (sourcePaths || rootDir)) {
        if (!changedFiles) {
            throw new Error('Your SCM does not support Source Paths');
        }

        const paths = sourcePaths || [];

        // Add rootDir as a sourcePath if no sourcePaths
        if (rootDir && paths.length === 0) {
            paths.push(`${rootDir}/`);
        }

        hasChangeInSourcePaths = changedFiles.some(file =>
            paths.some((source) => {
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
            }));
    }

    buildConfig.meta = Object.assign({
        commit: {
            ...decoratedCommit,
            changedFiles: changedFiles ? changedFiles.join(',') : ''
        }
    }, buildConfig.meta);

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
 * @param  {Boolean}  [config.isPR]                          Is it PR?
 * @param  {Object}   [config.decoratedCommit]               Decorated commit object
 * @param  {Object}   [config.pipeline]                      Default pipeline config from databse
 * @param  {Object}   [config.pipelineConfig]                Current Pipeline config
 */
function createBuilds(config) {
    const {
        decoratedCommit,
        eventConfig,
        eventId,
        pipeline,
        pipelineConfig,
        changedFiles,
        webhooks,
        isPR
    } = config;
    const startFrom = eventConfig.startFrom;
    let rootDir = '';

    if (!startFrom) {
        return null;
    }

    // enable pipeline parameters feature
    if (pipeline.parameters && pipelineConfig.meta && pipelineConfig.meta.parameters) {
        const allowedPipelineParameters = _.keys(pipeline.parameters);
        const currentPipelineParameters = _.assign({},
            pipeline.parameters,
            pipelineConfig.meta.parameters);

        pipelineConfig.meta.parameters = _.pick(currentPipelineParameters,
            allowedPipelineParameters);
    }

    return Promise.all([
        pipeline.branch,
        pipeline.getJobs(),
        pipeline.rootDir
    ]).then(([branch, jobs, root]) => {
        rootDir = root;
        // When startFrom is ~commit, ~release, ~tag, ~sd@
        const jobsFromTrigger = getJobsFromTrigger({
            jobs,
            pipelineConfig,
            startFrom,
            branch
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

        return Promise.all([jobsFromTrigger, jobsFromJobName, jobsFromPR])
            .then(result => result.reduce((a, b) => a.concat(b)));
    })
        .then((jobsToStart) => {
            // No jobs to start (eg: when jobs are disabled or startFrom is not valid)
            if (jobsToStart.length === 0) {
                winston.info(`No jobs to start in event ${eventId}.`);

                return null;
            }

            // Start builds
            return Promise.all(jobsToStart.map((j) => {
                const buildConfig = Object.assign({
                    jobId: j.id,
                    eventId,
                    causeMessage: pipelineConfig.causeMessage
                }, eventConfig);

                buildConfig.configPipelineSha = pipelineConfig.configPipelineSha;

                return startBuild({
                    decoratedCommit,
                    buildConfig,
                    changedFiles,
                    sourcePaths: j.permutations[0].sourcePaths, // TODO: support matrix job
                    webhooks,
                    isPR,
                    rootDir
                });
            })).then((buildsCreated) => {
                const builds = buildsCreated.filter(b => b !== null);

                if (builds.length === 0) {
                    winston.info(`No jobs ever started in event ${eventId}.`);

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
 * @param  {String}         [config.eventConfig.prRef] PR ref
 * @resolves {Object}                                  Resolves with workflowGraph
 */
function getLatestWorkflowGraph(config) {
    const { pipeline, eventConfig } = config;

    if (eventConfig.prRef) {
        return pipeline.getConfiguration({
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

        return jobFactory.list({
            params: { pipelineId: pipeline.id, archived: false },
            search: { field: 'name', keyword: `PR-${eventConfig.prNum}:%` }
        })
            .then((chainedPRJobs) => {
                const nodes = workflowGraph.nodes;

                chainedPRJobs.forEach((job) => {
                    // Add jobId to workflowGraph.nodes
                    nodes.forEach((node) => {
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
     * @param  {String}  [config.parentBuildId]     Id of the build that starts this event
     * @param  {String}  [config.parentEventId]     Id of the parent event
     * @param  {String}  [config.workflowGraph]     workflowGraph of parentEvent if there is a parentEvent
     * @param  {Array}   [config.changedFiles]      Array of files that were changed
     * @param  {Boolean} [config.webhooks]          If the create came from a webhook (pr or push) or not
     * @param  {Object}  [config.meta]              Metadata tied to this event
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
        const { pipelineId, configPipelineSha, username, scmContext,
            parentEventId, sha, startFrom, changedFiles, webhooks,
            prInfo, prTitle, prRef, prNum, skipMessage, chainPR } = config;
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
            baseBranch: config.baseBranch || null
        };
        let prevChainPR = '';
        let decoratedCommit;

        return pipelineFactory.get(pipelineId)
            // Sync pipeline to make sure workflowGraph is generated
            .then((p) => {
                prevChainPR = p.chainPR;
                // Sync pipeline with the parentEvent sha and create jobs based on that sha
                if (parentEventId && !prRef) {
                    modelConfig.parentEventId = parentEventId;

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
                    return this._getCommitSha(p.configPipelineId)
                        .then((commitSha) => {
                            modelConfig.configPipelineSha = commitSha;

                            return p.sync(commitSha, chainPR);
                        });
                }

                return p.sync(null, chainPR);
            })
            .then((p) => {
                if (prevChainPR !== p.chainPR) {
                    // when chainPR was changed, sync PRs.
                    return p.syncPRs();
                }

                return p;
            })
            .then((p) => {
                if (prInfo && prInfo.url) {
                    modelConfig.pr.url = prInfo.url;
                }

                if (prTitle) {
                    modelConfig.pr.title = prTitle;
                }

                if (prRef) {
                    modelConfig.pr.ref = prRef;

                    return p.syncPR(prNum);
                }

                return p;
            })
            .then(pipeline => pipeline.token
                .then((token) => {
                    if (!modelConfig.creator) {
                        return this.scm.decorateAuthor({ // decorate user who creates this event
                            username,
                            scmContext,
                            token
                        }).then((creator) => {
                            modelConfig.creator = creator;

                            return this.scm.decorateCommit({
                                scmUri: pipeline.scmUri,
                                scmContext,
                                sha,
                                token
                            });
                        });
                    }

                    return this.scm.decorateCommit({
                        scmUri: pipeline.scmUri,
                        scmContext,
                        sha,
                        token
                    });
                })
                .then((commit) => {
                    decoratedCommit = commit;
                    modelConfig.commit = commit;
                    modelConfig.createTime = (new Date()).toISOString();

                    return getLatestWorkflowGraph({
                        pipeline,
                        eventConfig: config
                    });
                })
                .then(workflowGraph => updateWorkflowGraph({
                    pipeline,
                    eventConfig: config,
                    workflowGraph
                }))
                .then((updatedWorkflowGraph) => {
                    modelConfig.workflowGraph = updatedWorkflowGraph;

                    // create event model
                    return super.create(modelConfig);
                })
                .then((event) => {
                    if (modelConfig.type === 'pipeline') {
                        pipeline.lastEventId = event.id;
                    }

                    return pipeline.update().then((p) => {
                        // Skip creating & starting builds
                        if (skipMessage) {
                            return event;
                        }

                        // Start builds
                        return createBuilds({
                            decoratedCommit,
                            eventConfig: config,
                            eventId: event.id,
                            pipeline: p,
                            pipelineConfig: modelConfig,
                            isPR: !!prInfo,
                            changedFiles,
                            webhooks
                        });
                    }).then((builds) => {
                        event.builds = builds;

                        return event;
                    });
                })
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
