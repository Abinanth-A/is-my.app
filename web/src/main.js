import '@fontsource-variable/bricolage-grotesque/standard.css'
import '@fontsource/instrument-serif/400.css'
import '@fontsource/instrument-serif/400-italic.css'
import '@fontsource-variable/jetbrains-mono'
import './styles/main.css'

import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { SplitText } from 'gsap/SplitText'
import Lenis from 'lenis'
import { initClaim } from './claim.js'
import { loadRegistry, renderRegistry, fillMarquees } from './registry.js'
import { initRecipes } from './recipes.js'

gsap.registerPlugin(ScrollTrigger, SplitText)

const mq = (q) => window.matchMedia(q).matches
const reduced = mq('(prefers-reduced-motion: reduce)')
const coarse = mq('(pointer: coarse)')
const lowPower = coarse || (navigator.hardwareConcurrency || 8) <= 4
const html = document.documentElement
html.classList.toggle('reduced', reduced)
document.body.classList.add('is-loading')

/* ---------------- WebGL ---------------- */
let gl = null
async function initGL() {
  const canvas = document.querySelector('.gl')
  try {
    const { createScene } = await import('./gl/scene.js')
    gl = createScene(canvas, { lowPower, reduced })
  } catch (err) {
    console.warn('WebGL unavailable, using CSS backdrop', err)
    canvas.style.background = 'radial-gradient(60% 50% at 50% 45%, rgba(198,255,61,.18), transparent 70%)'
  }
}

/* ---------------- smooth scroll ---------------- */
let lenis = null
function initScroll() {
  if (reduced) return
  lenis = new Lenis({ lerp: 0.085, wheelMultiplier: 1, smoothWheel: true })
  lenis.on('scroll', ScrollTrigger.update)
  gsap.ticker.add((t) => lenis.raf(t * 1000))
  gsap.ticker.lagSmoothing(0)
  lenis.stop()
  document.querySelectorAll('a[href^="#"]').forEach((a) => {
    a.addEventListener('click', (e) => {
      const id = a.getAttribute('href')
      if (id.length < 2 && id !== '#') return
      const target = id === '#top' || id === '#' ? 0 : document.querySelector(id)
      if (target === null) return
      e.preventDefault()
      lenis.scrollTo(target, { offset: id === '#claim' ? -40 : 0, duration: 1.6 })
    })
  })
}

/* ---------------- nav hide on scroll ---------------- */
function initNav() {
  const nav = document.querySelector('.nav')
  let lastY = 0
  ScrollTrigger.create({
    start: 0, end: 'max',
    onUpdate: (self) => {
      const y = self.scroll()
      nav.classList.toggle('is-solid', y > 40)
      nav.classList.toggle('is-hidden', y > 400 && y > lastY)
      lastY = y
    },
  })
}

/* ---------------- text scramble ---------------- */
const GLYPHS = 'abcdefghijklmnopqrstuvwxyz0123456789'
function scrambleTo(el, word, duration = 0.9) {
  const from = el.textContent
  const len = Math.max(from.length, word.length)
  const queue = Array.from({ length: len }, (_, i) => ({
    to: word[i] || '', start: Math.random() * 0.35, end: 0.35 + Math.random() * 0.65,
  }))
  const obj = { p: 0 }
  return gsap.to(obj, {
    p: 1, duration, ease: 'none',
    onUpdate() {
      let out = ''
      for (const q of queue) {
        if (obj.p >= q.end) out += q.to
        else if (obj.p >= q.start) out += `<span class="sc">${GLYPHS[(Math.random() * GLYPHS.length) | 0]}</span>`
        else out += from[queue.indexOf(q)] || ''
      }
      el.innerHTML = out
    },
    onComplete() { el.textContent = word },
  })
}
// long app names like "your-app-name" shrink so the hero line never overflows
function fitWord(el, word, duration = 0.7) {
  const probe = el.cloneNode()
  probe.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap;font-size:1em'
  probe.textContent = word
  el.parentElement.appendChild(probe)
  const scale = Math.min(1, el.closest('h1').clientWidth / probe.offsetWidth)
  probe.remove()
  gsap.to(el, { fontSize: `${scale}em`, duration, ease: 'expo.out' })
}
function loopScramble(el) {
  const words = el.dataset.words.split(',')
  let i = 0
  const next = () => {
    i = (i + 1) % words.length
    fitWord(el, words[i])
    scrambleTo(el, words[i]).eventCallback('onComplete', () => {
      el.textContent = words[i]
      gsap.delayedCall(1.9, next)
    })
  }
  gsap.delayedCall(2.2, next)
}

