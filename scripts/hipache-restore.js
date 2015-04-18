'use strict';
require('loadenv')();
// redis is required for hosts and hipache-entry to work (below)
var redis = require('models/redis/index');
var User = require('models/mongo/user');
var Instance = require('models/mongo/instance');
var mongoose = require('models/mongo/mongoose-control');
var createCount = require('callback-count');
var async = require('async');
var cachedGithubUsers = {}; /* githubId: githubUser */
var fetchingGithubUser= {}; /* githubId: [handlers...] */


mongoose.start(function () {

  restoreHosts(function (err) {
    if (err) { throw err; }

    console.log('done... disconnect from mongo');
    mongoose.stop(function (err) {
      if (err) { throw err; }
      console.log('DONE!');
      process.exit(0);
    });
  });

  function restoreHosts (cb) {
    Instance.find({ 'container.ports': { $exists: true } }, function (err, instances) {
      if (err) { throw err; }

      async.eachLimit(instances, 100, function (instance, cb) {
        var ownerId = instance.owner.github;

        // sub-optimization
        if (checkCache(ownerId)) { return; }

        // owners can be orgs or users, i need to find a user with a valid github token
        // - use createdBy
        User.findOneBy('accounts.github.id', instance.createdBy.github, function (err, user) {
          if (err) { return cb(err); }
          // reliable optimization
          if (checkCache(ownerId)) { return; }
          fetchingGithubUser[ownerId] = [handleGithubUser]; // init
          // this user method can only be used on a user with a valid github token
          user.findGithubUserByGithubId(ownerId, callAllGithubUserHandlers(ownerId));
        });

        function checkCache (ownerId) {
          var cachedGithubUser = cachedGithubUsers[ownerId];
          if (cachedGithubUser) {
            console.log('cache hit ownerId2', ownerId);
            handleGithubUser(null, cachedGithubUser);
            return true;
          }
          if (fetchingGithubUser[ownerId]) {
            console.log('fetch cache hit ownerId2', ownerId);
            fetchingGithubUser[ownerId].push(handleGithubUser);
            return true;
          }
        }
        function handleGithubUser (err, githubUser) {
          if (err) {
            // in production we will hit errors where tokens have been invalidated...
            console.error(err);
            return cb();
          }
          var username = githubUser.login;
          var ports = Object.keys(instance.container.ports);
          if (ports.length === 0) {
            return cb();
          }
          var count = createCount(ports.length, cb);

          ports.forEach(function (containerPort) {
            /*
             * DEBUG LOGIC
             */
            // var url = require('url');
            // var dockerUrl = instance.container.dockerHost;
            // var HipacheEntry = require('models/redis/hipache-entry');
            // var hipacheEntry = new HipacheEntry(
            //     containerPort, instance.name, username);
            // hipacheEntry.lrange(0, -1, function (err, data) {
            //   var actualPort = instance.container.ports[containerPort][0].HostPort;
            //   var backendUrl = url.format({
            //     protocol: /^443\/.+/.test(containerPort) ? 'https:' : 'http:',
            //     slashes: true,
            //     hostname: url.parse(dockerUrl).hostname,
            //     port: actualPort
            //   });
            //   console.log('\nKEY     ', hipacheEntry.key);
            //   console.log('ACTUAL  '  , data);
            //   console.log('EXPECTED'  , [instance.name, backendUrl]);
            //   count.next();
            // });

            /*
             * WRITE!! LOGIC
             */
            var Hosts = require('models/redis/hosts');
            var hosts = new Hosts();
            console.log(
              containerPort, username, instance, instance.name);
            hosts.upsertHostForContainerPort(
              containerPort, username, instance, instance.name, count.next);
          });
        }
      }, cb);
    });
  }
});
function callAllGithubUserHandlers (ownerId) {
  return function (err, githubUser) {
    cachedGithubUsers[ownerId] = githubUser;
    while (fetchingGithubUser[ownerId].length) {
      var handler = fetchingGithubUser[ownerId].pop();
      handler(err, githubUser);
    }
  };
}