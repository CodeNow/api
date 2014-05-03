var express = require('express');
var app = express();

app.post('/build', function (req, res, next) {
  var tar = require('tar');
  var concat = require('concat-stream');
  var dockfile = false;
  req.pipe(tar.Parse())
    .on('entry', function (entry) {
      if (entry.props.path === 'Dockerfile') {
        entry.pipe(concat(function (file) {
          if (/FROM/.test(file) && /WORKDIR/.test(file) && /CMD/.test(file)) {
            dockfile = true;
          }
        }));
      }
    })
    .on('end', function () {
      if (dockfile) {
        res.send('Successfully built');
      } else {
        res.send('error');
      }
    });
});

app.post('/images/:repo?/:user?/:name/push', express.bodyParser(), function (req, res, next) {
  res.send('pushed');
});

app.post('/containers/create', express.bodyParser(), function (req, res, next) {
  res.json(201, {
    "Id": "e90e34656806",
    "Warnings": []
  });
});

app.post('/containers/:id/stop', function (req, res, next) {
  res.send(204);
});

app.post('/commit', function (req, res, next) {
  res.json(201, {
    "Id": "596069db4bf5"
  });
});

app.del('/containers/:id', function (req, res, next) {
  res.send(204);
});

app.post('/containers/:id/start', function (req, res, next) {
  res.send(204);
});

app.get('/containers/:id/json', function (req, res, next) {
  res.json({
    "ID": "4fa6e0f0c6786287e131c3852c58a2e01cc697a68231826813597e4994f1d6e2",
    "Created": "2014-02-13T09:23:22.308224614Z",
    "Path": "/dockworker/bin/node",
    "Args": [
      "/dockworker"
    ],
    "Config": {
      "Hostname": "52fc849519fee08c58000009",
      "Domainname": "",
      "User": "",
      "Memory": 0,
      "MemorySwap": 0,
      "CpuShares": 0,
      "AttachStdin": false,
      "AttachStdout": false,
      "AttachStderr": false,
      "PortSpecs": null,
      "ExposedPorts": {
        "15000/tcp": {},
        "80/tcp": {}
      },
      "Tty": false,
      "OpenStdin": false,
      "StdinOnce": false,
      "Env": [
        "RUNNABLE_USER_DIR=/root",
        "RUNNABLE_SERVICE_CMDS=couchdb; redis-server; mongod; mysqld",
        "RUNNABLE_START_CMD=npm start",
        "RUNNABLE_BUILD_CMD=",
        "SERVICES_TOKEN=services-92ad7566-ad85-4f1d-b0b0-6fd57f90f7a6",
        "APACHE_RUN_USER=www-data",
        "APACHE_RUN_GROUP=www-data",
        "APACHE_LOG_DIR=/var/log/apache2",
        "PATH=/dart-sdk/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
        "STOP_URL=http://10.0.1.226:3000/containers/services-92ad7566-ad85-4f1d-b0b0-6fd57f90f7a6/stop",
        "PROMPT_COMMAND=history 1 | cut -c 8- >> /.terminalLog",
        "DEBIAN_FRONTEND=dialog"
      ],
      "Cmd": [
        "/dockworker/bin/node",
        "/dockworker"
      ],
      "Dns": null,
      "Image": "registry.runnable.com/runnable/52fc849519fee08c58000009",
      "Volumes": {
        "/dockworker": {}
      },
      "VolumesFrom": "",
      "WorkingDir": "/root",
      "Entrypoint": null,
      "NetworkDisabled": false,
      "OnBuild": null
    },
    "State": {
      "Running": true,
      "Pid": 10170,
      "ExitCode": 0,
      "StartedAt": "2014-02-13T09:23:22.554778843Z",
      "FinishedAt": "0001-01-01T00:00:00Z",
      "Ghost": false
    },
    "Image": "96019753d2da30fc955d39179cd6a0526741567451a23c32d8b65f31170c640b",
    "NetworkSettings": {
      "IPAddress": "172.17.0.2",
      "IPPrefixLen": 16,
      "Gateway": "172.17.42.1",
      "Bridge": "docker0",
      "PortMapping": null,
      "Ports": {
        "15000/tcp": [
          {
            "HostIp": "0.0.0.0",
            "HostPort": "49155"
          }
        ],
        "80/tcp": [
          {
            "HostIp": "0.0.0.0",
            "HostPort": "49156"
          }
        ]
      }
    },
    "ResolvConfPath": "/etc/resolv.conf",
    "HostnamePath": "/var/lib/docker/containers/f9fbfae7f320e2ee6711489e9401256c8d898b0f99e4ad99ac9b22a6daaa8783/hostname",
    "HostsPath": "/var/lib/docker/containers/f9fbfae7f320e2ee6711489e9401256c8d898b0f99e4ad99ac9b22a6daaa8783/hosts",
    "Name": "/elegant_engelbart",
    "Driver": "aufs",
    "Volumes": {
      "/dockworker": "/home/ubuntu/dockworker"
    },
    "VolumesRW": {
      "/dockworker": false
    },
    "HostConfig": {
      "Binds": [
        "/home/ubuntu/dockworker:/dockworker:ro"
      ],
      "ContainerIDFile": "",
      "LxcConf": [
        {
          "Key": "lxc.cgroup.cpuset.cpus",
          "Value": "0"
        }
      ],
      "Privileged": false,
      "PortBindings": {
        "15000/tcp": [
          {
            "HostIp": "0.0.0.0",
            "HostPort": "49155"
          }
        ],
        "80/tcp": [
          {
            "HostIp": "0.0.0.0",
            "HostPort": "49156"
          }
        ]
      },
      "Links": null,
      "PublishAllPorts": false
    }
  });
});

app.all('*', function (req, res, next) {
  console.log('Docker request:', req.method, req.url);
  next();
});

module.exports.started = false;
module.exports.start = function (cb) {
  var self = this;
  app.listen(4243, function (err) {
    self.started = true;
    cb(err);
  });
};
module.exports.stop = function (cb) {
  var self = this;
  app.close(function (err) {
    self.started = false;
    cb(err);
  });
};
