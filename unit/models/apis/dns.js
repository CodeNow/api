'use strict';

var Lab = require('lab');
var lab = exports.lab = Lab.script();
var describe = lab.describe;
var it = lab.it;
var beforeEach = lab.beforeEach;
var afterEach = lab.afterEach;
var Code = require('code');
var expect = Code.expect;

var uuid = require('uuid');

require('loadenv')();
var sinon = require('sinon');
var clone = require('101/clone');
var keypather = require('keypather')();
var runnableHostname = require('runnable-hostname');
var DNS = require('models/apis/dns');

describe('dns', function () {
  beforeEach(function (done) {
    sinon.stub(runnableHostname, 'elastic').returns('elastic');
    sinon.stub(runnableHostname, 'direct').returns('direct');
    done();
  });
  afterEach(function (done) {
    runnableHostname.elastic.restore();
    runnableHostname.direct.restore();
    done();
  });

  it('should generate a good url from a instance name and ownername', function (done) {
    var iName = uuid();
    var oName = uuid();
    // master instance w/out branch
    var masterNoBranch = {
      shortHash: 'abcdef',
      masterPod: true
    };
    // master instance w/ branch
    var master = clone(masterNoBranch);
    keypather.set(master, 'contextVersion.appCodeVersions[0].lowerBranch', 'branch');
    // non master instance
    var nonMaster = clone(master);
    nonMaster.masterPod = false;

    expect(DNS.generateUrls(iName, oName, masterNoBranch))
      .to.deep.equal([
        'elastic'
      ]);
    expect(DNS.generateUrls(iName, oName, master))
      .to.deep.equal([
        'elastic',
        'direct'
      ]);
    expect(DNS.generateUrls(iName, oName, nonMaster))
      .to.deep.equal([
        'direct'
      ]);


    done();
  });
});

