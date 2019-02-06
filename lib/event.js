'use strict';

const hoek = require('hoek');
const BaseModel = require('./base');

class EventModel extends BaseModel {
    /**
     * Construct an EventModel object
     * @method constructor
     * @param  {Object}   config                Config object to create the event with
     * @param  {Object}   config.datastore      Object that will perform operations on the datastore
     */
    constructor(config) {
        super('event', config);
    }

    /**
     * Return builds that belong to this event
     * @param  {String}   [config.startTime]     Search for builds after this startTime
     * @param  {String}   [config.endTime]       Search for builds before this endTime
     * @return {Promise}  Resolves to an array of builds
     */
    getBuilds(config) {
        const defaultConfig = {
            params: {
                eventId: this.id
            }
        };

        const listConfig = config ? hoek.applyToDefaults(defaultConfig, config) : defaultConfig;

        // Lazy load factory dependency to prevent circular dependency issues
        // https://nodejs.org/api/modules.html#modules_cycles
        /* eslint-disable global-require */
        const BuildFactory = require('./buildFactory');
        /* eslint-enable global-require */
        const factory = BuildFactory.getInstance();

        return factory.list(listConfig);
    }

    /**
     * getMetrics for this event
     * @method getMetrics
     * @param  {Object}   [config]              Configuration object
     * @param  {String}   [config.startTime]    Look at builds created after this startTime
     * @param  {String}   [config.endTime]      Look at builds created before this endTime
     * @return {Promise}  Resolves to array of metrics for builds belong to this event
     */
    async getMetrics(config) {
        // if no config pass in then get all (will not pass startTime/endTime to datastore)
        const startTime = config ? config.startTime : null;
        const endTime = config ? config.endTime : null;

        // Get builds during this time range
        const builds = await this.getBuilds({
            startTime,
            endTime
        });

        // Generate metrics
        const metrics = builds.map((b) => {
            const { id, createTime, status } = b;
            const duration = Math.round((new Date(b.endTime) - new Date(b.startTime)) / 1000);

            return { id, createTime, status, duration };
        });

        return metrics;
    }
}

module.exports = EventModel;
