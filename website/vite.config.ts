import { defineConfig, loadEnv } from "vite";
import { normalizeSiteUrl, websiteSeo } from "./seo.js";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, "website", "WEBSITE_");
  const siteUrl = normalizeSiteUrl(process.env.WEBSITE_URL || env.WEBSITE_URL);
  return {
    root: "website",
    base: "./",
    plugins: [websiteSeo(siteUrl)],
    build: { outDir: "../dist-website", emptyOutDir: true },
    server: { host: "127.0.0.1", port: 4174 },
  };
});
