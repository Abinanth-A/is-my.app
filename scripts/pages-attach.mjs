// Ensure a Pages project exists, has <hostname> as a custom domain, and that DNS points
// <hostname> at the project with a proxied CNAME. Idempotent.
// Usage: node scripts/pages-attach.mjs <project> <hostname> [--comment is-my.app:managed|is-my.app:site] [--force]
import { parseArgs } from 'node:util';
import { loadRepo, MANAGED, SITE } from './lib/domains.mjs';
import * as cf from './lib/cloudflare.mjs';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { comment: { type: 'string', default: MANAGED }, force: { type: 'boolean', default: false } },
});
const [project, rawHost] = positionals;
if (!project || !rawHost || ![MANAGED, SITE].includes(values.comment)) {
  console.error('usage: pages-attach.mjs <project> <hostname> [--comment is-my.app:managed|is-my.app:site] [--force]');
  process.exit(2);
}
const hostname = rawHost.toLowerCase();
const { config } = loadRepo();
if (hostname !== config.zone && !hostname.endsWith(`.${config.zone}`)) {
  console.error(`${hostname} is not inside ${config.zone}`);
  process.exit(2);
}

let p = await cf.getPagesProject(project);
if (!p) {
  console.log(`Creating Pages project ${project}`);
  p = await cf.createPagesProject(project, 'main');
}
const target = p.subdomain ?? `${project}.pages.dev`;

const domains = await cf.listPagesDomains(project).catch((e) => (cf.DRY_RUN ? [] : Promise.reject(e)));
if (!domains.some((d) => d.name === hostname)) {
  console.log(`Adding custom domain ${hostname} to ${project}`);
  await cf.addPagesDomain(project, hostname);
}

// A/AAAA/CNAME at the hostname conflict with our CNAME; other types (MX, TXT) are left alone.
const zoneId = await cf.getZoneId(config.zone);
const atHost = (await cf.listDnsRecords(zoneId, { name: hostname })).filter(
  (r) => r.name === hostname && ['A', 'AAAA', 'CNAME'].includes(r.type),
);
const ours = (r) => r.comment?.startsWith(values.comment);
const foreign = atHost.filter((r) => !ours(r));
if (foreign.length && !values.force) {
  console.error(`Refusing to touch records at ${hostname} not tagged "${values.comment}":`);
  for (const r of foreign) console.error(`  ${r.type} ${r.content} (comment: ${r.comment ?? 'none'})`);
  console.error('Remove them, or re-run with --force to replace them.');
  process.exit(1);
}

const want = { type: 'CNAME', name: hostname, content: target, proxied: true, ttl: 1, comment: values.comment };
const same = (r) => r.type === 'CNAME' && r.content === target && r.proxied && r.comment === values.comment;
const keep = atHost.find(same) ?? atHost.find((r) => r.type === 'CNAME');
for (const r of atHost) if (r !== keep) {
  console.log(`Deleting ${r.type} ${r.name} -> ${r.content}`);
  await cf.deleteDnsRecord(zoneId, r.id);
}
if (!keep) {
  console.log(`Creating CNAME ${hostname} -> ${target}`);
  await cf.createDnsRecord(zoneId, want);
} else if (!same(keep)) {
  console.log(`Updating CNAME ${hostname} -> ${target}`);
  await cf.updateDnsRecord(zoneId, keep.id, want);
} else {
  console.log(`DNS already correct: ${hostname} -> ${target}`);
}
