FROM {{image}}
WORKDIR /root
ADD {{file_root_host}} {{file_root}}
RUN cd {{file_root}}; npm install
CMD npm start {{file_root}}
EXPOSE {{port}}