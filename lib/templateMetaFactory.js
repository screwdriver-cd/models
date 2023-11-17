'use strict';

const BaseFactory = require('./baseFactory');
const TemplateMeta = require('./templateMeta');

class TemplateMetaFactory extends BaseFactory {
    /**
     * Construct a TemplateFactory object
     * @method constructor
     * @param  {Object}     config
     * @param  {Datastore}  config.datastore         Object that will perform operations on the datastore
     */
    constructor(config) {
        super('templateMeta', config);
    }

    /**
     *
     * @param config
     * @returns {TemplateMeta}
     */
    createClass(config) {
        return new TemplateMeta(config);
    }

    create(config) {
        config.templateType = this._getTemplateType();

        return super.create(config);
    }

    get(config) {
        config.templateType = this.getTemplateType();

        return super.get(config);
    }

    getTemplateType() {
        return this._getTemplateType();
    }

    _getTemplateType() {
        throw new Error('Not implemented');
    }
}

module.exports = TemplateMetaFactory;
