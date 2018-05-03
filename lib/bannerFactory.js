'use strict';

const BaseFactory = require('./baseFactory');
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
     * @param {String}  config.createTime          The time the banner is created
     * @param {Boolean} [config.isActive=false]     Whether the banner is active
     * @param {String}  [config.type='info']       Type of banner (info|warn|etc)
     * @memberof BannerFactory
     */
    create(config) {
        if (!config.type) {
            config.type = 'info';
        }
        if (!config.isActive) {
            config.isActive = false;
        }

        config.createTime = (new Date()).toISOString();

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
