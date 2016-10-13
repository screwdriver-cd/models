'use strict';

const BaseFactory = require('./baseFactory');
const Pipeline = require('./pipeline');
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
     * @param  {String}    config.id            Unique id
     * @param  {Object}    config.admins        Hash of admin usernames
     * @param  {String}    config.scmUri        Uri of source
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
     * @param  {String}   config.checkoutUrl    The checkoutUrl for the application
     * @return {Promise}
     */
    create(config) {
        return this.scm.parseUrl(config.checkoutUrl)
        .then((scmUri) => {
            const modelConfig = {
                admins: config.admins,
                scmUri
            };

            modelConfig.createTime = (new Date()).toISOString();

            return super.create(modelConfig);
        });
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
