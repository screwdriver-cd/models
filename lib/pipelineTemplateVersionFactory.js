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
     * @param  {String}     config.namespace     The template namespace
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
     * @param  {Object}     config                   Config object
     * @param  {Factory}    pipelineTemplateFactory  PipelineTemplateFactory
     * @param  {Datastore}  config.datastore         Object that will perform operations on the datastore
     * @param  {String}     config.name              The template name
     * @param  {String}     config.namespace         The template namespace
     * @param  {String}     config.version           Version of the template
     * @param  {String}     config.description       Description of the template
     * @param  {String}     config.maintainer        Maintainer's email
     * @param  {Object}     config.config            Config of the screwdriver-template.yaml
     * @param  {String}     config.pipelineId        pipelineId of the template
     * @return {Promise}
     */
    async create(config, pipelineTemplateFactory) {
        const createTime = new Date().toISOString();
        const [, configMajor, configMinor] = VERSION_REGEX.exec(config.version);

        // get the template meta
        let pipelineTemplateMeta = await pipelineTemplateFactory.get({
            name: config.name,
            namespace: config.namespace
        });

        // if template meta doesn't exist, create one
        if (!pipelineTemplateMeta) {
            pipelineTemplateMeta = await pipelineTemplateFactory.create({
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
                    templateId: pipelineTemplateMeta.id
                },
                sort: 'descending',
                sortBy: 'createTime'
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
     * List all the versions of a pipeline template
     * @method create
     * @param  {Object}     config                      Config object
     * @param  {Factory}    pipelineTemplateFactory     PipelineTemplateFactory
     * @param  {Datastore}  config.datastore            Object that will perform operations on the datastore
     * @param  {String}     config.name                 The template name
     * @param  {String}     config.namespace            The template namespace
     * @param  {String}     [config.params.templateId]  The template id, it is mutually exclusive with name and namespace and takes precedence
     * @param  {String}     config.sort                 The sort order of the list
     * @param  {Object}     config.paginate             Pagination parameters
     * @param  {Number}     config.paginate.count       Number of items per page
     * @param  {Number}     config.paginate.page        Specific page of the set to return
     * @return {Promise}                                List of PipelineTemplateVersionModel
     */
    async list(config, pipelineTemplateFactory) {
        if (!config.params) {
            config.params = {};
        }

        if (config.params.templateId) {
            return super.list(config);
        }

        if (!config.name || !config.namespace) {
            throw Error('name and namespace are required for pipeline template versions');
        }

        const pipelineTemplateMeta = await pipelineTemplateFactory.get({
            name: config.name,
            namespace: config.namespace
        });

        if (!pipelineTemplateMeta) {
            return [];
        }
        config.params.templateId = pipelineTemplateMeta.id;

        return super.list(config);
    }

    /**
     * Get a version of a pipeline template based on the criteria
     * @method get
     * @param  {Object}     config                   Config object
     * @param  {Datastore}  config.datastore         Object that will perform operations on the datastore
     * @param  {String}     [config.templateId]      The template id
     * @param  {String}     config.name              The template name
     * @param  {String}     config.namespace         The template namespace
     * @param  {String}     config.version           The template version
     * @param  {Factory}    pipelineTemplateFactory  PipelineTemplateFactory
     * @return {Promise}                             PipelineTemplateVersionModel
     */
    async get(config, pipelineTemplateFactory) {
        if (config.templateId) {
            return super.get(config);
        }

        const pipelineTemplateMeta = await pipelineTemplateFactory.get({
            name: config.name,
            namespace: config.namespace
        });

        if (!pipelineTemplateMeta) {
            return null;
        }

        config.templateId = pipelineTemplateMeta.id;

        return super.get(config);
    }

    /**
     * Get a version of a pipeline template and template meta based on the criteria
     * @method getWithMetadata
     * @param  {Object}     config                   Config object
     * @param  {Datastore}  config.datastore         Object that will perform operations on the datastore
     * @param  {String}     [config.templateId]      The template id
     * @param  {String}     config.name              The template name
     * @param  {String}     config.namespace         The template namespace
     * @param  {String}     config.version           The template version
     * @param  {Factory}    pipelineTemplateFactory  PipelineTemplateFactory
     * @return {Promise}                             {PipelineTemplateVersionModel, PipelineTemplateMetaModel}
     */
    async getWithMetadata(config, pipelineTemplateFactory) {
        let pipelineTemplateMeta = {};

        if (config.templateId) {
            pipelineTemplateMeta = await pipelineTemplateFactory.get({
                id: config.templateId
            });
        } else {
            pipelineTemplateMeta = await pipelineTemplateFactory.get({
                name: config.name,
                namespace: config.namespace
            });

            if (pipelineTemplateMeta) {
                config.templateId = pipelineTemplateMeta.id;
            }
        }

        if (!pipelineTemplateMeta) {
            return null;
        }

        const pipelineTemplateVersion = await super.get(config);

        if (!pipelineTemplateVersion) {
            return null;
        }

        // merge selected template meta fields into template version
        ['pipelineId', 'namespace', 'name', 'maintainer', 'latestVersion'].forEach(fieldName => {
            pipelineTemplateVersion[fieldName] = pipelineTemplateMeta[fieldName];
        });

        return pipelineTemplateVersion;
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
