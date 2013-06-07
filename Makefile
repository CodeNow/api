build:
	@./node_modules/.bin/coffee -o lib src
test:
ifdef grep
		@NODE_ENV=testing ./node_modules/.bin/mocha --reporter spec --grep ${grep}
else
		@NODE_ENV=testing ./node_modules/.bin/mocha --reporter spec
endif
install:
	@npm install
start:
	@node server.js
image:
	@docker build .
watch:
	@./node_modules/.bin/coffee -w -o lib src & ./node_modules/.bin/nodemon -w lib -w configs -q lib/index.js
testwatch:
ifdef grep
		@./node_modules/.bin/coffee -w -o lib src & NODE_ENV=testing ./node_modules/.bin/nodemon --delay 3 -w lib -w test -w configs -q ./node_modules/.bin/mocha --reporter spec --grep ${grep}
else
		@./node_modules/.bin/coffee -w -o lib src & NODE_ENV=testing ./node_modules/.bin/nodemon --delay 3 -w lib -w test -w configs -q ./node_modules/.bin/mocha --reporter spec
endif
coverage:
	@jscoverage lib lib-cov; rm -rf lib; mv lib-cov lib; mkdir ./coverage; ./node_modules/.bin/mocha -t 10000 --reporter html-cov > ./coverage/index.html
clean:
	@rm -rf ./lib; rm -rf ./coverage

.PHONY: test
.PHONY: install
.PHONY: build
.PHONY: image
.PHONY: watch
.PHONY: testwatch
.PHONY: coverage
.PHONY: clean
.PHONY: start
