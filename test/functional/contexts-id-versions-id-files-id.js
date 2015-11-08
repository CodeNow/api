// TODO: FIX THESE TESTS
// var Lab = require('lab')
// var describe = Lab.experiment
// var it = Lab.test
// var before = Lab.before
// var after = Lab.after
// var beforeEach = Lab.beforeEach
// var afterEach = Lab.afterEach

// var find = require('101/find')
// var hasKeypaths = require('101/has-keypaths')

// var api = require('./fixtures/api-control')
// var dock = require('./fixtures/dock')
// var multi = require('./fixtures/multi-factory')
// var expects = require('./fixtures/expects')
// var exists = require('101/exists')
// var createCount = require('callback-count')
// var regexpQuote = require('regexp-quote')

// describe('Version File - /contexts/:contextid/versions/:id/files/:id', function () {
//   var ctx = {}

//   before(api.start.bind(ctx))
//   before(dock.start.bind(ctx))
//   after(api.stop.bind(ctx))
//   after(dock.stop.bind(ctx))
//   afterEach(require('./fixtures/clean-mongo').removeEverything)
//   afterEach(require('./fixtures/clean-ctx')(ctx))
//   afterEach(require('./fixtures/clean-nock'))

//   var dirPathName = 'dir[]()'

//   beforeEach(function (done) {
//     multi.createContextVersion(function (err, contextVersion, context, build, env, project, user, array){
//       if (err) { return done(err) }
//       ctx.build = build
//       ctx.contextVersion = contextVersion
//       ctx.context = context
//       ctx.sourceContextVersion = array[0]
//       ctx.sourceContextVersionId = array[0].id()
//       ctx.sourceContextId = array[1].id()
//       require('./fixtures/mocks/s3/get-object')(ctx.context.id(), '/')
//       ctx.files = ctx.contextVersion.rootDir.contents
//       ctx.files.fetch({ path: '/' }, function (err) {
//         if (err) { return done(err) }
//         ctx.file = ctx.files.models[0]
//         ctx.fileId = ctx.file.id()
//         ctx.dockerfile = find(ctx.files.models, hasKeypaths({ 'id()': '/Dockerfile' }))
//         require('./fixtures/mocks/s3/get-object')(ctx.context.id(), '/')
//         require('./fixtures/mocks/s3/put-object')(ctx.context.id(), '/' + dirPathName + '/')
//         ctx.dir = ctx.files.createDir(dirPathName, done)
//       })
//     })
//   })

//   /**
//    * Helper BeforeEach function to fetch a source file for use in the tests below.
//    * @param done
//    */
//   function getSourceFile(done) {
//     var sourceFiles = ctx.sourceContextVersion.rootDir.contents
//     require('./fixtures/mocks/s3/get-object')(ctx.sourceContextId, '/')
//     sourceFiles.fetch({ path: '/' }, function (err) {
//       if (err) { done(err) }
//       ctx.sourceFile = sourceFiles.models[0]
//       ctx.sourceFileId = ctx.sourceFile.id()
//       done()
//     })
//   }

