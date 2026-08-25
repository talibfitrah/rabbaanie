import { describe, expect, it } from "vitest";

/**
 * Guards on which devices Google Play will let install this app, and on the
 * app filling the screen it is given.
 *
 * Both come from one attribute. `orientation: "portrait"` in app.config.ts
 * becomes android:screenOrientation="portrait" on MainActivity, and that:
 *
 *   - makes aapt2 imply android.hardware.screen.portrait as a REQUIRED
 *     feature, which removed all 3,037 TV devices from the Play catalog, and
 *   - letterboxes the app on every large screen. Measured on a Pixel_Tablet
 *     (Android 15, 1920x1200): letterboxInnerBounds = Rect(510, 0 - 1410,
 *     1200) — 510px of black down each side, with the app reporting itself as
 *     a 600x800dp portrait phone on a 1280x800dp display.
 *
 * Neither failure produces an error, a warning, or a failing build. The app
 * installs and runs; it just reaches fewer devices and renders in a box.
 *
 * This is the only guard on the orientation half. scripts/assert-play-artifact.sh
 * cannot carry one: the value is a plain string in an AAB's protobuf manifest
 * but a compiled enum int in an APK's binary XML, so a text search sees it in
 * one container and never in the other. Guarding it here is sound because
 * Expo's own withOrientation mod rewrites the attribute from this config on
 * every prebuild — there is no stale-manifest path around it.
 */

type ManifestMod = (config: any) => any;

async function loadConfig() {
  return (await import("../app.config")).default;
}

/** The registered withOptionalHardwareFeatures plugin, as a callable mod. */
async function loadFeaturePlugin(): Promise<ManifestMod> {
  const config = await loadConfig();
  // ExpoConfig types `plugins` as name/[name, opts] entries only, but a
  // function is what app.config.ts actually registers and what Expo runs.
  const plugin = (config.plugins as unknown[] | undefined)?.find(
    (p) =>
      typeof p === "function" &&
      (p as ManifestMod).name === "withOptionalHardwareFeatures",
  ) as ManifestMod | undefined;
  expect(plugin, "withOptionalHardwareFeatures is not registered").toBeDefined();
  return plugin!;
}

/**
 * Run the real mod over a manifest, rather than grepping app.config.ts, so a
 * reformat cannot break these and a plugin that stops writing the entries
 * cannot pass them.
 */
async function applyToManifest(manifest: Record<string, any>) {
  const withMod: any = (await loadFeaturePlugin())({ name: "t", slug: "t" });
  const applied = await withMod.mods.android.manifest({
    ...withMod,
    modResults: { manifest },
    modRequest: {},
  });
  return applied.modResults.manifest as Record<string, any>;
}

describe("device compatibility", () => {
  it("locks the app to no orientation", async () => {
    const config = await loadConfig();
    // Asserting the invariant (no lock) rather than one spelling of it: Expo
    // maps "default" to screenOrientation="unspecified" and omits the
    // attribute entirely when the field is absent. Both are fine. "portrait"
    // and "landscape" are the two values that reintroduce the letterbox and
    // the implied screen.* feature.
    expect(config.orientation).not.toBe("portrait");
    expect(config.orientation).not.toBe("landscape");
  });

  it("declares every implied hardware feature optional", async () => {
    const manifest = await applyToManifest({});
    const declared: Record<string, string> = Object.fromEntries(
      (manifest["uses-feature"] ?? []).map((f: any) => [
        f.$["android:name"],
        f.$["android:required"],
      ]),
    );

    // Google's "Permissions that Imply Feature Requirements" table, not
    // aapt2's printout — aapt2 reports only the parent of each pair, but Play
    // filters on the full set. CAMERA implies camera AND camera.autofocus;
    // ACCESS_FINE_LOCATION implies location.gps; ACCESS_COARSE_LOCATION
    // implies location.network; both imply location.
    //
    // screen.portrait is the exception: it is implied by a portrait-locked
    // ACTIVITY rather than a permission, so `orientation: "default"` does not
    // remove it — ML Kit merges its own locked activity in. Measured on a
    // build where MainActivity was already unspecified and aapt2 still
    // reported screen.portrait implied and required. It cost all 3,037 TV
    // devices, so it is the one entry here that must never be "tidied away"
    // on the reasoning that nothing implies it any more.
    for (const feature of [
      "android.hardware.screen.portrait",
      "android.hardware.camera",
      "android.hardware.camera.autofocus",
      "android.hardware.location",
      "android.hardware.location.gps",
      "android.hardware.location.network",
    ]) {
      expect(declared[feature], `${feature} is not declared`).toBe("false");
    }
  });

  it("does not duplicate its entries when prebuild reuses a manifest", async () => {
    // `expo prebuild` merges into an existing android/AndroidManifest.xml
    // instead of regenerating it, so the mod runs against a manifest that may
    // already carry its own output. Appending unconditionally would grow the
    // list on every prebuild.
    const once = await applyToManifest({});
    const firstCount = once["uses-feature"].length;
    // Guards the vacuous pass (0 === 0 if the mod wrote nothing) without
    // pinning the list length here — the names themselves are asserted above,
    // and duplicating the count would fail this test for an unrelated reason
    // the day a seventh feature is added.
    expect(firstCount).toBeGreaterThan(0);

    // Feed a COPY back in, and compare against a count captured beforehand.
    // The mod mutates the manifest in place and returns the same reference, so
    // `applyToManifest(once)` then asserting against `once.length` compares an
    // array to itself and passes even when the filter is deleted entirely.
    const twice = await applyToManifest(structuredClone(once));
    expect(twice["uses-feature"]).toHaveLength(firstCount);
  });

  it("keeps a feature a dependency requires", async () => {
    // The filter that makes the mod idempotent must not eat entries it did not
    // write. A library declaring its own required feature has to survive.
    const manifest = await applyToManifest({
      "uses-feature": [
        { $: { "android:name": "android.hardware.bluetooth", "android:required": "true" } },
      ],
    });
    const bluetooth = manifest["uses-feature"].find(
      (f: any) => f.$["android:name"] === "android.hardware.bluetooth",
    );
    expect(bluetooth?.$["android:required"]).toBe("true");
  });
});
