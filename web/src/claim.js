const REPO = 'jn-aman/is-my.app'
const LABEL = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/
const GH_USER = /^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i
const HOST = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}\.?$/i
const IPV4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/
const REPO_RE = /^[a-z\d](?:[a-z\d-]{0,38})\/[\w.-]{1,100}$/i

const esc = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c])

// Tiny JSON highlighter for the preview pane.
export function highlight(json) {
  return esc(json).replace(
    /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?)|([{}\[\],])/g,
    (m, str, colon, bool, num, punct) => {
      if (str) return colon ? `<span class="j-k">${str}</span><span class="j-p">${colon}</span>` : `<span class="j-s">${str}</span>`
      if (bool) return `<span class="j-b">${bool}</span>`
      if (num) return `<span class="j-n">${num}</span>`
      return `<span class="j-p">${punct}</span>`
    },
  )
}

function normalizeRepo(v) {
  return v.trim().replace(/^https?:\/\/(www\.)?github\.com\//i, '').replace(/\.git$/i, '').replace(/\/+$/, '')
}

export function initClaim(root, registry) {
  const $ = (s) => {
    if (typeof s !== 'string') return null
    const selector = s.trim()
    if (!selector) return null
    try {
      return root.querySelector(selector) ?? document.querySelector(selector)
    } catch {
      return null
    }
  }
  const els = {
    name: $('#name'), status: $('#name-status'), github: $('#github'), rtype: $('#rtype'), target: $('#target'),
    targetLabel: $('#target-label'), repo: $('#repo'), build: $('#build'), output: $('#output'), desc: $('#desc'),
    out: $('#json-out'), pr: $('#pr-link'), copy: $('#copy'), seg: $('.seg'),
  }
  const names = root.ownerDocument.querySelectorAll('[data-name]')
  const taken = new Map(registry.domains.map((d) => [d.name, d.owner]))
  const reserved = new Set(registry.reserved)
  let mode = 'records'

  function nameState(n) {
    if (!n) return ['idle', 'Type your app name to check it']
    if (!LABEL.test(n)) return ['bad', 'Letters, numbers and hyphens only. No leading or trailing hyphen.']
    if (reserved.has(n)) return ['reserved', `${n} is reserved`]
    if (taken.has(n)) return ['taken', `Taken by @${taken.get(n)}`]
    return ['ok', `${n}.is-my.app is available`]
  }

  function targetValid() {
    const t = els.target.value.trim()
    const type = els.rtype.value
    if (type === 'CNAME') return HOST.test(t) && !/(^|\.)is-my\.app\.?$/i.test(t)
    if (type === 'A') return t.split(/[\s,]+/).filter(Boolean).every((ip) => IPV4.test(ip))
    return t.split(/[\s,]+/).filter(Boolean).every((ip) => ip.includes(':') && /^[\da-f:]+$/i.test(ip))
  }

  function build() {
    const doc = { owner: { github: els.github.value.trim() || 'your-github-username' } }
    const desc = els.desc.value.trim()
    if (desc) doc.description = desc
    if (mode === 'records') {
      const type = els.rtype.value
      const t = els.target.value.trim()
      const fallback = { CNAME: 'you.github.io', A: '203.0.113.10', AAAA: '2001:db8::1' }[type]
      doc.records = type === 'CNAME'
        ? { CNAME: (t || fallback).replace(/\.$/, '') }
        : { [type]: (t || fallback).split(/[\s,]+/).filter(Boolean) }
    } else {
      const deploy = { repo: normalizeRepo(els.repo.value) || 'you/your-app' }
      const b = els.build.value.trim()
      const o = els.output.value.trim()
      if (b) deploy.build = b
      if (o && o !== '.') deploy.output = o
      doc.deploy = deploy
    }
    return JSON.stringify(doc, null, 2) + '\n'
  }

  function update() {
    const n = els.name.value.trim().toLowerCase()
    if (n !== els.name.value) els.name.value = n
    const [state, msg] = nameState(n)
    els.status.dataset.state = state
    els.status.textContent = msg
    names.forEach((el) => (el.textContent = n || 'your-app-name'))

    const json = build()
    els.out.innerHTML = highlight(json)

    const ghOk = GH_USER.test(els.github.value.trim())
    const modeOk = mode === 'records' ? targetValid() : REPO_RE.test(normalizeRepo(els.repo.value))
    const ready = state === 'ok' && ghOk && modeOk
    els.pr.classList.toggle('is-disabled', !ready)
    els.pr.setAttribute('aria-disabled', String(!ready))
    els.pr.href = ready
      ? `https://github.com/${REPO}/new/main/domains?filename=${encodeURIComponent(n + '.json')}&value=${encodeURIComponent(json)}`
      : '#'
  }

  els.rtype.addEventListener('change', () => {
    const ph = { CNAME: 'you.github.io', A: '203.0.113.10, 203.0.113.11', AAAA: '2001:db8::1' }
    els.target.placeholder = ph[els.rtype.value]
    els.targetLabel.textContent = els.rtype.value === 'CNAME' ? 'Points to' : 'IP addresses'
    update()
  })

  els.seg.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-mode]')
    if (!btn) return
    mode = btn.dataset.mode
    els.seg.dataset.mode = mode
    els.seg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-selected', String(b === btn)))
    root.querySelectorAll('[data-panel]').forEach((p) => (p.hidden = p.dataset.panel !== mode))
    update()
  })

  els.copy.addEventListener('click', async () => {
    const label = els.copy.querySelector('span')
    try {
      await navigator.clipboard.writeText(build())
      label.textContent = 'Copied'
    } catch {
      label.textContent = 'Copy failed'
    }
    setTimeout(() => (label.textContent = 'Copy JSON'), 1600)
  })

  root.addEventListener('input', update)
  root.addEventListener('submit', (e) => e.preventDefault())
  update()
}
