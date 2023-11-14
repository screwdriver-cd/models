'use strict';

const schema = require('screwdriver-data-schema');
const BaseFactory = require('./baseFactory');
const PipelineTemplateVersionModel = require('./pipelineTemplateVersion');
const EXACT_VERSION_REGEX = schema.config.regex.EXACT_VERSION;
const VERSION_REGEX = schema.config.regex.VERSION;
let instance;

class PipelineTemplateVersionFactory extends BaseFactory {
    /**
     * Construct a TemplateFactory object
     * @method constructor
     * @param  {Object}     config
     * @param  {Datastore}  config.datastore         Object that will perform operations on the datastore
     */
    constructor(config) {
        super('pipelineTemplateVersions', config);
    }

    /**
     * Instantiate a PipelineTemplateVersionModel class
     * @method createClass
     * @param  {Object}     config               Template data
     * @param  {Datastore}  config.datastore     Object that will perform operations on the datastore
     * @param  {String}     config.name          The template name
     * @param  {String}     config.namespace   The template namespace
     * @param  {String}     config.version       Version of the template
     * @param  {String}     config.description   Description of the template
     * @param  {String}     config.maintainer    Maintainer's email
     * @param  {Object}     config.config        Config of the screwdriver-template.yaml
     * @param  {String}     config.pipelineId    pipelineId of the template
     * @return {PipelineTemplateVersionModel}
     */
    createClass(config) {
        return new PipelineTemplateVersionModel(config);
    }

    /**
     * Create a new template of the correct version (See schema definition)
     * @method create
     * @param  {Object}     config               Config object
     * @param templateMetaFactory
     * @param  {Datastore}  config.datastore     Object that will perform operations on the datastore
     * @param  {String}     config.name          The template name
     * @param  {String}     config.namespace   The template namespace
     * @param  {String}     config.version       Version of the template
     * @param  {String}     config.description   Description of the template
     * @param  {String}     config.maintainer    Maintainer's email
     * @param  {Object}     config.config        Config of the screwdriver-template.yaml
     * @param  {String}     config.pipelineId    pipelineId of the template
     * @return {Promise}
     */
    async create(config, templateMetaFactory) {
        const createTime = new Date().toISOString();

        let pipelineTemplate = await templateMetaFactory.get({
            name: config.name,
            namespace: config.namespace
        });

        if (!pipelineTemplate) {
            pipelineTemplate = await templateMetaFactory.create({
                pipelineId: config.pipelineId,
                namespace: config.namespace,
                name: config.name,
                maintainer: config.maintainer,
                createTime,
                updateTime: createTime
            });
        }

        const exactVersionMatch = EXACT_VERSION_REGEX.exec(config.version);
        let versionedConfig = null;

        if (exactVersionMatch) {
            versionedConfig = await this.get({
                templateId: pipelineTemplate.id,
                version: config.version
            });
        }

        const currentVersion = versionedConfig ? versionedConfig.version : config.version;
        const [, configMajor, configMinor] = VERSION_REGEX.exec(currentVersion);
        let newVersion;
        let patch;

        if (exactVersionMatch) {
            newVersion = currentVersion;
        } else if (!pipelineTemplate.latestVersion) {
            newVersion = configMinor ? `${configMajor}${configMinor}.0` : `${configMajor}.0.0`;
        } else {
            const [, globalMajor, globalMinor, globalPatch] = VERSION_REGEX.exec(pipelineTemplate.latestVersion);
            const patchVersion = globalPatch || '.0';

            patch = parseInt(patchVersion.slice(1), 10) + 1;
            newVersion = `${globalMajor}${globalMinor}.${patch}`;
        }

        const pipelineTemplateVersionModel = await super.create({
            templateId: pipelineTemplate.id,
            description: config.description,
            config: config.config,
            createTime,
            version: newVersion
        });

        const [, latestMajor, latestMinor, latestPatch] = newVersion;
        const [, major, minor] = VERSION_REGEX.exec(pipelineTemplateVersionModel.version);

        if (
            major > latestMajor ||
            (major === latestMajor && minor >= latestMinor) ||
            (major === latestMajor && minor === latestMinor && patch > latestPatch)
        ) {
            pipelineTemplate.latestVersion = pipelineTemplateVersionModel.version;
            pipelineTemplate.updateTime = new Date().toISOString();
            await pipelineTemplate.update();
        }

        return pipelineTemplateVersionModel;
    }

    /**
     * Get an instance of the PipelineTemplateVersionFactory
     * @method getInstance
     * @param  {Object}     config
     * @param  {Datastore}  config.datastore
     * @return {PipelineTemplateVersionFactory}
     */
    static getInstance(config) {
        instance = BaseFactory.getInstance(PipelineTemplateVersionFactory, instance, config);

        return instance;
    }
}

module.exports = PipelineTemplateVersionFactory;