/* ---------------- intro ---------------- */
// The loader starts at once and idles near 90% while the scene, fonts and registry load.
function loaderIn() {
  const num = document.querySelector('.loader__num')
  const counter = { v: 0 }
  return gsap.timeline({ defaults: { ease: 'expo.out' } })
    .to('.loader__brand span', { y: 0, duration: 0.8, stagger: 0.06 })
    .to(counter, { v: 90, duration: 1, ease: 'power2.out', onUpdate: () => (num.textContent = String(Math.round(counter.v)).padStart(3, '0')) }, 0)
    .to('.loader__line', { scaleX: 0.9, duration: 1, ease: 'power2.out' }, 0)
}

function intro(heroChars) {
  const tl = gsap.timeline({ defaults: { ease: 'expo.out' } })
  const loader = document.querySelector('.loader')
  if (!reduced) {
    const num = loader.querySelector('.loader__num')
    tl.call(() => (num.textContent = '100'))
      .to('.loader__line', { scaleX: 1, duration: 0.35, ease: 'power2.out' }, 0)
      .to('.loader__brand span', { y: '-110%', duration: 0.7, stagger: 0.04, ease: 'expo.in' }, 0.05)
      .to(loader, { clipPath: 'inset(0 0 100% 0)', duration: 1.1, ease: 'expo.inOut' }, 0.4)
      .set(loader, { display: 'none' })
  } else {
    loader.style.display = 'none'
  }
  const at = reduced ? 0 : 0.75
  tl.from('.hero__line--sub .scramble', { yPercent: 110, duration: 1.4 }, at)
    .from(heroChars, { yPercent: 115, rotate: 8, duration: 1.3, stagger: 0.035 }, at + 0.1)
    .from('.hero .reveal-up', { y: 30, autoAlpha: 0, duration: 1.1, stagger: 0.1 }, at + 0.4)
    // explicit end state, then hand transform back to CSS so .is-hidden works on scroll
    .fromTo('.nav', { yPercent: -120 }, { yPercent: 0, y: 0, duration: 1.1, clearProps: 'transform' }, at + 0.3)
    .from('.hero__scroll', { autoAlpha: 0, duration: 1 }, at + 0.9)
  if (gl) {
    gl.state.scale = reduced ? 1 : 0.2
    tl.to(gl.state, { scale: 1, duration: 2.4, ease: 'elastic.out(1, 0.55)' }, reduced ? 0 : at - 0.45)
  }
  tl.add(() => {
    document.body.classList.remove('is-loading')
    lenis?.start()
    ScrollTrigger.refresh()
  }, at + 0.2)
  // Reduced motion: same end state, no movement.
  if (reduced) tl.progress(1, false)
  return tl
}

