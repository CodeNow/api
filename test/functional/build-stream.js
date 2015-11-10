'use strict'

var Lab = require('lab')
var lab = exports.lab = Lab.script()
var describe = lab.describe
var it = lab.it
var before = lab.before
var beforeEach = lab.beforeEach
var after = lab.after
var afterEach = lab.afterEach
var Code = require('code')
var expect = Code.expect

var api = require('./fixtures/api-control')
var dock = require('./fixtures/dock')
var multi = require('./fixtures/multi-factory')
var primus = require('./fixtures/primus')
var dockerMockEvents = require('./fixtures/docker-mock-events')
var createCount = require('callback-count')
var Primus = require('primus')
var PrimusClient = Primus.createSocket({
  transformer: process.env.PRIMUS_TRANSFORMER,
  plugin: {
    'substream': require('substream')
  },
  parser: 'JSON'
})

var ctx = {}

describe('Build Stream', function () {
  ctx = {}

  before(api.start.bind(ctx))
  before(dock.start.bind(ctx))
  before(primus.connect)
  afterEach(require('./fixtures/clean-mongo').removeEverything)
  afterEach(require('./fixtures/clean-ctx')(ctx))
  afterEach(require('./fixtures/clean-nock'))
  after(primus.disconnect)
  after(dock.stop.bind(ctx))
  after(api.stop.bind(ctx))

  describe('POST', function () {
    beforeEach(function (done) {
      multi.createContextVersion(function (err, cv, context, build, user) {
        ctx.cv = cv
        ctx.context = context
        ctx.build = build
        ctx.user = user
        done(err)
      })
    })
    beforeEach(function (done) {
      primus.joinOrgRoom(ctx.user.json().accounts.github.id, done)
    })

    it('should get full logs from build stream', function (done) {
      require('./fixtures/mocks/docker/build-logs')()
      require('./fixtures/mocks/github/user')(ctx.user)
      ctx.build.build(ctx.buildId, { message: 'hello!' }, function (err, body, code) {
        if (err) {
          return done(err)
        }

        expect(code).to.equal(201)
        expect(body).to.exist()

        dockerMockEvents.emitBuildComplete(ctx.cv)
        primus.onceVersionComplete(ctx.cv.id(), function () {
          var client = new PrimusClient('http://localhost:' + process.env.PORT)
          // start build stream
          client.write({
            id: 1,
            event: 'build-stream',
            data: {
              id: body.contextVersions[0],
              streamId: body.contextVersions[0]
            }
          })
          var buildStream = client.substream(body.contextVersions[0])
          var objectBuffer = []
          buildStream.on('data', function (d) { objectBuffer.push(d) })
          buildStream.on('end', function () {
            client.end()
            expect(objectBuffer).to.have.length(1)
            expect(objectBuffer[0].content).to.match(/^Successfully built .+/)
            done()
          })
        })
      })
    })

    it('should error if build does not exist', function (done) {
      var client = new PrimusClient('http://localhost:' + process.env.PORT)
      // start build stream
      client.write({
        id: 1,
        event: 'build-stream',
        data: {
          id: 'fakeVersion',
          streamId: 'fakeVersion'
        }
      })

      client.on('data', function (msg) {
        if (msg.error) {
          client.end()
          expect(msg.error).to.contain('could not find build in database')
          done()
        }
      })
    })

    it('should get logs from build stream', function (done) {
      require('./fixtures/mocks/github/user')(ctx.user)
      ctx.build.build(ctx.buildId, { message: 'hello!' }, function (err, body, code) {
        if (err) { return done(err) }
        expect(code).to.equal(201)
        expect(body).to.exist()
        require('./fixtures/mocks/docker/build-logs.js')()
        var client = new PrimusClient('http://localhost:' + process.env.PORT)
        // start build stream
        client.write({
          id: 1,
          event: 'build-stream',
          data: {
            id: body.contextVersions[0],
            streamId: body.contextVersions[0]
          }
        })
        // create substream for build logs
        var count = createCount(2, done)
        var buildStream = client.substream(body.contextVersions[0])
        dockerMockEvents.emitBuildComplete(ctx.cv)

        primus.onceVersionComplete(ctx.cv.id(), function () {
          count.next()
        })

        var objectBuffer = []
        buildStream.on('data', function (d) { objectBuffer.push(d) })
        buildStream.on('end', function () {
          client.end()
          expect(objectBuffer).to.have.length(1)
          expect(objectBuffer[0].content).to.match(/^Successfully built .+/)
          count.next()
        })
      })
    })

    it('100 people should get the same logs', function (done) {
      var people = 100
      require('./fixtures/mocks/github/user')(ctx.user)
      ctx.build.build(ctx.buildId, { message: 'lots of people!' }, function (err, body, code) {
        if (err) { return done(err) }
        expect(code).to.equal(201)
        expect(body).to.exist()
        primus.onceVersionComplete(ctx.cv.id(), function () {
          // start build stream
          var count = createCount(done)
          var client
          for (var i = 0; i < people; i++) {
            client = new PrimusClient('http://localhost:' + process.env.PORT)
            // start build stream
            client.write({
              id: 1,
              event: 'build-stream',
              data: {
                id: body.contextVersions[0],
                streamId: body.contextVersions[0]
              }
            })
            var buildStream = client.substream(body.contextVersions[0])
            // var concatStream = concat(assertForClient(client, count.inc().next))
            watchClientAndStream(client, buildStream, count.inc().next)
          }
          function watchClientAndStream (c, s, cb) {
            var objectBuffer = []
            s.on('data', function (d) { objectBuffer.push(d) })
            s.on('end', function () {
              c.end()
              expect(objectBuffer).to.have.length(1)
              expect(objectBuffer[0].content).to.match(/^Successfully built .+/)
              cb()
            })
          }
        })
        dockerMockEvents.emitBuildComplete(ctx.cv)
      })
    })
  })
})
