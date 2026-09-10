import { dirname, resolve } from "node:path";
import react from "@vitejs/plugin-react";

export function demoPlugins() {
  const client = resolve("src/web/client");
  return [
    react(),
    {
      name: "takotrace-demo-data",
      enforce: "pre",
      transform(code, id) {
        if (id === resolve("src/web/styles.css")) {
          return code.replace(
            'url("/takotrace-logo.png")',
            'url("../../assets/takotrace-logo.png")',
          );
        }
      },
      resolveId(source, importer) {
        if (
          importer &&
          source.startsWith(".") &&
          resolve(dirname(importer.split("?")[0]), source).replace(
            /\.ts$/,
            "",
          ) === client
        ) {
          return resolve("website/demo/client.ts");
        }
      },
    },
  ];
}
export const websiteInputs = {
  index: resolve("website/index.html"),
  demo: resolve("website/demo.html"),
};
