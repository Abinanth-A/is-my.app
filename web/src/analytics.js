export function trackEvent(name, properties = {}) {
  if (typeof window === 'undefined') return

  const rybbit = window.rybbit
  if (!rybbit) return

  try {
    if (typeof rybbit.event === 'function') {
      rybbit.event(String(name), properties)
      return
    }

    if (typeof rybbit.trackEvent === 'function') {
      rybbit.trackEvent(String(name), properties)
      return
    }

    if (typeof rybbit.track === 'function') {
      rybbit.track('custom_event', String(name), properties)
    }
  } catch {
    // Rybbit should never block the UI.
  }
}
