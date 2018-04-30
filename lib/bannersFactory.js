'use strict';

const BaseFactory = require('./baseFactory');
const Banners = require('./banners');

let instance;

class BannersFactory extends BaseFactory {
    /**
     * Construct a BannersFactory object
     * @method constructor
     * @param {Object} config
     * @param {Object} config.datastore     Object that will perform operations on the datastore
     */
    constructor(config) {
        super('banner', config); // data-schema model name
    }

    /**
     * Instantiate a Banners class
     * @method createClass
     * @param {Object} config
     * @return {Banners}
     */
    createClass(config) {
        return new Banners(config);
    }

    /**
     * Create a Banners model
     * @param {Object}  config
     * @param {String}  config.message        The banner message
     * @param {String}  config.type           The banner message
     * @param {Number}  config.userId         The ID of the associated user
     * @param {Boolean} config.isActive       The banner message
     * @param {String}  config.type='info'    The banner message
     * @memberof BannersFactory
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
     * Get an instance of BannersFactory
     * @method getInstance
     * @param {Object} config
     * @return {BannersFactory}
     */
    static getInstance(config) {
        instance = BaseFactory.getInstance(BannersFactory, instance, config);

        return instance;
    }
}

module.exports = BannersFactory;
