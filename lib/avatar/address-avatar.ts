// Deterministic "bitmoji-like" cartoon avatar derived purely from an address.
// No external calls, SSR-safe. Facial features come from an FNV-1a hash of the
// address; the background/ring colour is keyed off a separate checksum so each
// address is colour-coded at a glance.

export interface AvatarSpec {
  bg: string
  ring: string
  skin: string
  hair: string
  hairStyle: number // 0..4
  eyes: number // 0..2
  mouth: number // 0..3
  glasses: boolean
}

const SKIN = ["#ffdbac", "#f1c27d", "#e0ac69", "#c68642", "#8d5524", "#5c3a21"]
const HAIR = ["#0b0a0a", "#2c1b18", "#3b2219", "#6a4e42", "#a55728", "#b58143", "#d6c4c2", "#e8e1e1"]

/** FNV-1a 32-bit hash → unsigned int. */
export function hashAddress(addr: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < addr.length; i++) {
    h ^= addr.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** Position-weighted checksum → hue 0..359, for colour-coding by address. */
export function checksumHue(addr: string): number {
  let c = 0
  for (let i = 0; i < addr.length; i++) c = (c + addr.charCodeAt(i) * (i + 1)) >>> 0
  return c % 360
}

export function avatarSpec(addr: string): AvatarSpec {
  const a = (addr || "").trim()
  const h = hashAddress(a)
  const hue = checksumHue(a)
  return {
    bg: `hsl(${hue} 62% 90%)`,
    ring: `hsl(${hue} 64% 45%)`,
    skin: SKIN[h % SKIN.length],
    hair: HAIR[(h >>> 3) % HAIR.length],
    hairStyle: (h >>> 7) % 5,
    eyes: (h >>> 11) % 3,
    mouth: (h >>> 14) % 4,
    glasses: ((h >>> 17) & 7) === 0, // ~1 in 8
  }
}
