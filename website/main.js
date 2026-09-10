import "./style.css";
import { copyMessage } from "./i18n.js";

let toastTimeout;
const toast = document.querySelector(".toast");
for (const button of document.querySelectorAll("[data-copy]")) {
  let copiedTimeout;
  button.addEventListener("click", async () => {
    clearTimeout(copiedTimeout);
    button.classList.remove("is-copied");
    try {
      await navigator.clipboard.writeText(button.dataset.copy);
      toast.textContent = copyMessage(true);
      button.classList.add("is-copied");
      copiedTimeout = setTimeout(
        () => button.classList.remove("is-copied"),
        2000,
      );
    } catch {
      toast.textContent = copyMessage(false);
    }
    toast.classList.add("visible");
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => toast.classList.remove("visible"), 2600);
  });
}
for (const button of document.querySelectorAll("[data-provider]")) {
  button.addEventListener("click", () => {
    const provider = button.dataset.provider;
    const command =
      provider === "all"
        ? "npx takotrace"
        : `npx takotrace --provider ${provider}`;
    document.querySelector("#install-code").textContent = command;
    document.querySelector("#install-copy").dataset.copy = command;
    for (const option of document.querySelectorAll("[data-provider]")) {
      option.setAttribute("aria-pressed", String(option === button));
    }
  });
}
