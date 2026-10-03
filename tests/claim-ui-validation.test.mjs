import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  isHostname,
  isPublicIPv4,
  isPublicIPv6,
  isRelPath,
  isValidBuildCommand,
  isValidDeployRepo,
} from '../web/src/claim.js'

test('claim builder accepts only public IPv4 addresses', () => {
  for (const address of ['1.1.1.1', '8.8.8.8']) assert.equal(isPublicIPv4(address), true, address)
  for (const address of ['01.2.3.4', '203.0.113.10', '100.64.0.1', '224.0.0.1', '256.1.1.1']) {
    assert.equal(isPublicIPv4(address), false, address)
  }
})

test('claim builder accepts only public IPv6 addresses', () => {
  for (const address of ['2606:4700:4700::1111', '2001:4860:4860::8888']) {
    assert.equal(isPublicIPv6(address), true, address)
  }
  for (const address of ['2001:db8::1', '2002::1', 'fe80::1', '::1', ':::', '2000::gg']) {
    assert.equal(isPublicIPv6(address), false, address)
  }
})

test('claim builder hostname validation matches accepted DNS hostnames', () => {
  for (const host of ['example.com', 'a.io', '_acme.example.com', 'example.com.']) {
    assert.equal(isHostname(host), true, host)
  }
  for (const host of ['localhost', 'a..com', 'example.123', `${'a'.repeat(64)}.com`]) {
    assert.equal(isHostname(host), false, host)
  }
})

test('claim builder deploy fields enforce repository, path, and command constraints', () => {
  for (const repo of ['alice/portfolio', 'alice/my.site']) assert.equal(isValidDeployRepo(repo), true, repo)
  for (const repo of ['alice/..', 'alice/.', 'alice/portfolio/', 'https://github.com/alice/app']) {
    assert.equal(isValidDeployRepo(repo), false, repo)
  }

  for (const path of ['.', 'dist', 'packages/web']) assert.equal(isRelPath(path), true, path)
  for (const path of ['../secrets', 'packages/..', '/etc', '-output', 'a\nb']) {
    assert.equal(isRelPath(path), false, path)
  }

  assert.equal(isValidBuildCommand('npm ci && npm run build'), true)
  assert.equal(isValidBuildCommand('x'.repeat(501)), false)
  assert.equal(isValidBuildCommand('npm run build\nwhoami'), false)
})
