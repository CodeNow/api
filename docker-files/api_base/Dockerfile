#
# api_base Dockerfile
#

# Pull base image.
FROM registry.runnable.com/runnable/base:latest

# Node.js @ 10.28
$ npm     @  2.1.8

# install required packages
#    lsof: required for open file monitoring

RUN wget http://nodejs.org/dist/v0.10.28/node-v0.10.28.tar.gz \
  && tar xvf node-v*.tar.gz \
  && cd node-v0.10.28 \
  && ./configure \
  && make -j16 \
  && make install \
  && npm install -g npm@2.1.8 \
  && apt-get install lsof