'use strict';
var ObjectId = require('mongoose').Types.ObjectId;

module.exports = toObjectId;

function toObjectId (id) {
  if (id instanceof ObjectId) {
    return id;
  }
  else {
    return new ObjectId(id);
  }
}
