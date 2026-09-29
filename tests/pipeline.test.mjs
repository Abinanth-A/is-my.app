import { test } from 'node:test';
import assert from 'node:assert/strict';
import { changedNames, parseMode, selectTargets } from '../scripts/deploy-plan.mjs';
import { evaluate, renderReport, entryProblem, isReclaimedName, MARKER } from '../scripts/check-pr.mjs';
import { buildIndex } from '../scripts/build-index.mjs';
import { loadRepo } from '../scripts/lib/domains.mjs';

const config = { zone: 'is-my.app', repo: 'jn-aman/is-my.app', pagesPrefix: 'ismy-', maintainers: ['jn-aman'], maxDomainsPerUser: 2, maxRecordsPerUser: 50, minAccountAgeDays: 14 };
const reserved = ['www'];
const map = (obj) => new Map(Object.entries(obj));
const cname = (github) => ({ owner: { github }, records: { CNAME: 'example.com' } });
const deploy = (github, repo = `${github}/site`) => ({ owner: { github }, deploy: { repo } });

test('deploy-plan: changedNames parses git diff output', () => {
  const out = 'domains/foo.json\ndomains/docs.bob.json\nREADME.md\ndomains/nested/x.json\nscripts/a.mjs\n\n';
  assert.deepEqual([...changedNames(out)], ['foo', 'docs.bob']);
  assert.deepEqual([...changedNames('')], []);
});

test('deploy-plan: modes', () => {
  assert.deepEqual(parseMode('changed'), { mode: 'changed' });
  assert.deepEqual(parseMode(''), { mode: 'all' });
  assert.deepEqual(parseMode(' name:Foo '), { mode: 'name', name: 'foo' });
  assert.throws(() => parseMode('everything'));
  const entries = [{ name: 'a' }, { name: 'b' }];
  assert.deepEqual(selectTargets(entries, { mode: 'changed', changed: new Set(['b']) }), [{ name: 'b' }]);
  assert.deepEqual(selectTargets(entries, { mode: 'name', name: 'a' }), [{ name: 'a' }]);
  assert.deepEqual(selectTargets(entries, { mode: 'dns' }), []);
  assert.equal(selectTargets(entries, { mode: 'all' }).length, 2);
});

const run = (base, changes, author = 'alice', otherFiles = []) =>
  evaluate({ base: map(base), changes, otherFiles, author, config, reserved });

test('check-pr: new domain owned by the author passes', () => {
  const r = run({}, [{ name: 'alice', status: 'added', data: cname('Alice') }]);
  assert.deepEqual(r.errors, []);
  assert.equal(r.mode, 'records');
});

test('check-pr: owner must be the author', () => {
  const r = run({}, [{ name: 'x', status: 'added', data: cname('bob') }]);
  assert.ok(r.errors.some((e) => /your GitHub username/.test(e.message)));
});

test('check-pr: only the current owner may modify or remove', () => {
  const base = { bob: cname('bob') };
  assert.ok(run(base, [{ name: 'bob', status: 'modified', data: cname('alice') }]).errors.some((e) => /current owner/.test(e.message)));
  assert.ok(run(base, [{ name: 'bob', status: 'removed' }]).errors.some((e) => /current owner/.test(e.message)));
  assert.deepEqual(run(base, [{ name: 'bob', status: 'removed' }], 'bob').errors, []);
});

test('check-pr: non-domain files are rejected unless maintainer', () => {
  const r = run({}, [], 'alice', ['scripts/sync-dns.mjs']);
  assert.ok(r.errors.some((e) => /only files matching/.test(e.message)));
  assert.equal(r.mode, 'mixed');
  assert.deepEqual(run({}, [], 'jn-aman', ['README.md']).errors, []);
});

test('check-pr: maintainers can manage any domain', () => {
  const r = run({ bob: cname('bob') }, [{ name: 'bob', status: 'removed' }, { name: 'x', status: 'added', data: cname('carol') }], 'jn-aman');
  assert.deepEqual(r.errors, []);
});

test('check-pr: cross-file rules on the merged state', () => {
  const base = { bob: cname('bob'), a: cname('alice'), b: cname('alice') };
  const nested = run(base, [{ name: 'x.bob', status: 'added', data: cname('alice') }]);
  assert.ok(nested.errors.some((e) => /different owner/.test(e.message)));
  const limit = run(base, [{ name: 'c', status: 'added', data: cname('alice') }]);
  assert.ok(limit.errors.some((e) => e.name === 'c' && /exceeds the limit/.test(e.message)));
  const reservedName = run({}, [{ name: 'www', status: 'added', data: cname('alice') }]);
  assert.ok(reservedName.errors.some((e) => /reserved/.test(e.message)));
});

test('check-pr: pre-existing problems on main do not block unrelated PRs', () => {
  const base = { a: cname('carol'), b: cname('carol'), c: cname('carol') };
  assert.deepEqual(run(base, [{ name: 'alice', status: 'added', data: cname('alice') }]).errors, []);
  assert.deepEqual(run(base, [{ name: 'c', status: 'removed' }], 'carol').errors, []);
});

