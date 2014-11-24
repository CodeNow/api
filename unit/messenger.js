var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;

var Messenger = require('../lib/socket/messenger.js');

function socket (testData, done) {
  return {
    writable: true,
    write: function(data) {
      Lab.expect(data).to.deep.equal(testData);
      done();
    }
  };
}

function closedSocket (done) {
  return {
    writable: false,
    write: function() { done(new Error('should not write')); }
  };
}

function noop () {}

describe('messenger Unit Tests', function() {
  describe('new', function () {
    it('should set socket', function(done) {
      var messenger = new Messenger(socket);
      Lab.expect(messenger.socket).to.equal(socket);
      done();
    });
    it('should throw error if socket not passed', function(done) {
      try {
        var messenger = new Messenger(null);
        done(new Erorr('error not thrown', messenger));
      } catch(err) {
        Lab.expect(err.message).to.equal('Messenger needs socket');
        done();
      }
    });
  });
  describe('emit', function () {
    var testData = {
      string: 'hi',
      object: {
        hello: 'test'
      },
      number: 124,
      bool: true
    };
    it('should emit data', function(done) {
      var messenger = new Messenger(socket(testData, done));
      messenger.emit(testData, noop);
    });
    it('should not emit data if socket closed', function(done) {
      var messenger = new Messenger(closedSocket(done));
      messenger.emit(testData, done);
    });
  });
  describe('emitImagePulling', function () {
    it('should emit IMAGE_PULLING event', function(done) {
      var messenger = new Messenger(socket({ event: 'IMAGE_PULLING' }, done));
      messenger.emitImagePulling(noop);
    });
    it('should not emit IMAGE_PULLING event if socket closed', function(done) {
      var messenger = new Messenger(closedSocket(done));
      messenger.emitImagePulling(done);
    });
  });
});