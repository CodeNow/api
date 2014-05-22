'use strict';

module.exports = {
  replaceMeWithUserId: function (val, i, vals, req) {
    return (val === 'me') ?
      req.user_id : val;
  },
  toMongoQuery: function (dataObject) {
    var out = {};
    Object.keys(dataObject).forEach(function (key) {
      out[key] = Array.isArray(dataObject[key]) ?
        { $in: dataObject[key] } :
        dataObject[key];
    });
    return out;
  }
};