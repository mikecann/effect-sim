/**
 * Returns true if the keyboard event target is an editable element where
 * keystrokes should be handled by the element itself (e.g. typing in inputs).
 */
export function isKeyboardEventFromEditable(e: KeyboardEvent): boolean {
  const target = e.target as HTMLElement | null;
  if (!target) return false;

  // Contenteditable elements
  if (target.closest('[contenteditable="true"]')) return true;

  // ARIA textbox role
  const role = target.getAttribute("role");
  if (role === "textbox") return true;

  // Native inputs/textareas
  const tag = target.tagName;
  if (tag === "TEXTAREA") return true;
  if (tag === "INPUT") {
    const type = (target as HTMLInputElement).type;
    // Treat non-text-like inputs as non-editable for our purposes
    const nonTextLike = [
      "button",
      "checkbox",
      "color",
      "file",
      "hidden",
      "image",
      "radio",
      "range",
      "reset",
      "submit",
    ];
    return !nonTextLike.includes(type);
  }

  return false;
}
