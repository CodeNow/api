'use strict'
var uuid = require('uuid')

module.exports = function (email) {
  email = email || uuid() + '@random.net'
  return [{
    'email': email,
    'primary': false,
    'verified': true
  }, {
    'email': email,
    'primary': true,
    'verified': true
  }]
}
