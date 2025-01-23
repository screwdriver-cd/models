'use strict';

const BaseFactory = require('./baseFactory');
const PipelineFactory = require('./pipelineFactory');
const BuildFactory = require('./buildFactory');
const Banner = require('./banner');

let instance;

class BannerFactory extends BaseFactory {
    /**
     * Construct a BannerFactory object
     * @method constructor
     * @param {Object} config
     * @param {Object} config.datastore     Object that will perform operations on the datastore
     */
    constructor(config) {
        super('banner', config); // data-schema model name
    }

    /**
     * Instantiate a Banner class
     * @method createClass
     * @param {Object} config
     * @return {Banner}
     */
    createClass(config) {
        return new Banner(config);
    }

    /**
     * Create a Banner model
     * @param {Object}  config
     * @param {String}  config.message             The banner message
     * @param {String}  config.createdBy           The username of the associated user
     * @param {Boolean} [config.isActive=false]    Whether the banner is active
     * @param {String}  [config.type='info']       Type of banner (info|warn|etc)
     * @param {String}  [config.scope='GLOBAL']    Scope of the banner (GLOBAL|PIPELINE|BUILD)
     * @memberof BannerFactory
     */
    async create(config) {
        if (!config.type) {
            config.type = 'info';
        }
        if (!config.isActive) {
            config.isActive = false;
        }

        const scopeFactories = {
            PIPELINE: PipelineFactory,
            BUILD: BuildFactory
        };

        if (scopeFactories[config.scope]) {
            const factory = scopeFactories[config.scope];
            const scopeInstance = await factory.getInstance().get(config.scopeId);

            if (!scopeInstance) {
                throw new Error(
                    `${config.scope.charAt(0) + config.scope.slice(1).toLowerCase()} ${config.scopeId} does not exist`
                );
            }
        }

        config.createTime = new Date().toISOString();

        return super.create(config);
    }

    /**
     * Get an instance of BannerFactory
     * @method getInstance
     * @param {Object} config
     * @return {BannerFactory}
     */
    static getInstance(config) {
        instance = BaseFactory.getInstance(BannerFactory, instance, config);

        return instance;
    }
}

module.exports = BannerFactory;
