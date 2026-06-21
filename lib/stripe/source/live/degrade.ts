/** Reads are non-critical (no money moves). If a Stripe read fails — a product not enabled
 *  (e.g. Issuing off) or a transient outage — degrade to the fallback instead of 500ing the
 *  screen. Money mutators do NOT use this; they must surface failures. */
export async function degradeIfUnavailable<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn()
  } catch (e) {
    console.error("[stripe] live read degraded to fallback:", (e as Error).message)
    return fallback
  }
}
