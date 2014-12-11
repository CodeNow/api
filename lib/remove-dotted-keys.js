'use strict';

// modifies original object
module.exports = function removeDottedKeys (obj) {
  if (typeof obj === 'object') {
    Object.keys(obj).forEach(function (key) {
      if (~key.indexOf('.')) {
        delete obj[key];
      }
      removeDottedKeys(obj[key]);
    });
  }
  return obj;
};