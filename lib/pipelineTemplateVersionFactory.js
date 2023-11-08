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

        return templateMetaFactory
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

                return { pipelineTemplate, versionedConfig: null, isExactVersion };
            })
            .then(result => {
                const { pipelineTemplate, versionedConfig, isExactVersion } = result;
                const [, configMajor, configMinor] = VERSION_REGEX.exec(config.version);

                let newVersion;

                if (!versionedConfig) {
                    if (!isExactVersion) {
                        newVersion = config.version;
                    } else if (!pipelineTemplate.latestVersion) {
                        newVersion = configMinor ? `${configMajor}${configMinor}.0` : `${configMajor}.0.0`;
                    } else {
                        const [, globalMajor, globalMinor, globalPatch] = VERSION_REGEX.exec(
                            pipelineTemplate.latestVersion
                        );
                        const patch = parseInt(globalPatch.slice(1), 10) + 1;

                        newVersion = `${globalMajor}${globalMinor}.${patch}`;
                    }
                }

                return super
                    .create({
                        templateId: pipelineTemplate.id,
                        description: config.description,
                        config: config.config,
                        createTime,
                        version: newVersion
                    })
                    .then(pipelineTemplateVersion => {
                        return { pipelineTemplateVersion, pipelineTemplate };
                    });
            })
            .then(result => {
                const { pipelineTemplate, pipelineTemplateVersion } = result;
                const [, latestMajor, latestMinor] = VERSION_REGEX.exec(pipelineTemplate.latestVersion);
                const [, major, minor] = VERSION_REGEX.exec(pipelineTemplateVersion.version);

                if (major > latestMajor || (major === latestMajor && minor >= latestMinor)) {
                    pipelineTemplate.latestVersion = pipelineTemplateVersion.version;
                    pipelineTemplate.updateTime = new Date().toISOString();
                }

                return pipelineTemplate.update().then(() => {
                    return pipelineTemplateVersion;
                });
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
