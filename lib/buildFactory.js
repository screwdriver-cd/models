'use strict';

const BaseFactory = require('./baseFactory');
const Build = require('./build');
const imageParser = require('docker-parse-image');
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

        return user.unsealToken()
            .then(token => config.scm.getCommitSha({
                scmUri: pipeline.scmUri,
                scmContext: pipeline.scmContext,
                token
            })
                .then(sha =>
                    config.scm.decorateCommit({
                        scmUri: pipeline.scmUri,
                        scmContext: pipeline.scmContext,
                        sha,
                        token
                    })
                        .then(decoratedCommit => Promise.resolve({
                            sha,
                            decoratedCommit
                        }))
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
     * @param  {Datastore} config.datastore         Object that will perform datastore operations
     * @param  {String}    [config.dockerRegistry]  Docker Registry that the images belong to. Default is Docker Hub
     * @param  {Executor}  config.executor          Object that will perform compute operations
     * @param  {Bookend}   config.bookend           Object that will calculate the setup and teardown commands
     * @param  {String}    config.uiUri             Partial Uri including hostname and namespace for ui for git notifications
     */
    constructor(config) {
        super('build', config);
        this.dockerRegistry = config.dockerRegistry;
        this.executor = config.executor;
        this.uiUri = config.uiUri;
        this.bookend = config.bookend;
        this.apiUri = null;
        this.tokenGen = null;
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
     * @param  {Object}    config                   Config object
     * @param  {String}    config.eventId           The eventId that this build belongs to
     * @param  {String}    config.jobId             The job associated with this build
     * @param  {String}    config.username          The user that created this build
     * @param  {String}    config.scmContext        The scm context to which user belongs
     * @param  {String}    [config.sha]             The sha of the build
     * @param  {String}    [config.prRef]           The PR branch or reference
     * @param  {String}    [config.parentBuildId]   Id of the build that triggers this build
     * @param  {Boolean}   [config.start]           Whether to start the build after creating
     * @return {Promise}
     */
    create(config) {
        const number = Date.now();
        const modelConfig = config;
        const displayLabel = this.scm.getDisplayName(config);
        const displayName = displayLabel ? `${displayLabel}:${config.username}` : config.username;

        modelConfig.cause = `Started by user ${displayName}`;
        modelConfig.number = number;
        modelConfig.status = 'QUEUED';

        // Lazy load factory dependency to prevent circular dependency issues
        // https://nodejs.org/api/modules.html#modules_cycles
        /* eslint-disable global-require */
        const JobFactory = require('./jobFactory');
        /* eslint-enable global-require */
        const factory = JobFactory.getInstance();

        return factory.get(config.jobId)
            .then((job) => {
                if (!job) {
                    throw new Error('Job does not exist');
                }

                return Promise.all([
                    job.pipeline,
                    getCommitInfo({ job, scm: this.scm, modelConfig })
                ]).then(([pipeline, data]) => {
                    // TODO: support matrix jobs
                    const index = number.toString().split('.')[1] || 0;
                    const permutation = job.permutations[index];

                    modelConfig.sha = data.sha;

                    if (data.decoratedCommit) {
                        modelConfig.commit = data.decoratedCommit;
                    }

                    modelConfig.container = dockerImageName({
                        container: permutation.image,
                        dockerRegistry: this.dockerRegistry
                    });
                    modelConfig.environment = permutation.environment;
                    modelConfig.steps = permutation.commands.map(command => ({
                        name: command.name,
                        command: command.command
                    }));

                    const bookendConfig = { pipeline, job, build: modelConfig };

                    return Promise.all([
                        this.bookend.getSetupCommands(bookendConfig),
                        this.bookend.getTeardownCommands(bookendConfig)
                    ]).then(([setup, teardown]) => {
                        modelConfig.steps = setup.concat(modelConfig.steps, teardown);
                        // Launcher is hardcoded to do some business in sd-setup-launcher
                        modelConfig.steps.unshift({ name: 'sd-setup-launcher' });
                        modelConfig.createTime = (new Date(number)).toISOString();

                        return super.create(modelConfig);
                    });
                })
                    .then((build) => {
                        if (config.start === false) {
                            return build;
                        }

                        return build.start();
                    });
            });
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
