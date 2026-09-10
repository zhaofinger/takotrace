import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseHTML } from "linkedom";
import { translations } from "./translations.js";

export function normalizeSiteUrl(value) {
  if (!value) return undefined;
  const url = new URL(value);
  if (
    !["https:", "http:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      "WEBSITE_URL must be an HTTP(S) site URL without credentials, query parameters, or a fragment.",
    );
  }
  url.pathname = url.pathname.replace(/\/?$/, "/");
  return url.href;
}

export function renderPage(html, language, siteUrl) {
  const { document } = parseHTML(html);
  const english = language === "en";
  document.documentElement.lang = english ? "en" : "zh-CN";
  if (english) {
    for (const [selector, text, attribute] of translations) {
      const element = document.querySelector(selector);
      if (!element) throw new Error(`Missing translation target: ${selector}`);
      if (attribute) element.setAttribute(attribute, text);
      else element.textContent = text;
    }
  }
  const toggle = document.querySelector(".language-toggle");
  toggle.textContent = english ? "中文" : "English";
  toggle.setAttribute("href", english ? "./" : "./en.html");
  toggle.setAttribute("lang", english ? "zh-CN" : "en");
  toggle.setAttribute("hreflang", english ? "zh-CN" : "en");
  toggle.setAttribute(
    "aria-label",
    english ? "切换到中文" : "Switch to English",
  );
  const imageAlt = english
    ? "TakoTrace session inspector and sequence diagram"
    : "TakoTrace 会话查看器和时序图";
  const meta = (key, value, attribute = "name") => {
    let element = document.head.querySelector(`meta[${attribute}="${key}"]`);
    if (!element) {
      element = document.createElement("meta");
      element.setAttribute(attribute, key);
      document.head.append(element);
    }
    element.setAttribute("content", value);
  };
  for (const element of document.querySelectorAll(
    'link[rel="canonical"], link[rel="alternate"][hreflang], script[type="application/ld+json"], meta[property="og:url"], meta[property="og:image"], meta[name="twitter:image"]',
  ))
    element.remove();
  const link = (rel, href, lang) => {
    const element = document.createElement("link");
    element.setAttribute("rel", rel);
    element.setAttribute("href", href);
    if (lang) element.setAttribute("hreflang", lang);
    document.head.append(element);
  };
  const title = document.querySelector("title").textContent;
  const description = document
    .querySelector('meta[name="description"]')
    .getAttribute("content");
  meta(
    "robots",
    siteUrl ? "index, follow, max-image-preview:large" : "noindex, follow",
  );
  meta("og:site_name", "TakoTrace", "property");
  meta("og:locale", english ? "en_US" : "zh_CN", "property");
  meta("og:locale:alternate", english ? "zh_CN" : "en_US", "property");
  meta("twitter:card", "summary_large_image");
  meta("twitter:title", title);
  meta("twitter:description", description);
  meta("og:image:alt", imageAlt, "property");
  meta("twitter:image:alt", imageAlt);
  meta("og:image:width", "3108", "property");
  meta("og:image:height", "2096", "property");
  meta("og:image:type", "image/png", "property");

  const pageUrl = siteUrl && new URL(english ? "en.html" : "./", siteUrl).href;
  if (siteUrl) {
    link("canonical", pageUrl);
    link("alternate", siteUrl, "zh-CN");
    link("alternate", new URL("en.html", siteUrl).href, "en");
    link("alternate", siteUrl, "x-default");
    meta("og:url", pageUrl, "property");
    const imageUrl = new URL("assets/takotrace-preview.png", siteUrl).href;
    meta("og:image", imageUrl, "property");
    meta("twitter:image", imageUrl);
  }
  const schema = document.createElement("script");
  schema.type = "application/ld+json";
  schema.textContent = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "TakoTrace",
    description,
    ...(pageUrl ? { url: pageUrl } : {}),
    applicationCategory: "DeveloperApplication",
    operatingSystem: "Windows, macOS, Linux",
    softwareRequirements: "Node.js 22+; Codex or Claude Code",
    license: "https://www.apache.org/licenses/LICENSE-2.0",
    isAccessibleForFree: true,
    inLanguage: english ? "en" : "zh-CN",
    downloadUrl: "https://www.npmjs.com/package/takotrace",
    sameAs: ["https://github.com/zhaofinger/takotrace"],
  }).replace(/</g, "\\u003c");
  document.head.append(schema);
  return "<!doctype html>\n" + document.documentElement.outerHTML;
}

export function sitemap(siteUrl) {
  const escape = (value) =>
    value
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll('"', "&quot;");
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    [siteUrl, new URL("en.html", siteUrl).href]
      .map((url) => `  <url><loc>${escape(url)}</loc></url>`)
      .join("\n") +
    "\n</urlset>\n"
  );
}

export function websiteSeo(siteUrl) {
  return {
    name: "takotrace-static-seo",
    enforce: "post",
    transformIndexHtml: {
      order: "post",
      handler(html, context) {
        if (context.path.endsWith("/demo.html")) {
          return context.server
            ? html
            : html.replace(
                "</head>",
                `<meta http-equiv="Content-Security-Policy" content="connect-src 'none'"></head>`,
              );
        }
        // Development previews are deliberately not indexable.
        return renderPage(
          html,
          context.path.endsWith("/en.html") ? "en" : "zh",
          context.server ? undefined : siteUrl,
        );
      },
    },
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        if (request.url?.split("?")[0] !== "/en.html") return next();
        try {
          const html = await readFile(
            resolve(server.config.root, "index.html"),
            "utf8",
          );
          const rendered = await server.transformIndexHtml("/en.html", html);
          response.setHeader("Content-Type", "text/html; charset=utf-8");
          response.end(rendered);
        } catch (error) {
          next(error);
        }
      });
    },
    async generateBundle(_options, bundle) {
      this.emitFile({
        type: "asset",
        fileName: "assets/takotrace-preview.png",
        source: await readFile(resolve("assets/takotrace-screenshot.png")),
      });
      const index = bundle["index.html"];
      if (!index || index.type !== "asset")
        throw new Error("Missing website index.html");
      index.source = renderPage(String(index.source), "zh", siteUrl);
      this.emitFile({
        type: "asset",
        fileName: "en.html",
        source: renderPage(String(index.source), "en", siteUrl),
      });
      this.emitFile({
        type: "asset",
        fileName: "robots.txt",
        source: siteUrl
          ? `User-agent: *\nAllow: /\n\nSitemap: ${new URL("sitemap.xml", siteUrl).href}\n`
          : "User-agent: *\nAllow: /\n",
      });
      if (siteUrl)
        this.emitFile({
          type: "asset",
          fileName: "sitemap.xml",
          source: sitemap(siteUrl),
        });
    },
  };
}