//   /**
//    * Helper BeforeEach function to create another user, to use as someone who doesn't own the
//    * 'owners' context.
//    * @param done done function pointer
//    */
//   function createModUser(done) {
//     ctx.moderator = multi.createModerator(done)
//   }
//   /**
//    * Helper BeforeEach function to create a moderator
//    * @param done done function pointer
//    */
//   function createNonOwner(done) {
//     ctx.nonOwner = multi.createUser(done)
//     require('./fixtures/mocks/github/user-orgs')(ctx.nonOwner) // non owner org
//   }
//   /**
//    * Helper BeforeEach function to create a Context Version path for a user who is not the owner
//    * of it.
//    * @param done done function pointer
//    */
//   function createNonOwnerContextVersion(done) {
//     ctx.nonOwnerContextVersion = multi.createContextVersionPath(ctx.nonOwner, ctx.context.id(),
//       ctx.contextVersion.id())
//     done()
//   }
//   /**
//    * Helper BeforeEach function to create a Context Version path for a moderator to use for
//    * fetching with the API Client
//    * @param done done function pointer
//    */
//   function createModContextVersion(done) {
//     ctx.modContextVersion = multi.createContextVersionPath(ctx.moderator, ctx.context.id(),
//       ctx.contextVersion.id())
//     done()
//   }
//   /**
//    * Helper BeforeEach function to create a Context Version path for a moderator to the source
//    * Context Version.  This is needed when checking write privileges for moderators on Source
//    * files.
//    * @param done done function pointer
//    */
//   function createModSourceContextVersionPath(done) {
//     ctx.modSourceContextVersion = multi.createContextVersionPath(ctx.moderator, ctx.sourceContextId,
//       ctx.sourceContextVersionId)
//     done()
//   }
//   /**
//    * Helper BeforeEach function to create a Context Version path for a moderator to the source
//    * Context Version.  This is needed when checking write privileges for moderators on Source
//    * files.
//    * @param done done function pointer
//    */
//   function createSourceContextVersionPath(done) {
//     ctx.sourceContextVersion = multi.createContextVersionPath(ctx.nonOwner, ctx.sourceContextId,
//       ctx.sourceContextVersionId)
//     done()
//   }
// //  var sources = {
// //    'owner' : 'contextVersion',
// //    'non-owner' : 'otherContextVersion',
// //    'mod' : 'modContextVersion'
// //  }
// //  function eachTest(userType, testMethod, message, fileId, opts, cb) {
// //    describe(userType, function () {
// //      it(message, function (done) {
// //        if (opts) {
// //          ctx[sources[userType]][testMethod + 'File'](fileId, opts, cb(done))
// //        } else {
// //          ctx[sources[userType]][testMethod + 'File'](fileId, cb(done))
// //        }
// //      })
// //    })
// //  }
// //
// //  function runFileTests(testMethod, messages, fileId, opts, cb) {
// //    for (var userType in sources) {
// //      if (sources.hasOwnProperty(userType)) {
// //        eachTest(userType, testMethod, messages[userType], fileId, opts, cb)
// //      }
// //    }
// //  }

//   describe('GET', function () {
//     describe('permissions', function() {
//       describe('regular file', function () {
//         describe('owner', function () {
//           it('should give us the body of the file', function (done) {
//             var expected = ctx.file.json()
//             require('./fixtures/mocks/s3/get-object')(ctx.context.id(), '/Dockerfile')
//             ctx.file.fetch(expects.success(200, expected, done))
//           })
//           it('should give us the body of the file', function (done) {
//             var expected = ctx.dockerfile.json()
//             expected.body = 'FROM ubuntu'
//             require('./fixtures/mocks/s3/get-object')(ctx.context.id(), '/Dockerfile', 'FROM ubuntu')
//             ctx.dockerfile.fetch(expects.success(200, expected, done))
//           })
//         })
//         describe('non-owner', function () {
//           beforeEach(createNonOwner)
//           beforeEach(createNonOwnerContextVersion)
//           it('should not get the body of the file (403 forbidden)', function (done) {
//             require('./fixtures/mocks/s3/get-object')(ctx.context.id(), '/Dockerfile')
//             ctx.nonOwnerContextVersion.fetchFile(ctx.fileId,
//               expects.errorStatus(403, done))
//           })
//         })
//         describe('moderator', function () {
//           beforeEach(createModUser)
//           beforeEach(createModContextVersion)
//           it('should give us the body of the file', function (done) {
//             var expected = ctx.file.json()
//             require('./fixtures/mocks/s3/get-object')(ctx.context.id(), '/Dockerfile')
//             ctx.modContextVersion.fetchFile(ctx.fileId,
//               expects.success(200, expected, done))
//           })
//         })
//       })
//       describe('source file', function () {
//         beforeEach(getSourceFile)
//         describe('user', function () {
//           beforeEach(createNonOwner)
//           beforeEach(createSourceContextVersionPath)
//           it('should get the body of the file', function (done) {
//             var expected = ctx.sourceFile.json()
//             require('./fixtures/mocks/s3/get-object')(ctx.sourceContextId, '/Dockerfile')
//             require('./fixtures/mocks/s3/get-object')(ctx.sourceContextId, '/')
//             ctx.sourceContextVersion.fetchFile(ctx.sourceFileId,
//               expects.success(200, expected, done))
//           })
//         })
//         describe('moderator', function () {
//           beforeEach(createModUser)
//           beforeEach(createModSourceContextVersionPath)
//           it('should give us the body of the file', function (done) {
//             var expected = ctx.sourceFile.json()
//             require('./fixtures/mocks/s3/get-object')(ctx.sourceContextId, '/Dockerfile')
//             ctx.modSourceContextVersion.fetchFile(ctx.sourceFileId,
//               expects.success(200, expected, done))
//           })
//         })
//       })
//     })
//   })

