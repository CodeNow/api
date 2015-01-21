'use strict';

var util  = require('util');
var GraphInterface = require('models/graph/index');
var cayley = require('cayley');

module.exports = Cayley;

function Cayley () {
  GraphInterface.call(this);
  this.cayleyClient = cayley(process.env.CAYLEY);
  this.g = this.cayleyClient.graph;
}

util.inherits(Cayley, GraphInterface);

Cayley.prototype.getNodes = function (start, steps, cb) {
  var q = this.g.V(start);
  steps.forEach(function (step) {
    if (step.Out) {
      q = q.Out(step.Out);
    } else if (step.In) {
      q = q.In(step.In);
    }
  });
  q.All(cb);
};

Cayley.prototype.writeConnections = function (connections, cb) {
  // cayley can write in batches!
  if (connections.length === 0) { return cb(); }
  this.cayleyClient.write(connections, cb);
};

Cayley.prototype.deleteConnections = function (connections, cb) {
  // cayley can delete in batches!
  if (connections.length === 0) { return cb(); }
  this.cayleyClient.delete(connections, cb);
};
