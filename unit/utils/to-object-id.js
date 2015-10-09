'use strict';

var Lab = require('lab');
var lab = exports.lab = Lab.script();
var describe = lab.describe;
var it = lab.it;
var Code = require('code');
var expect = Code.expect;

var ObjectId = require('mongoose').Types.ObjectId;
var toObjectId = require('utils/to-object-id');

var path = require('path');
var moduleName = path.relative(process.cwd(), __filename);

describe('to-object-id: '+moduleName, function () {

  it('should return new ObjectId from string', function (done) {
    var objId = toObjectId('5616f6cbed85912200c264b2');
    expect(objId.toString()).to.equal('5616f6cbed85912200c264b2');
    expect(objId.equals(new ObjectId('5616f6cbed85912200c264b2'))).to.be.true();
    done();
  });

  it('should return old ObjectId if ObjectId was paseed', function (done) {
    var objId = toObjectId(new ObjectId('5616f6cbed85912200c264b2'));
    expect(objId.toString()).to.equal('5616f6cbed85912200c264b2');
    expect(objId.equals(new ObjectId('5616f6cbed85912200c264b2'))).to.be.true();
    done();
  });
});
