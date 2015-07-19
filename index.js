'use strict';

/**
 * @file An express middleware for returning error statuses via exceptions.
 * @module lib/http-errors
 * @example
 * # In app.js:
 * var httpErrors = require('http-errors')
 * # ...
 * app.use(httpErrors.middleware);
 *
 * # In some controller code
 * var HttpForbidden = require('http-errors').HttpForbidden;
 *
 * throw new HttpForbidden("You didn't say the magic word!",
 *                         "A useful internal message describing the conditions that led you to throw this error in the first place.");
 *
 * # Returns:
 * HTTP/1.1 403 Forbidden
 *
 * {
 *   "code": "Forbidden",
 *   "status": 403,
 *   "message": "You didn't say the magic word!"
 * }
 */
var config = {};
var hasConfigStores = false;  // Support both nconf-style configs as well as JSON.

var fs = require('fs');
var http = require('http');
var util = require('util');
var log = util.log;

var FILTERED_PARAMS = ['password', 'tax_id'];
var REDACTED_PARAMS = ['token'];

//
// Simple config hook for if/when we initialize this module with a custom
// config getter and/or logger.
//
function updateConfigParams() {
  var filteredParams;
  var redactedParams;

  if ((filteredParams = hasConfigStores ? config.get('LOG_FILTERED_PARAMS') : config.LOG_FILTERED_PARAMS)) {
    FILTERED_PARAMS = filteredParams;
  }
  if ((redactedParams = hasConfigStores ? config.get('LOG_REDACTED_PARAMS') : config.LOG_REDACTED_PARAMS)) {
    REDACTED_PARAMS = redactedParams;
  }
}

//
// Optionally initialize our module with a custom logger and config.
//
module.exports = function (configObj, logger) {
  if (configObj) {
    if (configObj.hasOwnProperty('stores')) {
      hasConfigStores = true;
    }

    config = configObj;
    updateConfigParams();
  }

  if (logger) {
    log = logger;
  }
};

/**
 * An instantiable base class for declaring HTTP error exceptions.
 * @constructor
 * @param  {String}  message    The error message to return to the user
 * @param  {Object}  options    Extra options to build with, including status number or shorthand code.
 */
var HttpError = function (message, options) {
  // ensure this constructor is called with `new`
  if (!(this instanceof HttpError)) { return new HttpError(message, options); }

  // ensure options is at least an empty object.
  // it can also be a string, in which case it will get dumped into `this.context`
  options || (options = {});

  // if a status was passed in, set it before getting the code
  if (options.status) {
    /** @member {Number} */
    this.status = options.status;
    delete options.status;
  }

  // default to the standard error code
  /** @member {String} */
  this.code = http.STATUS_CODES[this.status];

  // if a custom code was passed via options, override the default
  if (options.code) {
    this.code = options.code;
    delete options.code;
  }

  // set the rest of our properties
  /** @member {String} */
  this.message = message || this.defaultMessage || "An unexpected error occurred";
  /** @member {Mixed} */
  this.context = options;
  /** @member {Date} */
  this.timestamp = new Date();
};

/**
 * @method
 * @return {String} A String suitable for logs or a plaintext response
 */
HttpError.prototype.toString = function () {
  return "[" + this.status + "] " + this.message;
};

/**
 * @method
 * @return {Object} An Object suitable for an API response
 */
HttpError.prototype.toResponseJSON = function () {
  return {code: this.code, status: this.status, message: this.message};
};
exports.HttpError = HttpError;

/**
 * 302 Found Exception
 * @constructor
 * @extends {module:lib/http-errors~HttpError}
 */
var HttpRedirect = function(location, options) {
  this.status = 302;
  if (options && options.permanent) {
    this.status = 301;
  }
  this.defaultMessage = "Redirecting you to " + location;
  this.headers = {
    'Location': this.location
  };
  HttpError.call(this, this.message, options);
};
HttpRedirect.prototype = new HttpError();
exports.HttpRedirect = HttpRedirect;

/**
 * 400 Bad Request Exception
 * @constructor
 * @extends {module:lib/http-errors~HttpError}
 */
var HttpBadRequest = function (message, options) {
  this.status = 400;
  this.defaultMessage = "The server was unable to understand your request.";
  HttpError.call(this, message, options);
};
HttpBadRequest.prototype = new HttpError();
exports.HttpBadRequest = HttpBadRequest;

/**
 * 401 Unauthorized Exception
 * @constructor
 * @extends {module:lib/http-errors~HttpError}
 *
 * @todo diagnose and fix zero-length responses from this error
 */
var HttpUnauthorized = function (message, options) {
  this.status = 401;
  this.headers = {
    'WWW-Authenticate': 'Basic realm="Login Required"'
  };
  this.defaultMessage = "You must be logged in as an authorized user to access this endpoint.";
  HttpError.call(this, message, options);
};
HttpUnauthorized.prototype = new HttpError();
exports.HttpUnauthorized = HttpUnauthorized;

/**
 * 402 Payment Required Exception
 * @constructor
 * @extends {module:lib/http-errors~HttpError}
 */
var HttpPaymentRequired = function (message, options) {
  this.status = 402;
  this.defaultMessage = "An authorized payment is required to use this endpoint.";
  HttpError.call(this, message, options);
};
HttpPaymentRequired.prototype = new HttpError();
exports.HttpPaymentRequired = HttpPaymentRequired;

/**
 * 403 Forbidden Exception
 * @constructor
 * @extends {module:lib/http-errors~HttpError}
 */
var HttpForbidden = function  (message, options) {
  this.status = 403;
  this.template = './public/access-forbidden.html';
  this.defaultMessage = "You are not allowed to use this endpoint.";
  HttpError.call(this, message, options);
};
HttpForbidden.prototype = new HttpError();
exports.HttpForbidden = HttpForbidden;

