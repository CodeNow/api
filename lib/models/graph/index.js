'use strict';

module.exports = GraphInterface;

function GraphInterface () {}

GraphInterface.prototype.getNodes = function (start, steps, cb) {
  cb(new Error('getNodes not implemented'));
};

// GraphInterface.prototype.writeNodes = function (nodes, cb) {
//   cb(new Error('writeNodes not implemented'));
// };

// GraphInterface.prototype.deleteNodes = function (nodes, cb) {
//   cb(new Error('deleteNodes not implemented'));
// };

GraphInterface.prototype.writeConnections = function (connections, cb) {
  cb(new Error('writeConnections not implemented'));
};
