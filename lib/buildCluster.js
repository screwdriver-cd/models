'use strict';

const BaseModel = require('./base');

class BuildClusterModel extends BaseModel {
    /**
     * Construct a BuildClusterModel object
     * @method constructor
     * @param {Object}  config
     * @param {String}  config.name                 The buildCluster name
     * @param {String}  config.scmContext           SCM context
     * @param {String}  config.scmOrganizations     An array of SCM organizations
     * @param {String}  config.managedByScrewdriver Managed by screwdriver or not
     * @param {Boolean} config.isActive=true        Whether the buildCluster is active
     * @param {String}  [config.description]        Description for the build cluster
     */
    constructor(config) {
        super('buildCluster', config); // data-schema model name
    }
}

module.exports = BuildClusterModel;
