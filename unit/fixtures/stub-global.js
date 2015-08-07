var sinon = require('sinon');

var cachedGlobals = {
  setTimeout: setTimeout,
  setInterval: setInterval,
  clearTimeout: clearTimeout,
  clearInterval: clearInterval
};

module.exports = function stubGlobal (name) {
  if (global[name] !== cachedGlobals[name]) {
    throw new Error(name+' already stubbed');
  }
  var stub = global[name] = sinon.stub();
  return stub;
};
