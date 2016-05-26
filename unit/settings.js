// 'use strict'
//
// var Lab = require('lab')
// var lab = exports.lab = Lab.script()
// var describe = lab.describe
// var it = lab.it
// var before = lab.before
// var afterEach = lab.afterEach
// var Code = require('code')
// var expect = Code.expect
//
// var Settings = require('models/mongo/settings')
//
// var path = require('path')
// var moduleName = path.relative(process.cwd(), __filename)
//
// describe('Settings: ' + moduleName, function () {
//   before(require('./fixtures/mongo').connect)
//   afterEach(require('../test/functional/fixtures/clean-mongo').removeEverything)
//
//   describe('find by owner github id', function () {
//     var savedSettings = null
//     var data = {
//       owner: {
//         github: 429706
//       },
//       notifications: {
//         slack: {
//           apiToken: 'xoxo-dasjdkasjdk243248392482394',
//           enabled: true
//         }
//       }
//     }
//     before(function (done) {
//       var settings = new Settings(data)
//       settings.save(function (err, saved) {
//         if (err) { return done(err) }
//         expect(saved.owner.github).to.equal(data.owner.github)
//         expect(saved.notifications.slack.apiToken).to.equal(data.notifications.slack.apiToken)
//         expect(saved.notifications.slack.enabled).to.equal(true)
//         savedSettings = saved
//         done()
//       })
//     })
//
//     it("should be possible to find settings by owner's github id", function (done) {
//       Settings.findOneByGithubId(savedSettings.owner.github, function (err, settings) {
//         if (err) { return done(err) }
//         expect(String(settings._id)).to.equal(String(savedSettings._id))
//         expect(settings.owner.github).to.equal(savedSettings.owner.github)
//         expect(settings.notifications.slack.apiToken).to.equal(savedSettings.notifications.slack.apiToken)
//         done()
//       })
//     })
//   })
//
//   describe('save settings', function () {
//     it('should be possible to save settings', function (done) {
//       var data = {
//         owner: {
//           github: 429706
//         },
//         notifications: {
//           slack: {
//             apiToken: 'xoxo-dasjdkasjdk243248392482394',
//             enabled: false
//           }
//         }
//       }
//       var settings = new Settings(data)
//       settings.save(function (err, saved) {
//         if (err) { return done(err) }
//         expect(saved.owner.github).to.equal(data.owner.github)
//         expect(saved.notifications.slack.apiToken).to.equal(data.notifications.slack.apiToken)
//         expect(saved.notifications.slack.enabled).to.equal(false)
//         done()
//       })
//     })
//
//     it('should not save more than one setting for the same owner', function (done) {
//       var data1 = {
//         owner: {
//           github: 429705
//         },
//         notifications: {
//           slack: {
//             apiToken: 'xoxo-dasjdkasjdk243248392482394'
//           }
//         }
//       }
//       var data2 = {
//         owner: {
//           github: 429705
//         },
//         notifications: {
//           slack: {
//             apiToken: 'xoxo-dasjdkasjdk243248392482394'
//           }
//         }
//       }
//       var settings1 = new Settings(data1)
//       settings1.save(function (err, saved) {
//         if (err) { return done(err) }
//         expect(saved.owner.github).to.equal(data1.owner.github)
//         expect(saved.notifications.slack.apiToken).to.equal(data1.notifications.slack.apiToken)
//         var settings2 = new Settings(data2)
//         settings2.save(function (err) {
//           expect(err.name).to.equal('MongoError')
//           expect(err.code).to.equal(11000)
//           expect(err.err).to.include('dup key')
//           done()
//         })
//       })
//     })
//
//     it('should not save more than one setting for the same owner with additional bitbucket property', function (done) {
//       var data1 = {
//         owner: {
//           github: 429705
//         },
//         notifications: {
//           slack: {
//             apiToken: 'xoxo-dasjdkasjdk243248392482394'
//           }
//         }
//       }
//       var data2 = {
//         owner: {
//           github: 429705,
//           bitbucket: 1232
//         },
//         notifications: {
//           slack: {
//             apiToken: 'xoxo-dasjdkasjdk243248392482394'
//           }
//         }
//       }
//       var settings1 = new Settings(data1)
//       settings1.save(function (err, saved) {
//         if (err) { return done(err) }
//         expect(saved.owner.github).to.equal(data1.owner.github)
//         expect(saved.notifications.slack.apiToken).to.equal(data1.notifications.slack.apiToken)
//         var settings2 = new Settings(data2)
//         settings2.save(function (err) {
//           expect(err.name).to.equal('MongoError')
//           expect(err.code).to.equal(11000)
//           expect(err.err).to.include('dup key')
//           done()
//         })
//       })
//     })
//   })
// })
