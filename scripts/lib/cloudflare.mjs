// Minimal Cloudflare API client. DRY_RUN=1 logs mutations instead of performing them.
const API = 'https://api.cloudflare.com/client/v4';
export const DRY_RUN = ['1', 'true'].includes(process.env.DRY_RUN ?? '');

export class CloudflareError extends Error {
  constructor(method, path, status, errors) {
    const detail = (errors ?? []).map((e) => `${e.code ? `[${e.code}] ` : ''}${e.message}`).join('; ') || 'no error details';
    super(`Cloudflare ${method} ${path} failed (HTTP ${status}): ${detail}`);
    Object.assign(this, { status, errors: errors ?? [] });
  }
}

function env(name) {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set`);
  return v;
}

const account = () => `/accounts/${env('CLOUDFLARE_ACCOUNT_ID')}`;
const enc = encodeURIComponent;

export async function request(method, path, { query, body } = {}) {
  const url = new URL(API + path);
  for (const [k, v] of Object.entries(query ?? {})) if (v !== undefined) url.searchParams.set(k, v);
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${env('CLOUDFLARE_API_TOKEN')}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if ((res.status === 429 || res.status >= 500) && attempt < 4) {
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
      continue;
    }
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.success) throw new CloudflareError(method, path, res.status, json?.errors);
    return json;
  }
}

async function mutate(method, path, body) {
  if (DRY_RUN) {
    console.log(`[dry-run] ${method} ${path}${body === undefined ? '' : ` ${JSON.stringify(body)}`}`);
    return { id: 'dry-run', dryRun: true, ...body };
  }
  return (await request(method, path, { body })).result;
}

async function paginate(path, query = {}, perPage = 100) {
  const out = [];
  for (let page = 1; ; page++) {
    const { result, result_info: info } = await request('GET', path, { query: { ...query, page, per_page: perPage } });
    out.push(...result);
    const pages = info?.total_pages ?? Math.ceil((info?.total_count ?? 0) / (info?.per_page || perPage));
    if (!result.length || !info || page >= pages) return out;
  }
}

async function getOrNull(path) {
  try {
    return (await request('GET', path)).result;
  } catch (e) {
    if (e instanceof CloudflareError && e.status === 404) return null;
    throw e;
  }
}

// ---------- DNS ----------

export async function getZoneId(name) {
  const { result } = await request('GET', '/zones', { query: { name } });
  if (!result?.length) throw new Error(`zone ${name} not found (check the API token's zone permissions)`);
  return result[0].id;
}

export const listDnsRecords = (zoneId, query = {}) => paginate(`/zones/${zoneId}/dns_records`, query, 500);

const recordBody = ({ type, name, content, proxied, priority, ttl = 1, comment }) =>
  ({ type, name, content, proxied: Boolean(proxied), ttl, comment, ...(priority !== undefined && { priority }) });

export const createDnsRecord = (zoneId, record) => mutate('POST', `/zones/${zoneId}/dns_records`, recordBody(record));
export const updateDnsRecord = (zoneId, id, record) => mutate('PUT', `/zones/${zoneId}/dns_records/${id}`, recordBody(record));
export const deleteDnsRecord = (zoneId, id) => mutate('DELETE', `/zones/${zoneId}/dns_records/${id}`);

// ---------- Pages ----------

const pages = (p = '') => `${account()}/pages/projects${p}`;

export const listPagesProjects = () => paginate(pages(), {}, 10);
export const getPagesProject = (name) => getOrNull(pages(`/${enc(name)}`));
export const createPagesProject = (name, productionBranch = 'main') =>
  mutate('POST', pages(), { name, production_branch: productionBranch });
export const listPagesDomains = async (project) => (await request('GET', pages(`/${enc(project)}/domains`))).result;
export const addPagesDomain = (project, hostname) => mutate('POST', pages(`/${enc(project)}/domains`), { name: hostname });
export const deletePagesDomain = (project, hostname) => mutate('DELETE', pages(`/${enc(project)}/domains/${enc(hostname)}`));
export const listDeployments = (project) => paginate(pages(`/${enc(project)}/deployments`), {}, 25);
export const deleteDeployment = (project, id) => mutate('DELETE', `${pages(`/${enc(project)}/deployments/${enc(id)}`)}?force=true`);

export async function deletePagesProject(name) {
  for (const d of await listPagesDomains(name)) await deletePagesDomain(name, d.name);
  try {
    return await mutate('DELETE', pages(`/${enc(name)}`));
  } catch (e) {
    // Projects with many deployments cannot be deleted directly; remove deployments first.
    console.warn(`direct delete of ${name} failed (${e.message}); deleting deployments first`);
    for (const d of await listDeployments(name)) await deleteDeployment(name, d.id).catch((err) => console.warn(err.message));
    return mutate('DELETE', pages(`/${enc(name)}`));
  }
}

// Latest production deployment of a project (null if none or project missing).
export async function latestDeployment(project) {
  const p = typeof project === 'string' ? await getPagesProject(project) : project;
  return p?.canonical_deployment ?? p?.latest_deployment ?? null;
}

export const deploymentCommit = (deployment) => deployment?.deployment_trigger?.metadata?.commit_hash ?? null;
