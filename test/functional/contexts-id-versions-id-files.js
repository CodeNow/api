'use strict'

var Lab = require('lab')
var lab = exports.lab = Lab.script()
var describe = lab.describe
var it = lab.it
var before = lab.before
var beforeEach = lab.beforeEach
var after = lab.after
var afterEach = lab.afterEach

var exists = require('101/exists')
var join = require('path').join

var expects = require('./fixtures/expects')
var api = require('./fixtures/api-control')
var dock = require('./fixtures/dock')
var mockGetUserById = require('./fixtures/mocks/github/getByUserId')
var multi = require('./fixtures/multi-factory')
var createCount = require('callback-count')
var primus = require('./fixtures/primus')

function createFile (contextId, path, name, isDir, fileType) {
  var key = (isDir) ? join(contextId, 'source', path, name, '/') : join(contextId, 'source', path, name)
  return {
    _id: exists,
    ETag: exists,
    VersionId: exists,
    Key: key,
    name: name,
    path: path,
    isDir: isDir || false,
    fileType: fileType
  }
}

describe('Version Files - /contexts/:contextid/versions/:id/files', function () {
  var ctx = {}

  before(api.start.bind(ctx))
  before(dock.start.bind(ctx))
  beforeEach(primus.connect)
  afterEach(primus.disconnect)
  after(api.stop.bind(ctx))
  after(dock.stop.bind(ctx))
  afterEach(require('./fixtures/clean-mongo').removeEverything)
  afterEach(require('./fixtures/clean-ctx')(ctx))
  afterEach(require('./fixtures/clean-nock'))
  beforeEach(
    mockGetUserById.stubBefore(function () {
      return []
    })
  )
  afterEach(mockGetUserById.stubAfter)

  beforeEach(function (done) {
    multi.createContextVersion(function (err, contextVersion, context, build, user, others) {
      ctx.contextVersion = contextVersion
      ctx.context = context
      ctx.build = build
      ctx.user = user
      ctx.srcContext = others && others[1]
      done(err)
    })
  })

  describe('GET', function () {
    it('should give us files from a given version', function (done) {
      var expected = [
        createFile(ctx.context.id(), '/', 'Dockerfile')
      ]
      require('./fixtures/mocks/s3/get-object')(ctx.context.id(), '/', 'stuffz')
      ctx.contextVersion.rootDir.contents.fetch(expects.success(200, expected, done))
    })
  })

  describe('POST - discard changes', function () {
    beforeEach(function (done) {
      require('./fixtures/mocks/s3/get-object')(ctx.context.id(), '/')
      ctx.files = ctx.contextVersion.rootDir.contents.fetch(function (err) {
        if (err) { return done(err) }
        var count = createCount(2, done)
        require('./fixtures/mocks/s3/get-object')(ctx.context.id(), 'Dockerfile', 'stuff')
        require('./fixtures/mocks/s3/get-object')(ctx.context.id(), '/')
        require('./fixtures/mocks/s3/put-object')(ctx.context.id(), 'file.txt')
        require('./fixtures/mocks/s3/get-object')(ctx.context.id(), 'file.txt')
        ctx.contextVersion.rootDir.contents.create({
          json: {
            name: 'file.txt',
            path: '/',
            body: 'asdf'
          }
        }, count.next)
        ctx.dockerfile = ctx.contextVersion.fetchFile('/Dockerfile', count.next)
      })
    })

    it('should get rid of all the changes we had', function (done) {
      require('./fixtures/mocks/s3/get-object')(ctx.srcContext.id(), '/')
      require('./fixtures/mocks/s3/get-object')(ctx.srcContext.id(), 'Dockerfile')
      require('./fixtures/mocks/s3/put-object')(ctx.context.id(), '/')
      require('./fixtures/mocks/s3/put-object')(ctx.context.id(), 'Dockerfile')
      ctx.contextVersion.discardFileChanges(expects.success(204, function (err) {
        if (err) { return done(err) }
        var expected = [{
          name: 'Dockerfile',
          path: '/',
          Key: exists,
          ETag: exists,
          VersionId: exists
        }]
        require('./fixtures/mocks/s3/get-object')(ctx.context.id(), '/')
        ctx.contextVersion.rootDir.contents.fetch(expects.success(200, expected, done))
      }))
    })
  })

  describe('POST', function () {
    // it('should create a file with multi-part upload', function (done) {
    //   require('./fixtures/mocks/s3/multi-part-upload')(ctx.context, 'log-stream.js')
    //   require('./fixtures/mocks/s3/get-object')(ctx.context.id(), '/')
    //   var FormData = require('form-data')
    //   var form = new FormData()
    //   var pathname = ctx.contextVersion.rootDir.contents.urlPath
    //   form.append('file', fs.createReadStream(path.join(__dirname, 'log-stream.js')))
    //   form.getLength(function (err, length) {
    //     if (err) { return done(err) }
    //     else {
    //       // require('nock').recorder.rec()
    //       console.log('right before and')
    //       console.log('right before and')
    //       console.log('right before and')
    //       var req = ctx.user.client.post(pathname, { headers: { 'Content-Length': length+2 } }, function (err, res) {
    //         console.log('right before and')
    //         console.log('right before and')
    //         console.log('right before and')
    //         if (err) { return done(err) }
    //         Lab.expect(res.statusCode).to.equal(201)
    //         Lab.expect(err).to.be.not.okay
    //         Lab.expect(res).to.exist()
    //         var expected = {
    //           Key: ctx.context.id() + '/source/log-stream.js',
    //           VersionId: '5Sae_tebJTYHeDf1thrEl2nw3QPE6VvH',
    //           ETag: '"fb617becf824265cff1e7bbac5d7ba62-1"',
    //           isDir: false,
    //           path: '/',
    //           name: 'log-stream.js'
    //         }
    //         Object.keys(expected).forEach(function (key) {
    //           Lab.expect(res.body[key]).to.equal(expected[key])
    //         })
    //         done()
    //       })
    //       req._form = form
    //     }
    //   })
    // })
    it('should create a file', function (done) {
      var createExpected = createFile(ctx.context.id(), '/', 'file.txt')
      require('./fixtures/mocks/s3/put-object')(ctx.context.id(), 'file.txt')
      require('./fixtures/mocks/s3/get-object')(ctx.context.id(), '/')
      require('./fixtures/mocks/s3/get-object')(ctx.context.id(), 'file.txt')
      ctx.file = ctx.contextVersion.rootDir.contents.createFile(
        'file.txt', expects.success(201, createExpected, done))
    })
    it('should create a file which can be listed', function (done) {
      var createExpected = createFile(ctx.context.id(), '/', 'file.txt')
      var expected = [
        createFile(ctx.context.id(), '/', 'Dockerfile'),
        createFile(ctx.context.id(), '/', 'file.txt')
      ]
      require('./fixtures/mocks/s3/put-object')(ctx.context.id(), 'file.txt')
      require('./fixtures/mocks/s3/get-object')(ctx.context.id(), '/')
      require('./fixtures/mocks/s3/get-object')(ctx.context.id(), 'file.txt')
      ctx.file = ctx.contextVersion.rootDir.contents.create({
        json: {
          name: 'file.txt',
          path: '/',
          body: 'content'
        }
      }, expects.success(201, createExpected, function (err) {
        if (err) { return done(err) }
        require('./fixtures/mocks/s3/get-object')(ctx.context.id(), '/')
        ctx.contextVersion.rootDir.contents.fetch(expects.success(200, expected, done))
      })
      )
    })
    it('should create a file which knows its file type', function (done) {
      var fileType = 'textFile'
      var createExpected = createFile(ctx.context.id(), '/', 'file.txt', false, fileType)
      var expected = [
        createFile(ctx.context.id(), '/', 'Dockerfile'),
        createFile(ctx.context.id(), '/', 'file.txt', false, fileType)
      ]
      require('./fixtures/mocks/s3/put-object')(ctx.context.id(), 'file.txt')
      require('./fixtures/mocks/s3/get-object')(ctx.context.id(), '/')
      require('./fixtures/mocks/s3/get-object')(ctx.context.id(), 'file.txt')
      ctx.file = ctx.contextVersion.rootDir.contents.create({
        json: {
          name: 'file.txt',
          path: '/',
          body: 'content',
          fileType: fileType
        }
      }, expects.success(201, createExpected, function (err) {
        if (err) { return done(err) }
        require('./fixtures/mocks/s3/get-object')(ctx.context.id(), '/')
        ctx.contextVersion.rootDir.contents.fetch(expects.success(200, expected, done))
      })
      )
    })
    it('should create a directory', function (done) {
      var createExpected = createFile(ctx.context.id(), '/', 'dir', true)
      var expected = [
        createFile(ctx.context.id(), '/', 'Dockerfile'),
        createFile(ctx.context.id(), '/', 'dir', true)
      ]
      require('./fixtures/mocks/s3/put-object')(ctx.context.id(), 'dir/')
      require('./fixtures/mocks/s3/get-object')(ctx.context.id(), '/')
      ctx.file = ctx.contextVersion.rootDir.contents.create({
        json: {
          name: 'dir',
          path: '/',
          isDir: true
        }
      }, expects.success(201, createExpected, function (err) {
        if (err) { return done(err) }
        require('./fixtures/mocks/s3/get-object')(ctx.context.id(), '/')
        ctx.contextVersion.rootDir.contents.fetch(expects.success(200, expected, done))
      }))
    })
    it('should create a directory, including the tailing slash', function (done) {
      var createExpected = createFile(ctx.context.id(), '/', 'dir', true)
      var expected = [
        createFile(ctx.context.id(), '/', 'Dockerfile'),
        createFile(ctx.context.id(), '/', 'dir', true)
      ]
      require('./fixtures/mocks/s3/put-object')(ctx.context.id(), 'dir/')
      require('./fixtures/mocks/s3/get-object')(ctx.context.id(), '/')
      ctx.file = ctx.contextVersion.rootDir.contents.create({
        json: {
          name: 'dir/',
          path: '/',
          isDir: true
        }
      }, expects.success(201, createExpected, function (err) {
        if (err) { return done(err) }
        require('./fixtures/mocks/s3/get-object')(ctx.context.id(), '/')
        ctx.contextVersion.rootDir.contents.fetch(expects.success(200, expected, done))
      }))
    })
    it('should create nested directories, but does not list them at root', function (done) {
      require('./fixtures/mocks/s3/put-object')(ctx.context.id(), 'dir/')
      require('./fixtures/mocks/s3/get-object')(ctx.context.id(), '/')
      var dataDir = createFile(ctx.context.id(), '/', 'dir', true)
      var dir = ctx.contextVersion.rootDir.contents.create(dataDir,
        expects.success(201, dataDir, function (err) {
          if (err) { return done(err) }

          var dataDir2 = createFile(ctx.context.id(), '/dir', 'dir2', true)
          require('./fixtures/mocks/s3/put-object')(ctx.context.id(), 'dir/dir2/')
          require('./fixtures/mocks/s3/get-object')(ctx.context.id(), '/dir/')
          var dir2 = dir.contents.create(dataDir2,
            expects.success(201, dataDir2, function (err) {
              if (err) { return done(err) }

              var listExpected = [ { name: 'Dockerfile' }, dir.json() ]
              require('./fixtures/mocks/s3/get-object')(ctx.context.id(), '/')
              ctx.contextVersion.rootDir.contents.fetch(
                expects.success(200, listExpected, function (err) {
                  if (err) { return done(err) }

                  require('./fixtures/mocks/s3/get-object')(ctx.context.id(), '/dir/')
                  dir.contents.fetch(expects.success(200, [dir2.json()], done))
                }))
            }))
        }))
    })
    describe('errors', function () {
      it('should not create a conflicting file', function (done) {
        var createExpected = createFile(ctx.context.id(), '/', 'file.txt')
        var json = {
          json: {
            name: 'file.txt',
            path: '/',
            body: 'content'
          }
        }
        require('./fixtures/mocks/s3/put-object')(ctx.context.id(), 'file.txt')
        require('./fixtures/mocks/s3/get-object')(ctx.context.id(), '/')
        require('./fixtures/mocks/s3/get-object')(ctx.context.id(), 'file.txt')
        ctx.file = ctx.contextVersion.rootDir.contents.create(json,
          expects.success(201, createExpected, function (err) {
            if (err) { return done(err) }
            require('./fixtures/mocks/s3/get-object')(ctx.context.id(), '/')
            ctx.contextVersion.rootDir.contents.create(
              json, expects.error(409, /File already exists/, done))
          }))
      })
      describe('built build', function () {
        beforeEach(function (done) {
          multi.createBuiltBuild(function (err, build, user, modelArr) {
            if (err) { return done(err) }
            ctx.contextVersion = modelArr[0]
            done()
          })
        })
        it('should not allow file creates for built builds', function (done) {
          var json = {
            json: {
              name: 'file2.txt',
              path: '/',
              body: 'content'
            }
          }
          require('./fixtures/mocks/s3/put-object')(ctx.context.id(), 'file2.txt')
          require('./fixtures/mocks/s3/get-object')(ctx.context.id(), '/')
          require('./fixtures/mocks/s3/get-object')(ctx.context.id(), 'file2.txt')
          ctx.file = ctx.contextVersion.rootDir.contents.create(json, expects.error(400, /built/, done))
        })
      })
    })
  })
})
