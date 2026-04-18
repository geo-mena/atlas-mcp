FROM php:8.3-fpm-alpine

RUN apk add --no-cache --virtual .build-deps $PHPIZE_DEPS \
    && docker-php-ext-install pdo pdo_mysql \
    && apk del .build-deps

WORKDIR /var/www/html

# Day 0: no Composer deps yet. Day 1: composer install.
