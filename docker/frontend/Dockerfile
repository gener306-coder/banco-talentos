FROM docker.io/library/node:24-bookworm-slim

ARG LOCAL_UID=1000
ARG LOCAL_GID=1000

RUN groupmod --gid "${LOCAL_GID}" node \
    && usermod --uid "${LOCAL_UID}" --gid "${LOCAL_GID}" node

COPY --chmod=755 docker/frontend/entrypoint.sh /usr/local/bin/dev-entrypoint

WORKDIR /app
RUN mkdir -p /app/node_modules && chown -R node:node /app

USER node
EXPOSE 5173
ENTRYPOINT ["dev-entrypoint"]
CMD ["npm", "run", "dev"]
