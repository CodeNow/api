#!/bin/bash
apt-get -y update
apt-get -y install python-software-properties python g++ make vim git curl fontconfig diod
add-apt-repository -y ppa:chris-lea/node.js
apt-get -y update
apt-get -y install nodejs
apt-key adv --keyserver keyserver.ubuntu.com --recv 7F0CEB10
echo 'deb http://downloads-distro.mongodb.org/repo/ubuntu-upstart dist 10gen' | tee /etc/apt/sources.list.d/10gen.list
apt-get -y update
apt-get -y install mongodb-10gen redis-server
curl https://gist.github.com/jpetazzo/5668338/raw/rectifier.sh > /root/rectifier.sh; cp /root/rectifier.sh /usr/local/bin/rectifier; chmod +x /usr/local/bin/rectifier
git clone https://github.com/visionmedia/node-jscoverage.git /root/jscoverage
cd /root/jscoverage; ./configure; make; make install; rm -rf /root/jscoverage
cd /root; wget https://phantomjs.googlecode.com/files/phantomjs-1.9.1-linux-x86_64.tar.bz2; tar -xvf phantomjs-1.9.1-linux-x86_64.tar.bz2; cp ./phantomjs-1.9.1-linux-x86_64/bin/phantomjs /usr/local/bin/phantomjs; rm -rf /root/phantomjs-1.9.1-linux-x86_64