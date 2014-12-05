var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;
var expect = Lab.expect;
var before = Lab.before;
var afterEach = Lab.afterEach;

require('loadenv')();
var redisList = require('models/redis/dns');
var redis = require('models/redis/index');
var async = require('async');
var uuid = require('uuid');

describe('redisList', function () {
});
