/**
 * @module lib/models/redis/hosts
 */
'use strict'

var Boom = require('dat-middleware').Boom
var createCount = require('callback-count')
var isFunction = require('101/is-function')
var put = require('101/put')

var Instance = require('models/mongo/instance')
var NaviEntry = require('navi-entry')
var logger = require('middlewares/logger')(__filename)
var redisClient = require('models/redis')

NaviEntry.setRedisClient(redisClient)

var log = logger.log

module.exports = Hosts

function Hosts () {}

/**
 * parse instance hostname into name
 * @param  {string}   hostname  hostname of an instance
 * @param  {Function} cb   callback(err, instanceName)
 */
Hosts.prototype.parseHostname = function (hostname, cb) {
  log.info({
    tx: true,
    hostname: hostname
  }, 'Hosts.prototype.parseHostname')
  // validates at least 2 '-' + domain
  var userContentDomainRE = new RegExp('^.*\-.*\-.*\.' + // at least 2 -
    process.env.USER_CONTENT_DOMAIN + '$')
  if (!userContentDomainRE.test(hostname)) {
    return invalidHostname(hostname, 'incorrect user content domain', cb)
  }
  NaviEntry.createFromHostname(redisClient, hostname, function (err, naviEntry) {
    if (err) {
      return cb(Boom.notFound('entry not found for hostname: ' + hostname))
    }
    naviEntry.getInfo(function (err, info) {
      if (err) { return cb(err) }
      if (!info) {
        return cb(Boom.notFound('entry not found'))
      }
      cb(null, {
        username: info.ownerGitHubUsername,
        instanceName: info.instanceName
      })
    })
  })
}

function invalidHostname (hostname, msg, cb) {
  var errorMsg = 'Invalid hostname (ex: name-org.' + process.env.USER_CONTENT_DOMAIN + ')'
  var err = Boom.badRequest(errorMsg, {
    errorCode: 'INVALID_HOSTNAME', // this should not change!
    errorMsg: msg,
    errorHostname: hostname
  })
  cb(err)
}

/**
 * upsert hosts (hipache) for   instance
 * @param  {String}     ownerGitHubUsername   instance owner's username
 * @param  {Instance}   instance        instance mongo model
 * @param  {String}     [instanceName]  instanceName (could be diff from current name - old or new)
 *                                      for which to upsert host entries default: instance.name
 * @param  {Container}  [container]     container, default: instance.container
 * @param  {Function}   cb              callback
 */
Hosts.prototype.upsertHostsForInstance = function (ownerGitHubUsername, instance, instanceName, container, cb) {
  var logData = {
    tx: true,
    ownerGitHubUsername: ownerGitHubUsername,
    instance: instance,
    instanceName: instanceName,
    container: container
  }
  log.info(logData, 'Hosts.prototype.upsertHostsForInstance')
  var args = formatArgsForHosts.apply(null, arguments)
  ownerGitHubUsername = args.ownerGitHubUsername
  instance = args.instance
  instanceName = args.instanceName.toLowerCase()
  container = args.container
  var branch = Instance.getMainBranchName(instance)
  cb = args.cb
  if (!container || !container.ports || !Object.keys(container.ports).length) {
    cb()
  } else {
    var count = createCount(Object.keys(container.ports).length, cb)
    // upsert hipache entries for each port
    Object.keys(container.ports).forEach(function (containerPort) {
      var naviOpts = {
        shortHash: instance.shortHash,
        exposedPort: containerPort,
        branch: branch,
        instanceName: instanceName,
        ownerGitHubUsername: ownerGitHubUsername,
        ownerGithub: instance.owner.github,
        userContentDomain: process.env.USER_CONTENT_DOMAIN,
        masterPod: instance.masterPod
      }
      log.trace(put(naviOpts, logData), 'Hosts.prototype.upsertHostsForInstance forEach')
      new NaviEntry(naviOpts).setBackend(process.env.NAVI_HOST, function (err) {
        if (err) {
          log.error(put({
            err: err
          }, logData), 'Hosts.prototype.upsertHostsForInstance error')
        } else {
          log.trace(logData, 'Hosts.prototype.upsertHostsForInstance success')
        }
        count.next(err)
      })
    })
  }
}

/**
 * delete hosts (hipache) for   instance
 * @param  {Object}     lightEntry      light object with following properties:
                                          - ownerGitHubUsername
                                          - branch
                                          - shortHash
                                          - ownerGithub
                                          - masterPod
                                          - instanceName
 * @param  {Container}  container       container
 * @param  {Function}   cb              callback
 */
Hosts.prototype.removeHostsForInstance = function (lightEntry, container, cb) {
  var logData = put({
    tx: true,
    container: container
  }, lightEntry)
  log.info(logData, 'Hosts.prototype.removeHostsForInstance')
  if (!container || !container.ports || !Object.keys(container.ports).length) {
    log.warn(logData, 'removeHostsForInstance: missing container or container ports')
    return cb()
  }
  var count = createCount(Object.keys(container.ports).length, function (err) {
    if (err) {
      log.trace(put({
        err: err
      }, logData), 'removeHostsForInstance: failure')
    } else {
      log.trace(logData, 'removeHostsForInstance: success')
    }
    cb.apply(this, arguments)
  })
  // delete hipache entries for each port
  Object.keys(container.ports).forEach(function (containerPort) {
    log.trace(put({
      USER_CONTENT_DOMAIN: process.env.USER_CONTENT_DOMAIN,
      containerPort: containerPort
    }, logData), 'removeHostsForInstance container.ports forEach removing entry')
    var entry = put({
      exposedPort: containerPort,
      userContentDomain: process.env.USER_CONTENT_DOMAIN
    }, lightEntry)
    new NaviEntry(entry).del(count.next)
  })
}

function formatArgsForHosts (ownerGitHubUsername, instance, instanceName, container, cb) {
  if (isFunction(instanceName)) {
    cb = instanceName
    instanceName = instance.name
    container = instance.container
  }
  if (isFunction(container)) {
    cb = container
    container = instance.container
  }
  container = container || instance.container
  return {
    ownerGitHubUsername: ownerGitHubUsername,
    instance: instance,
    instanceName: instanceName,
    container: container,
    cb: cb
  }
}
