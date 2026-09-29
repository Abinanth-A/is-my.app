// Write web/public/domains.json, the public index used by the website.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadRepo, validateAll, ROOT } from './lib/domains.mjs';
import { isMain } from './lib/gha.mjs';

const KIND_ORDER = ['CNAME', 'A', 'AAAA', 'MX', 'TXT'];

function describe(data) {
  if (data.deploy) return { kind: 'deploy', target: data.deploy.repo };
  const r = data.records;
  const kind = KIND_ORDER.find((t) => t in r);
  const first = [r[kind]].flat()[0];
  return { kind, target: kind === 'MX' && typeof first === 'object' ? first.target : first };
}

export function buildIndex(domains, config, reserved, now = new Date()) {
  const { valid } = validateAll(domains, config, reserved);
  return {
    generated: now.toISOString(),
    zone: config.zone,
    repo: config.repo,
    reserved: [...reserved].sort(),
    limits: { maxDomainsPerUser: config.maxDomainsPerUser },
    domains: [...domains]
      .filter(([name]) => valid.has(name))
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, data]) => ({ name, owner: data.owner.github, description: data.description ?? '', ...describe(data) })),
  };
}

if (isMain(import.meta.url)) {
  const { config, reserved, domains } = loadRepo();
  const index = buildIndex(domains, config, reserved);
  const dir = join(ROOT, 'web', 'public');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'domains.json'), `${JSON.stringify(index, null, 2)}\n`);
  console.log(`Wrote web/public/domains.json (${index.domains.length} domains)`);
}
