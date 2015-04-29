/**
 * Tests for POST /workers/container-create
 * - Internal route
 * @module test/workers/container-create/post/201
 */
'use strict';

var Code = require('code');
var Lab = require('lab');
var createCount = require('callback-count');
var sinon = require('sinon');

//var Runnable = require('models/apis/runnable');
var api = require('../../../fixtures/api-control');
var dock = require('../../../fixtures/dock');
var expects = require('../../../fixtures/expects');
var multi = require('../../../fixtures/multi-factory');
var primus = require('../../../fixtures/primus');

var lab = exports.lab = Lab.script();

var after = lab.after;
var afterEach = lab.afterEach;
var before = lab.before;
var beforeEach = lab.beforeEach;
var describe = lab.describe;
var expect = Code.expect;
var it = lab.it;

//var runnable = new Runnable({}, {});

var ctx = {};
describe('201 POST /workers/container-create', function () {

  before(function (done) {
    // will prevent docker-listener from publishing a container-create job
    // when recieves a container-created docker event
    process.env.DISABLE_HERMES_PUBLISH = true;
    done();
  });

  // before
  before(api.start.bind(ctx));
  before(dock.start.bind(ctx));
  //before(require('../../../fixtures/mocks/api-client').setup);
  beforeEach(primus.connect);
  // after
  afterEach(primus.disconnect);
  after(api.stop.bind(ctx));
  after(dock.stop.bind(ctx));
  //after(require('../../../fixtures/mocks/api-client').clean);
  afterEach(require('../../../fixtures/clean-mongo').removeEverything);

  beforeEach(function (done) {
    // need instance

    // process.env.DISABLE_HERMES_PUBLISH: docker-listener wont publish job, worker wont run
    multi.createInstance(function (instance) {
      // poll for worker to complete update
      ctx.instance = instance;
      done();
    });

    // fake container info
    // dockerode method spies for assertion

    /* TJ comments */
    // create an instance ^^ you have that taken care of.
    //   BUT the multifactory methods may not be reliable anymore
    //   as they expect the POST/PATCH instance w/ {build:builtBuildId}
    //   to respond after the container has actually been created.
    // for this test it may not matter though. lets try this:
    //   * use the instance above
    //   * create a container using the docker model (note if you provide labels
    //      to this container docker-listener may create the container-create job,
    //      and it may actually reach the api-server and call this route for you).
    //   * if you want to call the route manually just create a container without labels
    //      use that information to create an accurate 'body' to post to this route and
    //      add the labels to the body (so it the route can use them to query the instance)
    //   * finally, assert properties the response body
    //
    // Casey Notes / Ideas
    //   - Race condition in the test following the above proposal that wouldn't occur normally
    //     - POST instances/ - creates container, docker-listener creates job to modify instance
    //       - (1) job calls worker route (updates instance /w container)
    //     - (2) Test calls worker route (updates instance w/ container)
    //     - Order could occur as 2, then 1
    //  Possible race fix, wait for worker to recieve job & update instance, then have test call worker route
    //  Alternatively, we can disable docker-listener for these tests
    //
    //  ^ All of that sucks. Lets just spy on the runnable model methods and assert they were invoked correctly
    //
    //  Or we deregister (stop consuming) container-create jobs.
    //  Job remains in queue, effectively ignored
    //  We invoke worker route with simulated body, verify correct
  });

  it('should upate instance with container information', function (done) {
    return done();
    var body = {
      status: 'create',
      time: 1430350280081,
      id: 'ab3e77401fd9d32869714235e3b4041f323437206b65da225a8605fc75ccb713',
      from: 'ubuntu:latest',
      uuid: 'd6fdd720-eec7-11e4-bf14-0d517431e40f',
      ip: '10.1.10.40',
      numCpus: 8,
      mem: 8589934592,
      tags: 'some,comma,tags',
      host: 'http://10.1.10.40:4243',
      inspectData:
       { Id: 'ab3e77401fd9d32869714235e3b4041f323437206b65da225a8605fc75ccb713',
         Hostname: '',
         User: '',
         Memory: 1000000000,
         MemorySwap: 0,
         AttachStdin: false,
         AttachStdout: true,
         AttachStderr: true,
         PortSpecs: null,
         Tty: false,
         OpenStdin: false,
         StdinOnce: false,
         Env:
          [ 'RUNNABLE_AWS_ACCESS_KEY=FAKE_AWS_ACCESS_KEY_ID',
            'RUNNABLE_AWS_SECRET_KEY=FAKE_AWS_SECRET_ACCESS_KEY',
            'RUNNABLE_FILES_BUCKET=runnable.context.resources.test',
            'RUNNABLE_PREFIX=554169c7dd3f3d21e1fb380e/source/',
            'RUNNABLE_FILES={"554169c7dd3f3d21e1fb380e/source/":"af4c5848-2938-4dbc-ae21-8914749b37a0","554169c7dd3f3d21e1fb380e/source/Dockerfile":"db5a191f-3b59-4506-b0b2-32ef6872a595"}',
            'RUNNABLE_DOCKER=unix:///var/run/docker.sock',
            'RUNNABLE_DOCKERTAG=registry.runnable.com/2/554169c7dd3f3d21e1fb380e:554169c7dd3f3d21e1fb3811',
            'RUNNABLE_IMAGE_BUILDER_NAME=runnable/image-builder',
            'RUNNABLE_IMAGE_BUILDER_TAG=d1.4.1-v2.2.2',
            'RUNNABLE_REPO=git@github.com:7d2f922a-a511-4fbc-bafa-02331b3edb6a/flaming-octo-nemesis',
            'RUNNABLE_COMMITISH=065470f6949b0b6f0f0f78f4ee2b0e7a3dc715ac',
            'RUNNABLE_KEYS_BUCKET=runnable.deploykeys.test',
            'RUNNABLE_DEPLOYKEY=7d2f922a-a511-4fbc-bafa-02331b3edb6a/flaming-octo-nemesis.key',
            'DOCKER_IMAGE_BUILDER_CACHE=/git-cache',
            'RUNNABLE_NETWORK_DRIVER=sauron',
            'RUNNABLE_WAIT_FOR_WEAVE=until grep -q ethwe /proc/net/dev; do sleep 1; done;',
            'RUNNABLE_SAURON_HOST=10.1.10.40:3200',
            'RUNNABLE_NETWORK_IP=10.255.120.0',
            'RUNNABLE_HOST_IP=10.255.120.1',
            'RUNNABLE_BUILD_FLAGS={"Memory":1000000000}' ],
         Cmd: [],
         Dns: null,
         Image: 'runnable/image-builder:d1.4.1-v2.2.2',
         Volumes: { '/cache': {} },
         VolumesFrom: '',
         WorkingDir: '',
         ExposedPorts: {},
         State: { Running: false, Pid: -1 },
         NetworkSettings: {
           Bridge: '',
           Gateway: '',
           IPAddress: '',
           IPPrefixLen: 0,
           MacAddress: '',
           Ports: null
         },
         name: '554169c7dd3f3d21e1fb3810',
         Binds: [ '/git-cache:/cache:rw' ]
      }
    };

    runnable.workerContainerCreate({test: 'foo'}, function () {
      console.log(arguments);
      done();
    });
  });
/*
  it('should deploy/start the container', function (done) {
    done();
  });
*/
});
