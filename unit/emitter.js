var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;

var emitter = require('../lib/socket/emitter.js');

function socket (testData, done) {
  return {
    writable: true,
    write: function(data) {
      Lab.expect(data).to.deep.equal(testData);
      done();
    }
  };
}

describe('emitter Unit Tests', function() {
  describe('emit', function () {
    it('should emit data', function(done) {
      var testData = {
        string: 'hi',
        object: {
          hello: 'test'
        },
        number: 124,
        bool: true
      };
      emitter.attachSocket(socket(testData, done));
      emitter.emit(testData);
    });
  });
  describe('emitImagePulling', function () {
    it('should emit IMAGE_PULLING event', function(done) {
      emitter.attachSocket(socket({ event: 'IMAGE_PULLING' }, done));
      emitter.emitImagePulling();
    });
  });
});