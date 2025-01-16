'use strict';

const BaseFactory = require('./baseFactory');
const Banner = require('./banner');
const { config } = require('screwdriver-data-schema');

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
    create(config) {
        if (!config.type) {
            config.type = 'info';
        }
        if (!config.isActive) {
            config.isActive = false;
        }
        if (!config.scope) {
            config.scope = 'GLOBAL';
            config.scopeId = null;
        }
        if ((config.scope === 'PIPELINE' || config.scope === 'BUILD') && !config.scopeId) {
            throw new Error(`scopeId is required when scope is ${config.scope}`);
        }

        // when scope is PIPELINE - need to make sure that the pipeline ID is valid
        // when scope is BUILD - need to make sure that the build ID is valid
        // todo: update needs the same as well

        config.createTime = new Date().toISOString();

        return super.create(config);
    }

    async get(id) {
        const response = await super.get(id);
        // backward compatibility for banners that do not have scope
        if (!response.scope) {
            response.scope = 'GLOBAL';
        }
        // backward compatibility for banners that do not have scopeId
        if (!response.scopeId) {
            response.scopeId = null;
        }
        return response;
    }

    list(config) {
        const banners = [];
        return super.list(config).then (response => {
            response.forEach(banner => {
                // backward compatibility for banners that do not have scope
                if (!banner.scope) {
                    banner.scope = 'GLOBAL';
                }
                // backward compatibility for banners that do not have scopeId
                if (!banner.scopeId) {
                    banner.scopeId = null;
                }
                banners.push(banner);
            });
            return banners;
        });
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
