'use strict';

const BaseFactory = require('./baseFactory');
const CommandTag = require('./commandTag');
let instance;

class CommandTagFactory extends BaseFactory {
    /**
     * Construct a CommandTagFactory object
     * @method constructor
     * @param  {Object}     config
     * @param  {Datastore}  config.datastore     Object that will perform operations on the datastore
     */
    constructor(config) {
        super('commandTag', config);
    }

    /**
     * Instantiate a CommandTag class
     * @method createClass
     * @param  {Object}     config               Command tag data
     * @param  {Datastore}  config.datastore     Object that will perform operations on the datastore
     * @param  {String}     config.namespace     The command namespace
     * @param  {String}     config.name          The command name
     * @param  {String}     config.tag           The command tag (e.g.: 'stable' or 'latest')
     * @param  {String}     config.version       Version of the command
     * @return {CommandTag}
     */
    createClass(config) {
        return new CommandTag(config);
    }

    /**
     * Get an instance of the CommandTagFactory
     * @method getInstance
     * @param  {Object}     config
     * @param  {Datastore}  config.datastore
     * @return {CommandTagFactory}
     */
    static getInstance(config) {
        instance = BaseFactory.getInstance(CommandTagFactory, instance, config);

        return instance;
    }

    /**
     * Create a new command tag for a given version
     * @method create
     * @param  {Object}     config
     * @param  {String}     config.name         The command name
     * @param  {String}     config.namespace    The command namespace
     * @param  {String}     config.tag          The command tag
     * @param  {String}     config.version      The command version
     * @return {Promise}
     */
    create(config) {
        config.createTime = (new Date()).toISOString();

        return super.create(config);
    }
}

module.exports = CommandTagFactory;
