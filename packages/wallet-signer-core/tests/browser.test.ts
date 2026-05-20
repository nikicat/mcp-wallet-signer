import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";

import { buildConnectUrl, buildSignUrl, openBrowser } from "../src/browser.ts";

// `open` actually spawns a child process. /bin/true is a real binary that exits 0 with no
// side-effect, so BROWSER=/bin/true exercises the new env-var branch without launching a UI.
const NOOP_BIN = "/bin/true";

function withBrowserEnv<T>(value: string | undefined, fn: () => Promise<T>): Promise<T> {
  const prev = Deno.env.get("BROWSER");
  if (value === undefined) Deno.env.delete("BROWSER");
  else Deno.env.set("BROWSER", value);
  return fn().finally(() => {
    if (prev === undefined) Deno.env.delete("BROWSER");
    else Deno.env.set("BROWSER", prev);
  });
}

/** Stub console.error to capture log output produced by openBrowser's failure path. */
function captureConsoleError<T>(fn: () => Promise<T>): Promise<{ result: T; logs: string[] }> {
  const logs: string[] = [];
  const orig = console.error;
  console.error = (...args: unknown[]) => {
    logs.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "));
  };
  return fn().then(
    (result) => {
      console.error = orig;
      return { result, logs };
    },
    (err) => {
      console.error = orig;
      throw err;
    },
  );
}

Deno.test({
  name: "openBrowser - BROWSER=/bin/true succeeds without errors",
  sanitizeResources: false,
  sanitizeOps: false,
  ignore: Deno.build.os !== "linux" && Deno.build.os !== "darwin",
  async fn() {
    const { logs } = await withBrowserEnv(NOOP_BIN, () =>
      captureConsoleError(async () => {
        await openBrowser("http://127.0.0.1:9/test");
      }));
    assertEquals(logs, [], `expected no console.error logs, got: ${logs.join("\n")}`);
  },
});

Deno.test({
  name: "openBrowser - empty BROWSER env var falls back to OS default branch",
  async fn() {
    // We can't safely call the default branch (it would launch a real browser). Instead,
    // verify that the source explicitly guards against empty strings: a length>0 check is
    // the only thing keeping BROWSER="" from forwarding "" as the app name to `open`.
    const source = await Deno.readTextFile(new URL("../src/browser.ts", import.meta.url));
    assertStringIncludes(source, "browser.length > 0");
    assertStringIncludes(source, "process.env.BROWSER");
  },
});

Deno.test("buildSignUrl - composes 127.0.0.1 url with port + id", () => {
  assertEquals(buildSignUrl(4321, "abc-123"), "http://127.0.0.1:4321/sign/abc-123");
});

Deno.test("buildConnectUrl - composes 127.0.0.1 url with port + id", () => {
  assertEquals(buildConnectUrl(4321, "abc-123"), "http://127.0.0.1:4321/connect/abc-123");
});
