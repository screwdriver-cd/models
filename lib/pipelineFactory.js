'use strict';

const BaseFactory = require('./baseFactory');
const Pipeline = require('./pipeline');
let instance;

class PipelineFactory extends BaseFactory {
    /**
     * Construct a JobFactory object
     * @method constructor
     * @param  {Object}    config
     * @param  {Object}    config.datastore                     Object that will perform operations on the datastore
     * @param  {Boolean}   config.multiBuildClusterEnabled      Enable multiple build cluster feature or not
     * @param  {Boolean}   config.externalJoin                  Flag to allow external join
     * @param  {Boolean}   config.notificationsValidationErr    Flag to throw error for notification validation or not
     */
    constructor(config) {
        super('pipeline', config);
        this.multiBuildClusterEnabled = config.multiBuildClusterEnabled;
        this.externalJoin = config.externalJoin || false;
        this.notificationsValidationErr = config.notificationsValidationErr;
    }

    /**
     * Instantiate a Pipeline class
     * @method createClass
     * @param  {Object}    config               Pipeline data
     * @param  {Object}    config.datastore     Object that will perform operations on the datastore
     * @param  {String}    config.id            Unique id
     * @param  {Object}    config.admins        Hash of admin usernames
     * @param  {String}    config.scmUri        Uri of source
     * @param  {String}    config.scmContext    The scm context to which user belongs
     * @return {Pipeline}
     */
    createClass(config) {
        config.multiBuildClusterEnabled = this.multiBuildClusterEnabled;

        return new Pipeline(config);
    }

    /**
     * Create a new pipeline
     * @method create
     * @param  {Object}   config                Config object
     * @param  {Object}   config.admins         The admins of this repository
     * @param  {String}   config.scmUri         The scmUri for the application
     * @param  {String}   config.scmContext     The scm context to which user belongs
     * @param  {String}   [config.scmToken]     The scm token for this repository
     * @return {Promise}
     */
    async create(config) {
        let { scmToken } = config;
        const modelConfig = config;

        modelConfig.createTime = new Date().toISOString();
        modelConfig.state = 'ACTIVE';

        if (!scmToken) {
            // Lazy load factory dependency to prevent circular dependency issues
            // https://nodejs.org/api/modules.html#modules_cycles
            /* eslint-disable global-require */
            const UserFactory = require('./userFactory');
            /* eslint-enable global-require */

            const userFactory = UserFactory.getInstance();
            const user = await userFactory.get({
                username: Object.keys(config.admins)[0],
                scmContext: config.scmContext
            });

            scmToken = await user.unsealToken();
        }

        const scmRepo = await this.scm.decorateUrl({
            scmUri: config.scmUri,
            scmContext: config.scmContext,
            token: scmToken
        });

        modelConfig.scmRepo = scmRepo;
        modelConfig.name = scmRepo.name;

        return super.create(modelConfig);
    }

    /**
     * Get a pipeline model by id, or personal access token
     * @method get
     * @param   {Mixed}     config
     * @param   {String}    [config.id]             ID of the pipeline
     * @param   {String}    [config.accessToken]    Access token of the pipeline to look up
     * @return  {Promise}
     */
    get(config) {
        if (!config.accessToken) {
            return super.get(config);
        }

        // Lazy load factory dependency to prevent circular dependency issues
        // https://nodejs.org/api/modules.html#modules_cycles
        /* eslint-disable global-require */
        const TokenFactory = require('./tokenFactory');
        /* eslint-enable global-require */
        const tokenFactory = TokenFactory.getInstance();

        return tokenFactory.get({ value: config.accessToken }).then(token => {
            if (!token) {
                return token;
            }

            token.lastUsed = new Date().toISOString();

            return token.update().then(() => this.get(token.pipelineId));
        });
    }

    /**
     * Return external join flag
     * @return {Boolean}
     */
    getExternalJoinFlag() {
        return this.externalJoin;
    }

    /**
     * Return notification validation error flag
     * @return {Boolean}
     */
    getNotificationsValidationErrFlag() {
        return this.notificationsValidationErr;
    }

    /**
     * Get an instance of the PipelineFactory
     * @method getInstance
     * @param  {Object}     config
     * @param  {Datastore}  config.datastore    A datastore instance
     * @param  {Datastore}  config.scm          A scm instance
     * @return {PipelineFactory}
     */
    static getInstance(config) {
        if (!instance && (!config || !config.scm)) {
            throw new Error('No scm plugin provided to PipelineFactory');
        }
        instance = BaseFactory.getInstance(PipelineFactory, instance, config);

        return instance;
    }
}

module.exports = PipelineFactory;
