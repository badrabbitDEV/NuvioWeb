import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ApiError } from '../src/errors.js';
import { openSafeResponse } from '../src/security/safe-fetch.js';

function hasCode(code: string) {
  return (error: unknown) => error instanceof ApiError && error.code === code;
}

test('bloqueia endereços IPv4 privados antes de abrir a conexão', async () => {
  await assert.rejects(openSafeResponse('https://127.0.0.1/private'), hasCode('HOST_BLOCKED'));
});

test('bloqueia endereços IPv6 loopback antes de abrir a conexão', async () => {
  await assert.rejects(openSafeResponse('https://[::1]/private'), hasCode('HOST_BLOCKED'));
});

test('bloqueia nomes localhost', async () => {
  await assert.rejects(openSafeResponse('https://localhost/resource'), hasCode('HOST_BLOCKED'));
});

test('recusa HTTP em produção por padrão', async () => {
  await assert.rejects(openSafeResponse('http://example.com/video.mp4', false), hasCode('HTTPS_REQUIRED'));
});

test('recusa esquemas não HTTP(S)', async () => {
  await assert.rejects(openSafeResponse('file:///etc/passwd', true), hasCode('HTTPS_REQUIRED'));
});
