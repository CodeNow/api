FROM runnable/base
ENV RUNNABLE_USER_DIR /root
ENV RUNNABLE_START_CMD /usr/local/bin/node /root/server.js
ADD ./src /root
RUN cd /root; npm install
CMD /usr/local/bin/npm start /root
EXPOSE 80