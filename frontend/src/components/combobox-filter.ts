// #124: how the Combobox filters its suggestions.
export const maxComboboxOptions = 8;

// Spaces and letter case are ignored when names are compared.
export const loose = (text: string) => text.replace(/\s+/g, '').toLowerCase();

// Options that contain the typed text, except the exact value already in the field.
export function filterOptions(options: readonly string[], value: string) {
  const typed = loose(value);
  return options
    .filter((option) => loose(option).includes(typed) && option !== value.trim())
    .slice(0, maxComboboxOptions);
}
