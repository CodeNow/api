test:
	@./node_modules/.bin/mocha --reporter spec
build:
	@./node_modules/.bin/coffee -o lib src
watch:
	@./node_modules/.bin/coffee -w -o lib src & ./node_modules/.bin/nodemon -w lib -q lib/index.js
coverage:
	@mkdir coverage; jscoverage lib lib-cov; ./node_modules/.bin/mocha --reporter html-cov > ./coverage/index.html; rm -rf ./lib-cov
clean:
	@rm -rf ./lib; rm -rf ./lib-cov; rm -rf ./coverage

.PHONY: test
.PHONY: build
.PHONY: watch
.PHONY: coverage
.PHONY: clean
