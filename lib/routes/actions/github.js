'use strict';

/**
 * Github API Hooks
 * @module rest/actions/github
 */

var express = require('express');
var app = module.exports = express();
var keypather = require('keypather')();
var flow = require('middleware-flow');
var mw = require('dat-middleware');
var Boom = mw.Boom;
var pollMongo = require('middlewares/poll-mongo');
var mongoMiddlewares = require('middlewares/mongo');
var contextVersions = mongoMiddlewares.contextVersions;
var contexts = mongoMiddlewares.contexts;
var instances = mongoMiddlewares.instances;
var users = mongoMiddlewares.users;
var settings = mongoMiddlewares.settings;
var runnable = require('middlewares/apis').runnable;
var github = require('middlewares/apis').github;
var heap = require('middlewares/apis').heap;
var pullRequest = require('middlewares/apis').pullrequest;
var slack = require('middlewares/slack').slack;
var timers = require('middlewares/apis').timers;
var validations = require('middlewares/validations');
var Runnable = require('models/apis/runnable');
var PullRequest = require('models/apis/pullrequest');
var Settings = require('models/mongo/settings');
var noop = require('101/noop');
var find = require('101/find');
var error = require('error');
var dogstatsd = require('models/datadog');
var checkEnvOn = require('middlewares/is-env-on');
var resSendAndNext = require('middlewares/send-and-next');
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
    mw.body('deleted').validate(validations.equals(true))
      .then(
        mw.res.status(202),
        mw.res.send('Deleted the branch; no work to be done.')),

    parseGitHubPushData,
    instances.findInstancesLinkedToBranch('githubPushInfo.repo', 'githubPushInfo.branch'),
    // check if there are instances that follow specific branch
    mw.req('instances.length').validate(validations.equals(0))
      .then(
        // no servers found with this branch
        newBranch()
      )
      .else(
        // servers following particular branch were found. Redeploy them with the new code
        followBranch('instances')
      )
  ),
  mw.res.status(202),
  mw.res.send('No action set up for that payload.'));


function reportDatadogEvent (req, res, next) {
  var eventName = req.get('x-github-event') || '';
  dogstatsd.increment('api.actions.github.events', ['event:' + eventName]);
  next();
}

function parseGitHubPushData (req, res, next) {
  var repository = keypather.get(req, 'body.repository');
  if (!repository) {
    return next(Boom.badRequest('Unexpected commit hook format. Repository is required',
      { req: req }));
  }
  var headCommit = keypather.get(req, 'body.head_commit');
  if (!headCommit) {
    return next(Boom.badRequest('Unexpected commit hook format. Head commit is required',
      { req: req }));
  }
  var ref = keypather.get(req, 'body.ref');
  if (!ref) {
    return next(Boom.badRequest('Unexpected commit hook format. Ref is required',
      { req: req }));
  }
  req.githubPushInfo = {
    repo      : repository.full_name,
    repoName  : repository.name,
    branch    : ref.replace('refs/heads/', ''),
    commit    : headCommit.id,
    headCommit: headCommit,
    commitLog : req.body.commits || [],
    user      : req.body.sender
  };
  next();
}

module.exports.parseGitHubPushData = parseGitHubPushData;

function findOwnerGithubId () {
  return flow.series(
    // fetch context to get owner to get settings for
    contexts.findById('contextVersions[0].context'),
    mw.req().set('ownerGithubId', 'context.owner.github'));
}

function findVersionCreator () {
  return flow.series(
    // FIXME:
    // we are getting creator of the context version here
    // we will use GitHub API using creator account. This is not ideal.
    mw.req().set('creatorGithubId', 'contextVersions[0].createdBy.github'),
    users.findByGithubId('creatorGithubId'),
    // session user is needed for findGithubUserByGithubId
    mw.req().set('versionCreator', 'user'));
}

function findContextOwner () {
  return flow.series(
    users.create('versionCreator'),
    users.model.findGithubUserByGithubId('ownerGithubId'),
    mw.req().set('contextOwner', 'user')
  );
}

function newBranch () {
  return flow.series(
    checkEnvOn('ENABLE_NEW_BRANCH_PRIVATE_MESSAGES',
      202, 'New branch private notifications are disabled for now'),
    timers.create(),
    timers.model.startTimer('github_push_new_branch'),
    instances.findContextVersionsForRepo('githubPushInfo.repo'),
    mw.req().set('contextVersionIds', 'instances'),
    mw.req('contextVersionIds.length').validate(validations.equals(0))
      .then(
        mw.res.status(202),
        mw.res.send('No appropriate work to be done; finishing.')),
    contextVersions.findByIds('contextVersionIds', { _id:1, context:1, createdBy:1, owner:1 }),
    // we send only one message and that is why we are picking one/first context version
    findOwnerGithubId(),
    findVersionCreator(),
    findContextOwner(),
    flow.try(
      settings.findOneByGithubId('ownerGithubId'),
      mw.req('setting').require().then(
        slack.create('setting', 'contextOwner'),
        slack.model.notifyOnNewBranch('githubPushInfo'))
    ).catch(
      error.logIfErrMw
    ),
    timers.model.stopTimer('github_push_new_branch'),
    mw.res.status(201),
    mw.res.json('contextVersionIds')
  );
}

