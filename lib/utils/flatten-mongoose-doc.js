'use strict';

var pick = require('101/pick');
var keypather = require('keypather')();
var map = require('object-loops/map');

module.exports = flattenMongooseDoc;

/**
 * flatten a mongoose document and toString all values (incl. objectIds)
 * @param  {MongooseDoc} doc  mongoose document to flatten
 * @param  {String} [pickKeys] keys to pick from document before flatten, default: "all"
 * @param  {String} [initKeypath] initial keypath to start keypaths with, default: ''
 * @return {Object} flattenned mongoose document
 */
function flattenMongooseDoc (doc, initKeypath, pickKeys) {
  var json = doc.toJSON ? doc.toJSON() : doc;
  if (Array.isArray(initKeypath)) {
    // (doc, pickKeys)
    pickKeys = initKeypath;
  }
  if (pickKeys) {
    json = pick(json, pickKeys);
  }
  var flat = keypather.flatten(json, '.', initKeypath || '');
  return map(flat, function (val) {
    return (val && val.toString) ? val.toString() : val + '';
  });
}
