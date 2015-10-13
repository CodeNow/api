'use strict';

module.exports = reverseFind;

function reverseFind (arr, test) {
  var i, item;
  for(i = arr.length-1; i >= 0; i--) {
    item = arr[i];
    if (test(item)) {
      return; // break loop
    }
  }
}

