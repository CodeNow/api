/**
 * @module lib/models/mongo/keypair
 */
'use strict'

var async = require('async')
var forge = require('node-forge')
var mongoose = require('mongoose')

var KeypairSchema = require('models/mongo/schemas/keypair')
var logger = require('logger')

var rsa = forge.pki.rsa

KeypairSchema.statics.createKeypair = function (cb) {
  var log = logger.child({ method: 'KeypairSchema.statics.createKeypair' })
  log.info('createKeypair')
  async.waterfall([
    rsa.generateKeyPair.bind(rsa, { bits: process.env.GITHUB_DEPLOY_KEY_BITS }),
    function fix (keypair, cb) {
      cb(null, {
        publicKey: forge.ssh.publicKeyToOpenSSH(keypair.publicKey),
        privateKey: forge.ssh.privateKeyToOpenSSH(keypair.privateKey)
      })
    },
    function save (keypair, cb) {
      var kp = new Keypair(keypair)
      kp.save(cb)
    }
  ], function (err) {
    log.trace('createKeypair callback')
    cb(err)
  })
}

KeypairSchema.statics.getRemainingKeypairCount = function (cb) {
  Keypair.count({}, cb)
}

var Keypair = module.exports = mongoose.model('Keypairs', KeypairSchema)
