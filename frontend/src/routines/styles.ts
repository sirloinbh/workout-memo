// #102, #378: the routine form's looks. Field labels, touch text, selects and hints come from
// components/form-styles.ts; the boxes and list below are only the routine builder's.
import { formHint, selectField, stackedFieldLabel, touchText } from '../components/form-styles';

export const fieldLabel = stackedFieldLabel;
export { touchText };
// Selects stay native like the journal's machine select (#101): the tests and the "Free workout"
// empty value rely on a real <select>.
export const nativeSelect = selectField;
export const hint = formHint;
export const box = 'my-5 min-w-0 rounded-xl border p-4';
export const legend = 'px-1 text-body-sm font-semibold text-foreground';
export const list = 'mt-2 space-y-1.5 pl-1 text-body-sm';
