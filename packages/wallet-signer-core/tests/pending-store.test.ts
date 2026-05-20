import { assertEquals, assertExists, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";

import { generateRequestId, PendingStore } from "../src/pending-store.ts";
import type { BaseRequest } from "../src/types.ts";

interface SmokeRequest extends BaseRequest {
  type: "smoke";
  payload: string;
}

function makeStore() {
  return new PendingStore<SmokeRequest>();
}

function makeRequest(payload: string): SmokeRequest {
  return { id: generateRequestId(), type: "smoke", createdAt: Date.now(), payload };
}

Deno.test("PendingStore - create + complete round-trip", async () => {
  const store = makeStore();
  const req = makeRequest("hello");
  const { id, promise } = store.create(req);

  assertEquals(id, req.id);
  assertEquals(store.size, 1);
  assertEquals(store.has(id), true);

  const got = store.get(id);
  assertExists(got);
  assertEquals(got.payload, "hello");

  store.complete(id, { success: true, result: "ok" });
  const result = await promise;
  assertEquals(result.success, true);
  assertEquals(store.size, 0);
});

Deno.test("PendingStore - cancel rejects the promise", async () => {
  const store = makeStore();
  const { id, promise } = store.create(makeRequest("x"));
  store.cancel(id, "nope");
  await assertRejects(() => promise, Error, "nope");
});

Deno.test("PendingStore - complete on unknown id returns false", () => {
  const store = makeStore();
  assertEquals(store.complete("not-a-uuid", { success: true, result: "" }), false);
  assertEquals(store.has("not-a-uuid"), false);
  assertEquals(store.get("not-a-uuid"), undefined);
});

Deno.test("PendingStore - getPendingIds reflects pending state", () => {
  const store = makeStore();
  const a = store.create(makeRequest("a"));
  const b = store.create(makeRequest("b"));
  assertEquals(store.getPendingIds().sort(), [a.id, b.id].sort());

  store.cancel(a.id, "drop");
  // Drain rejected promise to silence unhandled rejection warnings.
  a.promise.catch(() => {});
  assertEquals(store.getPendingIds(), [b.id]);

  store.cancel(b.id, "drop");
  b.promise.catch(() => {});
});

Deno.test("generateRequestId returns a UUID", () => {
  const id = generateRequestId();
  assertEquals(typeof id, "string");
  assertEquals(id.length, 36);
});
