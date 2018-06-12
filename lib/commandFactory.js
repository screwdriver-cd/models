'use strict';

const BaseFactory = require('./baseFactory');
const Command = require('./command');
const compareVersions = require('compare-versions');
const schema = require('screwdriver-data-schema');
let instance;

const FULL_COMMAND_NAME_REGEX = schema.config.regex.FULL_COMMAND_NAME;
const EXACT_VERSION_REGEX = schema.config.regex.EXACT_VERSION;
const VERSION_REGEX = schema.config.regex.VERSION;

class CommandFactory extends BaseFactory {
    /**
     * Construct a CommandFactory object
     * @method constructor
     * @param  {Object}     config
     * @param  {Datastore}  config.datastore         Object that will perform operations on the datastore
     */
    constructor(config) {
        super('command', config);
    }

    /**
     * Instantiate a Command class
     * @method createClass
     * @param  {Object}     config               Command data
     * @param  {Datastore}  config.datastore     Object that will perform operations on the datastore
     * @param  {String}     config.namespace     The command namespace
     * @param  {String}     config.name          The command name
     * @param  {String}     config.version       Version of the command
     * @param  {String}     config.description   Description of the command
     * @param  {String}     config.maintainer    Maintainer's email
     * @param  {String}     config.format        Format of the command
     * @param  {Object}     config.habitat       Habitat config of the command
     * @param  {Object}     config.docker        Docker config of the command
     * @param  {Object}     config.binary        Binary config of the command
     * @param  {String}     config.pipelineId    pipelineId of the command
     * @return {Command}
     */
    createClass(config) {
        return new Command(config);
    }

    /**
     * Create a new command of the correct version (See schema definition)
     * @method create
     * @param  {Object}     config               Config object
     * @param  {Datastore}  config.datastore     Object that will perform operations on the datastore
     * @param  {String}     config.namespace     The command namespace
     * @param  {String}     config.name          The command name
     * @param  {String}     config.version       Version of the command
     * @param  {String}     config.description   Description of the command
     * @param  {String}     config.maintainer    Maintainer's email
     * @param  {String}     config.format        Format of the command
     * @param  {Object}     config.habitat       Habitat config of the command
     * @param  {Object}     config.docker        Docker config of the command
     * @param  {Object}     config.binary        Binary config of the command
     * @param  {String}     config.pipelineId    pipelineId of the command
     * @return {Promise}
     */
    create(config) {
        const [, major, minor] = VERSION_REGEX.exec(config.version);
        const searchVersion = minor ? `${major}${minor}` : major;

        return this.getCommand(`${config.namespace}/${config.name}@${searchVersion}`)
            .then((latest) => {
                if (!latest) {
                    config.version = minor ? `${major}${minor}.0` : `${major}.0.0`;
                } else {
                    // eslint-disable-next-line max-len
                    const [, latestMajor, latestMinor, latestPatch] = VERSION_REGEX.exec(latest.version);
                    const patch = parseInt(latestPatch.slice(1), 10) + 1;

                    config.version = `${latestMajor}${latestMinor}.${patch}`;
                }

                config.createTime = (new Date()).toISOString();

                return super.create(config);
            });
    }

    /**
     * Get a the latest command by config using the full command name
     * @method getCommand
     * @param  {String}     fullCommandName    Name of the command and the version or tag (e.g. chefdk/knife@1.2.3)
     * @return {Promise}                       Resolves command model or null if not found
     */
    getCommand(fullCommandName) {
        const [, commandNamespace, commandName, versionOrTag]
            = FULL_COMMAND_NAME_REGEX.exec(fullCommandName);
        const isExactVersion = EXACT_VERSION_REGEX.exec(versionOrTag);
        const isVersion = VERSION_REGEX.exec(versionOrTag);

        if (isExactVersion) {
            // Get a command using the exact command version
            return super.get({
                namespace: commandNamespace,
                name: commandName,
                version: versionOrTag
            });
        }

        // If tag is passed in, get the version from the tag
        if (versionOrTag && !isVersion) {
            // Lazy load factory dependency to prevent circular dependency issues
            // eslint-disable-next-line global-require
            const CommandTagFactory = require('./commandTagFactory');
            const commandTagFactory = CommandTagFactory.getInstance();

            // Get a command tag
            return commandTagFactory.get({
                namespace: commandNamespace,
                name: commandName,
                tag: versionOrTag
            })
                .then((commandTag) => {
                    // Return null if no command tag exists
                    if (!commandTag) {
                        return null;
                    }

                    // Get a command using the exact command version
                    return super.get({
                        namespace: commandNamespace,
                        name: commandName,
                        version: commandTag.version
                    });
                });
        }

        // Get all commands with the same name
        return super.list({ params: { namespace: commandNamespace, name: commandName } })
            .then((commands) => {
                // If no version provided, return the most recently published command
                if (!versionOrTag) {
                    return commands[0];
                }

                // Get commands that have versions beginning with the version given
                const filtered = commands.filter(command =>
                    command.version.startsWith(versionOrTag));

                // Sort commands by descending order
                filtered.sort((a, b) => compareVersions(b.version, a.version));

                // Return first filtered command or null if none
                return filtered[0] || null;
            });
    }

    /**
     * Get an instance of the CommandFactory
     * @method getInstance
     * @param  {Object}     config
     * @param  {Datastore}  config.datastore
     * @return {CommandFactory}
     */
    static getInstance(config) {
        instance = BaseFactory.getInstance(CommandFactory, instance, config);

        return instance;
    }
}

module.exports = CommandFactory;
