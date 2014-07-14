'use strict';

module.exports = {
  replaceMeWithUserId: function (val, i, vals, req) {
    return (val === 'me') ?
      req.sessionUser._id : val;
  },
  toMongoQuery: function (dataObject) {
    var out = {};
    Object.keys(dataObject).forEach(function (key) {
      out[key] = Array.isArray(dataObject[key]) ?
      { $in: dataObject[key] } :
        dataObject[key];
    });
    return out;
  },
  toInt: function (val) {
    return parseInt(val, 10);
  },
  useMin: function (maxVal) {
    return function (val) {
      return (val < maxVal) ? val : maxVal;
    };
  },
  setDefault: function (defVal) {
    return function (val) {
      return val || defVal;
    };
  },
  boolToExistsQuery: function (bool) {
    return { $exists: Boolean(bool) };
  }
};