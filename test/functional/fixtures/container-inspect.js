/**
 * @module test/functional/fixtures/container-inspect
 */
'use strict';
var dockerHost = require('./docker-host');

/**
 * Generate an example set of meta data for job created
 * from docker-listener. Instance is required for container
 * labels.
 * @param  {Object} instance instance object
 * @return {Object} inspect object
 */
module.exports.getContainerInspect = function (instance) {
  return {
    status: 'create',
    time: 1430350280081,
    id: 'ab3e77401fd9d32869714235e3b4041f323437206b65da225a8605fc75ccb713',
    from: 'ubuntu:latest',
    uuid: 'd6fdd720-eec7-11e4-bf14-0d517431e40f',
    ip: '10.1.10.40',
    numCpus: 8,
    mem: 8589934592,
    tags: 'some,comma,tags',
    host: dockerHost, // 'http://10.1.10.40:4243',
    inspectData: {
      Id: 'ab3e77401fd9d32869714235e3b4041f323437206b65da225a8605fc75ccb713',
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
      Env: [
        'RUNNABLE_AWS_ACCESS_KEY=FAKE_AWS_ACCESS_KEY_ID',
        'RUNNABLE_AWS_SECRET_KEY=FAKE_AWS_SECRET_ACCESS_KEY',
        'RUNNABLE_FILES_BUCKET=runnable.context.resources.test',
        'RUNNABLE_PREFIX=554169c7dd3f3d21e1fb380e/source/',
        'RUNNABLE_DOCKER=unix:///var/run/docker.sock',
        'RUNNABLE_DOCKERTAG=registry.runnable.com/2/554169c7dd3f3d21e1fb380e:554169c7dd3f3d21e1fb3811',
        'RUNNABLE_IMAGE_BUILDER_NAME=runnable/image-builder',
        'RUNNABLE_IMAGE_BUILDER_TAG=d1.4.1-v2.2.2',
        'RUNNABLE_REPO=git@github.com:7d2f922a-a511-4fbc-bafa-02331b3edb6a/flaming-octo-nemesis',
        'RUNNABLE_COMMITISH=065470f6949b0b6f0f0f78f4ee2b0e7a3dc715ac',
        'RUNNABLE_KEYS_BUCKET=runnable.deploykeys.test',
        'RUNNABLE_DEPLOYKEY=7d2f922a-a511-4fbc-bafa-02331b3edb6a/flaming-octo-nemesis.key',
        'DOCKER_IMAGE_BUILDER_CACHE=/git-cache',
        'RUNNABLE_CIDR=22',
        'RUNNABLE_WEAVE_PATH=/usr/local/bin/weave',
        'RUNNABLE_WAIT_FOR_WEAVE=until grep -q ethwe /proc/net/dev; do sleep 1; done;',
        'RUNNABLE_HOST_IP=10.255.120.1',
        'RUNNABLE_BUILD_FLAGS={"Memory":1000000000}'
      ],
      Cmd: [
        '/source/dockerBuild.sh'
      ],
      Config: {
        Labels: {
          contextVersionId: instance.json().contextVersion.id,
          instanceId: instance.attrs._id,
          instanceShortHash: instance.attrs.shortHash,
          ownerUsername: 'cflynn07',
          type: 'user-container',
          userGithubId: instance.json().owner.github
        }
      },
      Dns: null,
      Image: 'runnable/image-builder:d1.4.1-v2.2.2',
      Volumes: {
        '/cache': '/git-cache',
        '/layer-cache': '/layer-cache',
        '/usr/local/bin/weave': '/usr/local/bin/weave',
        '/var/run/docker.sock': '/run/docker.sock'
      },
      VolumesRW: {
        '/cache': true,
        '/layer-cache': true,
        '/usr/local/bin/weave': false,
        '/var/run/docker.sock': true
      },
      VolumesFrom: '',
      WorkingDir: '',
      ExposedPorts: {},
      State: { Running: false, Pid: -1 },
      NetworkSettings: {
        Bridge: '',
        Gateway: '',
        GlobalIPv6Address: '',
        GlobalIPv6PrefixLen: 0,
        IPAddress: '',
        IPPrefixLen: 0,
        IPv6Gateway: '',
        LinkLocalIPv6Address: '',
        LinkLocalIPv6PrefixLen: 0,
        MacAddress: '',
        PortMapping: null,
        Ports: null
      },
      name: '554169c7dd3f3d21e1fb3810',
      Binds: [
        '/var/run/docker.sock:/var/run/docker.sock',
        '/git-cache:/cache:rw',
        '/layer-cache:/layer-cache:rw'
      ]
    }
  };
};
