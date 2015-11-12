'use strict'
var Keypair = require('models/mongo/keypair')

module.exports = function (done) {
  var kp = new Keypair({
    publicKey: 'asdf',
    privateKey: 'fdsa'
  })
  kp.save(done)
}
