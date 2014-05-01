var path = require('path');
var express = require('express');
var app = module.exports = express();
var me = require('middleware/me');
var images = require('middleware/images');
var implementations = require('middleware/implementations');
var specifications = require('middleware/specifications');
var channels = require('middleware/channels');
var containers = require('middleware/containers');
var harbourmaster = require('middleware/harbourmaster');
var dockworker = require('middleware/dockworker');
var query = require('middleware/query');
var body = require('middleware/body');
var params = require('middleware/params');
var utils = require('middleware/utils');

var ternary = utils.ternary;
var unless  = utils.unless;
var series  = utils.series;
var and     = utils.series;
var or = utils.or;

module.exports = function (baseUrl) {
  app.use(require('rest/containers/tags')(path.join(baseUrl, ':containerId', 'tags')));
  app.use(require('rest/containers/files')(path.join(baseUrl, ':containerId')));
  app.use(require('rest/containers/import')(path.join(baseUrl, 'import')));

  app.post(baseUrl,
    me.isUser,
    query.require('from'),
    ternary(query.isObjectId64('from'),
      series(
        query.decodeId('from'),
        images.findById('query.from')),
      series(
        channels.findByName('query.from'),
        channels.checkFound,
        images.fetchChannelImage('channel'))
    ),
    images.checkFound,
    containers.create({ owner: 'params.userId' }),
    containers.model.inheritFromImage('image'),
    harbourmaster.createContainer('image', 'container'),
    // if created from channel name and user is registered, mark as saved
    unless(query.isObjectId('from'),
      utils.if(me.isRegistered,
        containers.model.set('saved', true))),
    containers.model.save(),
    containers.model.unset('files'), // dont respond files
    containers.respond);

  app.get(baseUrl,
    or(me.isUser, me.isModerator),
    query.setFromParams('owner', 'userId'),
    query.pick('owner', 'saved'),
    containers.find('query', { files: 0 }),
    containers.respond);

  app.get(path.join(baseUrl, ':containerId'),
    or(me.isUser, me.isModerator),
    params.isObjectId64('containerId'),
    params.decodeId('containerId'),
    containers.findById('params.containerId', { files: 0 }),
    containers.checkFound,
    or(me.isOwnerOf('container'), me.isModerator),
    containers.respond);

// TODO: updateContainer needs rework, especially the commit interactions with harbourmaster..
  var updateContainer =
    series(
      params.isObjectId64('containerId'),
      params.decodeId('containerId'),
      or(me.isUser, me.isModerator),
      containers.findById('params.containerId', { files: 0 }),
      containers.checkFound,
      or(me.isOwnerOf('container'), me.isModerator),
      body.pickAndRequireOne('saved', 'name', 'description', 'specification',
        'start_cmd', 'build_cmd', 'output_format', 'status', 'commit_error',
        'service_cmds', 'last_write'),
      body.ifExists('last_write',
        body.set('last_write', Date.now.bind(Date))), // use a server based date
      utils.if(body.contains('status', 'Committing'),
        containers.publish),
      body.ifOneExists(['start_cmd', 'build_cmd'],
        body.ifExists('start_cmd', body.trim('start_cmd')),
        body.ifExists('build_cmd', body.trim('build_cmd')),
        dockworker.updateRunOptions('container', 'body')),
      body.ifExists('specification',
        body.isObjectId('specification'),
        specifications.findById('body.specification'),
        specifications.checkFound,
        implementations.updateEnvBySpecification(
          'params.userId', 'container._id', 'body.specification')),
      containers.model.set('body'),
      containers.model.update('body'), // not save bc we dont want to overwrite the entire doc
      containers.respond);

  app.put(path.join(baseUrl, ':containerId'),
    updateContainer);

  app.patch(path.join(baseUrl, ':containerId'),
    updateContainer);

  app.del(path.join(baseUrl, ':containerId'),
    params.isObjectId64('containerId'),
    params.decodeId('containerId'),
    or(me.isUser, me.isModerator),
    containers.findById('params.containerId', { _id: 1 , owner:1 }),
    containers.checkFound,
    or(me.isOwnerOf('container'), me.isModerator),
    containers.removeById('params.containerId'),
    utils.message('container deleted successfully'));

  var getContainerForStartStop = series(
    params.isObjectId64('containerId'),
    params.decodeId('containerId'),
    or(me.isUser, me.isModerator),
    containers.findById('params.containerId', {
      _id: 1 ,
      owner:1,
      containerId:1,
      host:1 ,
      webPort: 1,
      servicesPort: 1
    }),
    containers.checkFound,
    or(me.isOwnerOf('container'), me.isModerator)
  );

  app.put(path.join(baseUrl, ':containerId', 'start'),
    getContainerForStartStop,
    harbourmaster.startContainer('container'),
    containers.respond
  );

  app.put(path.join(baseUrl, ':containerId', 'stop'),
    getContainerForStartStop,
    harbourmaster.stopContainer('container'),
    utils.respond(204)
  );

  return app;
};