function newContextVersion (contextVersionKey) {
  return flow.series(
    mw.req().set('contextVersion', contextVersionKey),
    // Note: pushSessionUser has moderator permissions,
    // can only be used for loopback methods that don't require a githubToken
    runnable.create({}, pushSessionUser), // user a moderator like user.
    runnable.model.deepCopyContextVersion('contextVersion.context', 'contextVersion._id'),
    mw.req().set('contextVersionId', 'runnableResult.id()'),
    // find new deep copied context version
    contextVersions.modifyAppCodeVersionByRepo(
      'contextVersionId',
      'githubPushInfo.repo',
      'githubPushInfo.branch',
      'githubPushInfo.commit')
  );
}

function fetchPullRequests () {
  return flow.series(
    // we are getting creator of first instance
    // we need that to fetch list of open pull requests for the branch using accessToken
    users.findByGithubId('instances[0].createdBy.github'),
    mw.req().set('githubUser', 'user'),

    github.create({token: 'githubUser.accounts.github.accessToken'}),
    github.model.listOpenPullRequestsForBranch('githubPushInfo.repo', 'githubPushInfo.branch'),
    mw.req().set('pullRequests', 'githubResult')
  );
}

function createSocketClient (orgIdKey) {
  return function (req, res, next) {
      var SocketClient = require('socket/socket-client.js');
      var socketClient = new SocketClient();
      var orgId = keypather.get(req, orgIdKey);
      socketClient.joinOrgRoom(orgId);
      req.socketClient = socketClient;
      next();
    };
}

function followBranch (instancesKey) {
  return flow.series(
    mw.req().set('instances', instancesKey),
    createSocketClient('instances[0].owner.github'),
    fetchPullRequests(),
    function (req, res, next) {
      // dat-middleware set creates closures when reference values are used! (objects)
      req.newContextVersionIds = [];
      req.deployments = {};
      req.deployedInstances = [];
      next();
    },
    mw.req('instances').each(
      function (instance, req, eachReq, res, next) {
        eachReq.instance = instance;
        eachReq.contextVersion = instance.contextVersion;
        eachReq.creatorGithubId = instance.createdBy.github;
        next();
      },
      users.findByGithubId('creatorGithubId'),
      mw.req().set('instanceCreator', 'user'),
      instances.model.populateOwnerAndCreatedBy('instanceCreator'),
      newContextVersion('contextVersion'), // replaces context version!
      flow.try(
        function (req, res, next) {
          var instance = req.instance;
          var targetUrl = createTargetUrl(instance.name, instance.owner.username);
          var githubPushInfo = req.githubPushInfo;
          var accessToken = keypather.get(req, 'instanceCreator.accounts.github.accessToken');

          // listen on build started event
          var buildStartedEvent = [
            'CONTEXTVERSION_UPDATE',
            'build_started',
            req.contextVersion.id
          ].join(':');
          console.log('listen for build started event', buildStartedEvent);
          req.socketClient.addHandler(buildStartedEvent, function (contextVersion) {
            sendAndForgetGitHubStatus(githubPushInfo, targetUrl, accessToken, 'pending');
          });
          next();
        },
        // create and build new build
        createAndBuildBuild('githubPushInfo'),
        function (req, res, next) {
          if (req.jsonNewBuild) {
            var instance = req.instance;
            var targetUrl = createTargetUrl(instance.name, instance.owner.username);
            var githubPushInfo = req.githubPushInfo;
            var accessToken = keypather.get(req, 'instanceCreator.accounts.github.accessToken');
            var buildId = req.jsonNewBuild._id;
            // listen on build started event
            var buildStartedEvent = [
              'CONTEXTVERSION_UPDATE',
              'build_started',
              req.jsonNewBuild.contextVersions[0]
            ].join(':');

            req.socketClient.addHandler(buildStartedEvent, function (contextVersion) {
              sendAndForgetGitHubStatus(githubPushInfo, targetUrl, accessToken, 'pending');
            });

            // listen on build completed event
            var buildCompletedEvent = [
              'CONTEXTVERSION_UPDATE',
              'build_completed',
              req.jsonNewBuild.contextVersions[0]
            ].join(':');

            req.socketClient.addHandler(buildCompletedEvent, function (contextVersion) {
              if (contextVersion.build.error) {
                // if error send github statuses
                sendAndForgetGitHubStatus(githubPushInfo, targetUrl, accessToken, 'error');
                // we are finished
                req.socketClient.destroy();
              } else {
                // build was successful
                // 1. update github statuses. fire and forget
                sendAndForgetGitHubStatus(githubPushInfo, targetUrl, accessToken, 'success');
                // 2. send start deployment github request
                createAndStartGitHubDeployment(githubPushInfo, targetUrl, instance, accessToken, function (err, deployment) {
                  if (err) {
                    // TODO what to do here??
                    req.deployments[instance.shortHash] = {
                      status: 'error'
                    };
                    console.log('github deployment created.end', req.deployments);
                  } else {
                    req.deployments[instance.shortHash] = {
                      deploymentId: deployment.id
                    };
                    console.log('github deployment created.end', req.deployments, deployment.id);
                  }

                  // 3. listen on instance deploy event
                  // TODO this should be `deploy` and not `patch`. But somehow I receive deploy only occasionally
                  var instanceDeployedEvent = [
                    'INSTANCE_UPDATE',
                    'patch',
                    instance.shortHash
                  ].join(':');
                  req.socketClient.addHandler(instanceDeployedEvent, function (deployedInstance) {
                    console.log('is instance deployed????', deployedInstance);
                    var instanceStatus = req.deployments[instance.shortHash];
                    var pullRequest = new PullRequest(accessToken);
                    if (instanceStatus && instanceStatus.deploymentId) {
                      if (instanceStatus.status !== 'error') {
                        req.deployedInstances.push(instances);
                        // check if all instances were deployed
                        console.log('check if we need to send notification', Object.keys(req.deployments).length, req.instances.length);
                        if (Object.keys(req.deployments).length === req.instances.length) {
                          // we are finished. destroy socket client
                          req.socketClient.destroy();
                          console.log('send slack notification here', req.deployedInstances);
                          sendSlackNotification(githubPushInfo, req.deployedInstances);

                        }
                      } else {
                        pullRequest.deploymentErrored(req.githubPushInfo, instanceStatus.deploymentId,
                          req.instance.name, targetUrl, noop);
                      }
                    }
                  });
                  // 4. deploy it to the instance
                  var runnableClient = new Runnable({}, req.instanceCreator);

                  runnableClient.updateInstance(instance.shortHash, {json: {build: buildId}}, function (err) {
                    if (err) {
                      req.deployments[instance.shortHash] = {
                        status: 'error'
                      };
                    }
                  });
                });
              }
            });
          }
          next();
        }
      ).catch(
        error.logIfErrMw
      )
    ),
    // TODO revisit this response
    mw.res.json('newContextVersionIds')
  );
}


