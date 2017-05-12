'use strict';

const BaseFactory = require('./baseFactory');
const Token = require('./token');

let instance;

class TokenFactory extends BaseFactory {
    /**
     * Construct a TokenFactory object
     * @method constructor
     * @param  {Object}    config
     * @param  {Object}    config.datastore     Object that will perform operations on the datastore
     */
    constructor(config) {
        super('token', config);
    }

    /**
     * Instantiate a Token class
     * @method createClass
     * @param  {Object}     config
     * @return {Token}
     */
    createClass(config) {
        return new Token(config);
    }

    /**
     * Create a token model
     * @method create
     * @param  {Object}     config
     * @param  {String}     config.userId            The ID of the associated user
     * @param  {String}     config.value             The token value
     * @param  {String}     config.name              The token name
     * @param  {String}     config.description       The token description
     * @return {Promise}
     */
    create(config) {
        config.lastUsed = null;

        return super.create(config);
    }

    /**
     * Get an instance of the TokenFactory
     * @method getInstance
     * @param  {Object}     config
     * @param  {Datastore}  config.datastore    A datastore instance
     * @return {TokenFactory}
     */
    static getInstance(config) {
        instance = BaseFactory.getInstance(TokenFactory, instance, config);

        return instance;
    }
}

module.exports = TokenFactory;
