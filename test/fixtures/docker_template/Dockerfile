FROM {IMAGE}
ADD ./src {FILE_ROOT}
RUN cd {FILE_ROOT}; npm install
CMD /usr/local/bin/npm start {FILE_ROOT}
EXPOSE {PORT}