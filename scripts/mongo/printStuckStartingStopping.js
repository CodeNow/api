
var console = { log: print };
var $startingOrStopping = {
  $or: [
    {
      'container.inspect.State.Starting': true
    },
    {
      'container.inspect.State.Stopping': true
    }
  ]
};
console.log(new ISODate());
db.instances
  .find($startingOrStopping)
  .forEach(function (instance) {
    console.log(instance._id.toString());
  });
