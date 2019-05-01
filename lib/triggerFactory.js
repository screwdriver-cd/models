'use strict';

const BaseFactory = require('./baseFactory');
const Trigger = require('./trigger');
let instance;

class TriggerFactory extends BaseFactory {
    /**
     * Construct a TriggerFactory object
     * @method constructor
     * @param  {Object}     config
     * @param  {Datastore}  config.datastore     Object that will perform operations on the datastore
     */
    constructor(config) {
        super('trigger', config);
    }

    /**
     * Instantiate a Trigger class
     * @method createClass
     * @param  {Object}     config               Trigger data
     * @param  {Datastore}  config.datastore     Object that will perform operations on the datastore
     * @param  {String}     config.src           Job that initiates the trigger
     * @param  {String}     config.dest          Job that is triggered
     * @return {Trigger}
     */
    createClass(config) {
        return new Trigger(config);
    }

    /**
     * Get all triggers related to a pipeline
     * @param  {Object} config
     * @param  {String} config.pipelineId   pipelineId
     * @return {Object}                     Returns object with dest triggers split by src jobs
     */
    getTriggers({ pipelineId }) {
        // eslint-disable-next-line global-require
        const PipelineFactory = require('./pipelineFactory');
        const pipelineFactory = PipelineFactory.getInstance();
        const result = [];

        return pipelineFactory.get(pipelineId)
            .then((pipeline) => {
                if (pipeline) {
                    // Get pipeline job names
                    return pipeline.getJobs({ type: 'pipeline' })
                        .then(jobs => Promise.all(
                            jobs.map(j =>
                                // Get dest triggers for each src job
                                this.list({
                                    params: {
                                        src: `~sd@${pipelineId}:${j.name}`
                                    }
                                // Push jobName and dest triggers to result
                                }).then((triggersArr) => {
                                    const triggers = triggersArr.map(t => t.dest);

                                    result.push({ jobName: j.name, triggers });
                                })
                            ))).then(() => result);
                }

                return result;
            });
    }

    /**
     * Get an instance of the TriggerFactory
     * @method getInstance
     * @param  {Object}     config
     * @param  {Datastore}  config.datastore
     * @return {TriggerFactory}
     */
    static getInstance(config) {
        instance = BaseFactory.getInstance(TriggerFactory, instance, config);

        return instance;
    }
}

module.exports = TriggerFactory;
