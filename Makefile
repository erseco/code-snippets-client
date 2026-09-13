.PHONY: install check lint test build integration
install:
	npm ci
check:
	npm run check
lint:
	npm run format:check
	npm run typecheck
test:
	npm test
build:
	npm run build
integration:
	npm run build
	npm run test:integration
