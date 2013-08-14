async = require 'async'
mongodb = require 'mongodb'

# iterate through existing channels and look at array of category strings
# create categories inside new collection based on the labels we find
# update the existing channels record to point to the new category document

# iterate through each container and image, and look at the tags array
# check if a channel exists for that tag already (look in aliases?)
# if yes, then overwrite tag name with the objectId pointers they exist to
# if no, then create the channel on the spot and

db = mongodb.Db
console.log 'connecting to server'
db.connect 'mongodb://127.0.0.1:27017/runnable', (err, runnable_db) ->
  if err then console.log err else
    console.log 'connected to server'
    async.series [
      (cb) ->
        runnable_db.collection 'channels', (err, channels_collection) ->
          if err then console.log err else
            runnable_db.collection 'categories', (err, categories_collection) ->
              if err then console.log err else
                channels_collection.find().toArray (err, channels) ->
                  if err then console.log err else
                    async.forEachSeries channels, (channel, cb) ->
                      channel.category = channel.category or [ ]
                      tags = [ ]
                      async.forEachSeries channel.category, (category, cb) ->
                        categories_collection.findOne alias: category.name.toLowerCase(), (err, existing) ->
                          if err then console.log err else
                            if not existing
                              categories_collection.insert category, (err, new_category) ->
                                if err then cb err else
                                  tags.push
                                    _id: new mongodb.ObjectID
                                    category: new_category[0]._id
                                  cb()
                            else
                              tags.push
                                _id: new mongodb.ObjectID
                                category: existing._id
                              cb()
                      , (err) ->
                        if err then console.log err else
                          channels_collection.update { _id: channel._id }, { $set: { tags: tags }, $unset: { category: '' } }, (err) ->
                            if err then console.log err else
                              cb()
                    , (err) ->
                      if err then console.log err else
                        cb()
      (cb) ->
        runnable_db.collection 'images', (err, images_collection) ->
          if err then console.log err else
            runnable_db.collection 'channels', (err, channels_collection) ->
              if err then console.log err else
                images_collection.find({}, { files: 0} ).toArray (err, images) ->
                  if err then console.log err else
                    async.forEachSeries images, (image, cb) ->
                      images.tags = image.tags or [ ]
                      tags = [ ]
                      async.forEachSeries image.tags, (tag, cb) ->
                        channels_collection.findOne alias: tag.name.toLowerCase(), (err, existing) ->
                          if err then console.log err else
                            if not existing
                              channels_collection.insert { name: tag.name, alias: [ tag.name.toLowerCase() ] }, (err, new_channel) ->
                                if err then cb err else
                                  tags.push
                                    _id: new mongodb.ObjectID
                                    channel: new_channel[0]._id
                                  cb()
                            else
                              tags.push
                                _id: new mongodb.ObjectID
                                channel: existing._id
                              cb()
                      , (err) ->
                        if err then console.log err else
                          images_collection.update { _id: image._id }, { $set: { tags: tags } }, (err) ->
                            if err then console.log err else
                              cb()
                    , (err) ->
                      if err then console.log err else
                        cb()
      (cb) ->
        runnable_db.collection 'containers', (err, containers_collection) ->
          if err then console.log err else
            runnable_db.collection 'channels', (err, channels_collection) ->
              if err then console.log err else
                containers_collection.find({}, { files: 0 } ).toArray (err, containers) ->
                  if err then console.log err else
                    async.forEachSeries containers, (container, cb) ->
                      container.tags = container.tags or [ ]
                      tags = [ ]
                      async.forEachSeries container.tags, (tag, cb) ->
                        channels_collection.findOne alias: tag.name.toLowerCase(), (err, existing) ->
                          if err then console.log err else
                            if not existing
                              channels_collection.insert { name: tag.name, alias: [ tag.name.toLowerCase() ] }, (err, new_channel) ->
                                if err then cb err else
                                  tags.push
                                    _id: new mongodb.ObjectID
                                    channel: new_channel[0]._id
                                  cb()
                            else
                              tags.push
                                _id: new mongodb.ObjectID
                                channel: existing._id
                              cb()
                      , (err) ->
                        if err then console.log err else
                          containers_collection.update { _id: container._id }, { $set: { tags: tags } }, (err) ->
                            if err then console.log err else
                              cb()
                    , (err) ->
                      if err then console.log err else
                        cb()
      (cb) ->
        runnable_db.collection 'channels', (err, channels_collection) ->
          if err then console.log err else
            channels_collection.find().toArray (err, channels) ->
              if err then console.log err else
                async.forEachSeries channels, (channel, cb) ->
                  channels_collection.update { _id: channel._id }, { $set: { aliases: channel.alias }, $unset: { alias: '' } }, (err) ->
                    if err then console.log err else
                      cb()
                , (err) ->
                  if err then console.log err else
                    cb()
      (cb) ->
        runnable_db.collection 'categories', (err, categories_collection) ->
          if err then console.log err else
            categories_collection.find().toArray (err, categories) ->
              if err then console.log err else
                async.forEachSeries categories, (category, cb) ->
                  console.log category
                  categories_collection.update { _id: category._id }, { $set: { aliases: category.alias }, $unset: { alias: '' } }, (err) ->
                    if err then console.log err else
                      cb()
                , (err) ->
                  if err then console.log err else
                    cb()
    ], (err) ->
      if err then console.log err else
        console.log 'DONNNNNE'
