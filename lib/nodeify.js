'use strict';

/**
 * Determine whether to return a promise or use the callback. Disregards context
 * when invoking the given func
 * @method nodeify
 * @param  {Function}  func       The function to call
 * @param  {Object}    config     The parameters to pass to the function
 * @param  {Function}  [callback] Optional. Callback to invoke when func is completed.
 * @return {Promise}              If no callback is provided, a Promise is returned.
 */
function nodeify() {
    const args = Array.from(arguments);
    const func = args.shift();
    let callback = args[args.length - 1];

    if (typeof callback === 'function') {
        // To allow thrown errors to _NOT_ be caught in the promise chain
        return process.nextTick(() => func.apply(null, args));
    }
    if (typeof callback === 'undefined') {
        // for the case where the intended callback arguments is undefined.
        // To reduce the noise of the arguments array, we remove it
        args.pop();
    }

    return new Promise((resolve, reject) => {
        callback = (err, data) => {
            if (err) {
                return reject(err);
            }

            return resolve(data);
        };

        args.push(callback);

        // eslint-disable-next-line no-promise-executor-return
        return func.apply(null, args);
    });
}

/**
 * Invoke a particular function with a specific context for the "this" argument. It then
 * determines whether to return a promise or use the callback
 * @method withContext
 * @param  {Object}   context       The context for the "this" argument
 * @param  {String}   funcName      Function name to invoke on the context
 * @param  {Array}   argumentsList  Argument list to pass to the function named by "funcName"
 * @param  {Function} [callback]    Optional. Callback to invoke when func is completed.
 * @return {Promise}                If no callback is provided, a Promise is returned.
 */
nodeify.withContext = (context, funcName, argumentsList, callback) => {
    const func = context[funcName];
    const args = argumentsList.slice();

    if (typeof callback === 'function') {
        args.push(callback);

        // To allow thrown errors to _NOT_ be caught in the promise chain
        return process.nextTick(() => func.apply(context, args));
    }

    return new Promise((resolve, reject) => {
        const internalCallback = (err, data) => {
            if (err) {
                return reject(err);
            }

            return resolve(data);
        };

        args.push(internalCallback);

        // eslint-disable-next-line no-promise-executor-return
        return func.apply(context, args);
    });
};

/**
 * Handle a failure case either with a Promise or via callback
 * @method fail
 * @param  {Error}   errorObject  The error object to throw or callback with
 * @param  {Function} [callback]  Optional. Callback to pass error object to
 * @return {Promise}              If no callback is provided, a Promise is returned
 */
nodeify.fail = (errorObject, callback) => {
    const functionToCall = (errorToReturn, cb) => cb(errorToReturn);

    return nodeify(functionToCall, errorObject, callback);
};

/**
 * Handle a successful case either with a Promise or via callback
 * @method success
 * @param  {Mixed}    data        The data to return or callback with
 * @param  {Function} [callback]  Optional. Callback to pass error object to
 * @return {Promise}              If no callback is provided, a Promise is returned
 */
nodeify.success = (data, callback) => {
    const functionToCall = (dataToReturn, cb) => cb(null, dataToReturn);

    return nodeify(functionToCall, data, callback);
};

module.exports = nodeify;
