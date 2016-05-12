'use strict'

var expects = require('./expects')

/**
 * Make type check tests automatically based on `def`
 * @def - has `action` and arrays of `requiredParams` and `optionalParams`. See actual test for examples
 * @ctx - test content object
 * @handler - handler that would be called on test end. Accepts generated `body` and `cb`
 */
exports.makeTestFromDef = function (def, ctx, lab, handler) {
  exports.lab = lab
  // TODO (anton) null and undefined values are breaking code now. Investigate it
  var types = ['string', 'number', 'boolean', 'object', 'array'] // , 'null', 'undefined']

  if (def.requiredParams) {
    def.requiredParams.forEach(function (param, index) {
      setupTests(ctx, handler, def, types, param, buildBodyForRequiredParams, index)
      // more things should be checked for arrays. We should go and check each item
      setupArrayParamsTests(ctx, handler, def, types, param, buildBodyForRequiredParams)
    })
  }
  if (def.optionalParams) {
    def.optionalParams.forEach(function (param, index) {
      setupTests(ctx, handler, def, types, param, buildBodyWithRequiredParams, index)
      // more things should be checked for arrays. We should go and check each item
      setupArrayParamsTests(ctx, handler, def, types, param, buildBodyWithRequiredParams, index)
    })
  }
}

function typeValue (ctx, type) {
  var values = {
    'repo-string': 'user/repo',
    'string': 'some-string-value',
    'number': 123,
    'boolean': false,
    'null': null,
    'undefined': undefined,
    'object': {
      key1: 3,
      key2: 'some-val'
    },
    'array': ['val1', 'val2', 'val3']
  }
  if (ctx.build) {
    values.ObjectId = ctx.build.id()
  }
  return values[type]
}

function errorMessageSuffix (paramType, type) {
  if (type === 'null' || type === 'undefined') {
    return 'is required'
  }
  // TODO (anton) clarify these inconsistent messages
  var suffixes = {
    'boolean': 'must be a boolean',
    'string': 'must be a string',
    'repo-string': 'must be a string',
    'number': 'must be a number',
    'array': '(must be instance of Array)|(must be an array)',
    'object': 'must be an object',
    'ObjectId': 'is not an ObjectId'
  }
  return suffixes[paramType]
}

function buildBodyWithRequiredParams (ctx, requiredParams, param, type) {
  var body = {}
  if (param && type) {
    body[param.name] = typeValue(ctx, type)
  }

  if (requiredParams) {
    requiredParams.forEach(function (requiredParam) {
      if (requiredParam.type === 'object' && requiredParam.keys) {
        var param = {}
        requiredParam.keys.forEach(function (subparam) {
          param[subparam.name] = typeValue(ctx, subparam.type)
        })
        body[requiredParam.name] = param
      } else {
        body[requiredParam.name] = typeValue(ctx, requiredParam.type)
      }
    })
  }
  return body
}

// build body for required param. Use required params prior to the `param`
function buildBodyForRequiredParams (ctx, requiredParams, param, type, paramIndex) {
  var body = {}
  if (param && type) {
    body[param.name] = typeValue(ctx, type)
  }
  if (requiredParams) {
    requiredParams.forEach(function (requiredParam, index) {
      if (index < paramIndex) {
        if (requiredParam.type === 'object' && requiredParam.keys) {
          var param = {}
          requiredParam.keys.forEach(function (subparam) {
            param[subparam.name] = typeValue(ctx, subparam.type)
          })
          body[requiredParam.name] = param
        } else {
          body[requiredParam.name] = typeValue(ctx, requiredParam.type)
        }
      }
    })
  }
  return body
}

function excludeParam (types, excluded) {
  return types.filter(function (type) {
    return !~excluded.indexOf(type)
  })
}

function setupTests (ctx, handler, def, types, param, buildBodyFunction, index) {
  var paramTypes = excludeParam(types, param.type)
  paramTypes.forEach(function (type) {
    exports.lab.it('should not ' + def.action + ' when `' + param.name + '` param is ' + type, function (done) {
      var body = buildBodyFunction(ctx, def.requiredParams, param, type, index)
      var message = new RegExp('"' + param.name + '" ' + errorMessageSuffix(param.type, type))
      var cb = expects.error(400, message, done)
      handler(body, cb)
    })
  })
  if (param.invalidValues && param.type !== 'array') {
    param.invalidValues.forEach(function (invalidValue) {
      var testName = 'should not ' + def.action + ' when `' + param.name +
        '` param has invalid value such as ' + invalidValue
      exports.lab.it(testName, function (done) {
        var body = buildBodyFunction(ctx, def.requiredParams)
        body[param.name] = invalidValue
        // e.g. "env" should match
        var message = new RegExp('"' + param.name + '" should match ||("' + param.name + '" .* match)')
        var cb = expects.error(400, message, done)
        handler(body, cb)
      })
    })
  }
  if (param.type === 'object' && param.keys) {
    Object.keys(param.keys).forEach(function (key) {
      var keyParam = param.keys[key]
      var objectKeyParamTypes = excludeParam(types, keyParam.type)
      objectKeyParamTypes.forEach(function (type) {
        var testName = 'should not ' + def.action + ' when `' + param.name + '` param has key `' + keyParam.name +
          '` with type ' + type
        exports.lab.it(testName, function (done) {
          var body = buildBodyFunction(ctx, def.requiredParams, param, type, index)
          body[param.name] = {}
          body[param.name][keyParam.name] = typeValue(ctx, type)
          var testMsg = param.name + '.' + keyParam.name +
            '" ' + errorMessageSuffix(keyParam.type, type)
          var message = new RegExp(testMsg)
          var cb = expects.error(400, message, done)
          handler(body, cb)
        })
      })
    })
  }
}

function setupArrayParamsTests (ctx, handler, def, types, param, buildBodyFunction) {
  // handle array param
  if (param.type === 'array') {
    var arrayItemTypes = excludeParam(types, param.itemType)

    arrayItemTypes.forEach(function (arrayItemType) {
      var testName = 'should not ' + def.action + ' when `' + param.name +
        '` param has ' + arrayItemType + ' items in the array'
      exports.lab.it(testName, function (done) {
        var body = buildBodyFunction(ctx, def.requiredParams)
        body[param.name] = []
        body[param.name].push(typeValue(ctx, arrayItemType))
        body[param.name].push(typeValue(ctx, arrayItemType))
        body[param.name].push(typeValue(ctx, arrayItemType))
        var regexp = '("env" should match)||("env./d" must be a ' + arrayItemType + ')'
        var message = new RegExp(regexp)
        var cb = expects.error(400, message, done)
        handler(body, cb)
      })
    })
    if (param.invalidValues) {
      param.invalidValues.forEach(function (invalidValue) {
        var testName = 'should not ' + def.action + ' when `' + param.name +
          '` param has invalid item value such as ' + invalidValue
        exports.lab.it(testName, function (done) {
          var body = buildBodyFunction(ctx, def.requiredParams)
          body[param.name] = [invalidValue]
          // e.g. "env" should match
          var message = new RegExp('("' + param.name + '" should match )||("' + param.name + '" .* match)')
          var cb = expects.error(400, message, done)
          handler(body, cb)
        })
      })
    }
  }
}
