var Lab = require('lab');
var lab = exports.lab = Lab.script();
var describe = lab.describe;
var expect = require('code').expect;
var it = lab.it;
var before = lab.before;
var after = lab.after;
var beforeEach = lab.beforeEach;
var afterEach = lab.afterEach;

var Dockerode = require('dockerode');
var through = require('through');
var createFrame = require('docker-frame');
var createCount = require('callback-count');
var defaults = require('101/defaults');
var isFunction = require('101/is-function');
var mongoose = require('mongoose');
var ObjectId = mongoose.Types.ObjectId;
var uuid = require('uuid');
var rabbitMQ = require('models/rabbitmq');
var sinon = require('sinon');
var Docker = require('models/apis/docker');
var dock = require('../../functional/fixtures/dock');
var mongooseControl = require('models/mongo/mongoose-control.js');
var Build = require('models/mongo/build.js');
var ContextVersion = require('models/mongo/context-version.js');
var Instance = require('models/mongo/instance.js');
var User = require('models/mongo/user.js');
var messenger = require('socket/messenger');
var Sauron = require('models/apis/sauron.js');

var OnImageBuilderContainerDie = require('workers/on-image-builder-container-die.js');

describe('OnImageBuilderContainerDie Integration Tests', function () {
  before(mongooseControl.start);
  var ctx = {};
  beforeEach(function (done) {
    ctx = {};
    done();
  });

  before(dock.start.bind(ctx));
  after(dock.stop.bind(ctx));
  after(function (done) {
    var count = createCount(4, done);
    ContextVersion.remove({}, count.next);
    Instance.remove({}, count.next);
    Build.remove({}, count.next);
    User.remove({}, count.next);
  });
  afterEach(function (done) {
    var count = createCount(4, done);
    ContextVersion.remove({}, count.next);
    Instance.remove({}, count.next);
    Build.remove({}, count.next);
    User.remove({}, count.next);
  });
  after(mongooseControl.stop);

  describe('Running the Worker', function () {
    describe('deploying a manual build', function () {
      beforeEach(function (done) {
        sinon.stub(rabbitMQ, 'deployInstance');

        sinon.stub(messenger, '_emitInstanceUpdateAction');
        sinon.stub(messenger, 'emitContextVersionUpdate');
        done();
      });
      afterEach(function (done) {
        rabbitMQ.deployInstance.restore();
        messenger._emitInstanceUpdateAction.restore();
        messenger.emitContextVersionUpdate.restore();
        done();
      });
      beforeEach(function (done) {
        ctx.githubId = 10;
        createUser(ctx.githubId, function (err, user) {
          if (err) { return done(err); }
          ctx.user = user;
          ctx.hash = uuid();
          createStartedCv(ctx.githubId, { build: { manual: true }}, function (err, cv) {
            if (err) { return done(err); }
            ctx.cv = cv;
            createBuild(ctx.githubId, cv, function (err, build) {
              if (err) { return done(err); }
              ctx.build = build;
              createInstance(ctx.githubId, ctx.build, false, ctx.cv, function (err, instance) {
                ctx.instance = instance;
                done();
              });
            });
          });
        });
      });

      beforeEach(function (done) {
        sinon.stub(User.prototype, 'findGithubUserByGithubId').yieldsAsync(null, ctx.user);
        sinon.spy(OnImageBuilderContainerDie.prototype, '_baseWorkerValidateDieData');
        sinon.spy(OnImageBuilderContainerDie.prototype, '_baseWorkerFindContextVersion');
        sinon.spy(OnImageBuilderContainerDie.prototype, '_getBuildInfo');
        sinon.spy(OnImageBuilderContainerDie.prototype, '_findBuildAndEmitUpdate');
        sinon.spy(Docker.prototype, 'getBuildInfo');
        sinon.spy(Build.prototype, 'modifyCompleted');
        sinon.spy(User, 'findByGithubId');

        sinon.spy(OnImageBuilderContainerDie.prototype, '_baseWorkerUpdateInstanceFrontend');
        sinon.spy(OnImageBuilderContainerDie.prototype, '_deallocImageBuilderNetwork');

        sinon.stub(Sauron.prototype, 'deleteHost', function (net, host, cb) {
          cb();
        });
        done();
      });
      afterEach(function (done) {
        User.prototype.findGithubUserByGithubId.restore();
        OnImageBuilderContainerDie.prototype._baseWorkerValidateDieData.restore();
        OnImageBuilderContainerDie.prototype._baseWorkerFindContextVersion.restore();
        OnImageBuilderContainerDie.prototype._getBuildInfo.restore();
        OnImageBuilderContainerDie.prototype._findBuildAndEmitUpdate.restore();
        Docker.prototype.getBuildInfo.restore();
        Build.prototype.modifyCompleted.restore();
        User.findByGithubId.restore();

        OnImageBuilderContainerDie.prototype._baseWorkerUpdateInstanceFrontend.restore();
        OnImageBuilderContainerDie.prototype._deallocImageBuilderNetwork.restore();

        Sauron.prototype.deleteHost.restore();
        done();
      });
      describe('With a successful build', function () {
        afterEach(function (done) {
          Dockerode.prototype.getContainer.restore();
          done();
        });
        it('should attempt to deploy', function (done) {

          var worker = new OnImageBuilderContainerDie(imageBuilderDieTemplate(ctx.cv, ctx.user));

          var dockerStub = {
            start: sinon.stub().yieldsAsync(),
            remove: sinon.stub().yieldsAsync(),
            logs: function () {}
          };
          var successString = JSON.stringify({
            type: 'log',
            content: 'Successfully built d776bdb409ab783cea9b986170a2a496684c9a99a6f9c0480521e743'
          });
          ctx.mockReadWriteStream = through(function (data) {
            this.emit('data', data);
          }, function () {
            this.emit('end');
          }, {
            autoDestroy: true
          });
          sinon.stub(dockerStub, 'logs', function (opts, cb) {
            cb(null, ctx.mockReadWriteStream);
            ctx.mockReadWriteStream.write(createFrame(1, successString));
            ctx.mockReadWriteStream.end();
          });
          sinon.stub(Dockerode.prototype, 'getContainer').returns(dockerStub);


          worker.handle(function (err) {
            try {
              expect(err).to.be.undefined();
              expect(rabbitMQ.deployInstance.callCount, 'deployInstance')
                .to.equal(1);
              expect(messenger._emitInstanceUpdateAction.callCount, '_emitInstanceUpdateAction')
                .to.equal(1);

              checkEmittedInstance(messenger._emitInstanceUpdateAction.args[0][0], false);
              expect(
                OnImageBuilderContainerDie.prototype._baseWorkerValidateDieData.callCount,
                '_baseWorkerValidateDieData'
              ).to.equal(1);
              expect(
                OnImageBuilderContainerDie.prototype._baseWorkerFindContextVersion.callCount,
                '_baseWorkerFindContextVersion'
              ).to.equal(1);
              expect(OnImageBuilderContainerDie.prototype._getBuildInfo.callCount, '_getBuildInfo')
                .to.equal(1);
              expect(Docker.prototype.getBuildInfo.callCount, 'Docker.getBuildInfo')
                .to.equal(1);
              expect(Docker.prototype.getBuildInfo.args[0][0], 'Docker.getBuildInfo')
                .to.equal(ctx.cv.build.dockerContainer);
              expect(
                OnImageBuilderContainerDie.prototype._findBuildAndEmitUpdate.callCount,
                '_findBuildAndEmitUpdate'
              ).to.equal(1);
              expect(
                Build.prototype.modifyCompleted.callCount,
                'Build.modifyCompleted'
              ).to.equal(1);

              expect(Build.prototype.modifyCompleted.args[0][0], 'Build.modifyCompleted')
                .to.equal(false);

              expect(User.findByGithubId.callCount, 'User.findByGithubId').to.equal(1);
              expect(OnImageBuilderContainerDie.prototype._baseWorkerUpdateInstanceFrontend.callCount,
                '_baseWorkerUpdateInstanceFrontend'
              ).to.equal(1);
              expect(OnImageBuilderContainerDie.prototype._baseWorkerUpdateInstanceFrontend.args[0][0],
                '_baseWorkerUpdateInstanceFrontend'
              ).to.deep.equal({'contextVersion._id': ctx.cv._id});
              expect(OnImageBuilderContainerDie.prototype._baseWorkerUpdateInstanceFrontend.args[0][1],
                '_baseWorkerUpdateInstanceFrontend'
              ).to.deep.equal(ctx.githubId);
              expect(OnImageBuilderContainerDie.prototype._baseWorkerUpdateInstanceFrontend.args[0][2],
                '_baseWorkerUpdateInstanceFrontend'
              ).to.deep.equal('patch');
              expect(OnImageBuilderContainerDie.prototype._deallocImageBuilderNetwork.callCount,
                '_deallocImageBuilderNetwork'
              ).to.equal(1);
            } catch(e) {
              return done(e);
            }
            done();
          });
        });
      });
      describe('With an unsuccessful build', function () {
        afterEach(function (done) {
          Dockerode.prototype.getContainer.restore();
          done();
        });
        it('should attempt to deploy', function (done) {

          var worker = new OnImageBuilderContainerDie(imageBuilderDieTemplate(ctx.cv, ctx.user));

          var dockerStub = {
            start: sinon.stub().yieldsAsync(),
            remove: sinon.stub().yieldsAsync(),
            logs: function () {}
          };
          var successString = JSON.stringify({
            type: 'log',
            content: 'Nopesies'
          });
          ctx.mockReadWriteStream = through(function (data) {
            this.emit('data', data);
          }, function () {
            this.emit('end');
          }, {
            autoDestroy: true
          });
          sinon.stub(dockerStub, 'logs', function (opts, cb) {
            cb(null, ctx.mockReadWriteStream);
            ctx.mockReadWriteStream.write(createFrame(1, successString));
            ctx.mockReadWriteStream.end();
          });
          sinon.stub(Dockerode.prototype, 'getContainer').returns(dockerStub);

          worker.handle(function (err) {
            try {
              expect(err).to.be.undefined();
              expect(rabbitMQ.deployInstance.callCount, 'deployInstance')
                .to.equal(0);
              expect(messenger._emitInstanceUpdateAction.callCount, '_emitInstanceUpdateAction')
                .to.equal(1);
              checkEmittedInstance(messenger._emitInstanceUpdateAction.args[0][0], true);

              expect(
                OnImageBuilderContainerDie.prototype._baseWorkerValidateDieData.callCount,
                '_baseWorkerValidateDieData'
              ).to.equal(1);
              expect(
                OnImageBuilderContainerDie.prototype._baseWorkerFindContextVersion.callCount,
                '_baseWorkerFindContextVersion'
              ).to.equal(1);
              expect(OnImageBuilderContainerDie.prototype._getBuildInfo.callCount, '_getBuildInfo')
                .to.equal(1);
              expect(Docker.prototype.getBuildInfo.callCount, 'Docker.getBuildInfo')
                .to.equal(1);
              expect(Docker.prototype.getBuildInfo.args[0][0], 'Docker.getBuildInfo')
                .to.equal(ctx.cv.build.dockerContainer);
              expect(
                OnImageBuilderContainerDie.prototype._findBuildAndEmitUpdate.callCount,
                '_findBuildAndEmitUpdate'
              ).to.equal(1);
              expect(
                Build.prototype.modifyCompleted.callCount,
                'Build.modifyCompleted'
              ).to.equal(1);

              expect(Build.prototype.modifyCompleted.args[0][0], 'Build.modifyCompleted')
                .to.equal(true);

              expect(User.findByGithubId.callCount, 'User.findByGithubId').to.equal(1);
              expect(
                OnImageBuilderContainerDie.prototype._baseWorkerUpdateInstanceFrontend.callCount,
                '_baseWorkerUpdateInstanceFrontend'
              ).to.equal(1);
              expect(
                OnImageBuilderContainerDie.prototype._baseWorkerUpdateInstanceFrontend.args[0][0],
                '_baseWorkerUpdateInstanceFrontend'
              ).to.deep.equal({ 'contextVersion._id': ctx.cv._id});
              expect(
                OnImageBuilderContainerDie.prototype._baseWorkerUpdateInstanceFrontend.args[0][1],
                '_baseWorkerUpdateInstanceFrontend'
              ).to.deep.equal(ctx.githubId);
              expect(
                OnImageBuilderContainerDie.prototype._baseWorkerUpdateInstanceFrontend.args[0][2],
                '_baseWorkerUpdateInstanceFrontend'
              ).to.deep.equal('patch');
              expect(
                OnImageBuilderContainerDie.prototype._deallocImageBuilderNetwork.callCount,
                '_deallocImageBuilderNetwork'
              ).to.equal(1);
            } catch(e) {
              return done(e);
            }
            done();
          });
        });
      });
    });
  });

  function checkEmittedInstance(instance, expectedFail ) {
    expect(instance._id, 'emitted instance id').to.deep.equal(ctx.instance._id);
    expect(instance.build.completed, 'emitted instance.build.complete').to.exist();
    expect(instance.contextVersion.build.completed, 'emitted contextVersion.build.completed')
      .to.exist();
    expect(instance.build.failed, 'emitted instance.build.failed').to.equal(expectedFail);
    expect(instance.contextVersion.build.failed, 'emitted contextVersion.build.failed')
      .to.equal(expectedFail);
  }
  /* Utils */
  function createUser (id, cb) {
    User.create({
      email: 'hello@runnable.com',
      accounts: {
        github: {
          id: id,
          accessToken: uuid(),
          username: uuid(),
          emails: [
            'hello@runnable.com'
          ]
        }
      }
    }, cb);
  }
  function createInstance (ownerGithubId, build, locked, cv, cb) {
    var data = instanceTemplate(ownerGithubId, build, locked, cv);
    Instance.create(data, cb);
  }
  function createBuild (ownerGithubId, cv, cb) {
    var data = buildTemplate(ownerGithubId, cv);
    Build.create(data, cb);
  }
  function createStartedCv (ownerGithubId, props, cb) {
    if (isFunction(props)) {
      cb = props;
      props = null;
    }
    props = props || { build: {} };
    defaults(props.build, {
      hash: uuid(),
      started: new Date(),
      dockerContainer: '1234567890123456789012345678901234567890123456789012345678901234'
    });
    var data = cvTemplate(
      ownerGithubId,
      props.build.dockerContainer,
      props.build.manual,
      props.build.hash,
      props.build.started
    );
    ContextVersion.create(data, cb);
  }
  function cvTemplate (ownerGithubId, containerId, manual, hash, started) {
    started = started || new Date();
    var cv = {
      infraCodeVersion : new ObjectId(),
      createdBy : {
        github : ownerGithubId
      },
      context : new ObjectId(),
      owner : {
        github : ownerGithubId
      },
      build: {
        triggeredAction : {
          manual : manual
        },
        _id : new ObjectId(),
        triggeredBy : {
          github : ownerGithubId
        },
        started : started,
        hash : hash,
        dockerTag : 'registry.runnable.com/544628/123456789012345678901234:12345678902345678901234',
        containerId : containerId,
        dockerContainer : containerId,
        dockerImage : 'bbbd03498dab',
        network : {
          hostIp : '127.0.0.1',
          networkIp : '127.0.0.1'
        }
      },
      advanced : true,
      appCodeVersions : [],
      created : new Date(started - 60*1000),
      _v : 0,
      dockerHost : 'http://127.0.0.1:4242'
    };
    return cv;
  }
  function buildTemplate (ownerGithubId, cv) {
    var completed = new Date();
    var started = new Date(completed - 60*1000);
    return {
      buildNumber : 1,
      disabled: false,
      contexts: [cv.context],
      contextVersions: [cv._id],
      completed : completed,
      created : new Date(started - 60*1000),
      started: started,
      createdBy : {
        github : ownerGithubId
      },
      context : new ObjectId(),
      owner : {
        github : ownerGithubId
      }
    };
  }
  function instanceTemplate (ownerGithubId, build, locked, cv) {
    var name = uuid();
    return {
      shortHash: uuid(),
      name: name,
      lowerName: name.toLowerCase(),
      owner: {
        github: ownerGithubId,
        username: 'sdfasdfasdf',
        gravatar: 'gravatar'
      },
      createdBy: {
        github: ownerGithubId,
        username: 'sdfasdfasdf',
        gravatar: 'gravatar'
      },
      parent: 'sdf',
      build: build._id,
      contextVersion: cv,
      locked: locked,
      created: new Date(),
      env: [],
      network: {
        networkIp: '127.0.0.1',
        hostIp: '127.0.0.1'
      }
    };
  }
  function imageBuilderDieTemplate (contextVersion, user) {
    return {
      'status': 'die',
      'id': contextVersion.build.dockerContainer ||
          '1234567890123456789012345678901234567890123456789012345678901234',
      'from': 'runnable/image-builder:d1.6.2-v2.3.2',
      'time': 1439952757,
      'uuid': uuid(),
      'ip': '127.0.0.1',
      'numCpus': 2,
      'mem': 7843336192,
      'tags': '2335750,build',
      'host': 'http://127.0.0.1:4242',
      'inspectData': {
        'AppArmorProfile': '',
        'Args': [],
        'Config': {
          'AttachStderr': false,
          'AttachStdin': false,
          'AttachStdout': false,
          'Cmd': ['/source/dockerBuild.sh'],
          'CpuShares': 0,
          'Cpuset': '',
          'Domainname': '',
          'Entrypoint': null,
          'Env': [
            'RUNNABLE_AWS_ACCESS_KEY=AKIAIDC4WVMTCGV7KRVQ',
            'RUNNABLE_AWS_SECRET_KEY=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',
            'RUNNABLE_FILES_BUCKET=runnable.context.resources.production-beta',
            'RUNNABLE_PREFIX=55d2d0e93e1b620e00eb61bd/source/'
          ],
          'ExposedPorts': null,
          'Hostname': 'c2e4530647da',
          'Image': 'runnable/image-builder:d1.6.2-v2.3.2',
          'Labels': {
            'contextVersion._v': '0',
            'contextVersion._id._bsontype': 'ObjectID',
            'contextVersion._id.id': 'U??s>\u001bb\u000e\u0000?b?',
            'contextVersion.advanced': 'true',
            'contextVersion.appCodeVersions[0]._id._bsontype': 'ObjectID',
            'contextVersion.appCodeVersions[0]._id.id': 'U???>\u001bb\u000e\u0000?a?',
            'contextVersion.appCodeVersions[0].branch': 'queue',
            'contextVersion.appCodeVersions[0].commit': 'c1650832f3ca5a54cc7763bca91b4c83b739c648',
            'contextVersion.appCodeVersions[0].defaultBranch': 'master',
            'contextVersion.appCodeVersions[0].lowerBranch': 'queue',
            'contextVersion.appCodeVersions[0].lowerRepo': 'codenow/shiva',
            'contextVersion.appCodeVersions[0].privateKey': 'CodeNow/shiva.key',
            'contextVersion.appCodeVersions[0].publicKey': 'CodeNow/shiva.key.pub',
            'contextVersion.appCodeVersions[0].repo': 'CodeNow/shiva',
            'contextVersion.build._id._bsontype': 'ObjectID',
            'contextVersion.build._id.id': 'U??s>\u001bb\u000e\u0000?b?',
            'contextVersion.build.dockerContainerName._bsontype': 'ObjectID',
            'contextVersion.build.dockerContainerName.id': 'U??s>\u001bb\u000e\u0000?b?',
            'contextVersion.build.duration': 'undefined',
            'contextVersion.build.hash': 'b054d62cc793290867abddeb73586987',
            'contextVersion.build.triggeredAction.appCodeVersion.commit':
                'c1650832f3ca5a54cc7763bca91b4c83b739c648',
            'contextVersion.build.triggeredAction.appCodeVersion.repo': 'CodeNow/shiva',
            'contextVersion.build.triggeredAction.manual': 'false',
            'contextVersion.build.triggeredBy.github': '146592',
            'contextVersion.containerId': '55d3ef733e1b620e00eb6291',
            'contextVersion.context._bsontype': 'ObjectID',
            'contextVersion.context.id': 'U???>\u001bb\u000e\u0000?a?',
            'contextVersion.createdBy.github': '146592',
            'contextVersion.dockerHost': 'http://127.0.0.1:4242',
            'contextVersion.id': contextVersion._id,
            'contextVersion.infraCodeVersion._v': '0',
            'contextVersion.infraCodeVersion._id._bsontype': 'ObjectID',
            'contextVersion.infraCodeVersion._id.id': 'U?????;\u0015\u0000I??',
            'contextVersion.infraCodeVersion.context._bsontype': 'ObjectID',
            'contextVersion.infraCodeVersion.context.id': 'U???>\u001bb\u000e\u0000?a?',
            'contextVersion.infraCodeVersion.edited': 'true',
            'contextVersion.infraCodeVersion.parent._bsontype': 'ObjectID',
            'contextVersion.infraCodeVersion.parent.id': 'U????U?\u001d\u0000 g?',
            'contextVersion.owner.github': '2335750',
            'dockerTag':
                'registry.runnable.com/146592/55d2d0e93e1b620e00eb61bd:55d3ef733e1b620e00eb6292',
            'hostIp': '10.255.244.68',
            'manualBuild': 'false',
            'networkIp': '10.255.244.0',
            'noCache': 'body.noCache',
            'sauronHost': '127.0.0.1:3200',
            'sessionUserDisplayName': 'Ryan Sandor Richards',
            'sessionUserId': user.accounts.github.id,
            'sessionUserUsername': user.accounts.github.username,
            'tid': 'e5e14545-0d40-45bb-90fd-0128cbc6fbaa',
            'type': 'image-builder-container'
          },
          'MacAddress': '',
          'Memory': 1000000000,
          'MemorySwap': -1,
          'NetworkDisabled': false,
          'OnBuild': null,
          'OpenStdin': false,
          'PortSpecs': null,
          'StdinOnce': false,
          'Tty': false,
          'User': '',
          'Volumes': {'/cache': {}, '/layer-cache': {}},
          'WorkingDir': '/source'
        },
        'Created': '2015-08-19T02:52:33.553672014Z',
        'Driver': 'aufs',
        'ExecDriver': 'native-0.2',
        'ExecIDs': null,
        'HostConfig': {
          'Binds': [
            '/var/run/docker.sock:/var/run/docker.sock',
            '/git-cache:/cache:rw',
            '/layer-cache:/layer-cache:rw'
          ],
          'CapAdd': null,
          'CapDrop': null,
          'CgroupParent': '',
          'ContainerIDFile': '',
          'CpuShares': 0,
          'CpusetCpus': '',
          'Devices': null,
          'Dns': null,
          'DnsSearch': null,
          'ExtraHosts': null,
          'IpcMode': '',
          'Links': null,
          'LogConfig': {'Config': null, 'Type': 'json-file'},
          'LxcConf': null,
          'Memory': 0,
          'MemorySwap': 0,
          'NetworkMode': '',
          'PidMode': '',
          'PortBindings': null,
          'Privileged': false,
          'PublishAllPorts': false,
          'ReadonlyRootfs': false,
          'RestartPolicy': {'MaximumRetryCount': 0, 'Name': ''},
          'SecurityOpt': null,
          'Ulimits': null,
          'VolumesFrom': null
        },
        'HostnamePath': '/docker/containers/c2e4530647da729430dc2' +
            '52da581872356b3aad463b7214d13cd8e8dbc3c7a9f/hostname',
        'HostsPath': '/docker/containers/c2e4530647da729430dc252da581872356b' +
            '3aad463b7214d13cd8e8dbc3c7a9f/hosts',
        'Id': contextVersion.build.dockerContainer ||
            '1234567890123456789012345678901234567890123456789012345678901234',
        'Image': '45d2215ee80ddf33e1fbe8ef9d17da1fbf52083700a7bc0b9582dc43f816348a',
        'LogPath': '/docker/containers/c2e4530647da729430dc252da58187235' +
            '6b3aad463aad463b7214d13cd8e8dbc3c7a9f-json.log',
        'MountLabel': '',
        'Name': '/55d3ef733e1b620e00eb6291',
        'NetworkSettings': {
          'Bridge': '',
          'Gateway': '',
          'GlobalIPv6Address': '',
          'GlobalIPv6PrefixLen': 0,
          'IPAddress': '',
          'IPPrefixLen': 0,
          'IPv6Gateway': '',
          'LinkLocalIPv6Address': '',
          'LinkLocalIPv6PrefixLen': 0,
          'MacAddress': '',
          'PortMapping': null,
          'Ports': null
        },
        'Path': '/source/dockerBuild.sh',
        'ProcessLabel': '',
        'ResolvConfPath': '/docker/containers/c2e4530647da729430dca9f/resolv.conf',
        'RestartCount': 0,
        'State': {
          'Dead': false,
          'Error': '',
          'ExitCode': 0,
          'FinishedAt': '2015-08-19T02:52:37.424373486Z',
          'OOMKilled': false,
          'Paused': false,
          'Pid': 0,
          'Restarting': false,
          'Running': false,
          'StartedAt': '2015-08-19T02:52:33.80923025Z'
        },
        'Volumes': {
          '/cache': '/git-cache',
          '/layer-cache': '/layer-cache',
          '/var/run/docker.sock': '/run/docker.sock'
        },
        'VolumesRW': {'/cache': true, '/layer-cache': true, '/var/run/docker.sock': true}
      }
    };
  }
});
