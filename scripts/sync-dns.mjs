// Reconcile Cloudflare DNS with domains/. Only records whose comment starts with
// "is-my.app:managed" are ever changed. DRY_RUN=1 prints the plan without applying it.
import { loadRepo, validateAll, desiredRecords, deployEntries, planDnsChanges, isManaged } from './lib/domains.mjs';
import * as cf from './lib/cloudflare.mjs';
import { annotate, appendSummary } from './lib/gha.mjs';

const { config, reserved, domains, loadErrors } = loadRepo();
const { errors } = validateAll(domains, config, reserved);
if (loadErrors.length || errors.length) {
  for (const e of [...loadErrors, ...errors]) annotate('error', `${e.name ?? e.file}: ${e.message}`);
  console.error('Refusing to sync DNS while domains/ has validation errors.');
  process.exit(1);
}

const zoneId = await cf.getZoneId(config.zone);
const [existing, projects] = await Promise.all([cf.listDnsRecords(zoneId), cf.listPagesProjects()]);
const subdomains = new Map(projects.map((p) => [p.name, p.subdomain]));
const deploys = deployEntries(domains, config);
const projectOf = new Map(deploys.map((d) => [d.name, d.project]));

const desired = desiredRecords(domains, config, (name) => subdomains.get(projectOf.get(name)) ?? null);
const pending = deploys.filter((d) => !subdomains.has(d.project)).map((d) => `${d.name}.${config.zone}`);
const plan = planDnsChanges(existing, desired, { protect: pending });

// Guard against wiping the zone because of a bug or an accidentally emptied domains/ folder.
const managedCount = existing.filter(isManaged).length;
if (plan.delete.length > 10 && plan.delete.length > managedCount * 0.25 && process.env.SYNC_ALLOW_MASS_DELETE !== '1') {
  console.error(`Plan deletes ${plan.delete.length} of ${managedCount} managed records. Set SYNC_ALLOW_MASS_DELETE=1 to proceed.`);
  process.exit(1);
}

const show = (r) => `${r.type.padEnd(5)} ${r.name} -> ${r.content}${r.priority !== undefined ? ` (prio ${r.priority})` : ''}${r.proxied ? ' [proxied]' : ''}`;
const rows = [
  ...plan.delete.map((r) => `- delete  ${show(r)}`),
  ...plan.update.map((u) => `~ update  ${show(u.before)}  =>  ${show(u.after)}`),
  ...plan.create.map((r) => `+ create  ${show(r)}`),
];
for (const w of plan.warnings) annotate('warning', w);
if (pending.length) console.log(`Waiting for Pages projects (records kept as-is): ${pending.join(', ')}`);
console.log(`DNS plan${cf.DRY_RUN ? ' (dry run)' : ''}: ${plan.create.length} create, ${plan.update.length} update, ${plan.delete.length} delete, ${desired.length} desired, ${managedCount} managed`);
console.log(rows.length ? rows.join('\n') : 'No changes.');
appendSummary(`### DNS sync${cf.DRY_RUN ? ' (dry run)' : ''}\n\n\`\`\`\n${rows.join('\n') || 'No changes.'}\n\`\`\``);

let failed = 0;
const run = async (label, fn) => {
  try {
    await fn();
  } catch (e) {
    failed++;
    annotate('error', `${label}: ${e.message}`);
  }
};
// Deletes first so a type change (e.g. A -> CNAME) never collides.
for (const r of plan.delete) await run(`delete ${r.type} ${r.name}`, () => cf.deleteDnsRecord(zoneId, r.id));
for (const u of plan.update) await run(`update ${u.after.type} ${u.after.name}`, () => cf.updateDnsRecord(zoneId, u.id, u.after));
for (const r of plan.create) await run(`create ${r.type} ${r.name}`, () => cf.createDnsRecord(zoneId, r));

if (failed) {
  console.error(`${failed} DNS change(s) failed.`);
  process.exit(1);
}
