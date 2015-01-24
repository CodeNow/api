var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;
var expect = Lab.expect;
var beforeEach = Lab.beforeEach;
var afterEach = Lab.afterEach;

var Primus = require('primus');
var api = require('../test/fixtures/api-control');
var messenger = require('socket/messenger');
var createCount = require('callback-count');

var Socket = Primus.createSocket({
  transformer: process.env.PRIMUS_TRANSFORMER,
  plugin: {
    'substream': require('substream')
  },
  parser: 'JSON'
});

describe('messenger Unit Tests', function() {
  var ctx = {};
  beforeEach(api.start.bind(ctx));
  afterEach(api.stop.bind(ctx));

  describe('send message to room', function () {
    it('should get joined room message', function(done) {
      var primus = new Socket('http://localhost:'+process.env.PORT);
      primus.write({
        id: 1,
        event: 'subscribe',
        data: {
          type: 'org',
          name: 'test',
          action: 'join'
        }
      });
      primus.on('data', function(data) {
        expect(data.id).to.equal(1);
        expect(data.event).to.equal('ROOM_ACTION_COMPLETE');
        expect(data.data.type).to.equal('org');
        expect(data.data.name).to.equal('test');
        expect(data.data.action).to.equal('join');
        primus.end();
      });
      primus.on('end', done);
    });
    it('should get message from joined room', function(done) {
      var primus = new Socket('http://localhost:'+process.env.PORT);
      primus.write({
        id: 1421,
        event: 'subscribe',
        data: {
          type: 'org',
          name: 'test',
          action: 'join'
        }
      });
      primus.on('data', function(data) {
        if (data.event === 'ROOM_MESSAGE') {
          expect(data.type).to.equal('org');
          expect(data.name).to.equal('test');
          expect(data.data).to.deep.equal({test:'1234'});
          primus.end();
        } else {
            messenger.messageRoom('org', 'test', {test:'1234'});
        }
      });
      primus.on('end', done);
    });
    it('should not get events of another room or no room', function(done) {
      // room message will be sent to
      var primus1 = new Socket('http://localhost:'+process.env.PORT);
      // in no room
      var primus2 = new Socket('http://localhost:'+process.env.PORT);
      // in room with similer name
      var primus3 = new Socket('http://localhost:'+process.env.PORT);

      // primus2 join room testt
      // primus1 join room test
      // message room test
      // primus1 gets event, close all primus
      // done when all primus ends
      var count = createCount(3, done);
      primus1.on('end', count.next);
      primus2.on('end', count.next);
      primus3.on('end', count.next);

      primus2.write({
        id: 1234,
        event: 'subscribe',
        data: {
          type: 'org',
          name: 'testt',
          action: 'join'
        }
      });
      primus3.on('data', function() {
        done(new Error('should not have got here'));
      });
      primus2.on('data', function(data) {
        if (data.event !== 'ROOM_ACTION_COMPLETE') {
          return done(new Error('should not have got here'));
        }
        primus1.write({
          id: 1421,
          event: 'subscribe',
          data: {
            type: 'org',
            name: 'test',
            action: 'join'
          }
        });
      });
      primus1.on('data', function(data) {
        if (data.event === 'ROOM_MESSAGE') {
          expect(data.type).to.equal('org');
          expect(data.name).to.equal('test');
          expect(data.data).to.deep.equal({test:'1234'});
          primus1.end();
          primus2.end();
          primus3.end();
        } else {
          messenger.messageRoom('org', 'test', {test:'1234'});
        }
      });
    });
   it('should send events to everyone in room', function(done) {
      var primus1 = new Socket('http://localhost:'+process.env.PORT);
      var primus2 = new Socket('http://localhost:'+process.env.PORT);
      var primus3 = new Socket('http://localhost:'+process.env.PORT);

      var count = createCount(3, done);
      var sendMessageCount  = createCount(3, function() {
        messenger.messageRoom('org', 'test', {test:'1234'});
      });

      primus1.on('end', count.next);
      primus2.on('end', count.next);
      primus3.on('end', count.next);

      primus1.write({id:1234,event:'subscribe',data:{type:'org',name:'test',action:'join'}});
      primus2.write({id:1235,event:'subscribe',data:{type:'org',name:'test',action:'join'}});
      primus3.write({id:1236,event:'subscribe',data:{type:'org',name:'test',action:'join'}});

      primus1.on('data', function(data) {
        if (data.event === 'ROOM_MESSAGE') {
          expect(data.type).to.equal('org');
          expect(data.name).to.equal('test');
          expect(data.data).to.deep.equal({test:'1234'});
          primus1.end();
        } else {
          sendMessageCount.next();
        }
      });
      primus2.on('data', function(data) {
        if (data.event === 'ROOM_MESSAGE') {
          expect(data.type).to.equal('org');
          expect(data.name).to.equal('test');
          expect(data.data).to.deep.equal({test:'1234'});
          primus2.end();
        } else {
          sendMessageCount.next();
        }
      });
      primus3.on('data', function(data) {
        if (data.event === 'ROOM_MESSAGE') {
          expect(data.type).to.equal('org');
          expect(data.name).to.equal('test');
          expect(data.data).to.deep.equal({test:'1234'});
          primus3.end();
        } else {
          sendMessageCount.next();
        }
      });
    });
    it('should join and leave room', function(done) {
      var primus1 = new Socket('http://localhost:'+process.env.PORT);

      primus1.on('end', done);

      primus1.write({id:5678,event:'subscribe',data:{type:'org',name:'test',action:'join'}});

      primus1.on('data', function(data) {
        if (data.event === 'ROOM_ACTION_COMPLETE') {
          expect(data.data.type).to.equal('org');
          expect(data.data.name).to.equal('test');
          if(data.data.action === 'join') {
            messenger.messageRoom('org', 'test', {test:'1234'});
          } else if(data.data.action === 'leave') {
            primus1.end();
          }
        } else if (data.event === 'ROOM_MESSAGE') {
          expect(data.type).to.equal('org');
          expect(data.name).to.equal('test');
          expect(data.data).to.deep.equal({test:'1234'});
          primus1.write({id:2222,event:'subscribe',data:{type:'org',name:'test',action:'leave'}});
        }
      });
    });
  });
});