'use strict';

const BaseFactory = require('./baseFactory');
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
     * @param  {String}    [config.configUrl]   url of configuration
     * @return {Pipeline}
     */
    createClass(config) {
        return new Pipeline(config);
    }

    /**
     * Create a new pipeline
     * @method create
     * @param  {Object}   config                Config object
     * @param  {Object}   config.admins         The admins of this repository
     * @param  {String}   config.scmUrl         The scmUrl for the application
     * @param  {String}   [config.configUrl]    The configUrl for the application
     * @return {Promise}
     */
    create(config) {
        const modelConfig = hoek.applyToDefaults({
            createTime: (new Date()).toISOString(),
            configUrl: config.scmUrl
        }, config);

        return super.create(modelConfig);
    }

    /**
     * Get an instance of the PipelineFactory
     * @method getInstance
     * @param  {Object}     config
     * @param  {Datastore}  config.datastore    A datastore instance
     * @param  {Datastore}  config.scmPlugin    A scm plugin instance
     * @return {PipelineFactory}
     */
    static getInstance(config) {
        instance = BaseFactory.getInstance(PipelineFactory, instance, config);

        return instance;
    }
}

module.exports = PipelineFactory;
