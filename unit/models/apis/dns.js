'use strict';

var Lab = require('lab');
var lab = exports.lab = Lab.script();
var describe = lab.describe;
var it = lab.it;
var Code = require('code');
var expect = Code.expect;

var uuid = require('uuid');

require('loadenv')();
var DNS = require('models/apis/dns');

describe('dns', function () {
  it('should generate a good url from a instance name and ownername', function (done) {
    var iName = uuid();
    var oName = uuid();
    expect(DNS.generateUrl(iName, oName))
      .to.equal(iName + '-' + oName + '.' + process.env.USER_CONTENT_DOMAIN);
    done();
  });
});