//   describe('PATCH', function () {
//     describe('permissions', function() {
//       describe('regular file', function() {
//         describe('owner', function () {
//           it('should let us update a file\'s content', function (done) {
//             var dockerfile = find(ctx.files.models, hasKeypaths({ 'id()': '/Dockerfile' }))
//             var opts = {
//               json: {
//                 body: 'owner new content'
//               }
//             }
//             var expected = dockerfile.json()
//             expected.ETag = exists
//             expected.VersionId = exists
//             expected.body = opts.json.body
//             require('./fixtures/mocks/s3/put-object')(ctx.context.id(), '/Dockerfile')
//             require('./fixtures/mocks/s3/get-object')(ctx.context.id(), '/Dockerfile', opts.json.body)
//             dockerfile.update(opts, expects.success(200, expected, done))
//           })
//           it('should let us rename a file', function (done) {
//             var countDone = createCount(2, done)
//             var dockerfile = find(ctx.files.models, hasKeypaths({ 'id()': '/Dockerfile' }))
//             var newName = 'file[]().txt'
//             var expected = dockerfile.json()
//             expected.ETag = exists
//             expected.VersionId = exists
//             expected.name = newName
//             expected.Key = new RegExp(regexpQuote(newName) + '$')
//             require('./fixtures/mocks/s3/get-object')(ctx.context.id(), '/Dockerfile', 'dockerfileBody')
//             require('./fixtures/mocks/s3/delete-object')(ctx.context.id(), '/Dockerfile')
//             require('./fixtures/mocks/s3/put-object')(ctx.context.id(), '/file[]().txt')
//             require('./fixtures/mocks/s3/get-object')(ctx.context.id(), '/file[]().txt', 'body')
//             dockerfile.rename(newName, expects.success(200, expected, function (err) {
//               if (err) { return done(err) }
//               require('./fixtures/mocks/s3/get-object')(ctx.context.id(), '/file[]().txt')
//               dockerfile.fetch(expects.success(200, expected, countDone.next))

//               // Then let's test it again to make sure we can rename it again
//               newName = 'newFile.txt'
//               expected = dockerfile.json()
//               expected.ETag = exists
//               expected.VersionId = exists
//               expected.name = newName
//               expected.Key = new RegExp(regexpQuote(newName) + '$')
//               require('./fixtures/mocks/s3/get-object')(ctx.context.id(), '/file[]().txt',
//                 'dockerfileBody')
//               require('./fixtures/mocks/s3/delete-object')(ctx.context.id(), '/file[]().txt')
//               require('./fixtures/mocks/s3/put-object')(ctx.context.id(), '/newFile.txt')
//               require('./fixtures/mocks/s3/get-object')(ctx.context.id(), '/newFile.txt', 'body')
//               dockerfile.rename(newName, expects.success(200, expected, function (err) {
//                 if (err) { return done(err) }
//                 require('./fixtures/mocks/s3/get-object')(ctx.context.id(), '/newFile.txt')
//                 dockerfile.fetch(expects.success(200, expected, countDone.next))
//               }))
//             }))
//           })
//           it('should let us rename a dir', function (done) {
//             var dir = ctx.dir
//             var expected = dir.json()
//             var newName = 'dir2/'
//             expected.ETag = exists
//             expected.VersionId = exists
//             expected.name = newName.slice(0, -1)
//             expected.Key = new RegExp(newName + '$')
//             require('./fixtures/mocks/s3/get-object')(ctx.context.id(), dir.id())
//             require('./fixtures/mocks/s3/delete-object')(ctx.context.id(), dir.id())
//             require('./fixtures/mocks/s3/put-object')(ctx.context.id(), newName)
//             dir.rename(newName, expects.success(200, expected, done))
//             // FIXME: add a fetch after that ensures the dir is retrieved
//           })

