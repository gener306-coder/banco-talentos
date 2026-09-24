<?php

it('boots the application through the framework health endpoint', function () {
    $this->get('/up')->assertOk();
});

it('returns JSON for an unknown API route', function () {
    $this->get('/api/not-found')
        ->assertNotFound()
        ->assertHeader('Content-Type', 'application/json')
        ->assertJsonStructure(['message']);
});
