import FingerprintJS from "@fingerprintjs/fingerprintjs";

let cachedId = null;
let cachedPromise = null;

/* Generates a stable device fingerprint that survives private/incognito mode,
   cleared localStorage, and different browser tabs — because it's based on
   device/browser characteristics (canvas rendering, fonts, screen, etc.)
   rather than stored data. Not 100% foolproof, but far stronger than localStorage. */
export async function getDeviceFingerprint() {
  if (cachedId) return cachedId;
  if (cachedPromise) return cachedPromise;

  cachedPromise = (async () => {
    try {
      const fp = await FingerprintJS.load();
      const result = await fp.get();
      cachedId = result.visitorId;
      return cachedId;
    } catch (e) {
      console.error("Fingerprint generation failed:", e);
      // Fallback: still allow voting, just without fingerprint protection
      return null;
    }
  })();

  return cachedPromise;
}
