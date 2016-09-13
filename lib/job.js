'use strict';

const BaseModel = require('./base');
const hoek = require('hoek');
const PAGINATE_PAGE = 1;
const PAGINATE_COUNT = 25;

class Job extends BaseModel {
    /**
     * Constructs a Job Model
     * @method constructor
     * @param  {Object}     config
     * @param  {Datastore}  config.datastore    Datastore instance
     * See model schema
     * @constructor
     */
    constructor(config) {
        super('job', config);
    }

    /**
     * Lazy load a pipeline model
     * @property pipeline
     * @return {Promise}    Resolves to a pipeline
     */
    get pipeline() {
        // Lazy load factory dependency to prevent circular dependency issues
        // https://nodejs.org/api/modules.html#modules_cycles
        /* eslint-disable global-require */
        const PipelineFactory = require('./pipelineFactory');
        /* eslint-enable global-require */

        delete this.pipeline;
        const factory = PipelineFactory.getInstance();
        const pipeline = factory.get(this.pipelineId);

        // ES6 has weird getters and setters in classes,
        // so we redefine the pipeline property here to resolve to the
        // resulting promise and not try to recreate the factory, etc.
        Object.defineProperty(this, 'pipeline', {
            enumerable: true,
            value: pipeline
        });

        return pipeline;
    }

    /**
     * Lazy load the list of secrets
     * @property secrets
     * @return {Promise}    Resolves to a list of secrets
     */
    get secrets() {
        delete this.secrets;

        const secretNames = hoek.reach(this.permutations, '0.secrets', { default: [] });
        const secretList = this.pipeline.then(pipeline => {
            if (!pipeline) {
                throw new Error('Pipeline does not exist');
            }

            return pipeline.secrets.then(secrets =>
                secrets.filter((secret) =>
                    // Only allow secrets that are called in the config AND are allowed (if a PR)
                    secretNames.includes(secret.name) && (secret.allowInPR || !this.isPR()))
            );
        });

        // ES6 has weird getters and setters in classes,
        // so we redefine the pipeline property here to resolve to the
        // resulting promise and not try to recreate the factory, etc.
        Object.defineProperty(this, 'secrets', {
            enumerable: true,
            value: secretList
        });

        return secretList;
    }

    /**
     * Lazy load the list of builds sorted by createTime
     * @property builds
     * @return {Promise}       Resolves to a list of builds
     */
    get builds() {
        const listConfig = {
            params: {
                jobId: this.id
            },
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

        const builds = factory.list(listConfig).then((records) => records.sort(
            (build1, build2) => new Date(build2.createTime) - new Date(build1.createTime)));

        // ES6 has weird getters and setters in classes,
        // so we redefine the pipeline property here to resolve to the
        // resulting promise and not try to recreate the factory, etc.
        Object.defineProperty(this, 'builds', {
            enumerable: true,
            value: builds
        });

        return builds;
    }

    /**
     * Return true if job is a PR job
     * @return {Boolean}
     */
    isPR() {
        return /^PR\-/.test(this.name);
    }
}

module.exports = Job;
