<?php

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Process;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use League\Flysystem\AwsS3V3\AwsS3V3Adapter;
use League\Flysystem\Local\LocalFilesystemAdapter;

// Tarea técnica T-S9-01 del Sprint 9: la imagen del backend procesa video, una cola en PostgreSQL lo saca de la
// petición HTTP y el disco de medios se cambia de local a S3 sin tocar código.
uses(RefreshDatabase::class);

it('ships ffmpeg, ffprobe and pcntl in the backend image (T-S9-01 CA-01)', function () {
    expect(Process::run(['ffmpeg', '-hide_banner', '-version'])->successful())->toBeTrue()
        ->and(Process::run(['ffprobe', '-hide_banner', '-version'])->successful())->toBeTrue()
        // Sin pcntl, queue:work no puede cortar un trabajo que rebasa su --timeout.
        ->and(extension_loaded('pcntl'))->toBeTrue();
});

it('accepts uploads of up to 250 MB (T-S9-01)', function () {
    expect(ini_get('upload_max_filesize'))->toBe('250M')
        ->and(ini_get('post_max_size'))->toBe('260M');
});

it('queues on PostgreSQL with a retry window longer than the worker timeout (T-S9-01)', function () {
    $configured = require config_path('queue.php');

    expect($configured['connections']['database']['driver'])->toBe('database')
        ->and(config('queue.connections.database.retry_after'))->toBeGreaterThan(900)
        ->and(config('queue.failed.driver'))->toBe('database-uuids')
        ->and(Schema::hasTable('jobs'))->toBeTrue()
        ->and(Schema::hasTable('failed_jobs'))->toBeTrue();
});

it('runs a job queued on the videos queue through the database worker (T-S9-01 CA-02)', function () {
    config(['queue.default' => 'database']);

    dispatch(function (): void {
        Cache::put('t-s9-01-worker', 'processed');
    })->onQueue('videos');

    expect(DB::table('jobs')->where('queue', 'videos')->count())->toBe(1);

    $this->artisan('queue:work', ['connection' => 'database', '--queue' => 'videos', '--once' => true])
        ->assertSuccessful();

    expect(Cache::get('t-s9-01-worker'))->toBe('processed')
        ->and(DB::table('jobs')->count())->toBe(0);
});

it('stores media on a private local disk by default (T-S9-01 CA-03)', function () {
    expect(config('filesystems.media_disk'))->toBe('media')
        ->and(config('filesystems.disks.media.root'))->toBe(storage_path('app/media'))
        ->and(config('filesystems.disks.media.serve'))->toBeFalse()
        ->and(Storage::disk(config('filesystems.media_disk'))->getAdapter())->toBeInstanceOf(LocalFilesystemAdapter::class);
});

it('switches the media disk to S3 by configuration alone (T-S9-01 CA-03)', function () {
    config([
        'filesystems.media_disk' => 's3',
        'filesystems.disks.s3.region' => 'us-east-1',
        'filesystems.disks.s3.bucket' => 'banco-talentos-media',
    ]);

    expect(Storage::disk(config('filesystems.media_disk'))->getAdapter())->toBeInstanceOf(AwsS3V3Adapter::class);
});
