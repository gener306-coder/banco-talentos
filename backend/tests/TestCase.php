<?php

namespace Tests;

use Illuminate\Foundation\Testing\TestCase as BaseTestCase;
use RuntimeException;

abstract class TestCase extends BaseTestCase
{
    public function createApplication()
    {
        $app = parent::createApplication();

        // Runs before RefreshDatabase can migrate or truncate any tables.
        $connection = $app['db']->connection();
        $database = $connection->getDatabaseName();

        if (
            ! $app->environment('testing')
            || $connection->getDriverName() !== 'pgsql'
            || ! is_string($database)
            || ! preg_match('/_(testing|test)$/', $database)
            || $connection->getConfig('read')
            || $connection->getConfig('write')
        ) {
            throw new RuntimeException(
                'Tests require APP_ENV=testing and a dedicated PostgreSQL database ending in _testing or _test, without read/write overrides.'
            );
        }

        return $app;
    }
}
