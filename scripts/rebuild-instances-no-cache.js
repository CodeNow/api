/**
 * This is a script which can be used to rebuild instances without cache
 * this will rebuild every instance which is found via query
 */
'use strict';
require('loadenv')();
var async = require('async');

var mongoose = require('mongoose');
mongoose.connect(process.env.MONGO);
var User = require('models/mongo/user.js');
var Instance = require('models/mongo/instance');

var Runnable = require('runnable');
var runnableClient = new Runnable(process.env.FULL_API_DOMAIN, {
  requestDefaults: {
    headers: {
      'user-agent': 'anand'
    }
  }
});

// all instances found with this query will be rebuild
var query = {
  'container.error.data.err.reason': 'runnable error please rebuild'
};

runnableClient.githubLogin(process.env.HELLO_RUNNABLE_GITHUB_TOKEN, function (ee) {
  if (ee) {
    console.log('XX failed login', ee);
    throw new Error('no login');
  }
  var c = 0;
  Instance.find(query, function (err00, a) {
    // use me to do a single instance
    // a = [{ shortHash: '17kxj2' }];
    if (err00) { console.log('XX failed find', err00); }
    console.log('found', a.length);
    async.eachSeries(a, function (i, cb) {
      c++;
      var instanceModel = runnableClient.newInstance(i.shortHash);
      instanceModel.fetch(function (err0) {
        if (err0) {
          console.log('XX failed fetch', err0);
          return cb();
        }
        if (!instanceModel.attrs.createdBy.github) {
          console.log('XX no createdBy');
          return cb();
        }
        User.findByGithubId(instanceModel.attrs.createdBy.github, function (err, ud) {
          if (err) {
            console.log('XX getting user', err, ud);
            return cb();
          }
          var runnableClient2 = new Runnable(process.env.FULL_API_DOMAIN, {
            requestDefaults: {
              headers: {
                'user-agent': 'anand'
              }
            }
          });
          runnableClient2.githubLogin(ud.accounts.github.accessToken, function (err2) {
            if (err2) {
              console.log('XX error logging in', err2);
              return cb();
            }
            instanceModel.build.deepCopy(function (err3, build) {
              build = runnableClient.newBuild(build);
              if (err3) {
                console.log('XX failed to deep copy', i.shortHash, err3);
                return cb();
              }
              console.log('build', build);
              build.build({
                message: 'Manual build',
                noCache: true
              }, function (err4, nbuild) {
                if (err4) {
                  console.log('XX failed to deep copy', i.shortHash, err4);
                  return cb();
                }
                instanceModel.update({
                  build: nbuild._id,
                  env: instanceModel.attrs.env
                }, function (err5) {
                  // ignore errors for now
                  if (err5) {
                    console.log('XX failed to redeploy', i.shortHash, err5);
                  } else {
                    console.log('done', i.shortHash, c, '/', a.length);
                  }
                  cb();
                });
              });
            });
          });
        });
      });
    }, console.log.bind(console, 'ALL DONE'));
  });
});
