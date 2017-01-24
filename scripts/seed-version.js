/*
 * This script should be run whenever the database needs to be repopulated with
 * the seed contexts
 * `NODE_ENV=development NODE_PATH=./lib node scripts/seed-version.js`
 *
 * NOTE: This script will attempt to delete any existing source contexts, as well as their
 * instances.  It should output what it's deleting, so be sure to verify nothing else was targeted
 *
 * NOTE 2: Must log in as HelloRunnable and populate user model in mongo before running this script
 */

'use strict'

require('loadenv')()

const BuildService = require('models/services/build-service')
const Context = require('models/mongo/context')
const ContextVersion = require('models/mongo/context-version')
const fs = require('fs')
const InfraCodeVersion = require('models/mongo/infra-code-version')
const Instance = require('models/mongo/instance')
const InstanceService = require('models/services/instance-service')
const messenger = require('socket/messenger')
const mongoose = require('mongoose')
const Promise = require('bluebird')
const rabbitMQ = require('models/rabbitmq/index')
const sinon = require('sinon')
const User = require('models/mongo/user')

const blankSource = {
  name: 'Blank',
  isSource: true,
  body: '# Empty Dockerfile!\n'
}
const sources = [
  {
  name: 'PHP',
  isTemplate: true,
  isSource: true,
  body: fs.readFileSync('./scripts/sourceDockerfiles/php').toString()
}, {
  name: 'NodeJs',
  isTemplate: true,
  isSource: true,
  body: fs.readFileSync('./scripts/sourceDockerfiles/nodejs').toString()
}, {
  name: 'Rails',
  isTemplate: true,
  isSource: true,
  body: fs.readFileSync('./scripts/sourceDockerfiles/rails').toString()
}, {
  name: 'Ruby',
  isTemplate: true,
  isSource: true,
  body: fs.readFileSync('./scripts/sourceDockerfiles/ruby').toString()
}, {
  name: 'Python',
  isTemplate: true,
  isSource: true,
  body: fs.readFileSync('./scripts/sourceDockerfiles/python').toString()
}, {
  name: 'PostgreSQL',
  body: fs.readFileSync('./scripts/sourceDockerfiles/postgresSql').toString()
}, {
  name: 'Go',
  isTemplate: true,
  isSource: true,
  body: fs.readFileSync('./scripts/sourceDockerfiles/golang').toString()
}, {
  name: 'MySQL',
  body: fs.readFileSync('./scripts/sourceDockerfiles/mysql').toString()
}, {
  name: 'Consul-Server',
  body: fs.readFileSync('./scripts/sourceDockerfiles/consul-server').toString()
}, {
  name: 'HBase',
  body: fs.readFileSync('./scripts/sourceDockerfiles/hbase').toString()
}, {
  name: 'Cassandra',
  body: fs.readFileSync('./scripts/sourceDockerfiles/cassandra').toString()
}, {
  name: 'MongoDB',
  body: fs.readFileSync('./scripts/sourceDockerfiles/mongodb').toString()
}, {
  name: 'Redis',
  body: fs.readFileSync('./scripts/sourceDockerfiles/redis').toString()
}, {
  name: 'ElasticSearch',
  body: fs.readFileSync('./scripts/sourceDockerfiles/elasticsearch').toString()
}, {
  name: 'Memcached',
  body: fs.readFileSync('./scripts/sourceDockerfiles/memcached').toString()
}, {
  name: 'Nginx',
  body: fs.readFileSync('./scripts/sourceDockerfiles/nginx').toString()
}, {
  name: 'RabbitMQ',
  body: fs.readFileSync('./scripts/sourceDockerfiles/rabbitmq').toString()
}, {
  name: 'RethinkDB',
  body: fs.readFileSync('./scripts/sourceDockerfiles/rethinkdb').toString()
}]
sinon.stub(messenger)

var createdBy

/*
 * START SCRIPT
 */
main()

