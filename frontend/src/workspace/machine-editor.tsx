import { fieldErrors, machineSchema } from '../../../shared/contract';
import { FieldError } from '../components/field';
import { invalidProps } from '../components/field-props';
import { fieldLabel, selectField, textareaField, touchText } from '../components/form-styles';
import { Modal } from '../components/modal';
import { Button } from '../components/ui/button';
import { Checkbox } from '../components/ui/checkbox';
import { Input as CommonInput } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Spinner } from '../components/ui/spinner';
import { api, changed, type WriteAction } from './api';
import { fieldHint, noteText } from './form-text';
import { type Machine, officialLabel, type OfficialWeight } from './model';

/** The dialog that adds or edits one machine and links it to an official reference. */
export function MachineEditor({
  machineEditor,
  setMachineEditor,
  issues,
  setIssues,
  brands,
  officialWeights,
  saving,
  action,
}: {
  machineEditor: Partial<Machine>;
  setMachineEditor: (value: Partial<Machine> | null) => void;
  issues: Record<string, string>;
  setIssues: (issues: Record<string, string>) => void;
  brands: { id: number; name: string }[];
  officialWeights: OfficialWeight[] | null;
  saving: boolean;
  action: WriteAction;
}) {
  const invalid = (key: string) => invalidProps(key, issues[key]);
  const issue = (key: string) => <FieldError name={key}>{issues[key]}</FieldError>;
  return (
    <Modal
      title={machineEditor.id ? 'Edit machine details' : 'Add machine'}
      close={() => {
        setIssues({});
        setMachineEditor(null);
      }}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const checked = machineSchema.safeParse(machineEditor);
          setIssues(checked.success ? {} : fieldErrors(checked.error));
          if (!checked.success) return;
          void action(
            () =>
              api(
                '/machines' + (machineEditor.id ? '/' + machineEditor.id : ''),
                machineEditor.id ? 'PUT' : 'POST',
                machineEditor,
              ),
            () => setMachineEditor(null),
            changed.machines,
          );
        }}
      >
        <Label className={fieldLabel}>
          Brand
          <select
            required
            className={selectField}
            value={machineEditor.brand_id ?? ''}
            {...invalid('brand_id')}
            onChange={(e) => {
              const brandId = Number(e.target.value);
              const name = brands.find((b) => b.id === brandId)?.name;
              const linked = officialWeights?.find(
                (r) => r.id === machineEditor.official_weight_id,
              );
              // A reference from another brand cannot stay linked after a brand change.
              setMachineEditor({
                ...machineEditor,
                brand_id: brandId,
                official_weight_id:
                  linked && linked.brand === name ? machineEditor.official_weight_id : null,
              });
            }}
          >
            <option value="" disabled>
              Choose a brand
            </option>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </Label>
        {issue('brand_id')}
        {(() => {
          const brandName = brands.find((b) => b.id === machineEditor.brand_id)?.name;
          const refs = (officialWeights ?? []).filter((r) => r.brand === brandName);
          const selected = refs.find((r) => r.id === machineEditor.official_weight_id);
          if (officialWeights === null)
            return <p className={fieldHint}>Could not load the official reference.</p>;
          if (!refs.length)
            return <p className={fieldHint}>No official reference data for this brand.</p>;
          return (
            <>
              <Label className={fieldLabel}>
                Official reference (optional)
                <select
                  className={selectField}
                  value={selected?.id ?? ''}
                  onChange={(e) =>
                    setMachineEditor({
                      ...machineEditor,
                      official_weight_id: e.target.value === '' ? null : Number(e.target.value),
                    })
                  }
                >
                  <option value="">Not linked</option>
                  {refs.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.lineup} · {r.model_name}
                      {r.setting ? ` (${r.setting})` : ''} — {officialLabel(r)}
                    </option>
                  ))}
                </select>
              </Label>
              {selected && (
                <div
                  role="note"
                  aria-label="Official reference"
                  className="mb-4 flex flex-col gap-1.5 rounded-md border bg-muted p-3 [overflow-wrap:anywhere]"
                >
                  <strong className="text-body-sm font-medium">
                    Official reference: {officialLabel(selected)}
                  </strong>
                  <p className={noteText}>
                    {selected.brand} {selected.lineup}
                    {selected.model_number ? ` ${selected.model_number}` : ''} ·{' '}
                    {selected.official_item_name}
                    {selected.official_kg_text
                      ? ` · Manufacturer kg figure ${selected.official_kg_text}`
                      : ''}
                  </p>
                  {selected.notes && <p className={noteText}>{selected.notes}</p>}
                  <p className={noteText}>
                    {selected.source_url ? (
                      <a
                        className="text-foreground underline underline-offset-4"
                        href={selected.source_url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Official manufacturer source
                      </a>
                    ) : (
                      'No official source'
                    )}{' '}
                    · checked {selected.checked_date}
                  </p>
                  <p className={noteText}>
                    The official reference is the starting resistance without plates and is not
                    automatically added to the base weight below. A one-side value is not the sum of
                    both sides.
                  </p>
                </div>
              )}
            </>
          );
        })()}
        <Label className={fieldLabel}>
          Machine name
          <CommonInput
            required
            className={touchText}
            maxLength={120}
            value={machineEditor.name}
            onChange={(e) => setMachineEditor({ ...machineEditor, name: e.target.value })}
            {...invalid('name')}
          />
        </Label>
        {issue('name')}
        <Label className={fieldLabel}>
          Base weight (kg) · leave blank if unknown
          <CommonInput
            className={touchText}
            type="number"
            min="0"
            max="99999"
            step="0.25"
            value={machineEditor.base_weight ?? ''}
            onChange={(e) =>
              setMachineEditor({
                ...machineEditor,
                base_weight: e.target.value === '' ? null : Number(e.target.value),
              })
            }
            {...invalid('base_weight')}
          />
        </Label>
        {issue('base_weight')}
        <p className={fieldHint}>
          Leave the base weight blank if you could not confirm it. It is stored separately from a
          confirmed 0 kg, and changing the base weight does not change the total weight of past
          sets.
        </p>
        <Label className={fieldLabel}>
          Source / setting notes
          <textarea
            className={textareaField}
            maxLength={2000}
            value={machineEditor.notes}
            onChange={(e) => setMachineEditor({ ...machineEditor, notes: e.target.value })}
          />
        </Label>
        <div className="mb-4 flex items-center gap-2">
          <Checkbox
            id="machine-single-joint"
            // The legacy touch rule makes every .legacy button 44px; the box stays 16px and the
            // common Checkbox's 44px ::after area is the target (project-standards#415).
            className="pointer-coarse:min-h-4 pointer-coarse:min-w-4"
            checked={machineEditor.single_joint === true}
            onCheckedChange={(checked) =>
              setMachineEditor({ ...machineEditor, single_joint: checked === true })
            }
          />
          <Label
            htmlFor="machine-single-joint"
            className="mb-0 flex-row text-meta font-normal text-foreground"
          >
            Single-joint exercise machine (uses the single-joint default rest when a set is
            completed)
          </Label>
        </div>
        <Button type="submit" className="w-full" disabled={saving}>
          {saving && <Spinner size="sm" aria-hidden />}
          Save machine
        </Button>
      </form>
    </Modal>
  );
}
