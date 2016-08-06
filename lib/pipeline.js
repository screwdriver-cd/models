'use strict';
const BaseModel = require('./base');
const JobFactory = require('./jobFactory');
const schema = require('screwdriver-data-schema');
const MATCH_COMPONENT_BRANCH_NAME = 4;

class PipelineModel extends BaseModel {
    /**
     * Construct a PipelineModel object
     * @method constructor
     * @param  {Object}   config                Config object to create the pipeline with
     * @param  {Object}   config.datastore      Object that will perform operations on the datastore
     * @param  {Object}   config.admins         The admins of this repository
     * @param  {String}   config.scmUrl         The scmUrl for the application
     * @param  {String}   config.createTime     The time the pipeline was created
     * @param  {String}   config.configUrl      The configUrl for the application
     */
    constructor(config) {
        super('pipeline', config);
    }

    /**
     * Sync the pipeline by looking up what is currently in yaml and create or delete
     * jobs if necessary. Right now, this simply creates the job 'main'.
     * @method sync
     * @return {Promise}
     */
    // TODO: make this so that it looks up the yaml & create/delete jobs if necessary
    sync() {
        const factory = new JobFactory(this.datastore);
        const jobConfig = {
            pipelineId: this.id,
            name: 'main'
        };

        return factory.create(jobConfig);
    }

    /**
     * Format the scm url to include a branch and make case insensitive
     * @method formatScmUrl
     * @param  {String}     scmUrl Github scm url
     * @return {String}            Lowercase scm url with branch name
     */
    formatScmUrl(scmUrl) {
        let result = scmUrl;
        const matched = (schema.config.regex.SCM_URL).exec(result);
        let branchName = matched[MATCH_COMPONENT_BRANCH_NAME];

        // Check if branch name exists
        if (!branchName) {
            branchName = '#master';
        }

        // Do not convert branch name to lowercase
        result = result.split('#')[0].toLowerCase().concat(branchName);

        return result;
    }

    /**
     * Fetch the build admin
     * @property admin
    */
    // TODO: Get the first admin. Validate if it's valid. If not, remove from admins field,
    //       and retry with the next admin.
    get admin() {
        return Object.keys(this.admins)[0];
    }
}

module.exports = PipelineModel;
