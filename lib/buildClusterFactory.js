'use strict';

const BaseFactory = require('./baseFactory');
const BuildCluster = require('./buildCluster');

let instance;

class BuildClusterFactory extends BaseFactory {
    /**
     * Construct a BuildClusterFactory object
     * @method constructor
     * @param {Object} config
     * @param {Object} config.datastore     Object that will perform operations on the datastore
     */
    constructor(config) {
        super('buildCluster', config); // data-schema model name
    }

    /**
     * Instantiate a buildCluster class
     * @method createClass
     * @param {Object} config
     * @return {buildCluster}
     */
    createClass(config) {
        return new BuildCluster(config);
    }

    /**
     * Create a buildCluster model
     * @param {Object}  config
     * @param {String}  config.name                 The buildCluster name
     * @param {String}  config.scmContext           SCM context
     * @param {String}  config.scmOrganizations     An array of SCM organizations
     * @param {String}  config.managedByScrewdriver Managed by screwdriver or not
     * @param {Boolean} [config.isActive=true]      Whether the buildCluster is active
     * @param {String}  [config.description]        Description for the build cluster
     * @param {Integer} [config.weightage=100]          Weight percentage for build cluster
     * @memberof BuildClusterFactory
     */
    create(config) {
        if (!config.isActive) {
            config.isActive = true;
        }

        if (!config.weightage && config.weightage !== 0) {
            config.weightage = 100;
        }

        return super.create(config);
    }

    /**
     * Get an instance of BuildClusterFactory
     * @method getInstance
     * @param {Object} config
     * @return {BuildClusterFactory}
     */
    static getInstance(config) {
        instance = BaseFactory.getInstance(BuildClusterFactory, instance, config);

        return instance;
    }
}

module.exports = BuildClusterFactory;
