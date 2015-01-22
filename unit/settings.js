'use strict';
var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;
var expect = Lab.expect;
var before = Lab.before;
var afterEach = Lab.afterEach;
var Settings = require('models/mongo/settings');

describe('Settings',  function () {
  before(require('./fixtures/mongo').connect);
  afterEach(require('../test/fixtures/clean-mongo').removeEverything);

  describe('find by owner github id', function () {
    var savedSettings = null;
    var data = {
      owner: {
        github: 429706
      },
      notifications: {
        slack: {
          webhookUrl: 'https://hooks.slack.com/services/some-token-1/some-token-2/some-token3'
        }
      }
    };
    before(function (done) {
      var settings = new Settings(data);
      settings.save(function (err, saved) {
        if (err) { return done(err); }
        expect(saved.owner.github).to.equal(data.owner.github);
        expect(saved.notifications.slack.webhookUrl).to.equal(data.notifications.slack.webhookUrl);
        savedSettings = saved;
        done();
      });
    });

    it('should be possible to find settings by owner\'s github id', function (done) {
      Settings.findOneByGithubId(savedSettings.owner.github, function (err, settings) {
        if (err) { return done(err); }
        expect(String(settings._id)).to.equal(String(savedSettings._id));
        expect(settings.owner.github).to.equal(savedSettings.owner.github);
        expect(settings.notifications.slack.webhookUrl).to.equal(savedSettings.notifications.slack.webhookUrl);
        done();
      });
    });

  });

  describe('save settings', function () {

    it('should be possible to save settings', function (done) {
      var data = {
        owner: {
          github: 429706
        },
        notifications: {
          slack: {
            webhookUrl: 'https://hooks.slack.com/services/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'
          }
        }
      };
      var settings = new Settings(data);
      settings.save(function (err, saved) {
        if (err) { return done(err); }
        expect(saved.owner.github).to.equal(data.owner.github);
        expect(saved.notifications.slack.webhookUrl).to.equal(data.notifications.slack.webhookUrl);
        done();
      });
    });

    it('should not save more than one setting for the same owner', function (done) {
      var data1 = {
        owner: {
          github: 429705
        },
        notifications: {
          slack: {
            webhookUrl: 'https://hooks.slack.com/services/some-token-1/some-token-2/some-token3'
          }
        }
      };
      var data2 = {
        owner: {
          github: 429705
        },
        notifications: {
          slack: {
            webhookUrl: 'https://hooks.slack.com/services/some-token-4/some-token-5/some-token6'
          }
        }
      };
      var settings1 = new Settings(data1);
      settings1.save(function (err, saved) {
        if (err) { return done(err); }
        expect(saved.owner.github).to.equal(data1.owner.github);
        expect(saved.notifications.slack.webhookUrl).to.equal(data1.notifications.slack.webhookUrl);
        var settings2 = new Settings(data2);
        settings2.save(function (err) {
          expect(err.name).to.equal('MongoError');
          expect(err.code).to.equal(11000);
          expect(err.err).to.include('dup key');
          done();
        });
      });
    });

    it('should not save more than one setting for the same owner with additional bitbucket property', function (done) {
      var data1 = {
        owner: {
          github: 429705
        },
        notifications: {
          slack: {
            webhookUrl: 'https://hooks.slack.com/services/some-token-1/some-token-2/some-token3'
          }
        }
      };
      var data2 = {
        owner: {
          github: 429705,
          bitbucket: 1232
        },
        notifications: {
          slack: {
            webhookUrl: 'https://hooks.slack.com/services/some-token-4/some-token-5/some-token6'
          }
        }
      };
      var settings1 = new Settings(data1);
      settings1.save(function (err, saved) {
        if (err) { return done(err); }
        expect(saved.owner.github).to.equal(data1.owner.github);
        expect(saved.notifications.slack.webhookUrl).to.equal(data1.notifications.slack.webhookUrl);
        var settings2 = new Settings(data2);
        settings2.save(function (err) {
          expect(err.name).to.equal('MongoError');
          expect(err.code).to.equal(11000);
          expect(err.err).to.include('dup key');
          done();
        });
      });
    });


  });


});