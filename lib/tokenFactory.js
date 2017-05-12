'use strict';

const BaseFactory = require('./baseFactory');
const Token = require('./token');
const Lib = require('./library');
// Symbols for private fields
const password = Symbol('password');

let instance;

class TokenFactory extends BaseFactory {
    /**
     * Construct a TokenFactory object
     * @method constructor
     * @param  {Object}    config
     * @param  {Object}    config.datastore     Object that will perform operations on the datastore
     * @param  {String}    config.password      Password for encryption operations
     */
    constructor(config) {
        super('token', config);
        this[password] = config.password;
    }

    /**
     * Instantiate a Token class
     * @method createClass
     * @param  config
     * @return {Token}
     */
    createClass(config) {
        const c = config;

        c.password = this[password];

        return new Token(c);
    }

    /**
     * Create a token model
     * Need to seal the token before saving
     * @method create
     * @param  {Object}     config
     * @param  {String}     config.userId            The ID of the associated user
     * @param  {String}     config.value             The token value
     * @param  {String}     config.name              The token name
     * @param  {String}     config.description       The token description
     * @return {Promise}
     */
    create(config) {
        return Lib.sealValue(config.value, this[password])
            .then((sealed) => {
                config.value = sealed;
                config.lastUsed = null;

                return super.create(config);
            });
    }

    /**
     * List tokens with pagination and filter options
     * @method list
     * @param  {Object}   config                  Config object
     * @param  {Object}   config.params           Parameters to filter on
     * @param  {Object}   config.paginate         Pagination parameters
     * @param  {Number}   config.paginate.count   Number of items per page
     * @param  {Number}   config.paginate.page    Specific page of the set to return
     * @return {Promise}
     */
    list(config) {
        return super.list(config).then(tokens =>
            Promise.all(tokens.map(token => Lib.unsealValue(token, this[password]))));
    }

    /**
     * Get an instance of the TokenFactory
     * @method getInstance
     * @param  {Object}     config
     * @param  {Datastore}  config.datastore    A datastore instance
     * @param  {String}     config.password     Password for encryption operations
     * @return {TokenFactory}
     */
    static getInstance(config) {
        instance = BaseFactory.getInstance(TokenFactory, instance, config);

        return instance;
    }
}

module.exports = TokenFactory;
