/**
 * @module test/fixtures/container-inspect
 */

/**
 * Generate an example set of meta data for job created
 * from docker-listener. Instance is required for container
 * labels.
 * @param {Object} instance
 * @return Object
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
};
