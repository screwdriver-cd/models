'use strict';

const BaseModel = require('./base');

class CommandModel extends BaseModel {
    /**
     * Construct an CommandModel object
     * @method constructor
     * @param  {Object}   config                Config object to create the command with
     * @param  {Object}   config.datastore      Object that will perform operations on the datastore
     */
    constructor(config) {
        super('command', config);
    }
}

module.exports = CommandModel;
