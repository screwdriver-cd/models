'use strict';

const BaseFactory = require('./baseFactory');
const Token = require('./token');
const generateToken = require('./generateToken');

const password = Symbol('password');

let instance;

class TokenFactory extends BaseFactory {
    /**
     * Construct a TokenFactory object
     * @method constructor
     * @param  {Object}    config
     * @param  {Object}    config.datastore     Object that will perform operations on the datastore
     * @param  {String}    config.password      Password used as a salt by PBKDF2
     */
    constructor(config) {
        super('token', config);
        this[password] = config.password;
    }

    /**
     * Instantiate a Token class
     * @method createClass
     * @param  {Object}     config
     * @return {Token}
     */
    createClass(config) {
        const c = config;

        c.password = this[password];

        return new Token(c);
    }

    /**
     * Create a token model, returning the model including the unhashed value
     * @method create
     * @param  {Object}     config
     * @param  {String}     config.userId            The ID of the associated user
     * @param  {String}     config.name              The token name
     * @param  {String}     config.description       The token description
     * @return {Promise}
     */
    create(config) {
        let value;

        return generateToken.generateValue()
            .then((bytes) => {
                value = bytes;
                config.hash = generateToken.hashValue(bytes, this[password]);
                config.lastUsed = '';

                return super.create(config);
            }).then((model) => {
                model.value = value;

                return model;
            });
    }

    /**
     * Get a token
     * @method get
     * @param  {Mixed}     config
     * @param  {String}    [config.value]    (Un-hashed) value of token to look for
     * @return {Promise}
     */
    get(config) {
        if (config.value) {
            config.hash = generateToken.hashValue(config.value, this[password]);
            delete config.value;
        }

        return super.get(config);
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