/* ---------------- blob choreography ---------------- */
function choreograph() {
  if (!gl) return
  const s = gl.state
  const m = window.innerWidth < 800
  const X = (v) => (m ? v * 0.3 : v)
  const scenes = {
    hero: { x: 0, y: 0.1, amp: 0.26, freq: 1.0, hue: 0, spread: 0, dim: 1, rotY: 0 },
    how: { x: X(3.3), y: m ? 1.7 : 1.35, amp: 0.4, freq: 1.4, hue: 0.22, spread: 0.35, dim: 0.85, rotY: 1.4, scale: m ? 0.5 : 0.62 },
    modes: { x: 0, y: 0, amp: 0.22, freq: 1, hue: 0.48, spread: 0.12, dim: 0.35, rotY: 2.3, scale: 1.9 },
    recipes: { x: X(-3.1), y: 1.1, amp: 0.32, freq: 1.2, hue: 0.58, spread: 0.3, dim: 0.55, rotY: 2.8, scale: m ? 0.5 : 0.7 },
    statement: { x: 0, y: 0, amp: 0.48, freq: 0.8, hue: 0.7, spread: 1.3, dim: 0.5, rotY: 3.2, scale: 3.1 },
    docs: { x: X(3.2), y: 1.4, amp: 0.3, freq: 1.2, hue: 1.02, spread: 0.25, dim: 0.45, rotY: 4.5, scale: m ? 0.45 : 0.55 },
    claim: { x: X(2.5), y: m ? -1.8 : 0.3, amp: 0.3, freq: 1.4, hue: 0.92, spread: 0.2, dim: 0.9, rotY: 4, scale: m ? 0.55 : 0.85 },
    registry: { x: X(-2.9), y: 0.9, amp: 0.34, freq: 1.3, hue: 1.12, spread: 0.45, dim: 0.75, rotY: 5, scale: 0.6 },
    faq: { x: X(-2.4), y: -0.6, amp: 0.36, freq: 1.3, hue: 1.3, spread: 0.2, dim: 0.8, rotY: 5.8, scale: 0.7 },
  }
  // hero scale is owned by the intro tween
  let prev = { ...scenes.hero, scale: 1 }
  document.querySelectorAll('[data-scene]').forEach((sec) => {
    const target = scenes[sec.dataset.scene]
    if (!target || sec.dataset.scene === 'hero') return
    const to = { scale: 1, ...target }
    gsap.fromTo(s, { ...prev }, {
      ...to, ease: 'none', immediateRender: false,
      scrollTrigger: { trigger: sec, start: 'top bottom', end: sec.dataset.scene === 'how' ? 'top top' : 'top 25%', scrub: 1.4 },
    })
    prev = to
  })
  gsap.fromTo(s, { ...prev }, {
    x: 0, y: m ? -1.2 : -1.7, scale: m ? 0.9 : 1.15, amp: 0.3, hue: 1.5, spread: 0, dim: 1, rotY: 7, ease: 'none', immediateRender: false,
    scrollTrigger: { trigger: '.footer', start: 'top bottom', end: 'bottom bottom', scrub: 1.4 },
  })
}

/* ---------------- how: horizontal pinned rail ---------------- */
function initHow() {
  const section = document.querySelector('.how')
  const rail = section.querySelector('.how__rail')
  const steps = rail.querySelectorAll('.step')

  // typewriter: wrap every character of the JSON (preserving <k>/<s> markup)
  const code = section.querySelector('[data-typer]')
  const walker = document.createTreeWalker(code, NodeFilter.SHOW_TEXT)
  const nodes = []
  while (walker.nextNode()) nodes.push(walker.currentNode)
  nodes.forEach((n) => {
    const frag = document.createDocumentFragment()
    for (const ch of n.textContent) {
      const span = document.createElement('span')
      span.className = 'tc'
      span.textContent = ch
      frag.appendChild(span)
    }
    n.replaceWith(frag)
  })
  const caret = document.createElement('span')
  caret.className = 'typer-caret'
  code.appendChild(caret)
  const chars = code.querySelectorAll('.tc')

  const checks = section.querySelectorAll('.checks li')
  const merge = section.querySelector('.pr__merge')
  const lines = section.querySelectorAll('.term__line')

  const play = {
    1: () => gsap.fromTo(chars, { opacity: 0 }, { opacity: 1, duration: 0.01, stagger: 0.014, ease: 'none' }),
    2: () => {
      checks.forEach((li, i) => gsap.delayedCall(0.25 + i * 0.45, () => li.classList.add('is-done')))
      gsap.delayedCall(0.3 + checks.length * 0.45, () => merge.classList.add('is-ready'))
    },
    3: () => gsap.fromTo(lines, { opacity: 0, x: -12 }, { opacity: 1, x: 0, duration: 0.5, stagger: 0.28, ease: 'power3.out' }),
  }
  const played = new Set()
  const fire = (n) => { if (!played.has(n)) { played.add(n); play[n]() } }

  if (reduced) {
    checks.forEach((li) => li.classList.add('is-done'))
    merge.classList.add('is-ready')
    return
  }
  gsap.set(chars, { opacity: 0 })
  gsap.set(lines, { opacity: 0 })

  const mm = gsap.matchMedia()
  mm.add('(min-width: 901px)', () => {
    const distance = () => rail.scrollWidth - window.innerWidth
    const tween = gsap.to(rail, {
      x: () => -distance(), ease: 'none',
      scrollTrigger: { trigger: section, start: 'top top', end: () => '+=' + distance(), pin: true, scrub: 1, invalidateOnRefresh: true, anticipatePin: 1 },
    })
    ScrollTrigger.create({ trigger: section, start: 'top 60%', onEnter: () => fire(1) })
    steps.forEach((step, i) => {
      if (i === 0) return
      ScrollTrigger.create({ trigger: step, containerAnimation: tween, start: 'left 65%', onEnter: () => fire(i + 1) })
    })
    // parallax the big numerals inside the rail
    steps.forEach((step) => gsap.fromTo(step.querySelector('.step__n'), { xPercent: 40 }, { xPercent: -20, ease: 'none', scrollTrigger: { trigger: step, containerAnimation: tween, start: 'left right', end: 'right left', scrub: true } }))
  })
  mm.add('(max-width: 900px)', () => {
    steps.forEach((step, i) => ScrollTrigger.create({ trigger: step, start: 'top 70%', onEnter: () => fire(i + 1) }))
  })
}

