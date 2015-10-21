/**
 * @module unit/models/mongo/schemas/user
 */
'use strict';

var Code = require('code');
var Lab = require('lab');
var path = require('path');

var lab = exports.lab = Lab.script();

var describe = lab.describe;
var it = lab.it;
var expect = Code.expect;

var UserSchema = require('models/mongo/schemas/user');

var moduleName = path.relative(process.cwd(), __filename);
describe('User Schema: ' + moduleName, function () {
  describe('_transformToJSON', function () {
    it('should strip sensitive properties', function (done) {
      var ret = {
        accounts: {
          github: {
            accessToken: '12345'
          }
        }
      };
      var res = UserSchema._transformToJSON({}, ret);
      expect(res.accounts.github.accessToken).to.not.exist();
      done();
    });
  });
});