function main () {
  return Promise.all([
    rabbitMQ.connect(),
    Promise.fromCallback(cb => {
      mongoose.connect(process.env.MONGO, cb)
    })
  ])
    .then(() => {
      return User.findOneAsync({ 'accounts.github.username': 'HelloRunnable' }, null)
    })
    .then(user => {
      createdBy = { github: user.accounts.github.id }
      return findOrCreateBlankContext()
        .tap((res) => {
          let blankIcv = res[0]
          let blankContext = res[1]
          return createContextVersion(blankSource, blankContext, blankIcv)
            .then(cv => createAndBuildBuild(user, blankSource, cv))
        })
        .tap(function (res) {
          const blankIcv = res[0]
          return Promise.each(sources, function (source) {
            return findOrCreateContext(source)
              .then(context => {
                return createNewIcv(source, context, blankIcv)
                  .then(icv => createContextVersion(source, context, icv))
                  .then(cv => createAndBuildBuild(user, source, cv))
                  .then(build => createOrUpdateInstance(user, source, build))
              })
          })
        })
    })
    .catch(err => {
      console.error('hello runnable error', err)
      throw err
    })
    .finally(() => {
      return Promise.all([
        rabbitMQ.disconnect(),
        Promise.fromCallback(cb => {
          mongoose.disconnect(cb)
        })
      ])
      .asCallback(err => {
        return process.exit(err ? 1 : 0)
      })
    })
}

function findOrCreateBlankContext () {
  return findOrCreateContext(blankSource)
    .then(blankContext => {
      return InfraCodeVersion.findOneAsync({ context: blankContext.id })
        .then(blankIcv => {
          if (!blankIcv) {
            return createNewIcv(blankSource, blankContext)
          }
          return [blankIcv, blankContext]
        })
    })
}

function findOrCreateContext (data) {
  return Context.findOneAsync({ 'name': data.name, 'isSource': data.isSource })
    .then(context => {
      if (context) {
        console.log('Found Context "' + data.name + '"')
        return context
      }
      console.log('Create Context "' + data.name + '"')
      context = new Context({
        owner: createdBy,
        name: data.name,
        description: data.name,
        isSource: data.isSource
      })
      return context.saveAsync()
    })
}

function createNewIcv (data, context, parentIcv) {
  console.log('createICV "' + data.name + '"')
  const opts = {
    context: context._id
  }
  if (parentIcv) {
    opts.parent = parentIcv._id
  }
  var icv = new InfraCodeVersion(opts)
  return icv.initWithDefaultsAsync()
    .then(icv => {
      return icv.saveAsync()
    })
    .then(icv => {
      return icv.createFsAsync({ name: 'Dockerfile', path: '/', body: data.body })
    })
    .return(icv)
}

function createContextVersion (data, context, icv) {
  console.log('createCV "' + data.name + '"')
  // if this is brand newle

  let cv = new ContextVersion({
    createdBy: createdBy,
    context: context._id,
    advanced: true,
    created: new Date(),
    owner: createdBy,
    infraCodeVersion: icv._id
  })
  return cv.saveAsync()
}

function createAndBuildBuild (user, data, version) {
  console.log('createBuild (', data.name, ')')
  return BuildService.createBuild({
    contextVersion: version._id,
    owner: createdBy // same on purpose
  }, user)
    .then(build => {
      console.log('buildBuild (', data.name, ')')
      return BuildService.buildBuild(build._id, { message: 'seed instance script', noCache: true }, user)
    })
}

function createOrUpdateInstance (user, data, build) {
  console.log('createOrUpdateInstance (', data.name, ')')
  const name = ((data.isTemplate) ? 'TEMPLATE-' : '') + data.name
  return Instance.findOneAsync({ lowerName: name.toLowerCase(), 'owner.github': createdBy.github })
    .then(instance => {
      if (instance) {
        console.log('Found Instance "' + name + '"')
        return InstanceService.updateInstance(instance, { build: build._id.toString() }, user)
      }
      console.log('Create New Instance "' + name + '"')
      return InstanceService.createInstance({
        build: build._id.toString(),
        name: name,
        masterPod: true,
        owner: createdBy
      }, user)
    })

