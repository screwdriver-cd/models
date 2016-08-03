'use strict';
const Build = require('./build');
let build;

/**
 * Configure the build model for future getBuildModel executions
 * @method configureBuildModel
 * @param  {Object}            datastore Object that will perform operations on the datastore
 * @param  {Object}            executor  Object that will perform executor operations
 * @param  {String}            password  Login password
 */
function configureBuildModel(datastore, executor, password) {
    build = new Build(datastore, executor, password);
}

/**
 * Get an instance of the build model
 * @method getBuild
 * @return {Object} buildModel  Build model
 */
function getBuildModel() {
    return build;
}

module.exports = {
    configureBuildModel,
    getBuildModel
};
