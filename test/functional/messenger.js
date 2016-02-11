'use strict'

var Lab = require('lab')
var lab = exports.lab = Lab.script()
var describe = lab.describe
var it = lab.it
var before = lab.before
var after = lab.after
var Code = require('code')
var expect = Code.expect

var Primus = require('primus')
var api = require('./fixtures/api-control')
var messenger = require('socket/messenger')
var createCount = require('callback-count')

var Socket = Primus.createSocket({
  transformer: process.env.PRIMUS_TRANSFORMER,
  plugin: {
    'substream': require('substream')
  },
  parser: 'JSON'
})

describe('messenger Unit Tests', function () {
  var ctx = {}
  before(api.start.bind(ctx))
  after(api.stop.bind(ctx))

  describe('send message to room', function () {
    it('should get joined room message', function (done) {
      var token = process.env.PRIMUS_AUTH_TOKEN
      var url = process.env.FULL_API_DOMAIN + '?token=' + token
      var primus = new Socket(url)
      primus.write({
        id: 1,
        event: 'subscribe',
        data: {
          type: 'org',
          name: 'test',
          action: 'join'
        }
      })
      primus.on('data', function (data) {
        expect(data.id).to.equal(1)
        expect(data.event).to.equal('ROOM_ACTION_COMPLETE')
        expect(data.data.type).to.equal('org')
        expect(data.data.name).to.equal('test')
        expect(data.data.action).to.equal('join')
        primus.end()
      })
      primus.on('end', done)
    })
    it('should get message from joined room', function (done) {
      var token = process.env.PRIMUS_AUTH_TOKEN
      var url = process.env.FULL_API_DOMAIN + '?token=' + token
      var primus = new Socket(url)
      primus.write({
        id: 1421,
        event: 'subscribe',
        data: {
          type: 'org',
          name: 'test',
          action: 'join'
        }
      })
      primus.on('data', function (data) {
        if (data.event === 'ROOM_MESSAGE') {
          expect(data.type).to.equal('org')
          expect(data.name).to.equal('test')
          expect(data.data).to.deep.contain({test: '1234'})
          expect(Object.keys(data.data)).to.have.length(1)
          primus.end()
        } else {
          messenger.messageRoom('org', 'test', {test: '1234'})
        }
      })
      primus.on('end', function (err) {
        done(err)
      })
    })
    it('should not get events of another room or no room', function (done) {
      var token = process.env.PRIMUS_AUTH_TOKEN
      var url = process.env.FULL_API_DOMAIN + '?token=' + token
      // room message will be sent to
      var primus1 = new Socket(url)
      // in no room
      var primus2 = new Socket(url)
      // in room with similer name
      var primus3 = new Socket(url)

      // primus2 join room testt
      // primus1 join room test
      // message room test
      // primus1 gets event, close all primus
      // done when all primus ends
      var count = createCount(3, done)
      primus1.on('end', count.next)
      primus2.on('end', count.next)
      primus3.on('end', count.next)

      primus2.write({
        id: 1234,
        event: 'subscribe',
        data: {
          type: 'org',
          name: 'testt',
          action: 'join'
        }
      })
      primus3.on('data', function () {
        done(new Error('should not have got here'))
      })
      primus2.on('data', function (data) {
        if (data.event !== 'ROOM_ACTION_COMPLETE') {
          return done(new Error('should not have got here'))
        }
        primus1.write({
          id: 1421,
          event: 'subscribe',
          data: {
            type: 'org',
            name: 'test',
            action: 'join'
          }
        })
      })
      primus1.on('data', function (data) {
        if (data.event === 'ROOM_MESSAGE') {
          expect(data.type).to.equal('org')
          expect(data.name).to.equal('test')
          expect(data.data).to.deep.contain({test: '1234'})
          expect(Object.keys(data.data)).to.have.length(1)
          primus1.end()
          primus2.end()
          primus3.end()
        } else {
          messenger.messageRoom('org', 'test', {test: '1234'})
        }
      })
    })
    it('should send events to everyone in room', function (done) {
      var token = process.env.PRIMUS_AUTH_TOKEN
      var url = process.env.FULL_API_DOMAIN + '?token=' + token
      var primus1 = new Socket(url)
      var primus2 = new Socket(url)
      var primus3 = new Socket(url)

      var count = createCount(3, done)
      var sendMessageCount = createCount(3, function () {
        messenger.messageRoom('org', 'test', {test: '1234'})
      })

      primus1.on('end', count.next)
      primus2.on('end', count.next)
      primus3.on('end', count.next)

      primus1.write({
        id: 1234,
        event: 'subscribe',
        data: {
          type: 'org',
          name: 'test',
          action: 'join'
        }
      })
      primus2.write({
        id: 1235,
        event: 'subscribe',
        data: {
          type: 'org',
          name: 'test',
          action: 'join'
        }
      })
      primus3.write({
        id: 1236,
        event: 'subscribe',
        data: {
          type: 'org',
          name: 'test',
          action: 'join'
        }
      })

      primus1.on('data', function (data) {
        if (data.event === 'ROOM_MESSAGE') {
          expect(data.type).to.equal('org')
          expect(data.name).to.equal('test')
          expect(data.data).to.deep.contain({test: '1234'})
          expect(Object.keys(data.data)).to.have.length(1)
          primus1.end()
        } else {
          sendMessageCount.next()
        }
      })
      primus2.on('data', function (data) {
        if (data.event === 'ROOM_MESSAGE') {
          expect(data.type).to.equal('org')
          expect(data.name).to.equal('test')
          expect(data.data).to.deep.contain({test: '1234'})
          expect(Object.keys(data.data)).to.have.length(1)
          primus2.end()
        } else {
          sendMessageCount.next()
        }
      })
      primus3.on('data', function (data) {
        if (data.event === 'ROOM_MESSAGE') {
          expect(data.type).to.equal('org')
          expect(data.name).to.equal('test')
          expect(data.data).to.deep.contain({test: '1234'})
          expect(Object.keys(data.data)).to.have.length(1)
          primus3.end()
        } else {
          sendMessageCount.next()
        }
      })
    })
    it('should join and leave room', function (done) {
      var token = process.env.PRIMUS_AUTH_TOKEN
      var url = process.env.FULL_API_DOMAIN + '?token=' + token
      var primus1 = new Socket(url)

      primus1.on('end', done)

      primus1.write({
        id: 5678,
        event: 'subscribe',
        data: {
          type: 'org',
          name: 'test',
          action: 'join'
        }
      })

      primus1.on('data', function (data) {
        if (data.event === 'ROOM_ACTION_COMPLETE') {
          expect(data.data.type).to.equal('org')
          expect(data.data.name).to.equal('test')
          if (data.data.action === 'join') {
            messenger.messageRoom('org', 'test', {test: '1234'})
          } else if (data.data.action === 'leave') {
            primus1.end()
          }
        } else if (data.event === 'ROOM_MESSAGE') {
          expect(data.type).to.equal('org')
          expect(data.name).to.equal('test')
          expect(data.data).to.deep.contain({test: '1234'})
          expect(Object.keys(data.data)).to.have.length(1)
          primus1.write({
            id: 2222,
            event: 'subscribe',
            data: {
              type: 'org',
              name: 'test',
              action: 'leave'
            }
          })
        }
      })
    })
  })
})
