import { trackEvent } from './analytics.js'

const REPO = 'jn-aman/is-my.app'
const LABEL = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/
const GH_USER = /^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i
const HOST_LABEL = /^_?[a-z0-9]([a-z0-9-]*[a-z0-9])?$/i
const TLD = /^[a-z]([a-z0-9-]*[a-z0-9])?$/i
const IPV4_OCTET = '(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)'
const IPV4 = new RegExp(`^${IPV4_OCTET}(?:\\.${IPV4_OCTET}){3}$`)
const REPO_RE = /^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}\/[\w.-]{1,100}$/i
const REL_PATH_RE = /^[\w.\/@+-]+$/
const PRINTABLE = /^[^\x00-\x1f\x7f]*$/

const esc = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c])

const V4_BLOCKED = [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16],
  ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.88.99.0', 24], ['192.168.0.0', 16],
  ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
]
const V6_BLOCKED = [['2001::', 23], ['2001:db8::', 32], ['2002::', 16], ['3fff::', 20]]

function ipv4Integer(ip) {
  return ip.split('.').reduce((value, octet) => value * 256 + Number(octet), 0)
}

export function isPublicIPv4(ip) {
  if (!IPV4.test(ip)) return false
  return !V4_BLOCKED.some(([base, bits]) => isInIPv4Range(ip, base, bits))
}

function isInIPv4Range(ip, base, bits) {
  const size = 2 ** (32 - bits)
  return Math.floor(ipv4Integer(ip) / size) === Math.floor(ipv4Integer(base) / size)
}

function ipv6Value(input) {
  if (typeof input !== 'string' || input.includes('%')) return null
  let address = input.toLowerCase()
  const embeddedV4 = address.match(/(\d+\.\d+\.\d+\.\d+)$/)
  if (embeddedV4) {
    if (!IPV4.test(embeddedV4[1])) return null
    const value = ipv4Integer(embeddedV4[1])
    address = `${address.slice(0, -embeddedV4[1].length)}${(value >>> 16).toString(16)}:${(value & 0xffff).toString(16)}`
  } else if (address.includes('.')) {
    return null
  }

  if ((address.match(/::/g) || []).length > 1) return null
  let groups
  if (address.includes('::')) {
    const [left, right] = address.split('::')
    const head = left ? left.split(':') : []
    const tail = right ? right.split(':') : []
    const zeros = 8 - head.length - tail.length
    if (zeros < 1) return null
    groups = [...head, ...Array(zeros).fill('0'), ...tail]
  } else {
    groups = address.split(':')
    if (groups.length !== 8) return null
  }
  if (groups.length !== 8 || groups.some((group) => !/^[\da-f]{1,4}$/i.test(group))) return null
  return groups.reduce((value, group) => (value << 16n) | BigInt(`0x${group}`), 0n)
}

function isInIPv6Range(value, base, bits) {
  const baseValue = ipv6Value(base)
  const shift = 128n - BigInt(bits)
  return baseValue !== null && value >> shift === baseValue >> shift
}

export function isPublicIPv6(ip) {
  const value = ipv6Value(ip)
  return value !== null &&
    value >> 125n === ipv6Value('2000::') >> 125n &&
    !V6_BLOCKED.some(([base, bits]) => isInIPv6Range(value, base, bits))
}

export function isHostname(host) {
  const normalized = host.endsWith('.') ? host.slice(0, -1) : host
  const labels = normalized.split('.')
  return normalized.length <= 253 &&
    labels.length >= 2 &&
    labels.every((label) => label.length <= 63 && HOST_LABEL.test(label)) &&
    TLD.test(labels.at(-1))
}

export function isRelPath(path) {
  return typeof path === 'string' && path.length > 0 && path.length <= 200 &&
    REL_PATH_RE.test(path) && !path.startsWith('/') && !path.startsWith('-') && !path.split('/').includes('..')
}

export function isValidDeployRepo(repo) {
  return REPO_RE.test(repo) && !/\/\.\.?$/.test(repo)
}

export function isValidBuildCommand(command) {
  return command.length <= 500 && PRINTABLE.test(command)
}

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
    if (!t) return false
    const values = t.split(/[\s,]+/).filter(Boolean)
    if (!values.length) return false
    if (values.length > 10 || new Set(values).size !== values.length) return false
    if (type === 'CNAME') return isHostname(t) && !/(^|\.)is-my\.app\.?$/i.test(t)
    if (type === 'A') return values.every(isPublicIPv4)
    return values.every(isPublicIPv6)
  }

  function deployValid() {
    const repo = normalizeRepo(els.repo.value)
    const build = els.build.value.trim()
    const output = els.output.value.trim()
    if (!isValidDeployRepo(repo)) return false
    if (build && !isValidBuildCommand(build)) return false
    if (output && output !== '.' && !isRelPath(output)) return false
    return true
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
    const registryReady = !registry.error
    if (!registryReady) {
      els.status.dataset.state = 'idle'
      els.status.textContent = 'Could not check availability. Please reload and try again.'
    } else {
      els.status.dataset.state = state
      els.status.textContent = msg
    }
    names.forEach((el) => (el.textContent = n || 'your-app-name'))

    const json = build()
    els.out.innerHTML = highlight(json)

    const ghOk = GH_USER.test(els.github.value.trim())
    const modeOk = mode === 'records' ? targetValid() : deployValid()
    const ready = registryReady && state === 'ok' && ghOk && modeOk
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
    trackEvent('Claim record type changed', { recordType: els.rtype.value })
    update()
  })

  els.seg.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-mode]')
    if (!btn) return
    mode = btn.dataset.mode
    els.seg.dataset.mode = mode
    els.seg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-selected', String(b === btn)))
    root.querySelectorAll('[data-panel]').forEach((p) => (p.hidden = p.dataset.panel !== mode))
    trackEvent('Claim mode changed', { mode })
    update()
  })

  els.copy.addEventListener('click', async () => {
    const label = els.copy.querySelector('span')
    try {
      await navigator.clipboard.writeText(build())
      label.textContent = 'Copied'
      trackEvent('Claim JSON copied', { mode })
    } catch {
      label.textContent = 'Copy failed'
      trackEvent('Claim JSON copy failed', { mode })
    }
    setTimeout(() => (label.textContent = 'Copy JSON'), 1600)
  })

  els.pr.addEventListener('click', (event) => {
    if (els.pr.classList.contains('is-disabled')) {
      event.preventDefault()
      return
    }
    trackEvent('Pull request form opened', { mode, name: els.name.value.trim() || 'your-app-name' })
  })

  root.addEventListener('change', (event) => {
    const target = event.target
    if (!(target instanceof HTMLElement)) return
    const id = target.id
    if (id && id !== 'rtype') trackEvent('Claim form field updated', { field: id, mode })
  })
  root.addEventListener('input', update)
  root.addEventListener('submit', (e) => e.preventDefault())
  update()
}
