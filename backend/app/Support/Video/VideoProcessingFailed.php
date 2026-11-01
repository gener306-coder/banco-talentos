<?php

namespace App\Support\Video;

use RuntimeException;

/** Video que no se puede procesar. El mensaje se muestra tal cual a la institución (HU-S9-01 CA-05). */
class VideoProcessingFailed extends RuntimeException {}
