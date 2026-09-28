<?php

namespace Tests\Support;

use Illuminate\Foundation\Http\Middleware\PreventRequestForgery;

class EnforceRequestForgery extends PreventRequestForgery
{
    protected function runningUnitTests()
    {
        // Exercise the real CSRF middleware instead of Laravel's testing bypass.
        return false;
    }
}