//         })
//         describe('non-owner', function () {
//           beforeEach(createNonOwner)
//           beforeEach(createNonOwnerContextVersion)
//           it('should not let us update a file\'s content (403 forbidden)', function (done) {
//             var opts = {
//               json: {
//                 body: 'non-owner new content'
//               }
//             }
//             ctx.nonOwnerContextVersion.updateFile(ctx.fileId, opts, expects.errorStatus(403, done))
//           })
//           it('should not let us rename a file', function (done) {
//             var opts = {
//               json: {
//                 name: 'nonOwnerFile.txt'
//               }
//             }
//             ctx.nonOwnerContextVersion.updateFile(ctx.fileId, opts, expects.errorStatus(403, done))
//           })
//         })
//         describe('moderator', function () {
//           beforeEach(createModUser)
//           beforeEach(createModContextVersion)
//           it('should let us update a file\'s content', function (done) {
//             var opts = {
//               json: {
//                 body: 'moderator new content'
//               }
//             }
//             var expected = ctx.dockerfile.json()
//             expected.ETag = exists
//             expected.VersionId = exists
//             expected.body = opts.json.body
//             require('./fixtures/mocks/s3/put-object')(ctx.context.id(), '/Dockerfile')
//             ctx.modContextVersion.updateFile(ctx.fileId, opts,
//               expects.success(200, expected, done))
//           })
//           it('should let us rename a file', function (done) {
//             var opts = {
//               json: {
//                 name: 'moderatorFile.txt'
//               }
//             }
//             var expected = ctx.dockerfile.json()
//             expected.ETag = exists
//             expected.VersionId = exists
//             expected.name = opts.json.name
//             require('./fixtures/mocks/s3/get-object')(ctx.context.id(), '/Dockerfile')
//             require('./fixtures/mocks/s3/delete-object')(ctx.context.id(), '/Dockerfile')
//             require('./fixtures/mocks/s3/put-object')(ctx.context.id(), '/moderatorFile.txt')
//             expected.Key = new RegExp(opts.json.name + '$')
//             var newFile = ctx.modContextVersion.updateFile(ctx.fileId, opts, function (err) {
//               if (err) {
//                 return done(err)
//               }
//               require('./fixtures/mocks/s3/get-object')(ctx.context.id(), '/moderatorFile.txt')
//               ctx.modContextVersion.fetchFile(newFile.id(), expects.success(200, expected, done))
//             })
//           })
//         })
//       })
//       describe('source file', function () {
//         beforeEach(getSourceFile)
//         describe('user', function () {
//           beforeEach(createNonOwner)
//           beforeEach(createSourceContextVersionPath)
//           it('should not let us update a file\'s content (403 forbidden)', function (done) {
//             var opts = {
//               json: {
//                 body: 'non-owner new content'
//               }
//             }
//             ctx.sourceContextVersion.updateFile(ctx.sourceFileId, opts,
//               expects.errorStatus(403, done))
//           })
//           it('should not let us rename a file', function (done) {
//             var opts = {
//               json: {
//                 name: 'nonOwnerFile.txt'
//               }
//             }
//             ctx.sourceContextVersion.updateFile(ctx.sourceFileId, opts,
//               expects.errorStatus(403, done))
//           })
//         })
//         describe('moderator', function () {
//           beforeEach(createModUser)
//           beforeEach(createModSourceContextVersionPath)
//           it('should let us update a file\'s content', function (done) {
//             var opts = {
//               json: {
//                 body: 'moderator new content'
//               }
//             }
//             var expected = ctx.sourceFile.json()
//             expected.ETag = exists
//             expected.VersionId = exists
//             expected.body = opts.json.body
//             require('./fixtures/mocks/s3/put-object')(ctx.sourceContextId, '/Dockerfile')
//             ctx.modSourceContextVersion
//               .updateFile(ctx.sourceFileId, opts, expects.success(200, expected, done))
//           })
//           it('should let us rename a file', function (done) {
//             var opts = {
//               json: {
//                 name: 'moderatorFile.txt'
//               }
//             }
//             var expected = ctx.sourceFile.json()
//             expected.ETag = exists
//             expected.VersionId = exists
//             expected.name = opts.json.name
//             expected.Key = new RegExp(opts.json.name + '$')
//             require('./fixtures/mocks/s3/get-object')(ctx.sourceContextId, '/Dockerfile')
//             require('./fixtures/mocks/s3/delete-object')(ctx.sourceContextId, '/Dockerfile')
//             require('./fixtures/mocks/s3/put-object')(ctx.sourceContextId, '/moderatorFile.txt')
//             var newFile = ctx.modSourceContextVersion
//               .updateFile(ctx.sourceFileId, opts, function (err) {
//                 if (err) {
//                   return done(err)
//                 }
//                 require('./fixtures/mocks/s3/get-object')(ctx.sourceContextId, '/moderatorFile.txt')
//                 ctx.modSourceContextVersion
//                   .fetchFile(newFile.id(), expects.success(200, expected, done))
//               })
//           })
//         })
//       })
//     })
//   })
//   describe('DELETE', function () {
//     describe('permissions', function() {
//       describe('regular file', function() {
//         describe('owner', function () {
//           it('should delete a file', function (done) {
//             require('./fixtures/mocks/s3/get-object')(ctx.context.id(), '/Dockerfile')
//             ctx.file.destroy(expects.success(204, function (err) {
//               if (err) {
//                 return done(err)
//               }
//               ctx.contextVersion.fetchFile(ctx.fileId, expects.error(404, /not found/, done))
//             }))
//           })
//           it('should delete a dir', function (done) {
//             require('./fixtures/mocks/s3/get-object')(ctx.context.id(), '/Dockerfile')
//             var dirId = ctx.dir.id()
//             ctx.dir.destroy(expects.success(204, function (err) {
//               if (err) {
//                 return done(err)
//               }
//               ctx.contextVersion.fetchFile(dirId, expects.error(404, /not found/, done))
//             }))
//           })
//           describe('dir with contents', function() {
//             beforeEach(function (done) {
//               var count = createCount(done)
//               // sibling dir
//               require('./fixtures/mocks/s3/put-object')(ctx.context.id(), '/siblingDir/')
//               require('./fixtures/mocks/s3/get-object')(ctx.context.id(), '/siblingDir/')
//               ctx.siblingDir =
//                 ctx.contextVersion.rootDir.contents.createDir('siblingDir', count.inc().next)
//               // nested files
//               require('./fixtures/mocks/s3/put-object')(ctx.context.id(), '/' + dirPathName +
//                 '/nestedFile.txt')
//               require('./fixtures/mocks/s3/get-object')(ctx.context.id(), '/' + dirPathName +
//                 '/nestedFile.txt')
//               count.inc()
//               ctx.dir.contents.createFile('nestedFile.txt', function (err) {
//                 if (err) {
//                   return count.next(err)
//                 }
//                 require('./fixtures/mocks/s3/put-object')(ctx.context.id(), '/' + dirPathName +
//                   '/nestedFile2.txt')
//                 require('./fixtures/mocks/s3/get-object')(ctx.context.id(), '/' + dirPathName +
//                   '/nestedFile2.txt')
//                 ctx.dir.contents.createFile('nestedFile2.txt', count.next)
//               })
//             })
//             it('should delete a dir and it\'s contents', function (done) {
//               require('./fixtures/mocks/s3/get-object')(ctx.context.id(), '/Dockerfile')
//               ctx.dir.destroy(expects.success(204, function (err) {
//                 if (err) {
//                   return done(err)
//                 }
//                 var expected = {
//                   '[0]': ctx.dockerfile.json(),
//                   '[1]': ctx.siblingDir.json(),
//                   'length': 2
//                 }
//                 ctx.contextVersion.rootDir.contents.fetch(
//                   expects.success(200, expected, done))
//               }))
//             })
//           })
//         })
//         describe('non-owner', function () {
//           beforeEach(createNonOwner)
//           beforeEach(createNonOwnerContextVersion)
//           it('should not delete a file', function (done) {
//             ctx.nonOwnerContextVersion.destroyFile(ctx.fileId, expects.error(403, done))
//           })
//         })
//         describe('moderator', function () {
//           beforeEach(createModUser)
//           beforeEach(createModContextVersion)
//           it('should delete a file', function (done) {
//             ctx.modContextVersion.destroyFile(ctx.fileId, expects.success(204, function (err) {
//               if (err) {
//                 return done(err)
//               }
//               ctx.modContextVersion.fetchFile(ctx.fileId, expects.error(404, /not found/, done))
//             }))
//           })
//         })
//       })
//       describe('source file', function() {
//         beforeEach(getSourceFile)
//         describe('user', function () {
//           beforeEach(createNonOwner)
//           beforeEach(createSourceContextVersionPath)
//           it('should not delete a file', function (done) {
//             ctx.sourceContextVersion.destroyFile(ctx.sourceFileId,
//               expects.error(403, done))
//           })
//         })
//         describe('moderator', function () {
//           beforeEach(createModUser)
//           beforeEach(createModSourceContextVersionPath)
//           it('should delete a file', function (done) {
//             ctx.modSourceContextVersion
//               .destroyFile(ctx.sourceFileId, expects.success(204, function (err) {
//               if (err) {
//                 return done(err)
//               }
//               ctx.modSourceContextVersion
//                 .fetchFile(ctx.sourceFileId, expects.error(404, /not found/, done))
//             }))
//           })
//         })
//       })
//     })
//   })

