'use strict';

var ns = require('cls-namespace');

module.exports = function (req, res, next) {
  var lastReq = ns.get('req');
  ns.set('req', req);
  // all we use is res.json so wrap it to restore req to lastReq
  // after an internal request has completed
  var resJSON = res.json;
  res.json = function () {
    resJSON.apply(res, arguments);
    ns.set('req', lastReq);
  };
  next();
};