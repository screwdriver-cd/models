'use strict';

const imageParser = require('docker-parse-image');
const hoek = require('hoek');
const BaseFactory = require('./baseFactory');
const Build = require('./build');
const helper = require('./helper');
let instance;

/**
 * Gathers a sha for the build
 * @method getCommitInfo
 * @param  {Object}         config
 * @param  {JobModel}       config.job                    Instance of Job Model
 * @param  {Scm}            config.scm                    Instance of SCM
 * @param  {Object}         config.modelConfig            Configuration passed to the build model
 * @param  {String}         [config.modelConfig.sha]      The sha we are ultimately looking for
 * @param  {String}         config.modelConfig.username   The name of the user
 * @param  {String}         config.modelConfig.scmContext The scm context to which user belongs
 * @return {Promise}
 */
function getCommitInfo(config) {
    if (config.modelConfig.sha) {
        return Promise.resolve({
            sha: config.modelConfig.sha
        });
    }

    // Lazy load factory dependency to prevent circular dependency issues
    // https://nodejs.org/api/modules.html#modules_cycles
    /* eslint-disable global-require */
    const UserFactory = require('./userFactory');
    /* eslint-enable global-require */

    const userFactory = UserFactory.getInstance();

    // Fetch user and pipeline
    return Promise.all([
        userFactory.get({
            username: config.modelConfig.username,
            scmContext: config.modelConfig.scmContext
        }),
        config.job.pipeline
    ]).then(([user, pipeline]) => {
        if (!user) {
            throw new Error('User does not exist');
        }

        if (!pipeline) {
            throw new Error('Pipeline does not exist');
        }

        return user.unsealToken().then(token =>
            config.scm
                .getCommitSha({
                    scmUri: pipeline.scmUri,
                    scmContext: pipeline.scmContext,
                    token
                })
                .then(sha =>
                    config.scm
                        .decorateCommit({
                            scmUri: pipeline.scmUri,
                            scmContext: pipeline.scmContext,
                            sha,
                            token
                        })
                        .then(decoratedCommit =>
                            Promise.resolve({
                                sha,
                                decoratedCommit
                            })
                        )
                )
        );
    });
}

/**
 * Determines the Docker image name to use depending on if a default registry is
 * configured.
 *
 * When the image name contains an explicit registry, it returns the passed-in
 * container value. When a default registry is _not_ configured for the BuildFactory,
 * it simply returns the passed-in container value.
 * @method dockerImageName
 * @param  {Object}        config
 * @param  {String}        config.container         Docker image name to use.
 * @param  {String}        [config.dockerRegistry]  Docker registry where the image is stored. Defaults to Docker Hub
 * @return {String}                                 The full image name to use
 */
function dockerImageName({ container, dockerRegistry }) {
    const imageInfo = imageParser(container);

    // skip if no default registry or the image contains a specific registry in the name
    if (!dockerRegistry || imageInfo.registry) {
        return container;
    }

    const updatedName = imageParser(`${dockerRegistry}/${container}`);

    return updatedName.fullname;
}

class BuildFactory extends BaseFactory {
    /**
     * Construct a JobFactory object
     * @method constructor
     * @param  {Object}    config
     * @param  {Datastore} config.datastore                 Object that will perform datastore operations
     * @param  {String}    [config.dockerRegistry]          Docker Registry that the images belong to. Default is Docker Hub
     * @param  {Executor}  config.executor                  Object that will perform compute operations
     * @param  {Bookend}   config.bookend                   Object that will calculate the setup and teardown commands
     * @param  {String}    config.uiUri                     Partial Uri including hostname and namespace for ui for git notifications
     * @param  {Boolean}   config.multiBuildClusterEnabled  Enable multiple build cluster feature or not
     * @param  {Object}    config.clusterEnv                Default cluster environment variables
     */
    constructor(config) {
        super('build', config);
        this.dockerRegistry = config.dockerRegistry;
        this.executor = config.executor;
        this.uiUri = config.uiUri;
        this.bookend = config.bookend;
        this.apiUri = null;
        this.tokenGen = null;
        this.multiBuildClusterEnabled = config.multiBuildClusterEnabled;
        this.clusterEnv = config.clusterEnv || {};
    }

    /**
     * Instantiate a Build class
     * @method createClass
     * @param  {Object}     config               Build data
     * @param  {String}     config.id            unique id
     * @param  {Datastore}  config.datastore     Datastore instance
     * @param  {String}     config.username      The user that created this build
     * @param  {String}     config.scmContext    The scm context to which user belongs
     * @param  {String}     config.jobId         The ID of the associated job to start
     * @param  {String}     [config.sha]         The sha of the build
     * @param  {String}     [config.container]   The kind of container to use
     * @return {Build}
     */
    createClass(config) {
        // add executor to config
        const c = config;

        c.executor = this.executor;
        c.apiUri = this.apiUri;
        c.tokenGen = this.tokenGen;
        c.uiUri = this.uiUri;

        return new Build(c);
    }

