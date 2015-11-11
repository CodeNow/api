'use strict'

var Lab = require('lab')
var lab = exports.lab = Lab.script()
var describe = lab.describe
var it = lab.it
var beforeEach = lab.beforeEach
var Code = require('code')
var expect = Code.expect

var hasher = require('hasher')
var fs = require('fs')
var async = require('async')
var equals = require('101/equals')
var createCount = require('callback-count')
var through = require('through')
var notEquals = function (compare) {
  return function (item) {
    return item !== compare
  }
}

var equivalentDockerfiles = require('../test/functional/fixtures/equivalent-dockerfiles')
var differentDockerfiles = require('../test/functional/fixtures/different-dockerfiles')

var path = require('path')
var moduleName = path.relative(process.cwd(), __filename)

describe('Hasher: ' + moduleName, function () {
  describe('stream', function () {
    it('should hash a stream', function (done) {
      var fileStream = fs.createReadStream(__filename)
      hasher(fileStream, true, function (err, data) {
        if (err) { return done(err) }
        expect(data).to.exist()
        done()
      })
    })
    describe('all combinations of chunks', function () {
      var ctx
      beforeEach(function (done) {
        ctx = {}
        var dockerfile = new Buffer(' \t\r\n \t\r\n \t\r\n \t\r\nFROM ' +
          'dockerfile/nodejs \t\r\n \t\r\n ' +
          '\t\r\n \t\r\nCMD tail -f /var/log/dpkg.log ' +
          '\t\r\n \t\r\n \t\r\n \t\r\n')
        var chunkSets = ctx.chunkSets = []

        for (var i = 0; i + 8 < dockerfile.length; i++) {
          var chunks = chunkSets[i] = []
          if (i !== 0) { chunks.push(dockerfile.slice(0, i)) }
          chunks.push(dockerfile.slice(i, i + 8))
          chunks.push(dockerfile.slice(i + 8, dockerfile.length))
        }
        done()
      })
      it('should result in the correct hash', function (done) {
        async.each(ctx.chunkSets, function (chunks, cb) {
          var fileStream = through(function (data) { this.queue(data) })
          hasher(fileStream, function (err, hash) {
            if (err) { return cb(err) }
            expect(hash).to.exist()
            hasher(chunks.join(''), function (err, compareHash) {
              if (err) { return cb(err) }
              expect(compareHash).to.exist()
              expect(hash).to.equal(compareHash)
              cb()
            })
          })
          chunks.forEach(function (chunk) {
            fileStream.write(chunk)
          })
          fileStream.end()
        }, done)
      })
    })
    describe('compare stream hash to string hash', function () {
      it('should result in the same hashes', function (done) {
        async.each(equivalentDockerfiles, function (dockerfile, cb) {
          var streamHash, stringHash
          var streamData, stringData
          var count = createCount(2, compareHashes)
          // hash file stream
          var fileStream = through(function (data) { this.queue(data) })
          hasher(fileStream, function (err, hash, data) {
            if (err) { return count.next(err) }
            expect(hash).to.exist()
            streamHash = hash
            streamData = data
            count.next()
          })
          dockerfile.split('').forEach(function (chunk) {
            fileStream.write(chunk)
          })
          fileStream.end()
          // hash file string
          hasher(dockerfile, function (err, hash, data) {
            if (err) { return count.next(err) }
            expect(hash).to.exist()
            stringHash = hash
            stringData = data
            count.next()
          })
          function compareHashes (err) {
            if (err) { return cb(err) }
            expect(streamHash).to.equal(stringHash)
            expect(streamData).to.be.okay()
            expect(stringData).to.be.okay()
            cb()
          }
        }, function (err) {
          done(err)
        })
      })
    })
  })
  describe('string', function () {
    it('should hash a string', function (done) {
      var fileData = fs.readFileSync(__filename).toString()
      hasher(fileData, function (err, data) {
        if (err) { return done(err) }
        expect(data).to.exist()
        done()
      })
    })
    describe('whitespace comparisons', function () {
      describe('whitespace equivalent dockerfiles', function () {
        describe('keep whitespace', function () {
          it('should get different hashes for whitespace-equivalent files', function (done) {
            var fileDatas = equivalentDockerfiles
            async.map(fileDatas, function (fileData, cb) {
              hasher(fileData, true, cb)
            }, compareHashes)
            function compareHashes (err, hashes) {
              if (err) { return done(err) }
              var allHashesNotEqual = hashes.every(function (hash, i) {
                hashes.splice(i, 1)
                return hashes.every(notEquals(hash))
              })
              expect(allHashesNotEqual).to.equal(true)
              done()
            }
          })
        })
        describe('remove whitespace', function () {
          it('should get the same hashes for whitespace-equivalent files', function (done) {
            var fileDatas = equivalentDockerfiles
            async.map(fileDatas, hasher, compareHashes)
            function compareHashes (err, hashes) {
              if (err) { return done(err) }
              var allHashesEqual = hashes.slice(1).every(equals(hashes[0]))
              expect(allHashesEqual).to.equal(true)
              done()
            }
          })
        })
      })
      describe('different dockerfiles (not whitespace equivalent)', function () {
        describe('keep whitespace', function () {
          it('should get different hashes for whitespace-equivalent files', function (done) {
            var fileDatas = differentDockerfiles
            async.map(fileDatas, function (fileData, cb) {
              hasher(fileData, true, cb)
            }, compareHashes)
            function compareHashes (err, hashes) {
              if (err) { return done(err) }
              var allHashesNotEqual = hashes.slice(1).every(notEquals(hashes[0]))
              expect(allHashesNotEqual).to.equal(true)
              done()
            }
          })
        })
        describe('remove whitespace', function () {
          it('should get different hashes for different files', function (done) {
            var fileDatas = differentDockerfiles
            async.map(fileDatas, hasher, compareHashes)
            function compareHashes (err, hashes) {
              if (err) { return done(err) }
              var allHashesNotEqual = hashes.slice(1).every(notEquals(hashes[0]))
              expect(allHashesNotEqual).to.equal(true)
              done()
            }
          })
        })
      })
    })
  })
})
