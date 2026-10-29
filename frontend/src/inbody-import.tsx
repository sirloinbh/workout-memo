import React, { useState } from 'react';

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

const labels: Record<Target, string> = {
  date: '측정 날짜',
  body_weight_kg: '체중 kg',
  body_fat_percent: '체지방률 %',
  skeletal_muscle_kg: '골격근량 kg',
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
      setStatus('사진에서 글자를 읽는 중…');
      try {
        const recognized = await recognize(file);
        setText(recognized);
        preview([rowFromText(recognized)]);
        setStatus('읽은 값을 확인하고 비어 있거나 틀린 값을 고친 뒤 저장하세요.');
      } catch (e) {
        setStatus('');
        setError(`사진을 읽지 못했습니다: ${(e as Error).message}`);
      } finally {
        setBusy(false);
      }
      return;
    }
    const cells = parseCsv(await file.text());
    if (cells.length < 2) {
      setError('머리글과 측정값이 있는 CSV 파일을 선택하세요.');
      return;
    }
    const columns = detectColumns(cells[0]);
    setCsv({ cells, columns });
    preview(rowsFromCsv(cells, columns));
    setStatus(
      targets.every((t) => columns[t] !== null)
        ? '열을 자동으로 찾았습니다. 값을 확인한 뒤 저장하세요.'
        : '일부 열을 찾지 못했습니다. 아래에서 열을 직접 고르세요.',
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
        next[i] = { ...row, selected: false, result: '저장함' };
        saved++;
      } catch (e) {
        // A failed row (e.g. a date that already has a record) stays for correction.
        next[i] = { ...row, result: (e as Error).message };
      }
      setRows([...next]);
    }
    setBusy(false);
    setStatus(
      `${saved}건을 저장했습니다.` + (saved < chosen.length ? ' 실패한 행을 확인하세요.' : ''),
    );
    if (saved) done();
  }

  return (
    <section className="card inbody-import" aria-label="인바디 가져오기">
      <h2>인바디 가져오기</h2>
      <p className="form-hint">
        인바디에서 내보낸 CSV 파일이나 결과지 사진을 고르세요. 사진은 이 브라우저에서만 읽고 서버로
        보내지 않으며, 원본 파일은 보관하지 않습니다. 읽지 못한 값은 비워 두니 확인한 뒤 저장하세요.
      </p>
      <label>
        인바디 파일 또는 결과지 사진
        <input
          type="file"
          accept=".csv,.txt,text/csv,image/*"
          disabled={busy}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void open(file);
            e.target.value = '';
          }}
        />
      </label>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {status && <p role="status">{status}</p>}
      {csv && (
        <fieldset className="form-grid" disabled={busy}>
          <legend>파일의 열</legend>
          {targets.map((t) => (
            <label key={t}>
              {labels[t]} 열
              <select
                value={csv.columns[t] ?? ''}
                onChange={(e) => remap(t, e.target.value === '' ? null : Number(e.target.value))}
              >
                <option value="">없음</option>
                {csv.cells[0].map((h, i) => (
                  <option key={i} value={i}>
                    {h || `${i + 1}번째 열`}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </fieldset>
      )}
      {text && (
        <details>
          <summary>사진에서 읽은 글자</summary>
          <pre>{text}</pre>
        </details>
      )}
      {rows.length > 0 && (
        <>
          <div className="table-scroll">
            <table className="inbody-preview">
              <thead>
                <tr>
                  <th>저장</th>
                  {targets.map((t) => (
                    <th key={t}>{labels[t]}</th>
                  ))}
                  <th>확인</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => {
                  const problem = check(row).error;
                  return (
                    <tr key={i}>
                      <td>
                        <input
                          type="checkbox"
                          aria-label={`${i + 1}행 저장`}
                          checked={row.selected && !problem}
                          disabled={busy || !!problem}
                          onChange={(e) => update(i, { selected: e.target.checked })}
                        />
                      </td>
                      {targets.map((t) => (
                        <td key={t}>
                          <input
                            aria-label={`${i + 1}행 ${labels[t]}`}
                            type={t === 'date' ? 'date' : 'number'}
                            step={t === 'date' ? undefined : '0.01'}
                            inputMode={t === 'date' ? undefined : 'decimal'}
                            placeholder="미입력"
                            disabled={busy}
                            value={row[t]}
                            onChange={(e) =>
                              update(i, { [t]: e.target.value, selected: true, result: undefined })
                            }
                          />
                        </td>
                      ))}
                      <td>{row.result ?? (problem || '저장 가능')}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <button
            className="primary"
            disabled={busy || !chosen.length}
            onClick={() => void saveAll()}
          >
            선택한 {chosen.length}건 저장
          </button>
        </>
      )}
    </section>
  );
}
