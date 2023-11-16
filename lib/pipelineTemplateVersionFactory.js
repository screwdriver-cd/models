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
        const [, configMajor, configMinor] = VERSION_REGEX.exec(config.version);

        // get the template meta
        let pipelineTemplateMeta = await templateMetaFactory.get({
            name: config.name,
            namespace: config.namespace
        });

        // if template meta doesn't exist, create one
        if (!pipelineTemplateMeta) {
            pipelineTemplateMeta = await templateMetaFactory.create({
                pipelineId: config.pipelineId,
                namespace: config.namespace,
                name: config.name,
                maintainer: config.maintainer,
                createTime,
                updateTime: createTime
            });
        }

        let newVersion = configMinor ? `${configMajor}${configMinor}.0` : `${configMajor}.0.0`;

        if (pipelineTemplateMeta.latestVersion) {
            // list all the versions of the template
            const pipelineTemplateVersions = await super.list({
                params: {
                    templateId: pipelineTemplateMeta.id,
                    sort: 'descending',
                    sortBy: 'createTime'
                }
            });

            if (pipelineTemplateVersions.length > 0) {
                // get latest version that have version starting with config.version
                const pipelineTemplateVersion = pipelineTemplateVersions.find(template => {
                    const [, major, minor] = VERSION_REGEX.exec(template.version);

                    return major === configMajor && minor === configMinor;
                });

                if (pipelineTemplateVersion) {
                    const [, targetMajor, targetMinor, targetPatch] = VERSION_REGEX.exec(
                        pipelineTemplateVersion.version
                    );
                    const patch = parseInt(targetPatch.slice(1), 10) + 1;

                    newVersion = `${targetMajor}${targetMinor}.${patch}`;
                }
            }
        }

        const newPipelineTemplateVersion = await super.create({
            templateId: pipelineTemplateMeta.id,
            description: config.description,
            config: config.config,
            createTime,
            version: newVersion
        });

        const latestVersion = pipelineTemplateMeta.latestVersion || '0.0.0';
        const [, latestMajor, latestMinor, latestPatch] = EXACT_VERSION_REGEX.exec(latestVersion);
        const [, major, minor, patch] = EXACT_VERSION_REGEX.exec(newVersion);

        if (
            major > latestMajor ||
            (major === latestMajor && minor >= latestMinor) ||
            (major === latestMajor && minor === latestMinor && patch > latestPatch)
        ) {
            pipelineTemplateMeta.latestVersion = newPipelineTemplateVersion.version;
            pipelineTemplateMeta.updateTime = new Date().toISOString();
            await pipelineTemplateMeta.update();
        }

        return newPipelineTemplateVersion;
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