//   describe('Intense Directory and File manipulation', function() {
//     describe('dir with contents in only 1 level', function () {
//       beforeEach(function (done) {
//         var count = createCount(done)
//         // sibling dir
//         require('./fixtures/mocks/s3/put-object')(ctx.context.id(), '/siblingDir/')
//         require('./fixtures/mocks/s3/get-object')(ctx.context.id(), '/siblingDir/')
//         ctx.siblingDir =
//           ctx.contextVersion.rootDir.contents.createDir('siblingDir', count.inc().next)
//         // nested files
//         require('./fixtures/mocks/s3/put-object')(ctx.context.id(), '/' + dirPathName +
//           '/nestedFile.txt')
//         require('./fixtures/mocks/s3/get-object')(ctx.context.id(), '/' + dirPathName +
//           '/nestedFile.txt')
//         count.inc()
//         ctx.nestedFile = ctx.dir.contents.createFile('nestedFile.txt', function (err) {
//           if (err) {
//             return count.next(err)
//           }
//           require('./fixtures/mocks/s3/put-object')(ctx.context.id(), '/' + dirPathName +
//             '/nestedFile2.txt')
//           require('./fixtures/mocks/s3/get-object')(ctx.context.id(), '/' + dirPathName +
//             '/nestedFile2.txt')
//           ctx.nestedFile2 = ctx.dir.contents.createFile('nestedFile2.txt', count.next)
//         })
//       })
//       it('should rename a nested file', function (done) {
//         var body = {
//           name: 'newName.txt'
//         }
//         var path = '/files' + ctx.nestedFile.id()
//         var regexp = new RegExp(regexpQuote(path) + '$')
//         require('./fixtures/mocks/s3/get-object')(ctx.context.id(), ctx.dir.id())
//         require('./fixtures/mocks/s3/get-object')(ctx.context.id(), ctx.dir.id())
//         require('./fixtures/mocks/s3/get-object')(ctx.context.id(), ctx.dir.id())
//         // nestedFile
//         require('./fixtures/mocks/s3/get-object')(ctx.context.id(), ctx.nestedFile.id())
//         require('./fixtures/mocks/s3/delete-object')(ctx.context.id(), ctx.nestedFile.id())
//         require('./fixtures/mocks/s3/put-object')(ctx.context.id(),
//           ctx.nestedFile.id().replace(ctx.nestedFile.attrs.name, body.name))
//         Lab.expect(ctx.nestedFile.path()).to.match(regexp)
//         ctx.nestedFile.update(body, expects.success(200, function (err) {
//           if (err) {
//             return done(err)
//           }
//           var expected = {
//             '[0].name': 'newName.txt',
//             'length': 2
//           }
//           ctx.dir.contents.fetch(expects.success(200, expected, done))
//         }))
//       })
//       it('should rename a dir and move it\'s contents', function (done) {
//         var newName = 'dir2/'
//         require('./fixtures/mocks/s3/get-object')(ctx.context.id(), ctx.dir.id())
//         require('./fixtures/mocks/s3/get-object')(ctx.context.id(), ctx.dir.id())
//         require('./fixtures/mocks/s3/get-object')(ctx.context.id(), ctx.dir.id())
//         require('./fixtures/mocks/s3/delete-object')(ctx.context.id(), ctx.dir.id())
//         require('./fixtures/mocks/s3/delete-object')(ctx.context.id(), ctx.dir.id())
//         require('./fixtures/mocks/s3/delete-object')(ctx.context.id(), ctx.dir.id())
//         require('./fixtures/mocks/s3/put-object')(ctx.context.id(), ctx.dir.id())
//         require('./fixtures/mocks/s3/put-object')(ctx.context.id(), newName)
//         require('./fixtures/mocks/s3/put-object')(ctx.context.id(), newName)
//         // nestedFile
//         require('./fixtures/mocks/s3/get-object')(ctx.context.id(), ctx.nestedFile.id())
//         require('./fixtures/mocks/s3/delete-object')(ctx.context.id(), ctx.nestedFile.id())
//         require('./fixtures/mocks/s3/put-object')(ctx.context.id(),
//           ctx.nestedFile.id().replace(ctx.dir.attrs.name, newName))
//         // nestedFile2
//         require('./fixtures/mocks/s3/get-object')(ctx.context.id(), ctx.nestedFile2.id())
//         require('./fixtures/mocks/s3/delete-object')(ctx.context.id(), ctx.nestedFile2.id())
//         require('./fixtures/mocks/s3/put-object')(ctx.context.id(),
//           ctx.nestedFile2.id().replace(ctx.dir.attrs.name, newName))
//         ctx.dir.rename(newName, expects.success(200, function (err) {
//           if (err) {
//             return done(err)
//           }
//           var expected = [{
//             name: 'nestedFile.txt',
//             path: '/dir2'
//           },{
//             name: 'nestedFile2.txt',
//             path: '/dir2'
//           }]
//           require('./fixtures/mocks/s3/get-object')(ctx.context.id(), ctx.dir.id())
//           ctx.dir.contents.fetch(
//             expects.success(200, expected, done))
//         }))
//       })
//     })
//     describe('dir with contents with 2 levels of folders', function () {
//       beforeEach(function (done) {
//         var count = createCount(3, done)
//         // sibling dir
//         require('./fixtures/mocks/s3/put-object')(ctx.context.id(), '/siblingDir/')
//         require('./fixtures/mocks/s3/get-object')(ctx.context.id(), '/siblingDir/')
//         ctx.siblingDir =
//           ctx.contextVersion.rootDir.contents.createDir('siblingDir', count.next)

