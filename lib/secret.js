'use strict';
const BaseModel = require('./base');

class SecretModel extends BaseModel {

    /**
     * Construct a SecretModel object
     * @method constructor
     * @param  {Object}   config                Config object to create the secret with
     * @param  {Object}   config.datastore      Object that will perform operations on the datastore
     * @param  {String}   config.pipelineId     Pipeline Id
     * @param  {String}   config.name           Secret name
     * @param  {String}   config.value          Secret value
     * @param  {Boolean}  config.allowInPR      Whether this secret can be shown in PR builds
     */
    constructor(config) {
        super('secret', config);
    }
}

module.exports = SecretModel;
