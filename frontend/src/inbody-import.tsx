import React, { useState } from 'react';

import { AlertBanner } from './components/alert-banner';
import {
  fieldLabel as stackedLabel,
  formHint as hint,
  selectField,
  touchText,
} from './components/form-styles';
import { Button } from './components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './components/ui/card';
import { Checkbox } from './components/ui/checkbox';
import { Input } from './components/ui/input';
import { Label } from './components/ui/label';
import { Notice } from './components/ui/notice';
import { bodyMeasurementSchema, fieldErrors } from './contract';
import {
  detectColumns,
  parseCsv,
  type PreviewRow,
  rowFromText,
  rowsFromCsv,
  type Target,
  targets,
} from './inbody';
import { cn } from './lib/utils';

// The panel spaces its parts with gap, so its labels drop the shared bottom margin.
const fieldLabel = cn(stackedLabel, 'mb-0');
const cell = 'px-3 py-2 text-left align-middle font-normal';

const labels: Record<Target, string> = {
  date: 'Measurement date',
  body_weight_kg: 'Weight kg',
  body_fat_percent: 'Body fat %',
  skeletal_muscle_kg: 'Skeletal muscle mass kg',
};
type Row = PreviewRow & { selected: boolean; result?: string };
type Csv = { cells: string[][]; columns: Record<Target, number | null> };

// The same shared contract the server uses (#64): empty values are NULL, never 0.
function check(row: PreviewRow) {
  const body = {
    date: row.date,
    body_weight_kg: row.body_weight_kg === '' ? null : Number(row.body_weight_kg),
    body_fat_percent: row.body_fat_percent === '' ? null : Number(row.body_fat_percent),
    skeletal_muscle_kg: row.skeletal_muscle_kg === '' ? null : Number(row.skeletal_muscle_kg),
  };
  const parsed = bodyMeasurementSchema.safeParse(body);
  return parsed.success
    ? { body, error: '' }
    : { body, error: Object.values(fieldErrors(parsed.error)).join(' · ') };
}

// Photos are read in this browser with Tesseract; the image is never uploaded or kept.
async function recognize(file: File) {
  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker('kor+eng');
  try {
    return (await worker.recognize(file)).data.text;
  } finally {
    await worker.terminate();
  }
}

