'use strict';

const BaseModel = require('./base');

class BuildClusterModel extends BaseModel {
    /**
     * Construct a BuildClusterModel object
     * @method constructor
     * @param {Object}  config
     * @param {String}  config.name                 The buildCluster name
     * @param {String}  config.scmContexts          An array of SCM contexts
     * @param {String}  config.scmOrganizations     An array of SCM organizations
     * @param {String}  config.managedByScrewdriver Managed by screwdriver or not
     * @param {Boolean} config.isActive=true        Whether the buildCluster is active
     * @param {Integer} config.weightage=100        Weight percentage for build cluster
     * @param {String}  [config.description]        Description for the build cluster
     */
    constructor(config) {
        super('buildCluster', config); // data-schema model name
    }
}

module.exports = BuildClusterModel;
