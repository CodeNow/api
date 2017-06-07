'use strict'
const Promise = require('bluebird')
module.exports.sleep = asyncDelay

/**
 * Returns a promise after a specified amount of time
 * @param  {*} wait in ms to delay
 * @return resolved promise
 */
function asyncDelay (wait) {
  return new Promise((resolve) => {
    setTimeout(resolve, wait)
  })
}
