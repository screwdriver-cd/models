'use strict';

const schema = require('screwdriver-data-schema');
const BaseFactory = require('./baseFactory');
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
     * Instantiate a Template class
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
     * @return {PipelineTemplateVersionFactory}
     */
    createClass(config) {
        return new PipelineTemplateVersionFactory(config);
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

    create(config, templateMetaFactory) {
        const createTime = new Date().toISOString();

        templateMetaFactory
            .get({
                name: config.name,
                namespace: config.namespace
            })
            .then(pipelineTemplate => {
                if (!pipelineTemplate) {
                    return templateMetaFactory.create({
                        pipelineId: config.pipelineId,
                        namespace: config.namespace,
                        name: config.name,
                        maintainer: config.maintainer,
                        createTime,
                        updateTime: createTime
                    });
                }

                return pipelineTemplate;
            })
            .then(pipelineTemplate => {
                const isExactVersion = EXACT_VERSION_REGEX.exec(config.version);

                if (isExactVersion) {
                    return this.get({
                        templateId: pipelineTemplate.id,
                        version: config.version
                    }).then(versionedConfig => {
                        return { pipelineTemplate, versionedConfig };
                    });
                }

                return { pipelineTemplate, versionedConfig: null };
            })
            .then(result => {
                const { pipelineTemplate, versionedConfig } = result;
                const [, configMajor, configMinor] = VERSION_REGEX.exec(config.version);

                let newVersion;

                if (!versionedConfig) {
                    const { latestVersion } = pipelineTemplate;

                    if (!latestVersion) {
                        newVersion = configMinor ? `${configMajor}${configMinor}.0` : `${configMajor}.0.0`;
                    } else {
                        const [, globalMajor, globalMinor, globalPatch] = VERSION_REGEX.exec(latestVersion);
                        const patch = parseInt(globalPatch.slice(1), 10) + 1;

                        newVersion = `${globalMajor}${globalMinor}.${patch}`;
                    }
                } else {
                    const [, exactMajor, exactMinor, exactPatch] = VERSION_REGEX.exec(config.version);
                    const newPatch = parseInt(exactPatch.slice(1), 10) + 1;

                    newVersion = `${exactMajor}${exactMinor}.${newPatch}`;
                }

                const pipelineTemplateVersion = PipelineTemplateVersionFactory.create({
                    templateId: pipelineTemplate.id,
                    description: config.description,
                    config: config.config,
                    createTime,
                    version: newVersion
                });

                return { pipelineTemplateVersion, pipelineTemplate };
            })
            .then(result => {
                const { pipelineTemplate, pipelineTemplateVersion } = result;
                const [, latestMajor, latestMinor] = VERSION_REGEX.exec(pipelineTemplate.latestVersion);
                const [, major, minor] = VERSION_REGEX.exec(pipelineTemplateVersion.version);

                if (major > latestMajor || (major === latestMajor && minor >= latestMinor)) {
                    pipelineTemplate.latestVersion = pipelineTemplateVersion.version;
                    pipelineTemplate.updateTime = new Date().toISOString();
                }

                pipelineTemplate.update();
            });
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