/**
 * 404 Not Found Exception
 * @constructor
 * @extends {module:lib/http-errors~HttpError}
 */
var HttpNotFound = function (message, options) {
  this.status = 404;
  this.template = './public/not-found.html';
  this.defaultMessage = "The resource you requested was not found.";
  HttpError.call(this, message, options);
};
HttpNotFound.prototype = new HttpError();
exports.HttpNotFound = HttpNotFound;

/**
 * 408 Request Timeout Exception
 * @constructor
 * @extends {module:lib/http-errors~HttpError}
 */
var HttpRequestTimeout = function (message, options) {
  this.status = 408;
  this.defaultMessage = "The request you made has timed out.";
  HttpError.call(this, message, options);
};
HttpRequestTimeout.prototype = new HttpError();
exports.HttpRequestTimeout = HttpRequestTimeout;

/**
 * 409 Conflict Exception
 * @constructor
 * @extends {module:lib/http-errors~HttpError}
 */
var HttpConflict = function (message, options) {
  this.status = 409;
  this.defaultMessage = "The server was not able to fulfill your request with the data provided.";
  HttpError.call(this, message, options);
};
HttpConflict.prototype = new HttpError();
exports.HttpConflict = HttpConflict;

/**
 * 500 Internal Error Exception
 * @constructor
 * @extends {module:lib/http-errors~HttpError}
 */
var HttpInternalError = function (message, options) {
  this.status = 500;
  HttpError.call(this, message, options);
};
HttpInternalError.prototype = new HttpError();
exports.HttpInternalError = HttpInternalError;

/**
 * Internal method to convert parameters to asterisks
 * @method
 * @param  {String}  param  The parameter to redact
 * @param  {Number}  leave  The number of characters to leave intact on the end
 * @return {String} A redacted param safe to publish to logs
 */
var redactParam = function (param, leave) {
  var redactNum = Math.max(param.length - leave, 0);
  return param.replace(new RegExp('.{' + redactNum + '}'), new Array(redactNum + 1).join('*'));
};

/**
 * Internal method to log errors automatically.
 * @method
 * @param  {HttpException}  err   The error instance to log
 * @param  {Request}        req   The express Request object
 * @param  {Response}       res   The express Response object
 * @return {undefined}
 */
var logError = function (err, req, res) {
  // build our log payload from various objects in the environment
  var payload = {};
  ['params', 'query', 'body', 'cookies'].forEach(function (prop) {
    if (req[prop]) {
      payload[prop] = req[prop];
    }
  });
  if (err.context) {
    payload.context = err.context;
  }

  // if our payload contains sensitive values, redact them
  var stringPayload = JSON.stringify(payload);
  var pattern;
  var leave;
  var i;
  var handler = function (match, param, value) {
    return '"' + param + '":"' + redactParam(value, leave) + '"';
  };

  // leave 0 original characters on the end of FILTERED_PARAMS
  leave = 0;
  for (i in FILTERED_PARAMS) {
    pattern = new RegExp('"(' + FILTERED_PARAMS[i] + ')":"([^\"]+)"', 'g');
    stringPayload = stringPayload.replace(pattern, handler);
  }

  // leave 4 original characters on the end of REDACTED_PARAMS
  leave = 4;
  for (i in REDACTED_PARAMS) {
    pattern = new RegExp('"(' + REDACTED_PARAMS[i] + ')":"([^\"]+)"', 'g');
    stringPayload = stringPayload.replace(pattern, handler);
  }

  // load our redacted string back into an object to be logged
  payload = JSON.parse(stringPayload);

  res.status(err.status);
  log.error(err.toString(), payload);
};

/**
 * Internal method to render a response to the browser.
 * @method
 * @param  {HttpException}  err   The error instance to render
 * @param  {Request}        req   The express Request object
 * @param  {Response}       res   The express Response object
 * @return {Response}             Renders a response to the browser
 */
var renderResponse = function (err, req, res) {
  res.status(err.status);

  if (err.headers) {
    for (var headerName in err.headers) {
      res.header(headerName, err.headers[headerName]);
    }
  }

  // Return redirects as text regardless of request type
  if (err.status === 301 || err.status === 302) {
    return res.send(err.message);
  }

  // HTML responses render a template if present, otherwise a simple html page
  if (req.accepts('html') && !req.query.callback) {
    if (err.template) {
      return fs.createReadStream(err.template).pipe(res);
    }
    else {
      return res.send('<h2>' + err.code + '</h2><p>' + err.message + '</p>');
    }
  }

  // JSON responses call a builtin method of the error instance itself to render JSON
  if (req.accepts('json') || req.query.callback) {
    return res.send(err.toResponseJSON());
  }

  // Everything else is treated as plaintext.
  return res.send(err.toString());
};

/**
 * An express middleware to catch HttpError-based exceptions, log and render them.
 * @method
 * @param  {HttpException}  err    The error instance thrown
 * @param  {Request}        req    The express Request object
 * @param  {Response}       res    The express Response object
 * @param  {Function}       next   The next middleware (callback) in the stack
 * @return {Response}              An HTTP response to be automatically returned to the browser
 */
var middleware = function (err, req, res, next) {
  // If this is an HTTP error, log it and return the appropriate response.
  if (err instanceof HttpError) {
    // don't log HttpErrors in test mode
    if ((hasConfigStores ? config.get('NODE_ENV') : config.NODE_ENV) !== 'test') {
      logError(err, req, res);
    }
    return renderResponse(err, req, res);
  }
  // Otherwise, PANIC.
  else {
    throw err;
  }
  next();
};
exports.middleware = middleware;
