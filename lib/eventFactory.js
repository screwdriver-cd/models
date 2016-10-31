'use strict';

const BaseFactory = require('./baseFactory');
const Event = require('./event');

let instance;

class EventFactory extends BaseFactory {
    /**
     * Construct a EventFactory object
     * @method constructor
     * @param  {Object}    config
     * @param  {Object}    config.datastore     Object that will perform operations on the datastore
     */
    constructor(config) {
        super('event', config);
    }

    /**
     * Instantiate an Event class
     * @method createClass
     * @param  config
     * @return {Event}
     */
    createClass(config) {
        return new Event(config);
    }

    /**
     * Create an event model
     * @method create
     * @param  {Object}  config
     * @param  {String}  [config.type = 'pipeline'] Type of event (pipeline or pr)
     * @param  {String}  config.pipelineId          Unique id of the pipeline
     * @param  {Array}   config.workflow            Job names that will be executed for this event
     * @param  {String}  config.sha                 SHA this project was built on
     * @param  {String}  config.username            Username of the user that creates this event
     * @param  {String}  [config.causeMessage]      Message that describes why the event was created
     * @return {Promise}
     */
    create(config) {
        // Lazy load factory dependency to prevent circular dependency issues
        // https://nodejs.org/api/modules.html#modules_cycles
        /* eslint-disable global-require */
        const UserFactory = require('./userFactory');
        const PipelineFactory = require('./pipelineFactory');
        /* eslint-enable global-require */

        const userFactory = UserFactory.getInstance();
        const pipelineFactory = PipelineFactory.getInstance();

        return Promise.all([
            pipelineFactory.get(config.pipelineId),
            userFactory.get({ username: config.username })
        ]).then(([pipeline, user]) => {
            const modelConfig = {
                type: config.type || 'pipeline',
                pipelineId: config.pipelineId,
                sha: config.sha,
                workflow: config.workflow,
                createTime: (new Date()).toISOString(),
                causeMessage: config.causeMessage || `Started by ${config.username}`
            };

            return user.unsealToken()
                .then(token =>
                    this.scm.decorateAuthor({           // decorate user who creates this event
                        username: config.username,
                        token
                    })
                    .then((creator) => {
                        modelConfig.creator = creator;

                        const scmUri = pipeline.scmUri;

                        return this.scm.decorateCommit({
                            scmUri,
                            sha: config.sha,
                            token
                        });
                    }))
                .then((commit) => {
                    modelConfig.commit = commit;

                    return super.create(modelConfig);
                });
        });
    }

    /**
     * Get an instance of the EventFactory
     * @method getInstance
     * @param  {Object}     config
     * @param  {Datastore}  config.datastore    A datastore instance
     * @param  {Scm}        config.scm          A scm instance
     * @return {EventFactory}
     */
    static getInstance(config) {
        if (!instance && (!config || !config.scm)) {
            throw new Error('No scm plugin provided to EventFactory');
        }
        instance = BaseFactory.getInstance(EventFactory, instance, config);

        return instance;
    }
}

module.exports = EventFactory;
