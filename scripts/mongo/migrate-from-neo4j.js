'use strict'
/**
 * This script updates all instances to save their hostname (and elasticHostname) to the database.
 * It also saves the name of the owner from github (if it wasn't already there)
 */
require('loadenv')()
var exists = require('101/exists')
var keypather = require('keypather')()
var mongoose = require('mongoose')

var Instances = require('models/mongo/instance')
var Graph = require('models/apis/graph')
mongoose.connect(process.env.MONGO)
var Promise = require('bluebird')

var dryRun = !process.env.ACTUALLY_RUN

console.log('dryRun?', !!dryRun)
var count = 0
Instances.findAsync({})
  .each(function (i) {
    // fetch all the dependencies for each instance
    return getDepsFromNeo(i)
      .each(function (depInstance) {
        if (!depInstance) {
          return 'bad dep'
        }
        count++
        if (!dryRun) {
          return i.addDependency(depInstance)
        }
      })
  })
  .then(function () {
    console.log('updated', count, 'dependencies')
    process.exit(0)
  })
  .catch(function (err) {
    console.error('error happened', err)
    return process.exit(1)
  })
function generateGraphNode (instance) {
  return {
    label: 'Instance',
    props: {
      id: instance._id.toString(),
      shortHash: instance.shortHash,
      name: instance.name,
      lowerName: instance.lowerName,
      // eslint dislikes quoted props and non-camelcase keys. such contradiction
      'owner_github': keypather.get(instance, 'owner.github'), // eslint-disable-line quote-props
      'contextVersion_context': // eslint-disable-line quote-props
        keypather.get(instance, 'contextVersion.context.toString()')
    }
  }
}

function getDepsFromNeo (thisInstance) {
  var self = thisInstance
  return _getDeps(thisInstance, [])
    .then(function (deps) {
      // Annotate dependencies with additional instance information (currently
      // only adding network information for charon)
      return Promise.filter(deps, function (dep) {
        return self._id.toString() !== dep.id
      })
        .map(function annotateWithInstanceFields (dep) {
          return Instances.findByIdAsync(dep.id)
        })
    })

  function _getDeps (instance) {
    // hack to get valid starting node if we pass an existing node
    var start = generateGraphNode(instance)
    if (start.hostname) {
      delete start.hostname
    }
    var stepEdge = {
      label: 'dependsOn'
    }
    var steps = [{
      Out: {
        edge: stepEdge,
        node: { label: 'Instance' }
      }
    }]
    return Promise.fromCallback(
      function (cb) {
        var client = new Graph()
        client.graph.getNodes(start, steps, cb)
      },
      {multiArgs: true}
      )
      .spread(function (nodes, allNodes) {
        nodes = fixNodes(nodes, allNodes)
        return nodes
      })
  }
}

/**
 * fixes keys on node to match out instance objects
 * @param  {object} nodes    array of nodes returned from graph.getNodes
 * @param  {object} allNodes array of allNodes returned from graph.getNodes
 * @return {object}          array of nodes with keys fixed
 */
function fixNodes (nodes, allNodes) {
  var hostnames = allNodes.b
  // fix owner_github -> owner.github
  // fix contextVersion_context -> contextVersion.context
  var fixes = {
    'owner_github': 'owner.github', // eslint-disable-line quote-props
    'contextVersion_context': 'contextVersion.context' // eslint-disable-line quote-props
  }
  nodes.forEach(function (n, i) {
    // set hostnames (from the edges) on the nodes
    keypather.set(n, 'hostname', hostnames[i].hostname)
    Object.keys(fixes).forEach(function (key) {
      if (keypather.get(n, key) && !keypather.get(n, fixes[key])) {
        keypather.set(n, fixes[key], n[key])
        delete n[key]
      }
    })
  })
  return nodes
}
