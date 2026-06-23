// bcrypt password + token helpers for delegated reviewer links. Mirrors
// subfrost-admin's lib/passwords.ts. Distinct from lib/cms/session (which backs
// platform-user sessions) — reviewer links are passwords held by people with no
// platform account.

import bcrypt from "bcryptjs"
import crypto from "node:crypto"

const BCRYPT_ROUNDS = 12

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS)
}

export function verifyPassword(plain: string, hashed: string): Promise<boolean> {
  return bcrypt.compare(plain, hashed)
}

/** Random URL-safe token (32 bytes → 43-char base64url). Used for review-link
 *  tokens (the value in the URL) and reviewer session cookie values. */
export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString("base64url")
}

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex")
}

/** Salted hash of an IP/UA — never store raw IPs in the reviewer-session table. */
export function hashClient(ip: string | undefined | null): string | null {
  if (!ip) return null
  const salt = process.env.SESSION_IP_SALT ?? "subfrost-default-salt-rotate-me"
  return crypto.createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 32)
}

// Human-rememberable password generator for review links — adjective-noun-
// adjective-noun-#### (~46 bits). Easy to read aloud / paste over a casual
// channel; revocation + expiry posture carries the rest.
const ADJECTIVES = [
  "amber", "azure", "bright", "calm", "clever", "crisp", "dusty", "eager",
  "fair", "frost", "gentle", "happy", "ivory", "jolly", "kind", "lively",
  "merry", "noble", "olive", "proud", "quiet", "rapid", "silver", "tidy",
  "umber", "vivid", "warm", "yellow", "zesty",
]
const NOUNS = [
  "river", "mountain", "forest", "harbor", "meadow", "lantern", "ember",
  "compass", "ledger", "circuit", "ribbon", "anchor", "beacon", "comet",
  "trellis", "harvest", "willow", "raven", "falcon", "thicket", "vellum",
]

export function generateReviewPassword(): string {
  const pick = <T>(arr: T[]): T => arr[crypto.randomInt(0, arr.length)]
  const digits = crypto.randomInt(1000, 10000)
  return `${pick(ADJECTIVES)}-${pick(NOUNS)}-${pick(ADJECTIVES)}-${pick(NOUNS)}-${digits}`
}
