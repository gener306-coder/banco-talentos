FROM docker.io/library/php:8.4-cli-bookworm

ARG LOCAL_UID=1000
ARG LOCAL_GID=1000

RUN apt-get update \
    && apt-get install -y --no-install-recommends git unzip libpq-dev libicu-dev libzip-dev ffmpeg \
    && docker-php-ext-install pdo_pgsql intl zip pcntl \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --gid "${LOCAL_GID}" app \
    && useradd --uid "${LOCAL_UID}" --gid app --create-home app

COPY --from=docker.io/library/composer:2 /usr/bin/composer /usr/local/bin/composer
COPY --chmod=755 docker/backend/entrypoint.sh /usr/local/bin/dev-entrypoint
COPY docker/backend/php.ini "$PHP_INI_DIR/conf.d/zz-banco-talentos.ini"

WORKDIR /app
RUN mkdir -p /app/vendor && chown -R app:app /app

USER app
EXPOSE 8000
ENTRYPOINT ["dev-entrypoint"]
CMD ["php", "artisan", "serve", "--host=0.0.0.0", "--port=8000", "--no-reload"]
