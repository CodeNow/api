'use strict';

var isObject = require('101/is-object');
var keypather = require('keypather')();
var configs = require('configs');
var inflect = require('i')();
var mw = require('dat-middleware');
var flow = require('middleware-flow');
var transformations = require('middlewares/transformations');
var transformToInt = transformations.toInt;
var useMin = transformations.useMin;
var setDefault = transformations.setDefault;

var utils = module.exports = {
  //
  // middlewares
  //
  formatPaging: function () {
    return flow.series(
      mw.query('page', 'limit').mapValues(transformToInt),
      mw.query('page').mapValues(setDefault(0)),
      mw.query('limit').mapValues(setDefault(process.env.DEFAULT_PAGE_LIMIT)),
      mw.query('limit').mapValues(useMin(process.env.MAX_PAGE_LIMIT)),
      mw.query('page', 'limit').require().number()
    );
  },
  require: function (key) {
    // this is vs. using dat-middleware.require because the latter throws a 403
    return function (req, res, next) {
      if (!req[key]) {
        return next(mw.Boom.notFound(utils.capitalize(key)+' not found'));
      }
      next();
    };
  },
  message: function (code, msg) {
    if (typeof code === 'string') {
      msg = code;
      code = 200;
    }
    return function (req, res) {
      res.json(code, { message: msg });
    };
  },
  replacePlaceholders: function (ctx, args) {
    return handle(args);
    function handle (thing) {
      if (Array.isArray(thing)) {
        return thing.map(handle);
      }
      else if (isObject(thing)) {
        return handleObject(thing);
      }
      else if (typeof thing === 'string') {
        var val = keypather.get(ctx, thing);
        return utils.exists(val) ? val : thing;
      }
      else {
        return thing;
      }
    }
    function handleObject (obj) {
      if (Object.getPrototypeOf(obj).constructor.name !== 'Object') {
        //ignore special objects like ObjectIds
        return obj;
      }
      var out = {};
      Object.keys(obj).forEach(function (key) {
        out[key] = handle(obj[key]);
      });
      return out;
    }
  },
  //
  // utils
  //
  exists: function (thing) {
    return thing != null;
  },
  isObjectId: function (str) {
    if (!str) {
      return false;
    }
    str = str.toString();
    return Boolean(str.match(/^[0-9a-fA-F]{24}$/));
  },
  equalObjectIds: function (objectId1, objectId2) {
    return objectId1 && objectId2 && (objectId1.toString() === objectId2.toString());
  },
  pluralize: function (str) {
    return inflect.pluralize(str);
  },
  singularize: function (str) {
    return inflect.singularize(str);
  },
  capitalize: function (str) {
    return str[0].toUpperCase() + str.slice(1);
  },
};
