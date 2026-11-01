<?php

namespace App\Support\Video;

/** Lo que ffprobe dice del contenido real de un video. width y height ya consideran la rotación del celular. */
final readonly class VideoProbe
{
    public function __construct(
        public float $duration,
        public int $width,
        public int $height,
        public float $frameRate,
        public bool $hasAudio,
        public bool $hdr,
    ) {}
}
