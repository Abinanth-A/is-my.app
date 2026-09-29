import {
  WebGLRenderer, Scene, PerspectiveCamera, Mesh, IcosahedronGeometry, ShaderMaterial,
  BufferGeometry, Float32BufferAttribute, Points, AdditiveBlending, Color, Vector3, Group,
} from 'three'
import { blobVertex, blobFragment, pointsVertex, pointsFragment } from './shaders.js'

// Everything the scroll choreography tweens lives on `state`.
export function createScene(canvas, { lowPower = false, reduced = false } = {}) {
  const renderer = new WebGLRenderer({ canvas, antialias: !lowPower, alpha: true, powerPreference: 'high-performance' })
  const dpr = Math.min(window.devicePixelRatio || 1, lowPower ? 1.25 : 1.75)
  renderer.setPixelRatio(dpr)
  renderer.setClearColor(0x000000, 0)

  const scene = new Scene()
  const camera = new PerspectiveCamera(35, 1, 0.1, 100)
  camera.position.set(0, 0, 6)

  const state = {
    x: 0, y: 0, scale: 1, amp: 0.26, freq: 1.0, hue: 0, spread: 0, dim: 1, rotY: 0,
    tint: new Color('#c6ff3d'),
  }

  const group = new Group()
  scene.add(group)

  const blobUniforms = {
    uTime: { value: 0 }, uAmp: { value: state.amp }, uFreq: { value: state.freq },
    uHover: { value: 0 }, uMouse: { value: new Vector3(0, 0, 1) },
    uHue: { value: 0 }, uTint: { value: state.tint }, uDim: { value: 1 },
  }
  const blob = new Mesh(
    new IcosahedronGeometry(1.25, lowPower ? 28 : 64),
    new ShaderMaterial({ vertexShader: blobVertex, fragmentShader: blobFragment, uniforms: blobUniforms }),
  )
  group.add(blob)

  const count = lowPower ? 1800 : 4200
  const pos = new Float32Array(count * 3)
  const seed = new Float32Array(count)
  const size = new Float32Array(count)
  for (let i = 0; i < count; i++) {
    const r = 1.9 + Math.pow(Math.random(), 1.6) * 5.5
    const th = Math.random() * Math.PI * 2
    const ph = Math.acos(2 * Math.random() - 1)
    const flat = 0.35 + Math.random() * 0.65
    pos.set([r * Math.sin(ph) * Math.cos(th), r * Math.cos(ph) * flat, r * Math.sin(ph) * Math.sin(th)], i * 3)
    seed[i] = Math.random()
    size[i] = 0.6 + Math.random() * 2.2
  }
  const pGeo = new BufferGeometry()
  pGeo.setAttribute('position', new Float32BufferAttribute(pos, 3))
  pGeo.setAttribute('aSeed', new Float32BufferAttribute(seed, 1))
  pGeo.setAttribute('aSize', new Float32BufferAttribute(size, 1))
  const pointUniforms = {
    uTime: { value: 0 }, uSpread: { value: 0 }, uPixel: { value: dpr }, uTint: { value: state.tint },
  }
  const points = new Points(pGeo, new ShaderMaterial({
    vertexShader: pointsVertex, fragmentShader: pointsFragment, uniforms: pointUniforms,
    transparent: true, depthWrite: false, blending: AdditiveBlending,
  }))
  scene.add(points)

  // pointer is smoothed so the blob feels heavy, not twitchy
  const pointer = { x: 0, y: 0, tx: 0, ty: 0, hover: 0, thover: 0 }
  const setPointer = (nx, ny) => { pointer.tx = nx; pointer.ty = ny; pointer.thover = 1 }
  const clearPointer = () => { pointer.thover = 0 }

  let w = 0, h = 0
  function resize() {
    w = window.innerWidth; h = window.innerHeight
    renderer.setSize(w, h, false)
    camera.aspect = w / h
    // keep the blob a sensible size on tall phones
    camera.position.z = w / h < 0.8 ? 8.4 : 6
    camera.updateProjectionMatrix()
  }
  resize()
  window.addEventListener('resize', resize)

  let raf = 0, last = performance.now(), t = reduced ? 12 : 0, running = true
  function frame(now) {
    raf = requestAnimationFrame(frame)
    const dt = Math.min((now - last) / 1000, 0.05)
    last = now
    if (!reduced) t += dt

    const k = 1 - Math.pow(0.001, dt)
    pointer.x += (pointer.tx - pointer.x) * k
    pointer.y += (pointer.ty - pointer.y) * k
    pointer.hover += (pointer.thover - pointer.hover) * k * 0.6

    blobUniforms.uTime.value = t
    blobUniforms.uAmp.value = state.amp
    blobUniforms.uFreq.value = state.freq
    blobUniforms.uHue.value = state.hue
    blobUniforms.uDim.value = state.dim
    blobUniforms.uHover.value = pointer.hover
    blobUniforms.uMouse.value.set(pointer.x, pointer.y, 0.9).normalize()
    pointUniforms.uTime.value = t
    pointUniforms.uSpread.value = state.spread

    group.position.set(state.x, state.y, 0)
    group.scale.setScalar(state.scale)
    group.rotation.y = state.rotY + pointer.x * 0.35 + t * 0.05
    group.rotation.x = -pointer.y * 0.25
    points.rotation.y = pointer.x * 0.12
    points.rotation.x = -pointer.y * 0.08 + state.spread * 0.3

    renderer.render(scene, camera)
  }

  function start() { if (!running) { running = true; last = performance.now(); raf = requestAnimationFrame(frame) } }
  function stop() { running = false; cancelAnimationFrame(raf) }
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()))
  raf = requestAnimationFrame(frame)

  return { state, setPointer, clearPointer, renderer }
}
