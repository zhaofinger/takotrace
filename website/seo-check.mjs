import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseHTML } from "linkedom";
import { build } from "vite";
import { demoPlugins, websiteInputs } from "./demo-build.js";
import { normalizeSiteUrl, renderPage, websiteSeo } from "./seo.js";

const source = await readFile(new URL("./index.html", import.meta.url), "utf8");
const siteUrl = "https://example.com/takotrace/";

test("validates deployment URL and preserves a subdirectory", () => {
  assert.equal(normalizeSiteUrl("https://example.com/takotrace"), siteUrl);
  assert.equal(normalizeSiteUrl(undefined), undefined);
  for (const invalid of [
    "relative",
    "ftp://example.com",
    "https://user:secret@example.com",
    "https://example.com/?lang=en",
    "https://example.com/#main",
  ]) {
    assert.throws(() => normalizeSiteUrl(invalid));
  }
});

test("preview HTML is noindex and contains no invented production URL", () => {
  const { document } = parseHTML(renderPage(source, "zh"));
  assert.equal(
    document.querySelector('meta[name="robots"]').content,
    "noindex, follow",
  );
  assert.equal(document.querySelector('link[rel="canonical"]'), null);
  assert.equal(document.querySelector('meta[property="og:url"]'), null);
});

test("build emits translated HTML, reciprocal languages, sitemap, and bundled images", async () => {
  const result = await build({
    configFile: false,
    root: "website",
    base: "./",
    logLevel: "silent",
    plugins: [...demoPlugins(), websiteSeo(siteUrl)],
    build: { write: false, rollupOptions: { input: websiteInputs } },
  });
  const assets = new Map(
    result.output
      .filter((item) => item.type === "asset")
      .map((item) => [item.fileName, String(item.source)]),
  );
  const demo = parseHTML(assets.get("demo.html")).document;
  assert.equal(
    demo.querySelector('meta[name="robots"]').content,
    "noindex, follow",
  );
  assert.equal(
    demo.querySelector('meta[http-equiv="Content-Security-Policy"]').content,
    "connect-src 'none'",
  );
  const javascript = result.output
    .filter((item) => item.type === "chunk")
    .map((item) => item.code)
    .join("\n");
  assert.doesNotMatch(
    javascript,
    /new EventSource|\/api\/state|\/api\/subagents/,
  );
  assert.ok(
    assets.get("robots.txt").includes(`Sitemap: ${siteUrl}sitemap.xml`),
  );
  assert.ok(assets.get("sitemap.xml").includes(`<loc>${siteUrl}</loc>`));
  assert.ok(assets.get("sitemap.xml").includes(`<loc>${siteUrl}en.html</loc>`));
  for (const [file, lang, url] of [
    ["index.html", "zh-CN", siteUrl],
    ["en.html", "en", `${siteUrl}en.html`],
  ]) {
    const { document } = parseHTML(assets.get(file));
    assert.equal(document.documentElement.lang, lang);
    assert.equal(document.querySelector('link[rel="canonical"]').href, url);
    assert.equal(
      document.querySelector('link[hreflang="zh-CN"]').href,
      siteUrl,
    );
    assert.equal(
      document.querySelector('link[hreflang="en"]').href,
      `${siteUrl}en.html`,
    );
    assert.equal(
      document.querySelector('link[hreflang="x-default"]').href,
      siteUrl,
    );
    assert.equal(
      document.querySelector('meta[property="og:url"]').content,
      url,
    );
    assert.match(
      document.querySelector('meta[name="robots"]').content,
      /^index,/,
    );
    assert.equal(
      JSON.parse(
        document.querySelector('script[type="application/ld+json"]')
          .textContent,
      ).url,
      url,
    );
    const imageUrl = document.querySelector(
      'meta[property="og:image"]',
    ).content;
    assert.ok(imageUrl.startsWith(`${siteUrl}assets/`));
    assert.ok(assets.has(imageUrl.slice(siteUrl.length)));
    assert.equal(document.querySelectorAll("iframe.demo-frame").length, 1);
    assert.match(
      document.querySelector("iframe").getAttribute("src"),
      /demo.html\?lang=/,
    );
    assert.equal(document.querySelectorAll("h1").length, 1);
    assert.equal(document.querySelectorAll('link[rel="canonical"]').length, 1);
    if (lang === "en") {
      assert.equal(
        document.querySelector("h1").textContent.trim(),
        "See how your agent works",
      );
      assert.equal(
        document.querySelector(".language-toggle").getAttribute("href"),
        "./",
      );
      assert.equal(
        document.querySelector("#start .text-link").href,
        "https://github.com/zhaofinger/takotrace/blob/main/README.md",
      );
      assert.doesNotMatch(
        document.body.textContent.replace("中文", ""),
        /[\u4e00-\u9fff]/,
      );
    }
  }
});
