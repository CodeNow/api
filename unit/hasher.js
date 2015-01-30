'use strict';
var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;
var expect = Lab.expect;
var hasher = require('hasher');
var fs = require('fs');
var async = require('async');
var equals = require('101/equals');
var createCount = require('callback-count');
var createTempFile = require('tempfile');
var before = Lab.before;
var notEquals = function (compare) {
  return function (item) {
    return item !== compare;
  };
};

var equivalentDockerfiles = require('../test/fixtures/equivalent-dockerfiles');
var differentDockerfiles  = require('../test/fixtures/different-dockerfiles');

describe('Hasher',  function () {
  describe('stream', function () {
    it('should hash a stream', function (done) {
      var fileStream = fs.createReadStream(__filename);
      hasher(fileStream, true, function (err, data) {
        if (err) { return done(err); }
        expect(data).to.be.ok;
        done();
      });
    });
    describe('compare stream hash to string hash', function () {
      var filepaths = [];
      before(function (done) {
        equivalentDockerfiles.forEach(function (fileData) {
          var filepath = createTempFile('.txt');
          filepaths.push(filepath);
          fs.writeFileSync(filepath, fileData);
        });
        done();
      });
      it('should result in the same hashes', function (done) {
        async.each(filepaths, function (filepath, cb) {
          var streamHash, stringHash;
          var count = createCount(2, compareHashes);
          // hash file stream
          var fileStream = fs.createReadStream(filepath);
          hasher(fileStream, true, function (err, data) {
            if (err) { return count.next(err); }
            expect(data).to.be.ok;
            streamHash = data;
            count.next();
          });
          // hash file string
          var fileData = fs.readFileSync(filepath).toString();
          hasher(fileData, true, function (err, data) {
            if (err) { return count.next(err); }
            expect(data).to.be.ok;
            stringHash = data;
            count.next();
          });
          function compareHashes (err) {
            if (err) { return cb(err); }
            expect(streamHash).to.equal(stringHash);
            cb();
          }
        }, done);
      });
    });
  });
  describe('string', function () {
    it('should hash a string', function (done) {
      var fileData = fs.readFileSync(__filename).toString();
      hasher(fileData, true, function (err, data) {
        if (err) { return done(err); }
        expect(data).to.be.ok;
        done();
      });
    });
    describe('whitespace comparisons', function () {
      describe('whitespace equivalent dockerfiles', function () {
        describe('keep whitespace', function () {
          it('should get different hashes for whitespace-equivalent files', function (done) {
            var fileDatas = equivalentDockerfiles;
            async.map(fileDatas, hasher, compareHashes);
            function compareHashes (err, hashes) {
              if (err) { return done(err); }
              var allHashesNotEqual = hashes.every(function (hash, i) {
                hashes.splice(i, 1);
                return hashes.every(notEquals(hash));
              });
              expect(allHashesNotEqual).to.equal(true);
              done();
            }
          });
        });
        describe('remove whitespace', function () {
          it('should get the same hashes for whitespace-equivalent files', function (done) {
            var fileDatas = equivalentDockerfiles;
            async.map(fileDatas, function (fileData, cb) {
              hasher(fileData, cb);
            }, compareHashes);
            function compareHashes (err, hashes) {
              if (err) { return done(err); }
              var allHashesEqual = hashes.slice(1).every(equals(hashes[0]));
              expect(allHashesEqual).to.equal(true);
              done();
            }
          });
        });
      });
      describe('different dockerfiles (not whitespace equivalent)', function () {
        describe('keep whitespace', function () {
          it('should get different hashes for whitespace-equivalent files', function (done) {
            var fileDatas = differentDockerfiles;
            async.map(fileDatas, hasher, compareHashes);
            function compareHashes (err, hashes) {
              if (err) { return done(err); }
              var allHashesNotEqual = hashes.slice(1).every(notEquals(hashes[0]));
              expect(allHashesNotEqual).to.equal(true);
              done();
            }
          });
        });
        describe('remove whitespace', function () {
          it('should get different hashes for different files', function (done) {
            var fileDatas = differentDockerfiles;
            async.map(fileDatas, function (fileData, cb) {
              hasher(fileData, cb);
            }, compareHashes);
            function compareHashes (err, hashes) {
              if (err) { return done(err); }
              var allHashesNotEqual = hashes.slice(1).every(notEquals(hashes[0]));
              expect(allHashesNotEqual).to.equal(true);
              done();
            }
          });
        });
      });
    });
  });
});