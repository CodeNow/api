'use strict'

module.exports = function (contextVersion) {
  return {
    status: 'create',
    time: 1455917802310,
    id: '59a9e9ce232b5b08f198b5730ebd087e0ad1e36cf638e5076275f62ece7facd5',
    from: 'ubuntu:latest',
    uuid: 'ddcb1e60-d750-11e5-8018-09162f2b262c',
    ip: '192.168.1.20',
    numCpus: 8,
    mem: 17179869184,
    tags: 'default',
    host: 'http://192.168.1.20:4243',
    inspectData: {
      Id: '59a9e9ce232b5b08f198b5730ebd087e0ad1e36cf638e5076275f62ece7facd5',
      Memory: 0,
      MemorySwap: 0,
      Image: 'registry.runnable.com/runnable/image-builder:d1.6.2-v4.0.1',
      Config: {
        AttachStderr: true,
        AttachStdin: false,
        AttachStdout: true,
        Cmd: [],
        Env: [],
        ExposedPorts: {},
        Hostname: '',
        Image: null,
        Labels: {
          'contextVersion.infraCodeVersion.edited': contextVersion.infraCodeVersion.edited,
          'contextVersion.createdBy.github': contextVersion.createdBy.github,
          'contextVersion.owner.github': contextVersion.owner.github,
          'contextVersion.__v': contextVersion.__v,
          'contextVersion.dockerHost': contextVersion.dockerHost,
          'contextVersion.build.duration': contextVersion.build.duration,
          'contextVersion.advanced': contextVersion.advanced,
          'contextVersion.dockRemoved': contextVersion.dockRemoved,
          'contextVersion.id': contextVersion._id.toString(),
          'contextVersion.infraCodeVersion.context': contextVersion.context,
          'contextVersion.infraCodeVersion._id': contextVersion.infraCodeVersion.toString(),
          'contextVersion.context': contextVersion.context,
          'contextVersion._id': contextVersion._id.toString(),
          'contextVersion.build._id': contextVersion.build._id.toString(),
          dockerTag: 'registry.runnable.com/10/56c78aeac68adfe5135db912:56c78aeac68adfe5135db914',
          manualBuild: 'true',
          noCache: 'undefined',
          sessionUserDisplayName: 'undefined',
          sessionUserGithubId: '10',
          sessionUserUsername: '4c0df1c9-7881-4604-aac3-c8608c029a3e',
          ownerUsername: '4c0df1c9-7881-4604-aac3-c8608c029a3e',
          tid: '1',
          'com.docker.swarm.constraints': '[\'org==10\']',
          type: 'image-builder-container'
        },
        OpenStdin: false,
        PortSpecs: null,
        StdinOnce: false,
        Tty: false,
        User: '',
        Volumes: {},
        WorkingDir: ''
      },
      HostConfig: {
        Binds: ['/git-cache:/cache:rw']
      },
      Volumes: {},
      State: {
        Running: false,
        Pid: -1
      },
      NetworkSettings: {
        Bridge: '',
        Gateway: '',
        IPAddress: '',
        IPPrefixLen: 0,
        MacAddress: '',
        Ports: null
      },
      Env: [
        'RUNNABLE_AWS_ACCESS_KEY=FAKE_AWS_ACCESS_KEY_ID',
        'RUNNABLE_AWS_SECRET_KEY=FAKE_AWS_SECRET_ACCESS_KEY',
        'RUNNABLE_FILES_BUCKET=runnable.context.resources.test',
        'RUNNABLE_PREFIX=56c78aeac68adfe5135db912/source/',
        'RUNNABLE_FILES={}',
        'RUNNABLE_DOCKER=unix:///var/run/docker.sock',
        'RUNNABLE_DOCKERTAG=registry.runnable.com/10/56c78aeac68adfe5135db912:56c78aeac68adfe5135db914',
        'RUNNABLE_IMAGE_BUILDER_NAME=registry.runnable.com/runnable/image-builder',
        'RUNNABLE_IMAGE_BUILDER_TAG=d1.6.2-v4.0.1',
        'RUNNABLE_REPO=',
        'RUNNABLE_COMMITISH=',
        'RUNNABLE_KEYS_BUCKET=runnable.deploykeys.test',
        'RUNNABLE_DEPLOYKEY=',
        'DOCKER_IMAGE_BUILDER_CACHE=/git-cache',
        'RUNNABLE_WAIT_FOR_WEAVE=for i in {1..10}; do grep -q ethwe /proc/net/dev && break; sleep 1; test ' +
        '\'$i\' = \'10\' && echo Runnable: network failed && exit 55; done;',
        'NODE_ENV=test',
        'RUNNABLE_BUILD_FLAGS={\'Memory\:512000000,\'forcerm\:true}',
        'RUNNABLE_PUSH_IMAGE=true'
      ],
      '_events': {}
    }
  }
}
