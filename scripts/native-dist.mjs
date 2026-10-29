// native-dist — prune dist/ before Capacitor copies it into the IPA / AAB.
//
// The App Store build bakes `dist` into the binary (webDir, no server.url), so
// everything in it ships to every phone. Two things in there are for nobody on
// a phone:
//   - public/tiktok/ — the operator's video engine (paintings, Veo loops, the
//     cast renders). ~25 MB. The player app never reads it; only /admin's
//     TikTok tools do, and those run in a desktop browser.
//   - *.map sourcemaps — ~13 MB, the app's whole source, useful in a browser's
//     devtools and to nobody inside a WKWebView.
// The web deploy (Netlify) keeps both; this runs only in codemagic.yaml, after
// `npm run build` and before `cap sync`.
import { readdirSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'

const DIST = 'dist'
const size = (p) => {
  const s = statSync(p)
  return s.isDirectory() ? readdirSync(p).reduce((n, f) => n + size(join(p, f)), 0) : s.size
}
const mb = (n) => `${(n / 1048576).toFixed(1)} MB`
const before = size(DIST)

rmSync(join(DIST, 'tiktok'), { recursive: true, force: true })
let maps = 0
const walk = (dir) => {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f)
    if (statSync(p).isDirectory()) walk(p)
    else if (f.endsWith('.map')) { rmSync(p); maps++ }
  }
}
walk(DIST)

console.log(`native-dist: ${mb(before)} → ${mb(size(DIST))} (dropped tiktok/ and ${maps} sourcemaps)`)