function sendSlackNotification (githubPushInfo, deployedInstances) {
  if (!deployedInstances || deployedInstances.length === 0) {
    return;
  }
  var firstInstance = deployedInstances[0];
  var ownerGitHubId = keypather.get(firstInstance, 'owner.github');
  Settings.findOneByGithubId(ownerGitHubId, function (err, setting) {
    if (!err && setting) {
      var slack = new Slack(setting, ownerGithubId);
      slack.notifyOnAutoUpdate(githubPushInfo, deployedInstances, noop);
    }
  });
}

function sendAndForgetGitHubStatus (githubPushInfo, targetUrl, accessToken, status) {
  var pullRequest = new PullRequest(accessToken);
  if (status === 'error') {
    pullRequest.buildErrored(githubPushInfo, targetUrl, noop);
  } else if (status === 'pending'){
    pullRequest.buildStarted(githubPushInfo, targetUrl, noop);
  } else {
    pullRequest.buildSucceeded(githubPushInfo, targetUrl, noop);
  }
}

function createAndStartGitHubDeployment (githubPushInfo, targetUrl, instance, accessToken, callback) {
  var pullRequest = new PullRequest(accessToken);
  var payload = {
    instanceId: instance._id.toString()
  };
  pullRequest.createAndStartDeployment(githubPushInfo, instance.name,
    payload, targetUrl, callback);
}

function createAndBuildBuild (githubInfo) {
  return flow.series(
    mw.req().set('githubInfo', githubInfo),
    // we cannot use pushSessionUser, bc redeploy requires token
    // we must reinstantiate runnable model for each call bc of a bug
    runnable.create({}, 'instanceCreator'),
    runnable.model.createAndBuildBuild('contextVersion._id',
      'instance.owner.github', 'githubInfo.repo', 'githubInfo.commit'),
    mw.req().set('jsonNewBuild', 'runnableResult')
  );
}

function instanceAutoDeployDone () {
  return flow.series(
    timers.model.stopTimer('timerId'),
    heap.create(),
    heap.model.track('githubPushInfo.user.id', 'github_hook_autodeploy', {
      repo: 'githubPushInfo.repo',
      branch: 'githubPushInfo.branch',
      commit: 'githubPushInfo.commit',
      githubUsername: 'githubPushInfo.user.login',
      instanceName: 'instance.name',
      boxOwnerGithubId: 'instance.owner.github',
      boxOwnerGithubUsername: 'instance.owner.username',
      duration: 'timersResult[0]'
    }, {
      githubUsername: 'githubPushInfo.user.login'
    }));
}

// TODO protocol should be in env later
function createTargetUrl (instanceName, owner) {
  return 'https://' + process.env.DOMAIN + '/' + owner + '/' + instanceName;
}