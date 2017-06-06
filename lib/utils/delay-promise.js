'use strict'
const Promise = require('bluebird')
module.exports = asyncDelay

/**
 * invoke toJSON on a value if it exists
 * @param  {*} wait in ms to delay
 * @return resolved promise
 */
function asyncDelay (wait) {
  return new Promise((resolve) => {
    setTimeout(resolve, wait)
  })
}
