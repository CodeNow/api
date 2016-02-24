/**
 * @module test/functional/fixtures/container-inspect
 */
'use strict'
var dockerHost = require('./docker-host')

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
      Config: {
        Cmd: [
          '/source/dockerBuild.sh'
        ],
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
          'RUNNABLE_WAIT_FOR_WEAVE=until grep -q ethwe /proc/net/dev do sleep 1 done',
          'RUNNABLE_BUILD_FLAGS={"Memory":1000000000}'
        ],
        Tty: false,
        OpenStdin: false,
        StdinOnce: false,
        AttachStdin: false,
        AttachStdout: true,
        AttachStderr: true,
        Hostname: '',
        User: '',
        Labels: {
          contextVersionId: instance.json().contextVersion.id,
          instanceId: instance.attrs._id,
          instanceShortHash: instance.attrs.shortHash,
          ownerUsername: 'cflynn07',
          type: 'user-container',
          userGithubId: instance.json().owner.github,
          tid: 'e5e14545-0d40-45bb-90fd-0128cbc6fbaa'
        },
        Volumes: {
          '/cache': '/git-cache',
          '/layer-cache': '/layer-cache',
          '/usr/local/bin/weave': '/usr/local/bin/weave',
          '/var/run/docker.sock': '/run/docker.sock'
        },
        WorkingDir: '',
        Image: 'runnable/image-builder:d1.4.1-v2.2.2'
      },
      Image: '51a6860f9a670a4145c2c3658c9aa227012f76314a91fd3d42e961806947f160',
      State: {
        Running: false,
        Pid: -1,
        Status: 'exited',
        Paused: false,
        Restarting: false,
        OOMKilled: false,
        Dead: false,
        ExitCode: 0,
        Error: '',
        StartedAt: '2016-01-11T00:36:26.488101036Z',
        FinishedAt: '2016-01-11T00:38:05.80668384Z'
      },
      NetworkSettings: {
        Bridge: '',
        SandboxID: '',
        HairpinMode: false,
        LinkLocalIPv6Address: '',
        LinkLocalIPv6PrefixLen: 0,
        Ports: null,
        SandboxKey: '',
        SecondaryIPAddresses: null,
        SecondaryIPv6Addresses: null,
        EndpointID: '',
        Gateway: '',
        GlobalIPv6Address: '',
        GlobalIPv6PrefixLen: 0,
        IPAddress: '',
        IPPrefixLen: 0,
        IPv6Gateway: '',
        MacAddress: '',
        Networks: {
          bridge: {
            EndpointID: '',
            Gateway: '',
            IPAddress: '',
            IPPrefixLen: 0,
            IPv6Gateway: '',
            GlobalIPv6Address: '',
            GlobalIPv6PrefixLen: 0,
            MacAddress: ''
          }
        }
      },
      Name: '554169c7dd3f3d21e1fb3810',
      HostConfig: {
        MemorySwap: 0,
        VolumesFrom: '',
        Dns: null,
        Memory: 1000000000,
        Binds: [
          '/var/run/docker.sock:/var/run/docker.sock',
          '/git-cache:/cache:rw',
          '/layer-cache:/layer-cache:rw'
        ]
      }
    }
  }
}
