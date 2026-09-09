# harnesslab — the boring commands, in one place.
#
#   make test            the whole Python suite
#   make build-frontend  build the React UI into harnesslab/frontend/dist
#   make wheel           build a wheel into dist/ and verify it installs in a clean venv
#   make docker          build the container image
#
# Everything is phony: this is a task runner, not a build system.

PY      ?= python3
VENV    ?= /tmp/harnesslab-venv
WHEELDIR?= dist
DISTOUT ?= harnesslab/frontend/dist
IMAGE   ?= harnesslab:0.3.0

.PHONY: help test test-v build-frontend lint wheel wheel-check docker docker-run bench index clean

help:
	@grep -E "^[a-z][a-z-]*:.*##" $(MAKEFILE_LIST) | sed -E "s/^([a-z-]+):.*## /  \\1|/" | awk -F"|" '{printf "  %-16s %s\n", $$1, $$2}'

test:  ## run the unittest suite
	cd $(CURDIR) && $(PY) -m unittest discover -s tests_agentlab -q

test-v:  ## run the unittest suite, verbose
	cd $(CURDIR) && $(PY) -m unittest discover -s tests_agentlab -v

build-frontend:  ## npm ci + vite build into harnesslab/frontend/dist
	cd harnesslab/frontend && npm ci --no-audit --no-fund && npx vite build --outDir $(CURDIR)/$(DISTOUT)

lint:  ## oxlint over the frontend sources
	cd harnesslab/frontend && npx oxlint

wheel: build-frontend  ## build the wheel (UI included) into dist/
	$(PY) -m pip wheel . -w $(WHEELDIR) --no-deps
	@ls -l $(WHEELDIR)/*.whl

wheel-check: wheel  ## install the wheel in a throwaway venv and smoke-test the CLI
	rm -rf $(VENV)
	$(PY) -m venv $(VENV)
	$(VENV)/bin/pip -q install $(WHEELDIR)/harnesslab-*.whl
	$(VENV)/bin/harnesslab --version
	$(VENV)/bin/harnesslab --help >/dev/null
	HARNESSLAB_LAB=$${HARNESSLAB_LAB:-$$(mktemp -d)} $(VENV)/bin/harnesslab --paths

docker:  ## build the container image
	docker build -t $(IMAGE) .

docker-run:  ## run the image on http://127.0.0.1:8765
	docker run --rm -p 8765:8765 -e OPENROUTER_API_KEY="$$OPENROUTER_API_KEY" $(IMAGE)

index:  ## rebuild the SQLite run index from scratch
	$(PY) -m harnesslab.backend.store --rebuild

bench:  ## time the SQLite index against load_index()
	$(PY) -m harnesslab.backend.store

clean:  ## remove build artifacts and the derived run index
	rm -rf build $(WHEELDIR) *.egg-info $(VENV)
	rm -f data/.harnesslab_index.sqlite data/.harnesslab_index.sqlite-wal data/.harnesslab_index.sqlite-shm \
	      data/.holdstill_index.sqlite data/.holdstill_index.sqlite-wal data/.holdstill_index.sqlite-shm
	find . -name __pycache__ -type d -prune -exec rm -rf {} +
