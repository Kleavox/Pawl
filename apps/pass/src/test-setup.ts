import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

if (typeof HTMLDialogElement.prototype.showModal !== "function") {
  HTMLDialogElement.prototype.showModal = function showModal(
    this: HTMLDialogElement,
  ): void {
    if (this.open) {
      throw new Error("showModal on a dialog that is already open");
    }
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.show = function show(
    this: HTMLDialogElement,
  ): void {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close(
    this: HTMLDialogElement,
  ): void {
    this.removeAttribute("open");
  };
}

afterEach(() => {
  cleanup();
});
