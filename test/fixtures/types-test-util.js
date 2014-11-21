var Lab = require('lab');
var it = Lab.test;

var expects = require('./expects');


function typeValue (ctx, type) {
  var values = {
    'string': 'some-string-value',
    'number': 123,
    'boolean': false,
    'null': null,
    'undefined': undefined,
    'object': {
      key1: 3,
      key2: 'some-val',
    },
    'array': ['val1', 'val2', 'val3'],
    ObjectId: '123456789012345678901234'
  };
  return values[type];
}


function errorMessageSuffix (paramType, type) {
  if (type === 'null' || type === 'undefined') {
    return 'is required';
  }
  // TODO (anton) clarify these inconsistent messages
  var suffixes = {
    'boolean': 'must be a boolean',
    'string': 'must be a string',
    'number': 'must be a number',
    'array': 'should be an array',
    'object': 'must be an object',
    'ObjectId': 'is not an ObjectId',
  };
  return suffixes[paramType];
}

function buildBodyWithRequiredParams (ctx, requiredParams, param, type) {
  var body = {};
  if (param && type) {
    body[param.name] = typeValue(ctx, type);
  }

  if (requiredParams) {
    requiredParams.forEach(function(requiredParam) {
      body[requiredParam.name] = typeValue(ctx, requiredParam.type);
    });
  }
  return body;
}

// build body for required param. Use requried params prior to the `param`
function buildBodyForRequiredParams (ctx, requiredParams, param, type, paramIndex) {
  var body = {};
  if (param && type) {
    body[param.name] = typeValue(ctx, type);
  }
  if (requiredParams) {
    requiredParams.forEach(function(requiredParam, index) {
      if (index < paramIndex) {
        body[requiredParam.name] = typeValue(ctx, requiredParam.type);
      }

    });
  }
  return body;
}

function excludeParam (types, excluded) {
  return types.filter(function (type) {
    return type !== excluded;
  });
}


function setupTests (ctx, handler, def, types, param, buildBodyFunction, index) {
  var paramTypes = excludeParam(types, param.type);
  paramTypes.forEach(function (type) {
    it('should not ' + def.action + ' when `' + param.name + '` param is ' + type, function (done) {
      var body = buildBodyFunction(ctx, def.requiredParams, param, type, index);
      var message = new RegExp('body parameter "' + param.name + '" ' + errorMessageSuffix(param.type, type));
      var cb = expects.error(400, message, done);
      handler(body, cb);
    });
  });
  if (param.invalidValues && param.type !== 'array') {
    param.invalidValues.forEach(function (invalidValue) {
      var testName = 'should not ' + def.action + ' when `' + param.name +
      '` param has invalid value such as ' + invalidValue;
      it(testName, function (done) {
        var body = buildBodyFunction(ctx, def.requiredParams);
        body[param.name] = invalidValue;
        // e.g. "env" should match
        var message = new RegExp('"' + param.name + '" should match ');
        var cb = expects.error(400, message, done);
        handler(body, cb);
      });
    });
  }
  if (param.type === 'object' && param.keys) {
    Object.keys(param.keys).forEach(function (key) {
      var keyParam = param.keys[key];
      var objectKeyParamTypes = excludeParam(types, keyParam.type);
      objectKeyParamTypes.forEach(function (type) {
        var testName = 'should not ' + def.action + ' when `' + param.name + '` param has key `' + keyParam.name +
        '` with type ' + type;
        it(testName, function (done) {
          var body = buildBodyFunction(ctx, def.requiredParams, param, type, index);
          body[param.name] = {};
          body[param.name][keyParam.name] = typeValue(ctx, type);
          var testMsg = 'body parameter "' + param.name + '.' + keyParam.name +
          '" '+ errorMessageSuffix(keyParam.type, type);
          var message = new RegExp(testMsg);
          var cb = expects.error(400, message, done);
          handler(body, cb);
        });
      });
    });
  }
}

function setupArrayParamsTests (ctx, handler, def, types, param, buildBodyFunction) {
  // handle array param
  if (param.type === 'array') {
    var arrayItemTypes = excludeParam(types, param.itemType);

    arrayItemTypes.forEach(function(arrayItemType) {
      var testName = 'should not ' + def.action + ' when `' + param.name +
      '` param has ' + arrayItemType + ' items in the array';
      it(testName, function (done) {
        var body = buildBodyFunction(ctx, def.requiredParams);
        body[param.name] = [];
        body[param.name].push(typeValue(ctx, arrayItemType));
        body[param.name].push(typeValue(ctx, arrayItemType));
        body[param.name].push(typeValue(ctx, arrayItemType));
        // e.g. body parameter "env" should be an array of strings
        var regexp = 'body parameter "' + param.name + '" ' + errorMessageSuffix(param.type, arrayItemType) +
        ' of ' + param.itemType + 's';
        var message = new RegExp(regexp);
        var cb = expects.error(400, message, done);
        handler(body, cb);
      });
    });
    if (param.invalidValues) {
      param.invalidValues.forEach(function (invalidValue) {
        var testName = 'should not ' + def.action + ' when `' + param.name +
        '` param has invalid item value such as ' + invalidValue;
        it(testName, function (done) {
          var body = buildBodyFunction(ctx, def.requiredParams);
          body[param.name] = [invalidValue];
          // e.g. "env" should match
          var message = new RegExp('"' + param.name + '" should match ');
          var cb = expects.error(400, message, done);
          handler(body, cb);
        });
      });
    }
  }
}

/**
 * Make type check tests automatically based on `def`
 * @def - has `action` and arrays of `requiredParams` and `optionalParams`. See actual test for examples
 * @ctx - test contet object
 * @handler - handler that would be called on test end. Accepts generated `body` and `cb`
 */
exports.makeTestFromDef = function (def, ctx, handler) {
  // TODO (anton) null and undefined values are breaking code now. Investigate it
  var types = ['string', 'number', 'boolean', 'object', 'array'];//, 'null', 'undefined'];


  if (def.requiredParams) {
    def.requiredParams.forEach(function (param, index) {
      setupTests(ctx, handler, def, types, param, buildBodyForRequiredParams, index);
      // more things should be checked for arrays. We should go and check each item
      setupArrayParamsTests(ctx, handler, def, types, param, buildBodyForRequiredParams);
    });
  }
  if (def.optionalParams) {
    def.optionalParams.forEach(function (param, index) {
      setupTests(ctx, handler, def, types, param, buildBodyWithRequiredParams, index);
      // more things should be checked for arrays. We should go and check each item
      setupArrayParamsTests(ctx, handler, def, types, param, buildBodyWithRequiredParams, index);
    });
  }
};