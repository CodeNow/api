'use strict';

/**
 * Github API Hooks
 * @module rest/actions/github
 */
var express = require('express');
var app = module.exports = express();
var keypather = require('keypather')();
var flow = require('middleware-flow');
var middlewarize = require('middlewarize');
var mw = require('dat-middleware');
var Boom = mw.Boom;
var mongoMiddlewares = require('middlewares/mongo');
var instances = mongoMiddlewares.instances;
var users = mongoMiddlewares.users;
// var runnable = require('middlewares/apis').runnable;
var validations = require('middlewares/validations');
var githook = require('middlewares/apis').githook;
var pluck = require('101/pluck');
var dogstatsd = require('models/datadog');
var checkEnvOn = require('middlewares/is-env-on');

var MixPanelModel = require('models/apis/mixpanel');
var mixpanel = middlewarize(MixPanelModel);

/** Receive the Github hooks
 *  @event POST rest/actions/github
 *  @memberof module:rest/actions/github */
var pushSessionUser = {
  permissionLevel: 5,
  accounts: {
    github: {
      id: 'githubPushInfo.user.id'
    }
  }
};

app.post('/actions/github/',
  reportDatadogEvent,
  mw.headers('user-agent').require().matches(/^GitHub.*$/),
  mw.headers('x-github-event', 'x-github-delivery').require(),
  mw.headers('x-github-event').matches(/^ping$/).then(
    mw.res.status(202),
    mw.res.send('Hello, Github Ping!')),
  checkEnvOn('ENABLE_GITHUB_HOOKS', 202, 'Hooks are currently disabled. but we gotchu!'),
  // handle push events
  mw.headers('x-github-event').matches(/^push$/).then(
    parseGitHubPushData,
    reportMixpanelUserPush(),
    preventTagEventHandling,
    mw.body('deleted').validate(validations.equals(true))
      .then(autoDelete())
      .else(
        instances.findInstancesLinkedToBranch('githubPushInfo.repo', 'githubPushInfo.branch'),
        // check if there are instances that follow specific branch
        mw.req('instances.length').validate(validations.equals(0))
          // no servers found with this branch check autolaunching
          .then(
            instances.findForkableMasterInstances('githubPushInfo.repo', 'githubPushInfo.branch'),
            mw.req('instances.length').validate(validations.equals(0))
              .then(
                mw.res.status(202),
                mw.res.send('Nothing to deploy or fork'))
              .else(autoFork('instances')))
          // servers following particular branch were found. Redeploy them with the new code
          .else(autoDeploy('instances'))
      )
  ),
  mw.res.status(202),
  mw.res.send('No action set up for that payload.'));

/**
 * Report to mixpanel event - user pushed to a repository branch
 * Must be invoked after parseGitHubPushData
 * @return {Function} - middleware
 */
function reportMixpanelUserPush () {
  return flow.series(
    users.findByGithubId('githubPushInfo.user.id'),
    mw.req('user').require().then(
      mw.req().set('pushUser', 'user'),
      mixpanel.new('pushUser'),
      mixpanel.instance.track('github-push', 'githubPushInfo').sync()
    )
  );
}

/**
 * Middlware step to report what type of Github POSTback event
 * recieve to datadog
 * @return null
 */
function reportDatadogEvent (req, res, next) {
  var eventName = req.get('x-github-event') || '';
  dogstatsd.increment('api.actions.github.events', ['event:' + eventName]);
  next();
}

/**
 * Notification from Github that user repository has been pushed to. Organize repo & user
 * information and place on req for later use
 */
function parseGitHubPushData (req, res, next) {
  var repository = keypather.get(req, 'body.repository');
  if (!repository) {
    return next(Boom.badRequest('Unexpected commit hook format. Repository is required',
      { req: req }));
  }
  // headCommit can be null if we are deleting branch
  var headCommit = keypather.get(req, 'body.head_commit') || {};
  var ref = keypather.get(req, 'body.ref');
  if (!ref) {
    return next(Boom.badRequest('Unexpected commit hook format. Ref is required',
      { req: req }));
  }
  req.githubPushInfo = {
    repo: repository.full_name,
    repoName: repository.name,
    branch: ref.replace('refs/heads/', ''),
    commit: headCommit.id,
    headCommit: headCommit,
    commitLog : req.body.commits || [],
    user: req.body.sender,
    ref: ref
  };
  next();
}

module.exports.parseGitHubPushData = parseGitHubPushData;

/**
 * Middlware to check if ref is tag.
 * We don't handle tags creation/deletion events.
 */
function preventTagEventHandling (req, res, next) {
  var ref = req.githubPushInfo.ref;
  if (ref.indexOf('refs/tags/') === 0) {
    res.status(202);
    res.send('Cannot handle tags\' related events');
  }
  else {
    next();
  }
}

/**
 * Handle regular autoDelete procedure.
 * @return middleware
 */
function autoDelete () {
  return flow.series(
    instances.findForkedInstances('githubPushInfo.repo', 'githubPushInfo.branch'),
    mw.req('instances.length').validate(validations.equals(0))
      .then(
        mw.res.status(202),
        mw.res.send('No appropriate work to be done; finishing.')),
    users.findByGithubId('instances[0].createdBy.github'),
    // runnable.create({}, 'user'),
    // runnable.model.destroyInstances('instances'),
    // function (req, res, next) {
    //   var instancesIds = req.instances.map(pluck('_id'));
    //   req.instancesIds = instancesIds;
    //   next();
    // },
    mw.res.status(201),
    mw.res.send('instancesIds')
  );
}

/**
 * Handle case when instances linked to the branch: autodeploy.
 * High-level steps:
 * 1. create one socket client to listen for the events.
 * 2. for each instance create and build new build with new code.
 * 3. set GitHub Status of the build
 * 4. patch and deploy each instance with the new build.
 * 5. use Github Deployments API to keep deployment updates in sync
 * 6. after all instances were deployed: send private slack message to the
 * code pusher.
 * 7. close socket-client connection.
 */
function autoDeploy (instancesKey) {
  return flow.series(
    mw.req().set('instances', instancesKey),
    mw.req('instances').each(
      githook.create('gitPushInfo', pushSessionUser, instance),
      githook.mode.autoDeploy(),
      mw.log('instance', 'githookResult')),
    mw.res.json('instances')
  );
}

/**
 * Autofork instance from master.
 * 1. create new build
 * 2. fork instance from each master instance with the same repo
 * 3. put new build on each of the forked instances
 * 4. send slack notification about each forked instance
 */
function autoFork (instancesKey) {
  return flow.series(
    checkEnvOn('ENABLE_AUTOFORK_ON_BRANCH_PUSH',
      202, 'Autoforking of instances on branch push is disabled for now'),
    mw.req().set('instances', instancesKey),
    mw.req('instances').each(
      mw.log('instance')),
    mw.res.json('instances')
  );
}