//         require('./fixtures/mocks/s3/put-object')(ctx.context.id(), '/' + dirPathName +
//           '/childDir/')
//         require('./fixtures/mocks/s3/get-object')(ctx.context.id(), '/' + dirPathName +
//           '/childDir/')
//         ctx.childDir = ctx.dir.contents.createDir('childDir', count.next)
//         // nested files
//         require('./fixtures/mocks/s3/put-object')(ctx.context.id(), '/' + dirPathName +
//           '/nestedFile.txt')
//         require('./fixtures/mocks/s3/get-object')(ctx.context.id(), '/' + dirPathName +
//           '/nestedFile.txt')
//         ctx.nestedFile = ctx.dir.contents.createFile('nestedFile.txt',  function() {
//           require('./fixtures/mocks/s3/put-object')(ctx.context.id(), '/' + dirPathName +
//             '/childDir/doubleNestedFile.txt')
//           require('./fixtures/mocks/s3/get-object')(ctx.context.id(), '/' + dirPathName +
//             '/childDir/doubleNestedFile.txt')
//           ctx.doubleNestedFile = ctx.childDir.contents.createFile('doubleNestedFile.txt',
//            function() {
//             require('./fixtures/mocks/s3/put-object')(ctx.context.id(), '/' + dirPathName +
//               '/nestedFile3.txt')
//             require('./fixtures/mocks/s3/get-object')(ctx.context.id(), '/' + dirPathName +
//               '/nestedFile3.txt')
//             ctx.nestedFile3 = ctx.dir.contents.createFile('nestedFile3.txt', count.next)
//           })
//         })
//       })
//       it('should rename a nested file', function (done) {
//         var body = {
//           name: 'newName.txt'
//         }
//         var path = '/files' + ctx.nestedFile.id()
//         var regexp = new RegExp(regexpQuote(path) + '$')
//         require('./fixtures/mocks/s3/get-object')(ctx.context.id(), ctx.dir.id())
//         require('./fixtures/mocks/s3/get-object')(ctx.context.id(), ctx.dir.id())
//         require('./fixtures/mocks/s3/get-object')(ctx.context.id(), ctx.dir.id())
//         // nestedFile
//         require('./fixtures/mocks/s3/get-object')(ctx.context.id(), ctx.nestedFile.id())
//         require('./fixtures/mocks/s3/delete-object')(ctx.context.id(), ctx.nestedFile.id())
//         require('./fixtures/mocks/s3/put-object')(ctx.context.id(),
//           ctx.nestedFile.id().replace(ctx.nestedFile.attrs.name, body.name))
//         Lab.expect(ctx.nestedFile.path()).to.match(regexp)
//         ctx.nestedFile.update(body, expects.success(200, function (err) {
//           if (err) {
//             return done(err)
//           }
//           var expected = [{},{
//             name: 'newName.txt',
//           },{}]
//           ctx.dir.contents.fetch(expects.success(200, expected, done))
//         }))
//       })
//       it('should not allow a file to overwrite an existing file', function (done) {
//         var body = {
//           name: 'nestedFile3.txt'
//         }
//         var path = '/files' + ctx.nestedFile.id()
//         var regexp = new RegExp(regexpQuote(path) + '$')
//         require('./fixtures/mocks/s3/get-object')(ctx.context.id(), ctx.dir.id())
//         require('./fixtures/mocks/s3/get-object')(ctx.context.id(), ctx.dir.id())
//         require('./fixtures/mocks/s3/get-object')(ctx.context.id(), ctx.dir.id())
//         // nestedFile
//         require('./fixtures/mocks/s3/get-object')(ctx.context.id(), ctx.nestedFile.id())
//         require('./fixtures/mocks/s3/put-object')(ctx.context.id(),
//           ctx.nestedFile.id().replace(ctx.nestedFile.attrs.name, body.name))
//         Lab.expect(ctx.nestedFile.path()).to.match(regexp)
//         ctx.nestedFile.update(body, expects.error(409, done))
//       })
//       it('should rename a dir and move it\'s contents', function (done) {
//         var newName = 'dir2/'
//         require('./fixtures/mocks/s3/get-object')(ctx.context.id(), ctx.dir.id())
//         require('./fixtures/mocks/s3/get-object')(ctx.context.id(), ctx.dir.id())
//         require('./fixtures/mocks/s3/get-object')(ctx.context.id(), ctx.dir.id())
//         require('./fixtures/mocks/s3/get-object')(ctx.context.id(), ctx.dir.id())
//         require('./fixtures/mocks/s3/delete-object')(ctx.context.id(), ctx.dir.id())
//         require('./fixtures/mocks/s3/delete-object')(ctx.context.id(), ctx.dir.id())
//         require('./fixtures/mocks/s3/delete-object')(ctx.context.id(), ctx.dir.id())
//         require('./fixtures/mocks/s3/delete-object')(ctx.context.id(), ctx.dir.id())
//         require('./fixtures/mocks/s3/put-object')(ctx.context.id(), ctx.dir.id())
//         require('./fixtures/mocks/s3/put-object')(ctx.context.id(), newName)
//         require('./fixtures/mocks/s3/put-object')(ctx.context.id(), newName)
//         // nestedFile
//         require('./fixtures/mocks/s3/get-object')(ctx.context.id(), ctx.nestedFile.id())
//         require('./fixtures/mocks/s3/delete-object')(ctx.context.id(), ctx.nestedFile.id())
//         require('./fixtures/mocks/s3/put-object')(ctx.context.id(),
//           ctx.nestedFile.id().replace(ctx.dir.attrs.name, newName))

