// Validate every file in domains/. Exits 1 on any error.
import { relative, join } from 'node:path';
import { loadRepo, validateAll, ROOT } from './lib/domains.mjs';
import { annotate } from './lib/gha.mjs';

const { config, reserved, domains, loadErrors } = loadRepo();
const { errors, warnings } = validateAll(domains, config, reserved);
const fileOf = (name) => join('domains', `${name}.json`);

for (const e of loadErrors) annotate('error', e.message, relative(ROOT, e.file));
for (const e of errors) annotate('error', e.message, fileOf(e.name));
for (const w of warnings) annotate('warning', w.message, fileOf(w.name));

const total = loadErrors.length + errors.length;
console.log(`${domains.size} domain file(s) checked: ${total} error(s), ${warnings.length} warning(s)`);
process.exit(total ? 1 : 0);
