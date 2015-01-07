'use strict';

function HipChat (contextVersions) {
  this.contextVersions = contextVersions;
}

HipChat.prototype.notifyOnBuild = function (cb) {
  console.log(cb);
};

module.exports = HipChat;