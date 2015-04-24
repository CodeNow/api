/**
 * Tests for POST /workers/container-create
 * - Internal route
 * @module test/workers/container-create
 */
'use strict';


var Lab = require('lab');
var lab = exports.lab = Lab.script();
var describe = lab.describe;
var it = lab.it;
var before = lab.before;
var beforeEach = lab.beforeEach;
var after = lab.after;
var afterEach = lab.afterEach;
var Code = require('code');
var expect = Code.expect;
var sinon = require('sinon');

var api = require('../../fixtures/api-control');
var multi = require('../../fixtures/multi-factory');

describe('201 POST /workers/container-create', function () {
  it('should upate instance with container information', function (done) {
    done();
  });
  it('should deploy/start the container', function (done) {
    done();
  });
});
