// Generates the "Client Secret" JWT that Supabase's Apple provider needs.
// Zero dependencies — uses only Node's built-in crypto.
//
// Usage (from the project folder, in a terminal):
//   node scripts/apple-secret.mjs <path-to-AuthKey_XXXX.p8> <KEY_ID> <TEAM_ID> <SERVICES_ID>
//
// For Verse Arcade:
//   TEAM_ID     = SSS74S5AMR
//   SERVICES_ID = com.versearcade.signin
//   KEY_ID      = the Key ID shown when you create the Sign in with Apple key
//   .p8 file    = the AuthKey_XXXX.p8 you download when creating that key
//
// Example:
//   node scripts/apple-secret.mjs ./AuthKey_ABC123DEF4.p8 ABC123DEF4 SSS74S5AMR com.versearcade.signin
//
// It prints one long token. Copy the WHOLE thing into Supabase ->
// Authentication -> Providers -> Apple -> "Secret Key (for OAuth)".
// The token is valid for 180 days (Apple's max); re-run this to refresh it.

import fs from 'node:fs'
import crypto from 'node:crypto'

const [p8Path, keyId, teamId, servicesId] = process.argv.slice(2)

if (!p8Path || !keyId || !teamId || !servicesId) {
  console.error(
    'Usage: node scripts/apple-secret.mjs <AuthKey_XXXX.p8> <KEY_ID> <TEAM_ID> <SERVICES_ID>',
  )
  process.exit(1)
}

let key
try {
  key = fs.readFileSync(p8Path, 'utf8')
} catch {
  console.error(`Could not read the .p8 file at: ${p8Path}`)
  process.exit(1)
}

const b64url = (o) =>
  Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url')

const now = Math.floor(Date.now() / 1000)
const header = { alg: 'ES256', kid: keyId, typ: 'JWT' }
const payload = {
  iss: teamId,
  iat: now,
  exp: now + 60 * 60 * 24 * 180, // 180 days (Apple's maximum)
  aud: 'https://appleid.apple.com',
  sub: servicesId,
}

const signingInput = `${b64url(header)}.${b64url(payload)}`
// dsaEncoding 'ieee-p1363' gives the raw r||s signature JWT (JOSE) requires.
const signature = crypto
  .createSign('SHA256')
  .update(signingInput)
  .sign({ key, dsaEncoding: 'ieee-p1363' })
  .toString('base64url')

console.log(`${signingInput}.${signature}`)
