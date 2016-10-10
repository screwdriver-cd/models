'use strict';

const BaseFactory = require('./baseFactory');
const UserFactory = require('./userFactory');
const Pipeline = require('./pipeline');
const hoek = require('hoek');
let instance;

class PipelineFactory extends BaseFactory {
    /**
     * Construct a JobFactory object
     * @method constructor
     * @param  {Object}    config
     * @param  {Object}    config.datastore         Object that will perform operations on the datastore
     */
    constructor(config) {
        super('pipeline', config);
    }

    /**
     * Instantiate a Pipeline class
     * @method createClass
     * @param  {Object}    config               Pipeline data
     * @param  {Object}    config.datastore     Object that will perform operations on the datastore
     * @param  {String}    config.id            unique id
     * @param  {Object}    config.admins        hash of admin usernames
     * @param  {String}    config.scmUrl        url of source
     * @return {Pipeline}
     */
    createClass(config) {
        return new Pipeline(config);
    }

    /**
     * Fetch the user object based on the username.
     * @method getUser
     * @param  {String} name  The user name for fetching the user object
     * @return {Promise}
     */
    getUser(name) {
        const factory = UserFactory.getInstance();

        return factory.get({ username: name });
    }

    /**
     * Get the SCM Repo based on the SCM URL
     * @method getScmRepo
     * @param  {User}    user     The admin object for the repository of the scmUrl
     * @param  {String}  scmUrl   The scmUrl for the SCM Repo object
     * @return {Promise}
     */
    getScmRepo(user, scmUrl) {
        return user.unsealToken()
            .then(token =>
                this.scmPlugin.getRepoId({
                    scmUrl,
                    token
                })
            );
    }

    /**
     * Create a new pipeline
     * @method create
     * @param  {Object}   config                Config object
     * @param  {Object}   config.admins         The admins of this repository
     * @param  {String}   config.scmUrl         The scmUrl for the application
     * @return {Promise}
     */
    create(config) {
        const modelConfig = hoek.applyToDefaults({
            createTime: (new Date()).toISOString()
        }, config);
        const admin = this.getUser(config.admins[0]);

        return admin.then(user => this.getScmRepo(user, config.scmUrl))
            .then(repo => {
                modelConfig.scmRepo = repo;

                return repo;
            })
            .then(scmRepo => this.get({ scmRepo }))
            // see if there is already a pipeline
            .then(pipeline => {
                if (pipeline) {
                    throw new Error('scmUrl needs to be unique');
                }
            })
            .then(() => super.create(modelConfig));
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
