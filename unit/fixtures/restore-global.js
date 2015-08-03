var cachedGlobals = {
  setTimeout: setTimeout,
  setInterval: setInterval,
  clearTimeout: clearTimeout,
  clearInterval: clearInterval
};

module.exports = function restoreGlobal (name) {
  global[name] = cachedGlobals[name];
};