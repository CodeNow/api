#!/bin/bash
apt-get -y update
apt-get -y install python-software-properties python g++ make vim git curl fontconfig diod
add-apt-repository -y ppa:chris-lea/node.js
apt-get -y update
apt-get -y install nodejs
apt-key adv --keyserver keyserver.ubuntu.com --recv 7F0CEB10
echo 'deb http://downloads-distro.mongodb.org/repo/ubuntu-upstart dist 10gen' | tee /etc/apt/sources.list.d/10gen.list
apt-get -y update
apt-get -y install mongodb-10gen
git clone https://github.com/visionmedia/node-jscoverage.git /root/jscoverage
cd /root/jscoverage; ./configure; make; make install; rm -rf /root/jscoverage
cd /root; wget https://phantomjs.googlecode.com/files/phantomjs-1.9.1-linux-x86_64.tar.bz2; tar -xvf phantomjs-1.9.1-linux-x86_64.tar.bz2; cp ./phantomjs-1.9.1-linux-x86_64/bin/phantomjs /usr/local/bin/phantomjs; rm -rf /root/phantomjs-1.9.1-linux-x86_64
cd /root; wget http://redis.googlecode.com/files/redis-2.6.13.tar.gz; tar -xvf redis-2.6.13.tar.gz; cd redis-2.6.13; make; make install
apt-get -y install mercurial bison
bash < <(curl -s https://raw.github.com/moovweb/gvm/master/binscripts/gvm-installer)
source $HOME/.gvm/scripts/gvm
gvm install go1.1.1
gvm use go1.1.1
export GOPATH=~/go/
export PATH=$GOPATH/bin:$PATH
mkdir -p $GOPATH/src/github.com/dotcloud
cd $GOPATH/src/github.com/dotcloud ; git clone git://github.com/dotcloud/docker.git
cd GOPATH/src/github.com/dotcloud/docker ; go get -v github.com/dotcloud/docker/...
cd GOPATH/src/github.com/dotcloud/docker ; install -v github.com/dotcloud/docker/...
