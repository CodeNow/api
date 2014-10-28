var Instance = require('runnable/lib/models/instance');

// TODO: make this less hardcoded

var original = {};

module.exports.setup = function (cb) {
  original['instance.create'] = Instance.prototype.create;
  Instance.prototype.create = function () {
    require('./route53/resource-record-sets')();
    require('./route53/resource-record-sets')();
    require('./route53/resource-record-sets')();
    original['instance.create'].apply(this, arguments);
  };
  original['instance.update'] = Instance.prototype.update;
  Instance.prototype.update = function () {
    require('./route53/resource-record-sets')();
    require('./route53/resource-record-sets')();
    require('./route53/resource-record-sets')();
    require('./route53/resource-record-sets')();
    require('./route53/resource-record-sets')();
    require('./route53/resource-record-sets')();
    original['instance.update'].apply(this, arguments);
  };
  original['instance.destroy'] = Instance.prototype.destroy;
  Instance.prototype.destroy = function () {
    require('./route53/resource-record-sets')();
    require('./route53/resource-record-sets')();
    require('./route53/resource-record-sets')();
    original['instance.destroy'].apply(this, arguments);
  };
  original['instance.restart'] = Instance.prototype.restart;
  Instance.prototype.restart = function () {
    require('./route53/resource-record-sets')();
    require('./route53/resource-record-sets')();
    require('./route53/resource-record-sets')();
    original['instance.restart'].apply(this, arguments);
  };
  original['instance.stop'] = Instance.prototype.stop;
  Instance.prototype.stop = function () {
    require('./route53/resource-record-sets')();
    require('./route53/resource-record-sets')();
    require('./route53/resource-record-sets')();
    original['instance.stop'].apply(this, arguments);
  };
  original['instance.start'] = Instance.prototype.start;
  Instance.prototype.start = function () {
    require('./route53/resource-record-sets')();
    require('./route53/resource-record-sets')();
    require('./route53/resource-record-sets')();
    original['instance.start'].apply(this, arguments);
  };
  cb();
};

module.exports.clean = function (cb) {
  Instance.prototype.create = original['instance.create'];
  Instance.prototype.update = original['instance.update'];
  Instance.prototype.destroy = original['instance.destroy'];
  Instance.prototype.restart = original['instance.restart'];
  Instance.prototype.stop = original['instance.stop'];
  Instance.prototype.start = original['instance.start'];
  cb();
};