const PAGE_SELECTOR =
  '[data-testid="primaryColumn"], main[role="main"], #react-root'
const THEME_ATTRIBUTES = [
  "class",
  "style",
  "data-theme",
  "data-color-mode",
  "media",
  "href",
  "disabled"
]

function pageSurface(document: Document) {
  return (
    document.querySelector('[data-testid="primaryColumn"]') ||
    document.querySelector('main[role="main"]') ||
    document.getElementById("react-root") ||
    document.body ||
    document.documentElement
  )
}

function opaqueRgb(color: string) {
  const match = color.match(/^rgba?\(([^)]+)\)$/)
  if (!match) return null
  const parts = match[1].trim().split(/[\s,/]+/)
  if (parts.length < 3 || parts.length > 4) return null
  const alpha = parts[3]
    ? Number.parseFloat(parts[3]) / (parts[3].endsWith("%") ? 100 : 1)
    : 1
  // Transparent surfaces inherit the theme of their backing page. Media and
  // translucent overlays are not a reliable signal for a site's chosen theme.
  if (alpha !== 1) return null
  const rgb = parts
    .slice(0, 3)
    .map((part) => Number.parseFloat(part) * (part.endsWith("%") ? 2.55 : 1))
  return rgb.every(Number.isFinite) ? rgb : null
}

export function pageUsesDarkTheme(document: Document, systemDark = false) {
  const view = document.defaultView
  if (!view) return systemDark
  let explicitScheme: string | undefined
  for (
    let element: Element | null = pageSurface(document);
    element;
    element = element.parentElement
  ) {
    const style = view.getComputedStyle(element)
    const rgb = opaqueRgb(style.backgroundColor)
    if (rgb) {
      const linear = rgb.map((channel) => {
        const value = channel / 255
        return value <= 0.04045
          ? value / 12.92
          : ((value + 0.055) / 1.055) ** 2.4
      })
      // The luminance where white text has better contrast than black text.
      return (
        0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2] < 0.179
      )
    }
    if (!explicitScheme && ["dark", "light"].includes(style.colorScheme))
      explicitScheme = style.colorScheme
  }
  // X's rendered Default/Dim/Lights out background wins over OS preference.
  // This fallback only applies before the page has painted its own surface.
  return explicitScheme ? explicitScheme === "dark" : systemDark
}

export function observePageTheme(document: Document) {
  const view = document.defaultView
  if (!view) throw new Error("The page is not available.")
  const media = view.matchMedia?.("(prefers-color-scheme: dark)")
  const hosts = new Set<HTMLElement>()
  let surface = pageSurface(document)
  let ancestors = new Set<Element>()
  let timer: number | undefined
  let stopped = false
  let dark = false

  function refresh() {
    if (stopped) return
    if (timer !== undefined) view.clearTimeout(timer)
    timer = undefined
    surface = pageSurface(document)
    ancestors = new Set()
    for (
      let element: Element | null = surface;
      element;
      element = element.parentElement
    )
      ancestors.add(element)
    dark = pageUsesDarkTheme(document, media?.matches)
    for (const host of hosts) host.classList.toggle("dark", dark)
  }

  function schedule() {
    if (!stopped && timer === undefined) timer = view.setTimeout(refresh, 0)
  }

  const observer = new view.MutationObserver((changes) => {
    if (
      changes.some((change) => {
        const element =
          change.target.nodeType === 1
            ? (change.target as Element)
            : change.target.parentElement
        if (!element || element.closest("[data-docmrk-feedback]")) return false
        if (document.head?.contains(element)) return true
        if (change.type === "attributes") return ancestors.has(element)
        if (!surface.isConnected) return true
        return Array.from(change.addedNodes).some(
          (node) =>
            node.nodeType === 1 &&
            ((node as Element).matches(PAGE_SELECTOR) ||
              (node as Element).querySelector(PAGE_SELECTOR))
        )
      })
    )
      schedule()
  })
  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: THEME_ATTRIBUTES
  })
  media?.addEventListener("change", schedule)
  refresh()

  return {
    track(host: HTMLElement) {
      if (!stopped) {
        hosts.add(host)
        host.classList.toggle("dark", dark)
      }
      return () => {
        hosts.delete(host)
      }
    },
    refresh,
    dispose() {
      stopped = true
      observer.disconnect()
      media?.removeEventListener("change", schedule)
      if (timer !== undefined) view.clearTimeout(timer)
      hosts.clear()
    }
  }
}