//         require('./fixtures/mocks/s3/get-object')(ctx.context.id(), ctx.nestedFile3.id())
//         require('./fixtures/mocks/s3/delete-object')(ctx.context.id(), ctx.nestedFile3.id())
//         require('./fixtures/mocks/s3/put-object')(ctx.context.id(),
//           ctx.nestedFile3.id().replace(ctx.dir.attrs.name, newName))
//         // childDir
//         require('./fixtures/mocks/s3/get-object')(ctx.context.id(), ctx.childDir.id())
//         require('./fixtures/mocks/s3/delete-object')(ctx.context.id(), ctx.childDir.id())
//         require('./fixtures/mocks/s3/put-object')(ctx.context.id(),
//           ctx.childDir.id().replace(ctx.dir.attrs.name, newName))
//         // doubleNestedFile
//         require('./fixtures/mocks/s3/get-object')(ctx.context.id(), ctx.doubleNestedFile.id())
//         require('./fixtures/mocks/s3/delete-object')(ctx.context.id(), ctx.doubleNestedFile.id())
//         require('./fixtures/mocks/s3/put-object')(ctx.context.id(),
//           ctx.doubleNestedFile.id().replace(ctx.dir.attrs.name + '/', newName))
//         ctx.dir.rename(newName, expects.success(200, function (err) {
//           if (err) {
//             return done(err)
//           }
//           var expected = [{
//             name: 'childDir',
//             path: '/dir2/'
//           },{
//             name: 'nestedFile.txt',
//             path: '/dir2'
//           },{
//             name: 'nestedFile3.txt',
//             path: '/dir2'
//           }]

//           var expectedChild = {
//             '[0].name': 'doubleNestedFile.txt',
//             '[0].path': '/dir2/childDir',
//             'length': 1
//           }
//           require('./fixtures/mocks/s3/get-object')(ctx.context.id(), ctx.dir.id())
//           require('./fixtures/mocks/s3/get-object')(ctx.context.id(), '/dir2/childDir/')

//           ctx.dir.contents.fetch(
//             expects.success(200, expected, function () {
//               ctx.dir.contents.fetch('/dir2/childDir/', function () {
//                 var childDir = ctx.dir.contents.models[0]
//                 childDir.contents.fetch(expects.success(200, expectedChild, done))
//               })
//             }))
//         }))
//       })
//     })
//   })
// })
