# Full list of versions available here: https://registry.hub.docker.com/_/node/tags/manage/\n' +
FROM node:4.2.3

# Open up ports on the container
EXPOSE 80 8000 8080 3000

# Add repository files to container

ENV RABBITMQ_HOSTNAME=rabbitmq-testing-staging-codenow.runnableapp.com REDIS_IPADDRESS=redis-testing-staging-codenow.runnableapp.com MONGO=mongodb://mongodb-testing-staging-codenow.runnableapp.com:27017/runnable_test123 NEO4J=http://neo4j-testing-staging-codenow.runnableapp.com:7474 NPM_TOKEN=c76363e9-78e0-4667-82ac-e2ac01efcfe2

#Start: Main Repository
ADD ["./", "/api"]
WORKDIR /api
RUN npm set strict-ssl false
RUN echo '//registry.npmjs.org/:_authToken=${NPM_TOKEN}' > .npmrc
RUN npm install

#End

#Start: File
ADD ["./wait-for-it.sh", "/usr/local/bin/"]
WORKDIR /usr/local/bin/
RUN chmod +x /usr/local/bin/wait-for-it.sh
#End

WORKDIR /api


# Command to start the app
# CMD /usr/local/bin/wait-for-it.sh redis-testing-staging-codenow.runnableapp.com:6379 -t 120 && npm run unit
CMD bash
