// Each language is rendered at its own URL; the page language survives reloads.
export function copyMessage(success) {
  if (document.documentElement.lang === "en")
    return success
      ? "Launch command copied"
      : "Clipboard unavailable. Please copy the command manually.";
  return success ? "启动命令已复制" : "未能访问剪贴板，请手动复制命令";
}
