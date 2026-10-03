import { trackEvent } from './analytics.js'

const esc = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

export async function loadRegistry() {
  try {
    const res = await fetch('/domains.json', { cache: 'no-cache' })
    if (!res.ok) throw new Error(res.statusText)
    const data = await res.json()
    return { reserved: data.reserved || [], domains: data.domains || [], zone: data.zone || 'is-my.app', error: false }
  } catch (err) {
    trackEvent('Registry load failed', { reason: err instanceof Error ? err.message : 'unknown error' })
    return { reserved: [], domains: [], zone: 'is-my.app', error: true }
  }
}

function entry(d) {
  const isDeploy = d.kind === 'deploy'
  // only single-label names are browsable sites; nested ones are usually verification records
  const browsable = !d.name.includes('.') && ['CNAME', 'A', 'AAAA', 'deploy'].includes(d.kind)
  const tag = browsable ? 'a' : 'div'
  const href = browsable ? ` href="https://${esc(d.name)}.is-my.app" target="_blank" rel="noopener"` : ''
  return `<li><${tag} class="entry"${href}>
    <img src="https://github.com/${esc(d.owner)}.png?size=88" alt="" loading="lazy" width="44" height="44" />
    <div>
      <div class="entry__name">${esc(d.name)}<span>.is-my.app</span></div>
      <div class="entry__meta"><span class="badge${isDeploy ? ' badge--deploy' : ''}">${isDeploy ? 'HOSTED' : esc(d.kind)}</span><em>${esc(d.description || d.target || '')}</em><span class="entry__owner">@${esc(d.owner)}</span></div>
    </div>
  </${tag}></li>`
}

const ghost = (label) => `<li><div class="entry entry--ghost"><span class="entry__avatar">+</span><div><div class="entry__name">${label}<span>.is-my.app</span></div><div class="entry__meta">unclaimed, could be your app</div></div></div></li>`

export function renderRegistry(section, registry) {
  const grid = section.querySelector('[data-registry-grid]')
  const count = section.querySelector('[data-registry-count]')
  const search = section.querySelector('[data-registry-search]')
  const all = registry.domains

  count.dataset.target = String(all.length)
  count.textContent = String(all.length).padStart(2, '0')

  function draw(q = '') {
    const needle = q.trim().toLowerCase()
    const list = needle
      ? all.filter((d) => [d.name, d.owner, d.target, d.description].some((v) => v && String(v).toLowerCase().includes(needle)))
      : all
    let html = list.map(entry).join('')
    if (!needle) html += ['your-app-name', 'your-next-idea', 'your-game'].map(ghost).join('')
    if (needle && !list.length) html = `<li class="registry__empty">Nothing matches "${esc(q)}". Which means that name might be free.</li>`
    grid.innerHTML = html
    return list.length
  }

  let searchTimer
  search.addEventListener('input', () => {
    const resultCount = draw(search.value)
    clearTimeout(searchTimer)
    const query = search.value.trim()
    searchTimer = setTimeout(() => {
      trackEvent('Registry search completed', {
        queryLength: query.length,
        resultCount,
        cleared: query.length === 0,
      })
    }, 400)
  })

  grid.addEventListener('click', (event) => {
    const target = event.target
    if (!(target instanceof Element)) return
    const link = target.closest('a.entry')
    if (!link || !grid.contains(link)) return
    const name = link.querySelector('.entry__name')?.firstChild?.textContent?.trim()
    if (name) trackEvent('Registry app opened', { name })
  })

  draw()
}

export function fillMarquees(registry) {
  const real = registry.domains.filter((d) => !d.name.includes('.')).map((d) => d.name)
  const invites = ['your-app-name', 'your-side-project', 'your-game', 'your-hackathon-build', 'your-weekend-app', 'your-tool']
  const words = [...real, ...invites]
  document.querySelectorAll('[data-marquee]').forEach((track, i) => {
    const list = i % 2 ? [...words].reverse() : words
    const chunk = list.map((w) => `<span class="marquee__item">${esc(w)}<b>.is-my.app</b><i class="marquee__star"></i></span>`).join('')
    // two copies so the loop can wrap seamlessly at -50%
    track.innerHTML = chunk + chunk
  })
}
