/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

XPCOMUtils.defineLazyModuleGetters(this, {
  BridgedRecord: "resource://services-sync/bridged_engine.js",
  extensionStorageSync: "resource://gre/modules/ExtensionStorageSync.jsm",
  Service: "resource://services-sync/service.js",
});

const {
  ExtensionStorageEngineBridge,
  ExtensionStorageEngineKinto,
} = ChromeUtils.import("resource://services-sync/engines/extension-storage.js");

Services.prefs.setStringPref("webextensions.storage.sync.log.level", "debug");

add_task(async function test_switching_between_kinto_and_bridged() {
  function assertUsingKinto(message) {
    let kintoEngine = Service.engineManager.get("extension-storage");
    Assert.ok(kintoEngine instanceof ExtensionStorageEngineKinto, message);
  }
  function assertUsingBridged(message) {
    let bridgedEngine = Service.engineManager.get("extension-storage");
    Assert.ok(bridgedEngine instanceof ExtensionStorageEngineBridge, message);
  }

  let isUsingKinto = Services.prefs.getBoolPref(
    "webextensions.storage.sync.kinto",
    false
  );
  if (isUsingKinto) {
    assertUsingKinto("Should use Kinto engine before flipping pref");
  } else {
    assertUsingBridged("Should use bridged engine before flipping pref");
  }

  _("Flip pref");
  Services.prefs.setBoolPref("webextensions.storage.sync.kinto", !isUsingKinto);
  await Service.engineManager.switchAlternatives();

  if (isUsingKinto) {
    assertUsingBridged("Should use bridged engine after flipping pref");
  } else {
    assertUsingKinto("Should use Kinto engine after flipping pref");
  }

  _("Clean up");
  Services.prefs.clearUserPref("webextensions.storage.sync.kinto");
  await Service.engineManager.switchAlternatives();
});

// It's difficult to know what to test - there's already tests for the bridged
// engine etc - so we just try and check that this engine conforms to the
// mozIBridgedSyncEngine interface guarantees.
add_task(async function test_engine() {
  let engine = new ExtensionStorageEngineBridge(Service);
  Assert.equal(engine.version, 1);

  Assert.deepEqual(await engine.getSyncID(), null);
  await engine.resetLocalSyncID();
  Assert.notEqual(await engine.getSyncID(), null);

  Assert.equal(await engine.getLastSync(), 0);
  // lastSync is seconds on this side of the world, but milli-seconds on the other.
  await engine.setLastSync(1234.567);
  // should have 2 digit precision.
  Assert.equal(await engine.getLastSync(), 1234.57);
  await engine.setLastSync(0);

  // Set some data.
  await extensionStorageSync.set({ id: "ext-2" }, { ext_2_key: "ext_2_value" });
  // Now do a sync with out regular test server.
  let server = await serverForFoo(engine);
  try {
    await SyncTestingInfrastructure(server);

    info("Add server records");
    let foo = server.user("foo");
    let collection = foo.collection("extension-storage");
    let now = new_timestamp();

    collection.insert(
      "fakeguid0000",
      encryptPayload({
        id: "fakeguid0000",
        extId: "ext-1",
        data: JSON.stringify({ foo: "bar" }),
      }),
      now
    );

    info("Sync the engine");
    await sync_engine_and_validate_telem(engine, false);

    // We should have applied the data from the existing collection record.
    Assert.deepEqual(await extensionStorageSync.get({ id: "ext-1" }, null), {
      foo: "bar",
    });

    // should now be 2 records on the server.
    let payloads = collection.payloads();
    Assert.equal(payloads.length, 2);
    // find the new one we wrote.
    let newPayload =
      payloads[0].id == "fakeguid0000" ? payloads[1] : payloads[0];
    Assert.equal(newPayload.data, `{"ext_2_key":"ext_2_value"}`);
    // should have updated the timestamp.
    greater(await engine.getLastSync(), 0, "Should update last sync time");
  } finally {
    await promiseStopServer(server);
    await engine.finalize();
  }
});
