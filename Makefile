test:
	@NODE_ENV=testing ./node_modules/.bin/mocha --reporter spec
build:
	@./node_modules/.bin/coffee -o lib src
start:
	node server.js
image:
	@docker build .
watch:
	@./node_modules/.bin/coffee -w -o lib src & ./node_modules/.bin/nodemon -w lib -w configs -q lib/index.js
testwatch:
	@./node_modules/.bin/coffee -w -o lib src & NODE_ENV=testing ./node_modules/.bin/nodemon -w lib -w test  -w configs -q ./node_modules/.bin/mocha --reporter spec
coverage:
	@jscoverage lib lib-cov; rm -rf lib; mv lib-cov lib; mkdir coverage; ./node_modules/.bin/mocha --reporter html-cov > ./coverage/index.html
clean:
	@rm -rf ./lib; rm -rf ./coverage

.PHONY: test
.PHONY: build
.PHONY: image
.PHONY: watch
.PHONY: testwatch
.PHONY: coverage
.PHONY: clean
.PHONY: start