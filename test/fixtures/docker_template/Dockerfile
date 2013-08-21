FROM {IMAGE}
ADD {FILE_ROOT_HOST} {FILE_ROOT}
RUN cd {FILE_ROOT}; npm install
CMD /usr/local/bin/npm start {FILE_ROOT}
EXPOSE {PORT}