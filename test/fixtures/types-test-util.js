var Lab = require('lab');
var it = Lab.test;

var expects = require('./expects');



exports.makeTestFromDef = function(def, ctx, objectName, methodName) {
  // TODO (anton) null and undefined values are breaking code now. Investigate it
  var types = ['string', 'number', 'boolean', 'object', 'array'];//, 'null', 'undefined'];
  var typeValue = function(ctx, type) {
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
      'ObjectId': ctx.build.id()
    };
    return values[type];
  };
  var errorMessageSuffix = function(paramType, type) {
    if(type === 'null' || type === 'undefined') {
      return 'is required';
    }
    // TODO (anton) clarify these inconsistent messages
    var suffixes = {
      'string': 'must be a string',
      'number': 'must be a number',
      'array': 'should be an array',
      'object': 'must be an object',
      'ObjectId': 'is not an ObjectId',
    };
    return suffixes[paramType];
  };
  var buildBodyWithRequiredParams = function(ctx, requiredParams) {
    var body = {};
    if(requiredParams) {
      requiredParams.forEach(function(requiredParam) {
        body[requiredParam.name] = typeValue(ctx, requiredParam.type);
      });
    }
    return body;
  };
  if(def.requiredParams) {
    def.requiredParams.forEach(function(param) {
      var paramTypes = types.filter(function(type) {
        return type !== param.type;
      });
      // TODO (anton) cover case when we have few required parameters
      paramTypes.forEach(function(type) {
        it('should not ' + def.action + ' when `' + param.name + '` param is ' + type, function(done) {
          var body = {};
          body[param.name] = typeValue(ctx, type);
          var message = new RegExp('body parameter "' + param.name + '" ' + errorMessageSuffix(param.type, type));
          ctx[objectName][methodName](body, expects.error(400, message, done));
        });
      });
    });
  }
  if(def.optionalParams) {
    def.optionalParams.forEach(function(param) {
      var paramTypes = types.filter(function(type) {
        return type !== param.type;
      });
      paramTypes.forEach(function(type) {
        it('should not ' + def.action + ' when `' + param.name + '` param is ' + type, function(done) {
          var body = buildBodyWithRequiredParams(ctx, def.requiredParams);
          body[param.name] = typeValue(ctx, type);
          var message = new RegExp('body parameter "' + param.name + '" ' + errorMessageSuffix(param.type, type));
          ctx[objectName][methodName](body, expects.error(400, message, done));
        });
      });
      if(param.type === 'array') {
        var arrayItemTypes = types.filter(function(type) {
          return type !== param.itemType;
        });
        arrayItemTypes.forEach(function(arrayItemType) {
          var testName = 'should not ' + def.action + ' when `' + param.name +
          '` param has ' + arrayItemType + ' items in the array';
          it(testName, function(done) {
            var body = buildBodyWithRequiredParams(ctx, def.requiredParams);
            body[param.name] = [];
            body[param.name].push(typeValue(ctx, arrayItemType));
            body[param.name].push(typeValue(ctx, arrayItemType));
            body[param.name].push(typeValue(ctx, arrayItemType));
            // e.g. body parameter "env" should be an array of strings
            var regexp = 'body parameter "' + param.name + '" ' + errorMessageSuffix(param.type, arrayItemType) +
            ' of ' + param.itemType + 's';
            var message = new RegExp(regexp);
            ctx[objectName][methodName](body, expects.error(400, message, done));
          }); 
        });
        param.itemValues.forEach(function(itemValue) {
          var testName = 'should not ' + def.action + ' when `' + param.name +
          '` param has invalid item value such as ' + itemValue;
          it(testName, function(done) {
            var body = buildBodyWithRequiredParams(ctx, def.requiredParams);
            body[param.name] = [itemValue];
            // e.g. "env" should match 
            var message = new RegExp('"' + param.name + '" should match ');
            ctx[objectName][methodName](body, expects.error(400, message, done));
          }); 
        });
      }
    });
  }
};