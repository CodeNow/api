'use strict'

module.exports = function (contextVersion, container, user, exitCode) {
  return {
    status: 'die',
    time: 1456965885536,
    id: container.id,
    from: 'ubuntu:latest',
    uuid: '2013ed10-e0d9-11e5-978a-7b4fb0bfbcb1',
    ip: '192.168.1.12',
    numCpus: 4,
    mem: 17179869184,
    tags: 'default',
    host: 'http://192.168.1.12:4243',
    inspectData: {
      Id: container.id,
      Memory: 0,
      MemorySwap: 0,
      Image: 'registry.runnable.com/runnable/image-builder:d1.6.2-v4.0.4',
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
          'contextVersion.context': contextVersion.context,
          'contextVersion._id': contextVersion._id.toString(),
          'contextVersion.build._id': contextVersion.build._id.toString(),
          dockerTag: 'registry.runnable.com/10/56d78c576dbcd8e088f5ff3b:56d78c576dbcd8e088f5ff3e',
          manualBuild: 'true',
          noCache: 'undefined',
          sessionUserDisplayName: user.accounts.github.username,
          sessionUserGithubId: user.accounts.github.id.toString(),
          sessionUserUsername: user.accounts.github.username,
          ownerUsername: user.accounts.github.username,
          tid: '1',
          'com.docker.swarm.constraints': '["org==10"]',
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
        Binds: {}
      },
      Volumes: {},
      State: {
        ExitCode: exitCode || 0,
        Running: false,
        Pid: 0
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
        'RUNNABLE_BUILD_LINE_TIMEOUT_MS=600000',
        'RUNNABLE_DOCKER=unix:///var/run/docker.sock',
        'RUNNABLE_DOCKERTAG=registry.runnable.com/10/56d788fd60705d52824328c1:56d788fd60705d52824328c4',
        'RUNNABLE_FILES={}',
        'RUNNABLE_FILES_BUCKET=runnable.context.resources.test',
        'RUNNABLE_IMAGE_BUILDER_NAME=registry.runnable.com/runnable/image-builder',
        'RUNNABLE_IMAGE_BUILDER_TAG=d1.6.2-v4.0.4',
        'RUNNABLE_PREFIX=56d788fd60705d52824328c1/source/',
        'RUNNABLE_REPO=',
        'RUNNABLE_COMMITISH=',
        'RUNNABLE_KEYS_BUCKET=runnable.deploykeys.test',
        'RUNNABLE_DEPLOYKEY=',
        'DOCKER_IMAGE_BUILDER_CACHE=/git-cache',
        'RUNNABLE_WAIT_FOR_WEAVE=for i in {1..10}; do grep -q ethwe /proc/net/dev && break; sleep 1; test "$i" = "10" && echo Runnable: network failed && exit 55; done;',
        'NODE_ENV=test',
        'RUNNABLE_BUILD_FLAGS={"Memory":512000000,"forcerm":true}',
        'RUNNABLE_PUSH_IMAGE=true'
      ],
      _events: {}
    }
  }
}
