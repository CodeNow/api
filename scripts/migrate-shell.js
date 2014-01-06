var db = db || {};
var ObjectId = ObjectId || {};
var id;
//migrate channels alias to aliases
var aliasUpdate = {};
db.channels.find().forEach(function (channel) {
  if (!channel.alias) {
    print('alias already migrated '+channel._id);
    return;
  }
  aliasUpdate[channel._id.valueOf()] = {
    $set: {aliases:channel.alias},
    $unset: {alias:''}
  };
});
for(id in aliasUpdate) {
  var update = aliasUpdate[id];
  db.channels.update({_id:new ObjectId(id)}, update);
}

function createCategory(name) {
  var lower = name.toLowerCase();
  var category = {
    _id: new ObjectId(),
    name: name,
    aliases: [lower]
  };
  db.categories.insert(category);
  return category;
}

//create categories from channels
var channelUpdates = {};
db.channels.find().forEach(function (channel) {
  var categories = channel.category;
  if (categories) {
    var newTags = [];
    categories.forEach(function (cat) {
      var lower = cat.name.toLowerCase();
      var existing = db.categories.findOne({aliases:lower});
      var category = existing || createCategory(cat.name);
      newTags.push({
        _id: new ObjectId(),
        category:category._id
      });
    });
    channelUpdates[channel._id.valueOf()] = {$set:{tags:newTags}, $unset:{category:''}};
  }
});


function createChannel(name) {
  var lower = name.toLowerCase();
  var channel = {
    _id: new ObjectId(),
    name: name,
    aliases: [lower]
  };
  db.channels.insert(channel);
  return channel;
}

//create non existing channels, update tags in images
var imageUpdates = {};
db.images.find().forEach(function (image) {
  var tags = image.tags;
  if (tags) {
    var newTags= [];
    tags.forEach(function (tag) {
      if (!tag.name) {
        print('already migrated image '+image._id);
        return;
      }
      var lower = tag.name.toLowerCase();
      var existing = db.channels.findOne({aliases:lower});
      var channel = existing || createChannel(tag.name);
      newTags.push({
        _id: new ObjectId(),
        channel:channel._id
      });
    });
    imageUpdates[image._id.valueOf()] = {$set:{tags:newTags}};
  }
});

//create non existing channels, update tags in containers
var containerUpdates = {};
db.containers.find().forEach(function (container) {
  var tags = container.tags;
  if (tags) {
    var newTags= [];
    tags.forEach(function (tag) {
      if (!tag.name) {
        print('already migrated container '+image._id);
        return;
      }
      var lower = tag.name.toLowerCase();
      var existing = db.channels.findOne({aliases:lower});
      var channel = existing || createChannel(tag.name);
      newTags.push({
        _id: new ObjectId(),
        channel:channel._id
      });
    });
    containerUpdates[container._id.valueOf()] = {$set:{tags:newTags}};
  }
});

// push updates
for(id in channelUpdates) {
  var update = channelUpdates[id];
  db.channels.update({_id:new ObjectId(id)}, update);
}
for(id in imageUpdates) {
  var update = imageUpdates[id];
  db.images.update({_id:new ObjectId(id)}, update);
}
for(id in containerUpdates) {
  var update = containerUpdates[id];
  db.containers.update({_id:new ObjectId(id)}, update);
}