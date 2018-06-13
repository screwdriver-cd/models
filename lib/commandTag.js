'use strict';

const BaseModel = require('./base');

class CommandTagModel extends BaseModel {
    /**
     * Construct a CommandTagModel object
     * @method constructor
     * @param  {Object}    config
     * @param  {String}    config.createTime    The time the command tag was created
     * @param  {Object}    config.datastore     Object that will perform operations on the datastore
     * @param  {String}    config.namespace     The command namespace
     * @param  {String}    config.name          The command name
     * @param  {String}    config.tag           The command tag (e.g.: 'stable' or 'latest')
     * @param  {String}    config.version       Version of the command
     */
    constructor(config) {
        super('commandTag', config);
    }
}

module.exports = CommandTagModel;
