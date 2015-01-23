require('loadenv')();
var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;
var expect = Lab.expect;
var before = Lab.before;
var after = Lab.after;
var uuid = require('uuid');
var SocketServer = require('../lib/socket/socket-server.js');
var Primus = require('primus');
var http = require('http');
var httpServer;
var primusClient = Primus.createSocket({
  transformer: process.env.PRIMUS_TRANSFORMER,
  plugin: {
    'substream': require('substream')
  },
  parser: 'JSON'
});


describe('socket-server', function () {

  describe('init test', function () {
    it('should error if no server passed in', function (done) {
      try {
        new SocketServer();
      } catch(err) {
        return done();
      }
      return done(new Error('failed to error is invalid server passed in'));
    });
    it('should load with no errors', function (done) {
      try {
        httpServer = http.createServer();
        new SocketServer(httpServer);
      } catch(err) {
        return done(err);
      }
      return done();
    });
  });

  describe('functionality test', function () {
    var socketServer;
    before(function (done) {
      httpServer = http.createServer();
      socketServer = new SocketServer(httpServer);
      httpServer.listen(process.env.PORT, done);
    });

    after(function (done) {
      httpServer.close(done);
    });

    it('should be able to connect', function (done) {
      var client = new primusClient('http://localhost:'+process.env.PORT);
      client.on('open', client.end);
      client.on('end', done);
    });

    it('should send error for blank message', function (done) {
      var client = new primusClient('http://localhost:'+process.env.PORT);
      client.on('open', function() {
        client.write('');
      });
      client.on('data', function(data){
        expect(data.error).to.equal('invalid input');
        client.end();
        done();
      });
    });

    it('should send error for invalid message format', function (done) {
      var client = new primusClient('http://localhost:'+process.env.PORT);
      client.on('open', function() {
        client.write('invalid message');
      });
      client.on('data', function(data){
        expect(data.error).to.equal('invalid input');
        client.end();
        done();
      });
    });

    it('should send error for invalid message data', function (done) {
      var client = new primusClient('http://localhost:'+process.env.PORT);
      client.on('open', function() {
        client.write({
          event: 123,
          id: 'invalid'
        });
      });
      client.on('data', function(data){
        expect(data.error).to.equal('invalid input');
        client.end();
        done();
      });
    });

    it('should send error for invalid data type', function (done) {
      var client = new primusClient('http://localhost:'+process.env.PORT);
      client.on('open', function() {
        client.write({
          event: 'invalid',
          id: 1,
          data: 'wrong type'
        });
      });
      client.on('data', function(data){
        expect(data.error).to.equal('invalid input');
        client.end();
        done();
      });
    });

    it('should send error for invalid event', function (done) {
      var client = new primusClient('http://localhost:'+process.env.PORT);
      client.on('open', function() {
        client.write({
          event: 'invalid',
          id: 1
        });
      });
      client.on('data', function(data){
        expect(data.error).to.equal('invalid event');
        client.end();
        done();
      });
    });

    it('should correctly add handler', function (done) {
      socketServer.addHandler('test', function(socket, id, data) {
        socket.write({
          id: id,
          event: "test_resp",
          data: data
        });
      });
      var client = new primusClient('http://localhost:'+process.env.PORT);
      client.on('open', function() {
        client.write({
          event: 'test',
          id: 1,
          data: {
            some:'data'
          }
        });
      });
      client.on('data', function(data){
        socketServer.removeHandler('test');
        expect(data.id).to.equal(1);
        expect(data.event).to.equal('test_resp');
        expect(data.data.some).to.equal('data');
        client.end();
        done();
      });
    });

    it('should correctly use substream', function (done) {
      socketServer.addHandler('test', function(socket, id) {
        var roomId = uuid();
        socket.substream(roomId).on('data', function() {
          socket.end(done());
        });
        socket.write({
          id: id,
          event: "test_resp",
          data: {
            roomId: roomId
          }
        });
      });
      var client = new primusClient('http://localhost:'+process.env.PORT);
      client.on('open', function() {
        client.write({
          event: 'test',
          id: 1,
          data: {
            some:'data'
          }
        });
      });
      client.on('data', function(message){
        client.substream(message.data.roomId).write('test');
      });
    });
  });
});