'use strict';

var mongoose = require('mongoose');

var async = require('async');
var debug = require('debug')('runnable-api:keypair:model');
var forge = require('node-forge');
var rsa = forge.pki.rsa;

var KeypairSchema = require('models/mongo/schemas/keypair');

KeypairSchema.statics.createKeypair = function (cb) {
  debug('creating key...');
  async.waterfall([
    rsa.generateKeyPair.bind(rsa, { bits: process.env.GITHUB_DEPLOY_KEY_BITS }),
    function fix (keypair, cb) {
      cb(null, {
        publicKey: forge.ssh.publicKeyToOpenSSH(keypair.publicKey),
        privateKey: forge.ssh.privateKeyToOpenSSH(keypair.privateKey)
      });
    },
    function save (keypair, cb) {
      var kp = new Keypair(keypair);
      kp.save(cb);
    }
  ], function (err) {
    debug('creating key... done');
    cb(err);
  });
};

KeypairSchema.statics.getRemainingKeypairCount = function (cb) {
  Keypair.count({}, cb);
};

var Keypair = module.exports = mongoose.model('Keypairs', KeypairSchema);
