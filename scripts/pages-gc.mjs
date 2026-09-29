// Delete Pages projects with the configured prefix that no longer match a deploy entry.
// Logs only unless GC_CONFIRM=1. Projects without the prefix are never touched.
import { loadRepo, validateAll, deployEntries } from './lib/domains.mjs';
import * as cf from './lib/cloudflare.mjs';

const { config, reserved, domains, loadErrors } = loadRepo();
if (loadErrors.length || validateAll(domains, config, reserved).errors.length) {
  console.error('Refusing to garbage-collect while domains/ has validation errors.');
  process.exit(1);
}

const wanted = new Set(deployEntries(domains, config).map((d) => d.project));
const ours = (await cf.listPagesProjects())
  .map((p) => p.name)
  .filter((n) => n.startsWith(config.pagesPrefix) && n !== config.sitePagesProject);
const orphans = ours.filter((n) => !wanted.has(n));

// Same guard as sync-dns: a bug or an emptied domains/ folder must not wipe every hosted app.
if (orphans.length > 3 && orphans.length > ours.length * 0.25 && process.env.GC_ALLOW_MASS_DELETE !== '1') {
  console.error(`Would delete ${orphans.length} of ${ours.length} projects. Set GC_ALLOW_MASS_DELETE=1 to proceed.`);
  process.exit(1);
}

console.log(orphans.length ? `Orphaned projects:\n  ${orphans.join('\n  ')}` : 'No orphaned projects.');
if (orphans.length && process.env.GC_CONFIRM !== '1') {
  console.log('Set GC_CONFIRM=1 to delete them.');
  process.exit(0);
}

let failed = 0;
for (const name of orphans) {
  try {
    await cf.deletePagesProject(name);
    console.log(`Deleted ${name}${cf.DRY_RUN ? ' (dry run)' : ''}`);
  } catch (e) {
    failed++;
    console.error(`Failed to delete ${name}: ${e.message}`);
  }
}
process.exit(failed ? 1 : 0);
