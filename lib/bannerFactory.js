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
     * @param {String}  config.message        The banner message
     * @param {String}  config.type           The banner message
     * @param {Number}  config.userId         The ID of the associated user
     * @param {Boolean} config.isActive       The banner message
     * @param {String}  config.type='info'    The banner message
     * @memberof BannerFactory
     */
    create(config) {
        if (!config.type) {
            config.type = 'info';
        }
        if (!config.isActive) {
            config.isActive = false;
        }

        // config.dateCreated = (new Date()).toISOString();
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
