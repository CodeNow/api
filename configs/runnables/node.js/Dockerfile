FROM runnable/base
ENV RUNNABLE_USER_DIR /root
ENV RUNNABLE_SERVICE_CMDS /usr/local/bin/npm start /root
ADD ./src /root
RUN cd /root; npm install
CMD /usr/local/bin/npm start /root