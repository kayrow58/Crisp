// iPhone Home Screen apps sometimes start with the screen measured too short (the tab bar sits
// above the bottom edge) until the first scroll. A 1px scroll-and-back makes iOS re-measure.
export function nudgeViewport() {
  const html = document.documentElement
  if (window.scrollY > 0 || html.classList.contains('locked')) return
  const prev = html.style.minHeight
  html.style.minHeight = 'calc(100% + 2px)'
  window.scrollTo(0, 1)
  requestAnimationFrame(() => {
    window.scrollTo(0, 0)
    html.style.minHeight = prev
  })
}

export function watchViewport() {
  window.addEventListener('pageshow', () => setTimeout(nudgeViewport, 60))
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && setTimeout(nudgeViewport, 60))
}
