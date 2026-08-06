import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveApiOrigin } from './apiOrigin';

/**
 * The door talks to a server on a LAN address, and a LAN address changes
 * without anyone editing anything. These pin the one rule that keeps the
 * scanner working across a DHCP lease: in development, follow the machine
 * that served the bundle; anywhere else, do not touch what was configured.
 */

const METRO = '10.0.0.183:8081';

test('dev: a stale LAN host follows the machine serving the bundle', () => {
  assert.equal(
    resolveApiOrigin('http://10.0.0.74:3008', METRO, true),
    'http://10.0.0.183:3008'
  );
});

test('dev: the configured port is kept, only the host moves', () => {
  assert.equal(
    resolveApiOrigin('http://192.168.1.9:4000', METRO, true),
    'http://10.0.0.183:4000'
  );
  assert.equal(resolveApiOrigin('http://localhost', METRO, true), 'http://10.0.0.183');
});

test('dev: pointing a dev build at a real host is deliberate and survives', () => {
  // The whole reason this is guarded: testing against staging from a dev
  // build must not be silently rewritten to the laptop.
  assert.equal(
    resolveApiOrigin('https://opuspass.opusfesta.com', METRO, true),
    'https://opuspass.opusfesta.com'
  );
});

test('production never rewrites anything', () => {
  assert.equal(
    resolveApiOrigin('http://10.0.0.74:3008', METRO, false),
    'http://10.0.0.74:3008'
  );
});

test('no Metro host means leave the configured value alone', () => {
  assert.equal(
    resolveApiOrigin('http://10.0.0.74:3008', '', true),
    'http://10.0.0.74:3008'
  );
});

test('a host that already matches is left untouched', () => {
  assert.equal(
    resolveApiOrigin('http://10.0.0.183:3008', METRO, true),
    'http://10.0.0.183:3008'
  );
});
