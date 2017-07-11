'use strict';

const BuildFactory = require('./lib/buildFactory');
const CollectionFactory = require('./lib/collectionFactory');
const EventFactory = require('./lib/eventFactory');
const JobFactory = require('./lib/jobFactory');
const PipelineFactory = require('./lib/pipelineFactory');
const SecretFactory = require('./lib/secretFactory');
const TemplateFactory = require('./lib/templateFactory');
const TokenFactory = require('./lib/tokenFactory');
const UserFactory = require('./lib/userFactory');

module.exports = {
    BuildFactory,
    CollectionFactory,
    EventFactory,
    JobFactory,
    PipelineFactory,
    SecretFactory,
    TemplateFactory,
    TokenFactory,
    UserFactory
};
