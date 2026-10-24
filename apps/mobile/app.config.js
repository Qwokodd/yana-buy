// Adds these to app.json when the phone app is built with EAS (plus the Google Maps key, see below):
//  1. google-services.json (from Firebase) — Android needs it for push notifications.
//     Put the file in apps/mobile/ and it's picked up automatically.
//  2. For test builds (ALLOW_HTTP=1 in eas.json): lets the app talk to your
//     computer over plain http on the local network. Store builds use https.
const fs = require("fs");
const path = require("path");
const { withAndroidManifest } = require("expo/config-plugins");

module.exports = ({ config }) => {
  const out = { ...config, android: { ...config.android } };
  if (fs.existsSync(path.join(__dirname, "google-services.json"))) out.android.googleServicesFile = "./google-services.json";
  // Google Maps key for app builds (Expo Go shows maps without it). Set GOOGLE_MAPS_API_KEY in eas.json or your shell.
  const mapsKey = process.env.GOOGLE_MAPS_API_KEY;
  if (mapsKey) {
    out.android.config = { ...(config.android?.config ?? {}), googleMaps: { apiKey: mapsKey } };
    out.ios = { ...(config.ios ?? {}), config: { ...(config.ios?.config ?? {}), googleMapsApiKey: mapsKey } };
  }
  if (process.env.ALLOW_HTTP === "1") {
    return withAndroidManifest(out, (c) => {
      const app = c.modResults.manifest.application?.[0];
      if (app) app.$["android:usesCleartextTraffic"] = "true";
      return c;
    });
  }
  return out;
};