    /**
     * Create a new Build
     * @method create
     * @param  {Object}    config                      Config object
     * @param  {String}    config.causeMessage         Message that describes why the event was created
     * @param  {String}    config.eventId              The eventId that this build belongs to
     * @param  {String}    config.jobId                The job associated with this build
     * @param  {String}    config.username             The user that created this build
     * @param  {String}    config.scmContext           The scm context to which user belongs
     * @param  {String}    [config.sha]                The sha of the build
     * @param  {String}    [config.configPipelineSha]  The sha of the config pipeline
     * @param  {String}    [config.prRef]              The PR branch or reference
     * @param  {String}    [config.parentBuildId]      Id of the build that triggers this build
     * @param  {Object}    [config.parentBuilds]       Parent builds information
     * @param  {Boolean}   [config.start]              Whether to start the build after creating
     * @param  {Object}    [config.environment]        Dynamically injected environment variables
     * @param  {Object}    [config.meta]               Metadata tied to this build
     * @param  {Object}    [config.environment]        Preset environment variables
     * @return {Promise}
     */
    create(config) {
        const number = Date.now();
        const { jobId, configPipelineSha, start, meta, username, causeMessage } = config;
        const modelConfig = config;
        const displayLabel = this.scm.getDisplayName(config);
        const displayName = displayLabel ? `${displayLabel}:${username}` : username;

        modelConfig.cause = `Started by user ${displayName}`;
        modelConfig.number = number;
        modelConfig.status = start === false ? 'CREATED' : 'QUEUED';
        modelConfig.meta = meta || {};

        // Lazy load factory dependency to prevent circular dependency issues
        // https://nodejs.org/api/modules.html#modules_cycles
        /* eslint-disable global-require */
        const JobFactory = require('./jobFactory');
        const StepFactory = require('./stepFactory');
        /* eslint-enable global-require */
        const factory = JobFactory.getInstance();
        const stepFactory = StepFactory.getInstance();

        return factory.get(jobId).then(job => {
            if (!job) {
                throw new Error('Job does not exist');
            }

            return Promise.all([job.pipeline, getCommitInfo({ job, scm: this.scm, modelConfig })]).then(
                async ([pipeline, data]) => {
                    // TODO: support matrix jobs
                    const index = number.toString().split('.')[1] || 0;
                    const permutation = job.permutations[index];
                    const annotations = hoek.reach(job.permutations[0], 'annotations', { default: {} });
                    let buildClusterName;

                    if (String(this.multiBuildClusterEnabled) === 'true') {
                        buildClusterName = await helper.getBuildClusterName({
                            annotations,
                            pipeline
                        });
                    }

                    if (buildClusterName) {
                        modelConfig.buildClusterName = buildClusterName;
                    }
                    modelConfig.sha = data.sha;

                    if (data.decoratedCommit) {
                        modelConfig.commit = data.decoratedCommit;
                    }

                    modelConfig.container = dockerImageName({
                        container: permutation.image,
                        dockerRegistry: this.dockerRegistry
                    });

                    // merge preset environment with build environment
                    modelConfig.environment = {
                        ...this.clusterEnv,
                        ...modelConfig.environment,
                        ...permutation.environment
                    };

                    const bookendConfig = { pipeline, job, build: modelConfig };

                    if (pipeline.configPipelineId) {
                        bookendConfig.configPipeline = await pipeline.configPipeline;
                        bookendConfig.configPipelineSha = configPipelineSha;
                    }

                    const [setup, teardown] = await Promise.all([
                        this.bookend.getSetupCommands(bookendConfig),
                        this.bookend.getTeardownCommands(bookendConfig)
                    ]);

                    modelConfig.createTime = new Date(number).toISOString();
                    const steps = [
                        {
                            name: 'sd-setup-init',
                            startTime: modelConfig.createTime
                        },
                        // Launcher is hardcoded to do some business in sd-setup-launcher
                        { name: 'sd-setup-launcher' },
                        ...setup,
                        ...permutation.commands.map(command => ({
                            name: command.name,
                            command: command.command
                        })),
                        ...teardown
                    ];

                    modelConfig.templateId = job.templateId;

                    modelConfig.stats = {};

                    const build = await super.create(modelConfig);

                    // eslint-disable-next-line no-restricted-syntax
                    for (const step of steps) {
                        try {
                            // eslint-disable-next-line no-await-in-loop
                            await stepFactory.create({ buildId: build.id, ...step });
                        } catch (err) {
                            // eslint-disable-next-line max-len
                            throw new Error(`Error in steps -BuildId:${build.id}-step:${step}`, err);
                        }
                    }

                    if (start === false) {
                        return build;
                    }

                    return build.start({ causeMessage });
                }
            );
        });
    }

    /**
     * List secrets with pagination and filter options
     * @method list
     * @param  {Object}   config                  Config object
     * @param  {Object}   config.params           Parameters to filter on
     * @param  {Object}   config.paginate         Pagination parameters
     * @param  {Number}   config.paginate.count   Number of items per page
     * @param  {Number}   config.paginate.page    Specific page of the set to return
     * @param  {String}   config.sortBy           Key to sort builds table
     * @return {Promise}                          Resolve builds after merging with step models
     */
    list(config) {
        config.sortBy = config.sortBy || 'createTime';

        return super.list(config);
    }

    /**
     * Get an instance of the BuildFactory
     * @method getInstance
     * @param  {Object}     [config]            Configuration required for first call
     * @param  {Datastore}  config.datastore    Datastore instance
     * @param  {Executor}   config.executor     Executor instance
     * @param  {Scm}        config.scm          SCM instance
     * @return {BuildFactory}
     */
    static getInstance(config) {
        if (!instance && (!config || !config.executor)) {
            throw new Error('No executor provided to BuildFactory');
        }
        if (!instance && (!config || !config.uiUri)) {
            throw new Error('No uiUri provided to BuildFactory');
        }
        if (!instance && (!config || !config.scm)) {
            throw new Error('No scm plugin provided to BuildFactory');
        }
        if (!instance && (!config || !config.bookend)) {
            throw new Error('No bookend plugin provided to BuildFactory');
        }

        instance = BaseFactory.getInstance(BuildFactory, instance, config);

        return instance;
    }
}

module.exports = BuildFactory;