/* ---------------- text reveals ---------------- */
function initReveals() {
  document.querySelectorAll('.split-lines').forEach((el) => {
    const split = SplitText.create(el, { type: 'lines,words', linesClass: 'line', mask: 'lines' })
    if (reduced) return
    gsap.from(split.words, {
      yPercent: 120, rotate: 6, duration: 1.3, ease: 'expo.out', stagger: 0.05,
      scrollTrigger: { trigger: el, start: 'top 85%' },
    })
  })
  document.querySelectorAll('.kicker, .step__meta p, .card, .stat, details, .builder, .preview, .recipes__ui, .docs__ref, .rules, .docs__row .window, .footer__cta .btn').forEach((el) => {
    if (reduced || el.closest('.hero')) return
    gsap.from(el, { y: 40, autoAlpha: 0, duration: 1.2, ease: 'expo.out', scrollTrigger: { trigger: el, start: 'top 90%' } })
  })

  const statement = document.querySelector('[data-light]')
  const words = SplitText.create(statement, { type: 'words', wordsClass: 'word', aria: 'none' }).words
  if (!reduced) {
    gsap.to(words, {
      opacity: 1, stagger: 0.1, ease: 'none',
      scrollTrigger: { trigger: statement, start: 'top 75%', end: 'bottom 45%', scrub: 1 },
    })
  }

  document.querySelectorAll('[data-count]').forEach((el) => {
    const target = Number(el.dataset.count)
    const pre = el.dataset.prefix || ''
    const suf = el.dataset.suffix || ''
    if (reduced || target === 0) return
    const o = { v: 0 }
    el.textContent = pre + '0' + suf
    ScrollTrigger.create({
      trigger: el, start: 'top 85%', once: true,
      onEnter: () => gsap.to(o, { v: target, duration: 2, ease: 'expo.out', onUpdate: () => (el.textContent = pre + Math.round(o.v) + suf) }),
    })
  })

  const count = document.querySelector('[data-registry-count]')
  if (count && !reduced) {
    const o = { v: 0 }
    ScrollTrigger.create({
      trigger: count, start: 'top 85%', once: true,
      onEnter: () => gsap.to(o, { v: Number(count.dataset.target || 0), duration: 1.6, ease: 'expo.out', onUpdate: () => (count.textContent = String(Math.round(o.v)).padStart(2, '0')) }),
    })
  }
}

/* ---------------- marquee (scroll velocity reactive) ---------------- */
function initMarquee() {
  const tracks = [...document.querySelectorAll('[data-marquee]')]
  const pos = tracks.map(() => 0)
  let boost = 0
  if (lenis) lenis.on('scroll', (e) => (boost = gsap.utils.clamp(-40, 40, e.velocity)))
  gsap.ticker.add((_, dt) => {
    boost *= 0.92
    tracks.forEach((t, i) => {
      const dir = Number(t.dataset.dir || 1)
      const half = t.scrollWidth / 2 || 1
      const speed = reduced ? 0 : (0.045 + Math.abs(boost) * 0.02) * dt
      pos[i] = (pos[i] - speed * dir) % half
      if (pos[i] > 0) pos[i] -= half
      t.style.transform = `translate3d(${pos[i]}px,0,0) skewX(${reduced ? 0 : -boost * 0.25}deg)`
    })
  })
}

