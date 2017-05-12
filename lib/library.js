'use strict';

const iron = require('iron');
const nodeify = require('./nodeify');

/**
 * Seal token value
 * @method sealToken
 * @param  {String}         value          Value to seal
 * @param  {String}         pw             Password to seal with
 * @return {Promise}
 */
function sealValue(value, pw) {
    return nodeify.withContext(iron, 'seal', [value, pw, iron.defaults]);
}

/**
 * Unseal token value and return the token with the unsealed value
 * @param  {Model}              model   Model to unseal
 * @param  {String}             pw      Password to unseal with
 * @return {Promise}
 */
function unsealValue(model, pw) {
    return nodeify.withContext(iron, 'unseal', [model.value, pw, iron.defaults])
        .then((unsealed) => {
            model.value = unsealed;

            return model;
        });
}

module.exports = {
    sealValue,
    unsealValue
};
