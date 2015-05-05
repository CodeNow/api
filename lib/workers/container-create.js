/**
 * Respond to container-create event from Docker
 * Job created from docker-listener running on a dock
 *  - start the container
 *  - update instance model
 *  - start container
 *  - notifications
 *    - primus org-room broadcast
 * @module lib/workers/container-create
 */
'use strict';

require('loadenv')();
var debug = require('debug')('api:worker:container-create');
var keypather = require('keypather')();
var Runnable = require('models/apis/runnable');

module.exports.worker = worker;

function worker (data, done) {
  var runnable = new Runnable({}, {});
  debug('job recieved: "container-create"');
  var labels = keypather.get(data, 'inspectData.Config.Labels');
  debug('container labels', labels);
  if (keypather.get(labels, 'type') === 'user-container') {
    //console.log('worker container-create', data);
    runnable.workerContainerCreate({
      json: data
    }, function (/* err, res, body */) {
      // todo handle error
      //console.log('worker response', arguments);
      done();
    });
  } else {
    done();
  }
}

/**
 * SAMPLE DATA FROM docker-listener
      { status: 'create',
        id: 'fd1bf1a9998b73abbe205ff82849938ed085605de8fbb1ad84d8e2eed7cd82ca',
    from: 'ubuntu:latest',
    time: 1429302924,
    uuid: '46348700-e541-11e4-b81d-87ab7e37eb88',
    ip: '192.168.1.223',
    numCpus: 8,
    mem: 8589934592,
    tags: [ 'some', 'tags' ],
    host: 'http://192.168.1.223:4243',
    inspectData:
     { AppArmorProfile: '',
         Args: [ 'test' ],
         Config:
          { AttachStderr: true,
                 AttachStdin: false,
                 AttachStdout: true,
                 Cmd: [Object],
                 CpuShares: 0,
                 Cpuset: '',
                 Domainname: '',
                 Entrypoint: null,
                 Env: [Object],
                 ExposedPorts: null,
                 Hostname: 'fd1bf1a9998b',
                 Image: 'ubuntu',
                 Labels: {},
                 MacAddress: '',
                 Memory: 0,
                 MemorySwap: 0,
                 NetworkDisabled: false,
                 OnBuild: null,
                 OpenStdin: false,
                 PortSpecs: null,
                 StdinOnce: false,
                 Tty: false,
                 User: '',
                 Volumes: null,
                 WorkingDir: '' },
         Created: '2015-04-17T20:35:24.060907506Z',
         Driver: 'aufs',
         ExecDriver: 'native-0.2',
         ExecIDs: null,
         HostConfig:
          { Binds: null,
                 CapAdd: null,
                 CapDrop: null,
                 CgroupParent: '',
                 ContainerIDFile: '',
                 CpuShares: 0,
                 CpusetCpus: '',
                 Devices: [],
                 Dns: null,
                 DnsSearch: null,
                 ExtraHosts: null,
                 IpcMode: '',
                 Links: null,
                 LogConfig: [Object],
                 LxcConf: [],
                 Memory: 0,
                 MemorySwap: 0,
                 NetworkMode: 'bridge',
                 PidMode: '',
                 PortBindings: {},
                 Privileged: false,
                 PublishAllPorts: false,
                 ReadonlyRootfs: false,
                 RestartPolicy: [Object],
                 SecurityOpt: null,
                 Ulimits: null,
                 VolumesFrom: null },
         HostnamePath: '',
         HostsPath: '',
         Id: 'fd1bf1a9998b73abbe205ff82849938ed085605de8fbb1ad84d8e2eed7cd82ca',
         Image: 'd0955f21bf24f5bfffd32d2d0bb669d0564701c271bc3dfc64cfc5adfdec2d07',
         LogPath: '',
         MountLabel: '',
         Name: '/compassionate_jang',
         NetworkSettings:
          { Bridge: '',
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
                 Ports: null },
         Path: 'echo',
         ProcessLabel: '',
         ResolvConfPath: '',
         RestartCount: 0,
         State:
          { Dead: false,
                 Error: '',
                 ExitCode: 0,
                 FinishedAt: '0001-01-01T00:00:00Z',
                 OOMKilled: false,
                 Paused: false,
                 Pid: 0,
                 Restarting: false,
                 Running: false,
                 StartedAt: '0001-01-01T00:00:00Z' },
         Volumes: {},
         VolumesRW: {} } }
     */

