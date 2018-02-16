'use strict';

const BaseModel = require('./base');
const PAGINATE_PAGE = 1;
const PAGINATE_COUNT = 50;

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
     * @return {Promise}                            List of builds
     */
    getBuilds() {
        const listConfig = {
            params: {
                eventId: this.id
            },
            // We are not implementing paginate, but the datastore is expecting it
            paginate: {
                count: PAGINATE_COUNT,
                page: PAGINATE_PAGE
            }
        };

        // Lazy load factory dependency to prevent circular dependency issues
        // https://nodejs.org/api/modules.html#modules_cycles
        /* eslint-disable global-require */
        const BuildFactory = require('./buildFactory');
        /* eslint-enable global-require */
        const factory = BuildFactory.getInstance();

        return factory.list(listConfig);
    }
}

module.exports = EventModel;
