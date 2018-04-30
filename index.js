'use strict';

const BannersFactory = require('./lib/bannersFactory');
const BuildFactory = require('./lib/buildFactory');
const CollectionFactory = require('./lib/collectionFactory');
const CommandFactory = require('./lib/commandFactory');
const CommandTagFactory = require('./lib/commandTagFactory');
const EventFactory = require('./lib/eventFactory');
const JobFactory = require('./lib/jobFactory');
const PipelineFactory = require('./lib/pipelineFactory');
const SecretFactory = require('./lib/secretFactory');
const TemplateFactory = require('./lib/templateFactory');
const TemplateTagFactory = require('./lib/templateTagFactory');
const TokenFactory = require('./lib/tokenFactory');
const TriggerFactory = require('./lib/triggerFactory');
const UserFactory = require('./lib/userFactory');

module.exports = {
    BannersFactory,
    BuildFactory,
    CollectionFactory,
    CommandFactory,
    CommandTagFactory,
    EventFactory,
    JobFactory,
    PipelineFactory,
    SecretFactory,
    TemplateFactory,
    TemplateTagFactory,
    TokenFactory,
    TriggerFactory,
    UserFactory
};
