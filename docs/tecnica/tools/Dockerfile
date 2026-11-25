# T-S20-02 y T-S20-07: imagen fijada para generar los diagramas y el PDF de docs/tecnica/.
# Misma base que E2E (docker/testing/Dockerfile.e2e) y el mismo Chromium de Playwright, sin tocar el sistema anfitrión.
FROM docker.io/library/node:24-bookworm-slim

ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
WORKDIR /tools

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund \
    && npx playwright install --with-deps --only-shell chromium \
    && apt-get update \
    && apt-get install -y --no-install-recommends fonts-noto-core \
    && rm -rf /var/lib/apt/lists/*

COPY mermaid-theme.json *.mjs ./
USER node
ENTRYPOINT ["node"]
