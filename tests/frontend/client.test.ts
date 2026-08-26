import { afterEach, describe, expect, it, vi } from "vitest";
import { syncThread } from "../../src/web/client";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("syncThread", () => {
  it("finishes without reading the successful response body", async () => {
    const json = vi.fn();
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json })));

    await expect(syncThread("thread/a")).resolves.toBeUndefined();

    expect(fetch).toHaveBeenCalledWith("/api/threads/thread%2Fa/sync", { method: "POST" });
    expect(json).not.toHaveBeenCalled();
  });

  it("surfaces the server error message", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      error: { message: "Stored thread item is incompatible" },
    }), {
      status: 500,
      headers: { "content-type": "application/json" },
    })));

    await expect(syncThread("thread-1")).rejects.toThrow("Stored thread item is incompatible");
  });

  it("falls back to the HTTP status for non-JSON errors", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("bad gateway", { status: 502 })));

    await expect(syncThread("thread-1")).rejects.toThrow("Thread sync failed (502)");
  });
});
