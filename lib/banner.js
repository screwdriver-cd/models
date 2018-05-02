'use strict';

const BaseModel = require('./base');

class BannerModel extends BaseModel {
    /**
     * Construct a BannersModel object
     * @method constructor
     * @param {Object} config
     * @param {String} config.message         The banner message
     * @param {Number} config.createdBy       The username of the user that created this banner
     * @param {Number} config.createTime      Time the banner object was created
     * @param {Number} config.isActive        Boolean to indicate whether banner should display
     * @param {String} config.type            The type of banner (info|warn)
     */
    constructor(config) {
        super('banner', config); // data-schema model name
    }
}

module.exports = BannerModel;
