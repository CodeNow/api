# api_main Dockerfile
# Author anandkumarpatel
##

# Pull base image.
FROM registry.runnable.com/runnable/api_base:latest

# Expose port to Host
EXPOSE 3000

WORKDIR /api

# Download API-Server Repo
ADD . .

RUN npm install --production

# Define default command.
CMD ["/usr/local/bin/npm", "start"]