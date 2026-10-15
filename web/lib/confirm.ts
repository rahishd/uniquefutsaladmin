// An in-app replacement for window.confirm(). Browsers can block or hide their own pop-ups, and the look cannot be styled.
// Use it like this:   if (!(await askConfirm("Delete this ad?"))) return;
// <ConfirmHost /> (mounted once in app/layout.tsx) shows the dialog. The button label and the red "danger" look are chosen
// from the first words of the message; pass options to set them yourself.

export type ConfirmOptions = { title?: string; confirmLabel?: string; cancelLabel?: string; danger?: boolean };
export type ConfirmRequest = ConfirmOptions & { message: string; resolve: (answer: boolean) => void };

let host: ((r: ConfirmRequest) => void) | null = null;

export function registerConfirmHost(h: (r: ConfirmRequest) => void) {
  host = h;
  return () => {
    if (host === h) host = null;
  };
}

export function askConfirm(message: string, options: ConfirmOptions = {}): Promise<boolean> {
  // no dialog on screen (it should not happen): fall back to the browser, so an action is never done without asking
  if (!host) return Promise.resolve(typeof window !== "undefined" ? window.confirm(message) : false);
  const show = host;
  return new Promise((resolve) => show({ message, ...options, resolve }));
}

const RULES: { test: RegExp; label: string; danger: boolean }[] = [
  { test: /^delete\b/i, label: "Delete", danger: true },
  { test: /^remove\b/i, label: "Remove", danger: true },
  { test: /^reject\b/i, label: "Reject", danger: true },
  { test: /^void\b/i, label: "Void", danger: true },
  { test: /^suspend\b/i, label: "Suspend", danger: true },
  { test: /^disable\b/i, label: "Disable", danger: true },
  { test: /^withdraw\b/i, label: "Withdraw", danger: true },
  { test: /^cancel\b/i, label: "Yes, cancel", danger: true },
  { test: /^blocking\b/i, label: "Block and cancel", danger: true },
  { test: /^take (this|the) .* back/i, label: "Take it back", danger: true },
  { test: /^put this .* back/i, label: "Put back", danger: true },
  { test: /^switch .* off/i, label: "Switch off", danger: true },
  { test: /^make a new/i, label: "Make a new one", danger: true },
  { test: /^make the final bill/i, label: "Make the bill", danger: false },
  { test: /^send\b/i, label: "Send", danger: false },
  { test: /^mark\b/i, label: "Mark as paid", danger: false },
  { test: /^open\b/i, label: "Open", danger: false },
  { test: /^let\b/i, label: "Allow", danger: false },
  { test: /^enable\b/i, label: "Enable", danger: false },
  { test: /^change\b/i, label: "Change it", danger: false },
];

export function describeConfirm(message: string, o: ConfirmOptions) {
  const rule = RULES.find((r) => r.test.test(message.trim()));
  const danger = o.danger ?? rule?.danger ?? false;
  return {
    danger,
    title: o.title ?? (danger ? "Are you sure?" : "Please confirm"),
    confirmLabel: o.confirmLabel ?? rule?.label ?? "Yes, continue",
    cancelLabel: o.cancelLabel ?? "Cancel",
  };
}
