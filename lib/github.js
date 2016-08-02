'use strict';
const async = require('async');
const Breaker = require('circuit-fuses');
const schema = require('screwdriver-data-schema');
const Github = require('github');
const github = new Github();
let cached = null;

/**
 * Github command to run
 * @method githubCommand
 * @param  {Object}   options            An object that tells what command & params to run
 * @param  {String}   options.action     Github method. For example: get
 * @param  {Object}   options.params     Parameters to run with
 * @param  {Function} callback           Callback function from github API
 */
function githubCommand(options, callback) {
    github.repos[options.action](options.params, callback);
}

/**
 * Get the circuit breaker
 * @method getBreaker
 * @return {Breaker}        The circuit breaker
 */
function getBreaker() {
    if (!cached) {
        cached = new Breaker(githubCommand);
    }

    return cached;
}

/**
 * Get repo information
 * @method getInfo
 * @param  {String} scmUrl      scmUrl of the repo
 * @return {Object}             An object with the user, repo, and branch
 */
function getInfo(scmUrl) {
    const matched = (schema.config.regex.SCM_URL).exec(scmUrl);

    return {
        user: matched[2],
        repo: matched[3],
        branch: matched[4].slice(1)
    };
}

/**
 * Run command. This first gets the user, then unseal the user's token and call the github command
 * @method run
 * @param  {Object}   config            Configuration object
 * @param  {Model}    config.user       User Model
 * @param  {String}   config.username   Username to authenticate
 * @param  {String}   config.action     Method to invoke. For example: get, createStatus
 * @param  [Object]   config.params     Params to pass into the github command
 * @param  {Function} callback          Callback function that is returned from calling the github command
 */
function run(config, callback) {
    const user = config.user;
    const userId = user.generateId({ username: config.username });
    const githubBreaker = getBreaker();

    async.waterfall([
        (next) => {
            user.get(userId, next);
        },
        (result, next) => {
            user.unsealToken(result.token, next);
        },
        (unsealed, next) => {
            github.authenticate({
                type: 'oauth',
                token: unsealed
            });
            githubBreaker.runCommand({
                action: config.action,
                params: config.params || {}
            }, next);
        }
    ], callback);
}
module.exports = {
    getBreaker,
    getInfo,
    run
};
