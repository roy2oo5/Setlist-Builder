.PHONY: build-android

build-android:
	npm run build
	npm run build:stage-relay
	mkdir -p backend/bin
	cd backend && GOOS=linux GOARCH=arm64 CGO_ENABLED=0 go build -o bin/stage-relay-arm64 ./cmd/stage-relay