// #89: brings InBody results in through an editable preview. Only confirmed rows are
// saved, one request per row, and the original file is never stored.
export function InbodyImport({
  save,
  done,
}: {
  save: (body: ReturnType<typeof check>['body']) => Promise<unknown>;
  done: () => void;
}) {
  const [csv, setCsv] = useState<Csv | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const preview = (next: PreviewRow[]) =>
    setRows(next.map((r) => ({ ...r, selected: !check(r).error })));

  async function open(file: File) {
    setCsv(null);
    setRows([]);
    setText('');
    setStatus('');
    setError('');
    if (file.type.startsWith('image/')) {
      setBusy(true);
      setStatus('Reading text from the photo…');
      try {
        const recognized = await recognize(file);
        setText(recognized);
        preview([rowFromText(recognized)]);
        setStatus('Check the values read, fix any that are empty or wrong, then save.');
      } catch (e) {
        setStatus('');
        setError(`Could not read the photo: ${(e as Error).message}`);
      } finally {
        setBusy(false);
      }
      return;
    }
    const cells = parseCsv(await file.text());
    if (cells.length < 2) {
      setError('Choose a CSV file with a header row and measurements.');
      return;
    }
    const columns = detectColumns(cells[0]);
    setCsv({ cells, columns });
    preview(rowsFromCsv(cells, columns));
    setStatus(
      targets.every((t) => columns[t] !== null)
        ? 'Columns were found automatically. Check the values, then save.'
        : 'Some columns were not found. Choose them below.',
    );
  }
  function remap(target: Target, index: number | null) {
    if (!csv) return;
    const columns = { ...csv.columns, [target]: index };
    setCsv({ ...csv, columns });
    preview(rowsFromCsv(csv.cells, columns));
  }
  const update = (i: number, change: Partial<Row>) =>
    setRows(rows.map((r, j) => (j === i ? { ...r, ...change } : r)));
  const chosen = rows.filter((r) => r.selected && !check(r).error);

  async function saveAll() {
    setBusy(true);
    setError('');
    const next = [...rows];
    let saved = 0;
    for (const [i, row] of rows.entries()) {
      if (!row.selected || check(row).error) continue;
      try {
        await save(check(row).body);
        next[i] = { ...row, selected: false, result: 'Saved' };
        saved++;
      } catch (e) {
        // A failed row (e.g. a date that already has a record) stays for correction.
        next[i] = { ...row, result: (e as Error).message };
      }
      setRows([...next]);
    }
    setBusy(false);
    setStatus(`${saved} ${saved === 1 ? 'record' : 'records'} saved.`);
    // #223: a partial failure is a warning, not a progress line; each row keeps its reason.
    if (saved < chosen.length)
      setError(
        `${chosen.length - saved} ${chosen.length - saved === 1 ? 'record was' : 'records were'} not saved. Check the reason in the Check column of the table, fix it, then save again.`,
      );
    if (saved) done();
  }

  return (
    <Card role="region" aria-label="Import InBody" className="mt-4 gap-4 shadow-none">
      <CardHeader>
        <CardTitle asHeading="h2" className="text-body font-semibold">
          Import InBody
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className={hint}>
          Choose a CSV file exported from InBody or a photo of the result sheet. Photos are read
          only in this browser and are not sent to the server, and the original file is not kept.
          Values that could not be read are left blank, so check them before saving.
        </p>
        <Label className={fieldLabel}>
          InBody file or result sheet photo
          <Input
            className={touchText}
            type="file"
            accept=".csv,.txt,text/csv,image/*"
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void open(file);
              e.target.value = '';
            }}
          />
        </Label>
        {error && <AlertBanner className="mb-0">{error}</AlertBanner>}
        <Notice notice={status ? { kind: 'status', text: status } : undefined} />
        {csv && (
          <fieldset
            className="m-0 grid min-w-0 grid-cols-2 gap-x-3 gap-y-4 border-0 p-0 md:gap-x-5 pointer-coarse:max-[480px]:grid-cols-1"
            disabled={busy}
          >
            <legend className="mb-2 text-body-sm font-medium">File column</legend>
            {targets.map((t) => (
              <Label key={t} className={fieldLabel}>
                {labels[t]} column
                <select
                  className={selectField}
                  value={csv.columns[t] ?? ''}
                  onChange={(e) => remap(t, e.target.value === '' ? null : Number(e.target.value))}
                >
                  <option value="">None</option>
                  {csv.cells[0].map((h, i) => (
                    <option key={i} value={i}>
                      {h || `Column ${i + 1}`}
                    </option>
                  ))}
                </select>
              </Label>
            ))}
          </fieldset>
        )}
        {text && (
          <details className="text-body-sm">
            <summary className="cursor-pointer">Text read from the photo</summary>
            <pre className="mt-2 rounded-md bg-muted p-3 text-meta whitespace-pre-wrap">{text}</pre>
          </details>
        )}
        {rows.length > 0 && (
          <>
            {/* On a phone the table scrolls sideways inside the card; keyboard users reach it too. */}
            <div
              // eslint-disable-next-line jsx-a11y-x/no-noninteractive-tabindex -- a scrollable region must be focusable.
              tabIndex={0}
              role="region"
              aria-label="InBody preview"
              className="max-w-full overflow-x-auto rounded-md border outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              <table className="w-full border-collapse text-body-sm">
                <thead className="bg-muted text-meta text-muted-foreground">
                  <tr>
                    <th scope="col" className={cell}>
                      Save
                    </th>
                    {targets.map((t) => (
                      <th scope="col" key={t} className={cell}>
                        {labels[t]}
                      </th>
                    ))}
                    <th scope="col" className={cell}>
                      Confirm
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => {
                    const problem = check(row).error;
                    return (
                      <tr key={i} className="border-t">
                        <td className={cell}>
                          <Checkbox
                            aria-label={`Save row ${i + 1}`}
                            // The legacy touch rule makes every .legacy button 44px; the box
                            // stays 16px with the common 44px ::after area, as in the machine form.
                            className="pointer-coarse:min-h-4 pointer-coarse:min-w-4"
                            checked={row.selected && !problem}
                            disabled={busy || !!problem}
                            onCheckedChange={(checked) => update(i, { selected: checked === true })}
                          />
                        </td>
                        {targets.map((t) => (
                          <td key={t} className={cell}>
                            <Input
                              aria-label={`Row ${i + 1} ${labels[t].toLowerCase()}`}
                              className={cn(touchText, t === 'date' ? 'min-w-36' : 'w-24')}
                              type={t === 'date' ? 'date' : 'number'}
                              step={t === 'date' ? undefined : '0.01'}
                              inputMode={t === 'date' ? undefined : 'decimal'}
                              placeholder="Not entered"
                              disabled={busy}
                              value={row[t]}
                              onChange={(e) =>
                                update(i, {
                                  [t]: e.target.value,
                                  selected: true,
                                  result: undefined,
                                })
                              }
                            />
                          </td>
                        ))}
                        <td className={cn(cell, 'min-w-32 text-meta text-muted-foreground')}>
                          {row.result ?? (problem || 'Can save')}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Button
              className="self-start"
              disabled={busy || !chosen.length}
              onClick={() => void saveAll()}
            >
              Save {chosen.length} selected
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
