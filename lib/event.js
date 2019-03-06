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
     * getBuildMetrics for this event
     * @method getBuildMetrics
     * @param  {Object}   [config]              Configuration object
     * @param  {String}   [config.startTime]    Look at builds created after this startTime
     * @param  {String}   [config.endTime]      Look at builds created before this endTime
     * @return {Promise}  Resolves to array of metrics for builds belong to this event
     */
    async getBuildMetrics(config = { startTime: null, endTime: null }) {
        // Get builds during this time range
        const builds = await this.getBuilds({
            startTime: config.startTime,
            endTime: config.endTime
        });

        const findDuration = (start, end) => Math.round((new Date(end) - new Date(start)) / 1000);

        // Generate metrics
        const metrics = builds.map((b) => {
            const { id, jobId, eventId, createTime, status, startTime, endTime, stats } = b;
            const duration = findDuration(startTime, endTime);
            let queuedTime;
            let imagePullTime;

            // for backward compatibility, some old builds don't have stats field
            if (stats) {
                const { queueEnterTime, imagePullStartTime } = stats;

                queuedTime = findDuration(queueEnterTime, imagePullStartTime);
                imagePullTime = findDuration(imagePullStartTime, startTime);
            }

            return {
                id,
                jobId,
                eventId,
                createTime,
                startTime,
                endTime,
                duration,
                status,
                queuedTime,
                imagePullTime
            };
        });

        return metrics;
    }
}

module.exports = EventModel;