/* ---------------- pointer: tilt, blob hover ---------------- */
function initPointer() {
  if (gl) {
    window.addEventListener('pointermove', (e) => {
      gl.setPointer((e.clientX / window.innerWidth) * 2 - 1, -((e.clientY / window.innerHeight) * 2 - 1))
    }, { passive: true })
    document.addEventListener('pointerleave', () => gl.clearPointer())
  }
  if (coarse || reduced) return

  document.querySelectorAll('.tilt').forEach((card) => {
    const rX = gsap.quickTo(card, 'rotateX', { duration: 0.8, ease: 'power3' })
    const rY = gsap.quickTo(card, 'rotateY', { duration: 0.8, ease: 'power3' })
    card.addEventListener('pointermove', (e) => {
      const r = card.getBoundingClientRect()
      const px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height
      card.style.setProperty('--mx', `${px * 100}%`)
      card.style.setProperty('--my', `${py * 100}%`)
      rY((px - 0.5) * 6)
      rX(-(py - 0.5) * 5)
    })
    card.addEventListener('pointerleave', () => { rX(0); rY(0) })
  })

  // footer: letters swell toward the cursor on the width + weight axes
  const giant = document.querySelector('[data-giant]')
  const letters = SplitText.create(giant, { type: 'chars', charsClass: 'char', aria: 'none' }).chars
  let centers = []
  const measure = () => (centers = letters.map((c) => { const r = c.getBoundingClientRect(); return r.left + r.width / 2 }))
  ScrollTrigger.create({ trigger: giant, start: 'top bottom', onEnter: measure, onRefresh: measure })
  giant.parentElement.addEventListener('pointermove', (e) => {
    letters.forEach((c, i) => {
      const d = Math.min(Math.abs(e.clientX - centers[i]) / (window.innerWidth * 0.22), 1)
      const k = 1 - d * d
      c.style.fontVariationSettings = `'wght' ${Math.round(700 - k * 480)}, 'wdth' ${Math.round(88 + k * 12)}`
    })
  })
  giant.parentElement.addEventListener('pointerleave', () => letters.forEach((c) => (c.style.fontVariationSettings = '')))
}

/* ---------------- copy buttons + keyboard ---------------- */
function initCopy() {
  document.querySelectorAll('[data-copy]').forEach((btn) => {
    const label = btn.querySelector('[data-copy-label]')
    btn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(btn.dataset.copy)
        label.textContent = 'copied'
      } catch {
        label.textContent = 'failed'
      }
      setTimeout(() => (label.textContent = 'copy'), 1600)
    })
  })
}

// "/" jumps to the app search, like most dev tools
function initKeys() {
  const search = document.querySelector('[data-registry-search]')
  document.addEventListener('keydown', (e) => {
    if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return
    if (e.target.closest('input, textarea, select, [contenteditable]')) return
    e.preventDefault()
    if (lenis) lenis.scrollTo(document.querySelector('#registry'), { duration: 1.2, onComplete: () => search.focus({ preventScroll: true }) })
    else search.focus()
  })
}

/* ---------------- boot ---------------- */
async function boot() {
  const ready = Promise.all([loadRegistry(), initGL(), document.fonts.ready])
  const loading = reduced ? null : loaderIn()
  const [registry] = await ready
  fillMarquees(registry)
  renderRegistry(document.querySelector('.registry'), registry)
  initClaim(document.querySelector('.builder'), registry)
  initRecipes(document.querySelector('[data-recipes]'))
  initCopy()
  initKeys()

  initScroll()
  const heroChars = SplitText.create('.hero .split', { type: 'chars', charsClass: 'char', aria: 'none' }).chars
  initNav()
  initHow()
  initReveals()
  initMarquee()
  initPointer()
  choreograph()
  await loading
  intro(heroChars)
  const scramble = document.querySelector('.scramble')
  fitWord(scramble, scramble.textContent, 0)
  window.addEventListener('resize', () => fitWord(scramble, scramble.textContent, 0))
  if (!reduced) loopScramble(scramble)

  // hero exit: title drifts up as you leave
  if (!reduced) {
    gsap.to('.hero__title', { yPercent: -18, ease: 'none', scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true } })
  }
  window.addEventListener('load', () => ScrollTrigger.refresh())
}

boot()