test('check-pr: parse errors and modes', () => {
  const r = run({}, [{ name: 'x', status: 'added', parseError: 'could not parse: bad' }]);
  assert.ok(r.errors.some((e) => /could not parse/.test(e.message)));
  assert.equal(run({}, [{ name: 'alice', status: 'added', data: deploy('alice') }]).mode, 'deploy');
  const mixed = run({}, [{ name: 'alice', status: 'added', data: deploy('alice') }, { name: 'al', status: 'added', data: cname('alice') }]);
  assert.equal(mixed.mode, 'mixed');
  assert.equal(run({}, []).mode, 'none');
  assert.equal(run({ s: deploy('alice') }, [{ name: 's', status: 'removed' }]).mode, 'deploy');
});

test('check-pr: report neutralizes mentions and HTML', () => {
  const report = renderReport({
    valid: false, mode: 'records', errors: [{ name: 'x', message: 'ping @someone <img src=x>' }], warnings: [],
    changes: [{ name: 'x', status: 'added', data: cname('alice') }], author: 'alice', sha: 'abcdef1234567', zone: 'is-my.app',
  });
  assert.ok(report.startsWith(MARKER));
  assert.ok(!report.includes('@someone'));
  assert.ok(!report.includes('<img'));
  assert.match(report, /Validation failed/);
});

test('check-pr: domain files must be small regular files', () => {
  const blob = { type: 'blob', mode: '100644', size: 200 };
  assert.equal(entryProblem(blob), null);
  assert.equal(entryProblem({ ...blob, mode: '100755' }), null);
  assert.match(entryProblem({ ...blob, mode: '120000' }), /regular file/);
  assert.match(entryProblem({ type: 'commit', mode: '160000' }), /regular file/);
  assert.match(entryProblem({ ...blob, size: 100_000 }), /larger than/);
  assert.match(entryProblem(undefined), /not found/);
});

test('check-pr: accounts newer than the domain file are treated as reused usernames', () => {
  const lastChanged = '2026-03-01T00:00:00Z';
  assert.equal(isReclaimedName(Date.parse('2025-01-01T00:00:00Z'), lastChanged), false);
  assert.equal(isReclaimedName(Date.parse('2026-06-01T00:00:00Z'), lastChanged), true);
});

test('check-pr: report caps long lists and explains what happens next', () => {
  const errors = Array.from({ length: 40 }, (_, i) => ({ name: 'x', message: `unknown key "${'k'.repeat(500)}${i}"` }));
  const base = { mode: 'records', warnings: [], changes: [], author: 'alice', sha: 'abcdef1234567', zone: 'is-my.app' };
  const failed = renderReport({ ...base, valid: false, errors });
  assert.match(failed, /and 10 more/);
  assert.ok(failed.split('\n').every((l) => l.length < 400));
  assert.match(renderReport({ ...base, valid: true, errors: [], autoMerge: true }), /merges automatically/);
  assert.match(renderReport({ ...base, valid: true, errors: [], autoMerge: false }), /maintainer/);
  assert.match(renderReport({ ...base, mode: 'mixed', valid: true, errors: [], autoMerge: true }), /maintainer/);
});

test('build-index: contract', () => {
  const domains = map({
    b: { ...cname('bob'), description: 'Bob' },
    a: deploy('alice'),
    ip: { owner: { github: 'carol', email: 'secret@example.com' }, records: { A: ['1.1.1.1'], TXT: 'x' } },
    mx: { owner: { github: 'dave' }, records: { MX: [{ target: 'mx.example.com', priority: 1 }] } },
    bad: { owner: { github: 'eve' }, records: { A: ['10.0.0.1'] } },
  });
  const index = buildIndex(domains, config, ['www', 'api'], new Date('2026-01-01T00:00:00Z'));
  assert.deepEqual(index, {
    generated: '2026-01-01T00:00:00.000Z',
    zone: 'is-my.app',
    repo: 'jn-aman/is-my.app',
    reserved: ['api', 'www'],
    limits: { maxDomainsPerUser: 2, maxRecordsPerUser: 50 },
    domains: [
      { name: 'a', owner: 'alice', description: '', kind: 'deploy', target: 'alice/site' },
      { name: 'b', owner: 'bob', description: 'Bob', kind: 'CNAME', target: 'example.com' },
      { name: 'ip', owner: 'carol', description: '', kind: 'A', target: '1.1.1.1' },
      { name: 'mx', owner: 'dave', description: '', kind: 'MX', target: 'mx.example.com' },
    ],
  });
  assert.ok(!JSON.stringify(index).includes('secret@'));
});

test('the repository itself is valid', async () => {
  const { validateAll } = await import('../scripts/lib/domains.mjs');
  const { config: c, reserved: r, domains, loadErrors } = loadRepo();
  assert.deepEqual(loadErrors, []);
  assert.deepEqual(validateAll(domains, c, r).errors, []);
});
