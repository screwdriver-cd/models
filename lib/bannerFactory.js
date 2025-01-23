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
        
        
        if (config.scope === 'PIPELINE') {
            const pipeline = await PipelineFactory.getInstance().get(config.scopeId);

            if (!pipeline) {
                throw new Error(`Pipeline ${config.scopeId} does not exist`);
            }
        }
        if (config.scope === 'BUILD') {
            const build = await BuildFactory.getInstance().get(config.scopeId);

            if (!build) {
                throw new Error(`Build ${config.scopeId} does not exist`);
            }
        }

        config.createTime = new Date().toISOString();

        return super.create(config);
    }

    /**
     * Helper function to ensure scope and scopeId are set
     * @param {Object} banner
     * @return {Object} banner
     */
    _setScopeDefaults(banner) {
        if (!banner.scope) {
            banner.scope = 'GLOBAL';
        }
        if (!banner.scopeId) {
            banner.scopeId = null;
        }

        return banner;
    }

    /**
     * Retrieves a banner by its ID and sets default scope values.
     *
     * @param {number|string} id - The ID of the banner to retrieve.
     * @returns {Promise<Object>} A promise that resolves to the banner object with default scope values set.
     */
    async get(id) {
        const response = await super.get(id);

        return this._setScopeDefaults(response);
    }

    /**
     * Retrieves a list of banners and sets default scope values for each banner.
     *
     * @param {Object} config - The configuration object for the list request.
     * @returns {Promise<Array>} A promise that resolves to an array of banners with default scope values set.
     */
    async list(config) {
        const response = await super.list(config);

        return response.map(banner => this._setScopeDefaults(banner));
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
