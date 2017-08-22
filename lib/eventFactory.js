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
     * @param  {Object}     config
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
     * @param  {String}  config.scmContext          The scm context to which user belongs
     * @param  {String}  [config.causeMessage]      Message that describes why the event was created
     * @return {Promise}
     */
    create(config) {
        // Lazy load factory dependency to prevent circular dependency issues
        // https://nodejs.org/api/modules.html#modules_cycles
        /* eslint-disable global-require */
        const PipelineFactory = require('./pipelineFactory');
        /* eslint-enable global-require */

        const pipelineFactory = PipelineFactory.getInstance();
        const displayLabel = this.scm.getDisplayName(config);
        const displayName = displayLabel ? `${displayLabel}:${config.username}` : config.username;

        return pipelineFactory.get(config.pipelineId).then((pipeline) => {
            const modelConfig = {
                type: config.type || 'pipeline',
                pipelineId: config.pipelineId,
                sha: config.sha,
                workflow: config.workflow,
                causeMessage: config.causeMessage || `Started by ${displayName}`
            };

            return pipeline.token
                .then(token =>
                    this.scm.decorateAuthor({           // decorate user who creates this event
                        username: config.username,
                        scmContext: config.scmContext,
                        token
                    })
                    .then((creator) => {
                        modelConfig.creator = creator;

                        const scmUri = pipeline.scmUri;

                        return this.scm.decorateCommit({
                            scmUri,
                            scmContext: config.scmContext,
                            sha: config.sha,
                            token
                        });
                    }))
                .then((commit) => {
                    modelConfig.commit = commit;
                    modelConfig.createTime = (new Date()).toISOString();

                    return super.create(modelConfig);
                })
                .then((event) => {
                    pipeline.lastEventId = event.id;

                    return pipeline.update()
                        .then(() => event);
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
