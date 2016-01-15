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
var commonStream = require('socket/common-stream')
var dock = require('./fixtures/dock')
var mockGetUserById = require('./fixtures/mocks/github/getByUserId')
var multi = require('./fixtures/multi-factory')
var primus = require('./fixtures/primus')
var dockerMockEvents = require('./fixtures/docker-mock-events')
var createCount = require('callback-count')
var Primus = require('primus')
var Promise = require('bluebird')
var PrimusClient = Primus.createSocket({
  transformer: process.env.PRIMUS_TRANSFORMER,
  plugin: {
    'substream': require('substream')
  },
  parser: 'JSON'
})
var sinon = require('sinon')

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
  beforeEach(
    mockGetUserById.stubBefore(function () {
      return []
    })
  )
  beforeEach(function (done) {
    sinon.stub(commonStream, 'checkOwnership').returns(Promise.resolve(true))
    done()
  })
  afterEach(mockGetUserById.stubAfter)
  afterEach(function (done) {
    commonStream.checkOwnership.restore()
    done()
  })

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
      var body
      primus.onceVersionBuildRunning(ctx.cv.id(), function () {
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

        dockerMockEvents.emitBuildComplete(ctx.cv)
      })

      ctx.build.build(ctx.buildId, { message: 'hello!' }, function (err, _body, code) {
        if (err) {
          return done(err)
        }
        body = _body
        expect(code).to.equal(201)
        expect(body).to.exist()
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

      var count = createCount(2, done)

      client.on('data', function (msg) {
        if (msg.error) {
          client.end()
          expect(msg.error).to.match(/could not find build in database||You don\'t have access to this stream/)
          count.next()
        }
      })
    })

    it('should get logs from build stream', function (done) {
      var body

      primus.onceVersionBuildRunning(ctx.cv.id(), function () {
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

        primus.onceVersionComplete(ctx.cv.id(), function () {
          count.next()
        })

        dockerMockEvents.emitBuildComplete(ctx.cv)

        var objectBuffer = []
        buildStream.on('data', function (d) { objectBuffer.push(d) })
        buildStream.on('end', function () {
          client.end()
          expect(objectBuffer).to.have.length(1)
          expect(objectBuffer[0].content).to.match(/^Successfully built .+/)
          count.next()
        })
      })

      require('./fixtures/mocks/github/user')(ctx.user)
      ctx.build.build(ctx.buildId, { message: 'hello!' }, function (err, _body, code) {
        if (err) { return done(err) }
        body = _body
        expect(code).to.equal(201)
        expect(body).to.exist()
      })
    })

    it('100 people should get the same logs', function (done) {
      var people = 100
      var body
      primus.onceVersionBuildRunning(ctx.cv.id(), function () {
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

      require('./fixtures/mocks/github/user')(ctx.user)
      ctx.build.build(ctx.buildId, { message: 'lots of people!' }, function (err, _body, code) {
        if (err) { return done(err) }
        body = _body
        expect(code).to.equal(201)
        expect(body).to.exist()
      })
    })
  })
})
