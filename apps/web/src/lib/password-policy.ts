export const passwordRules = [
  { key: "length", test: (value: string) => Array.from(value).length >= 8 },
  { key: "uppercase", test: (value: string) => /[A-Z]/.test(value) },
  { key: "lowercase", test: (value: string) => /[a-z]/.test(value) },
  { key: "number", test: (value: string) => /[0-9]/.test(value) },
  { key: "symbol", test: (value: string) => /[!-/:-@[-`{-~]/.test(value) },
] as const;

export function validNewPassword(value: string) {
  return new TextEncoder().encode(value).length <= 72 && passwordRules.every((rule) => rule.test(value));
}
