'use strict';

const schema = require('screwdriver-data-schema');
const BaseFactory = require('./baseFactory');
const pipelineTemplateVersions = require('./pipelineTemplateVersions');
const TEMPLATE_NAME_REGEX = schema.config.regex.FULL_TEMPLATE_NAME;
const EXACT_VERSION_REGEX = schema.config.regex.EXACT_VERSION;
const VERSION_REGEX = schema.config.regex.VERSION;
const TAG_REGEX = schema.config.regex.TEMPLATE_TAG_NAME;
let instance;

class pipelineTemplateVersionFactory extends BaseFactory {
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
     * @param  {String}     [config.namespace]   The template namespace
     * @param  {String}     config.version       Version of the template
     * @param  {String}     config.description   Description of the template
     * @param  {String}     config.maintainer    Maintainer's email
     * @param  {Object}     config.config        Config of the screwdriver-template.yaml
     * @param  {String}     config.pipelineId    pipelineId of the template
     * @param  {Array}      [config.labels]      Labels attached to the template
     * @return {TemplateModel}
     */
    createClass(config) {
        // eslint-disable-next-line new-cap
        return new pipelineTemplateVersions(config);
    }

    /**
     * Parses full template name to return an object with
     * full template name, versionOrTag, isExactVersion, and isVersion
     * @method getFullNameAndVersion
     * @param  {String} fullTemplateName Full template name (e.g.: chefdk/knife@1.2.3 or chefdk/knife@stable)
     * @return {Object}                  Object with template metadata
     */
    getFullNameAndVersion(fullTemplateName) {
        const [, templateName, versionOrTag] = TEMPLATE_NAME_REGEX.exec(fullTemplateName);
        const isExactVersion = EXACT_VERSION_REGEX.exec(versionOrTag);
        const isVersion = VERSION_REGEX.exec(versionOrTag);
        const isTag = versionOrTag ? versionOrTag.match(TAG_REGEX) : null;

        return {
            templateName, // not yet parsed for namespace
            versionOrTag,
            isExactVersion,
            isVersion,
            isTag
        };
    }

    /**
     * Create a new template of the correct version (See schema definition)
     * @method create
     * @param  {Object}     config               Config object
     * @param pipelineTemplateFactory
     * @param  {Datastore}  config.datastore     Object that will perform operations on the datastore
     * @param  {String}     config.name          The template name
     * @param  {String}     [config.namespace]   The template namespace
     * @param  {String}     config.version       Version of the template
     * @param  {String}     config.description   Description of the template
     * @param  {String}     config.maintainer    Maintainer's email
     * @param  {Object}     config.config        Config of the screwdriver-template.yaml
     * @param  {String}     config.pipelineId    pipelineId of the template
     * @param  {Array}      [config.labels]      Labels attached to the template
     * @return {Promise}
     */
    // eslint-disable-next-line no-shadow
    create(config, pipelineTemplateFactory) {
        // 0. create variable createTime: result.createTime = new Date().toISOString();
        // 1. get template meta using template meta factory which matches name and namespace
        // 2. if template meta doesn't exist, create template meta with all necessary fields, createTime and updateTime is identical
        // 3. get version from version factory for the specified major,minor version from the config
        //      if version from config is exactVersion, make a DB call with below parameters to get the version entry and return it:
        //          templateId from templateMeta (from steps 1, 2)
        //          version from config
        //      else return [pipelineTemplate, NULL]
        // 4. create a new version in version factory by passing necessary fields
        //      fields coming from config= {description, config}
        //      templateId from templateMeta (from steps 1, 2)
        //      createTime from step 0
        //      need to determine exact version (may only have part of the version initially):
        //          if step 3 returns NULL:
        //              if we have exact version from config, use exact version
        //              if we have partial version:
        //                  if global version is NULL, complete the partial version and use it
        //                  else bump up global version and use it
        //          else bump up exact version and use it
        // 5. update latestVersion in templateMeta (if it is overall latest) -> update time: result.updateTime = new Date().toISOString();

        const createTime = new Date().toISOString();

        pipelineTemplateFactory
            .get({
                params: {
                    name: config.name,
                    namespace: config.namespace
                }
            })
            // eslint-disable-next-line no-shadow
            .then(pipelineTemplate => {
                if (!pipelineTemplate) {
                    return pipelineTemplateFactory.create({
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
                const { pipelineTemplate } = result.pipelineTemplate;
                const { versionedConfig } = result.versionedConfig;
                const [, configMajor, configMinor] = VERSION_REGEX.exec(config.version);

                let newVersion;

                if (!versionedConfig) {
                    const globalVersion = pipelineTemplate.latestVersion;

                    if (!globalVersion) {
                        newVersion = configMinor ? `${configMajor}${configMinor}.0` : `${configMajor}.0.0`;
                    } else {
                        const [, globalMajor, globalMinor, globalPatch] = VERSION_REGEX.exec(globalVersion);
                        const patch = parseInt(globalPatch.slice(1), 10) + 1;

                        newVersion = `${globalMajor}${globalMinor}.${patch}`;
                    }
                } else {
                    const [, exactMajor, exactMinor, exactPatch] = VERSION_REGEX.exec(config.version);
                    const newPatch = parseInt(exactPatch.slice(1), 10) + 1;

                    newVersion = `${exactMajor}${exactMinor}.${newPatch}`;
                }
                const newTemplate = {
                    templateId: pipelineTemplate.id,
                    description: config.description,
                    config: config.config,
                    createTime,
                    version: newVersion
                };

                return { newTemplate, pipelineTemplate };
            })
            .then(newResult => {
                const { pipelineTemplate } = newResult.pipelineTemplate;
                const { newTemplate } = newResult.newTemplate;
                const [, latestMajor, latestMinor] = VERSION_REGEX.exec(pipelineTemplate.latestVersion);
                const [, major, minor] = newTemplate.version;

                if (major > latestMajor || (major === latestMajor && minor >= latestMinor)) {
                    pipelineTemplate.latestVersion = newTemplate.version;
                    pipelineTemplate.updateTime = new Date().toISOString();
                }

                return super.create(newTemplate);
            });
    }

    /**
     * Get an instance of the TemplateFactory
     * @method getInstance
     * @param  {Object}     config
     * @param  {Datastore}  config.datastore
     * @return {TemplateFactory}
     */
    static getInstance(config) {
        instance = BaseFactory.getInstance(pipelineTemplateVersionFactory, instance, config);

        return instance;
    }
}

module.exports = pipelineTemplateVersionFactory;
