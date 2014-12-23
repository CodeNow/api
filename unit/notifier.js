'use strict';
var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;
var expect = Lab.expect;
var before = Lab.before;
var after = Lab.after;
var beforeEach = Lab.beforeEach;
var afterEach = Lab.afterEach;
var Notifier = require('models/notifications/notifier');

describe('Notifier', function () {

  it('should throw an error if send was not implemented', function (done) {
    var slack = new Notifier('slack', {});
    var sendMethod = slack.send.bind(slack, 'some-text');
    expect(sendMethod).to.throw(Error, 'Not implemented');
    done();
  });

});