import React, { useState } from 'react';

// Analysis CSV and restore backup are separate artifacts (#33). The server validates and
// computes every summary; this page only shows it and asks for explicit confirmation.
const maxBytes = 10 * 1024 * 1024;
const confirmation = '전체 교체';
type Counts = { added: number; skipped: number; conflicts: number; deleted: number };
type Summary = {
  mode: 'merge' | 'replace';
  dry_run: boolean;
  tables: Record<string, Counts>;
  conflicts: string[];
  retry_keys_cleared: number;
};
const labels: [string, string][] = [
  ['workouts', '운동 일지'],
  ['sets', '세트'],
  ['goals', '목표'],
  ['routines', '루틴'],
  ['machines', '머신'],
  ['brands', '브랜드'],
];
async function post(path: string, body: unknown): Promise<Summary> {
  const response = await fetch('/api/backup/' + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw Error(data.error ?? '백업 요청에 실패했습니다');
  return data;
}

export function Backup({ onRestored }: { onRestored: () => void }) {
  const [backup, setBackup] = useState<unknown>(null);
  const [fileName, setFileName] = useState('');
  const [mode, setMode] = useState<'merge' | 'replace'>('merge');
  const [typed, setTyped] = useState('');
  const [preview, setPreview] = useState<Summary | null>(null);
  const [result, setResult] = useState<Summary | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function check(value: unknown, nextMode: 'merge' | 'replace') {
    setPreview(null);
    setResult(null);
    setError('');
    setBusy(true);
    try {
      setPreview(await post('preview', { mode: nextMode, backup: value }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function choose(file: { name: string; size: number; text: () => Promise<string> }) {
    setBackup(null);
    setPreview(null);
    setResult(null);
    setTyped('');
    setFileName(file.name);
    if (file.size > maxBytes) {
      setError('백업 파일은 10MB 이하여야 합니다.');
      return;
    }
    let value: unknown;
    try {
      value = JSON.parse(await file.text());
    } catch {
      setError('백업 파일을 읽을 수 없습니다. 이 앱에서 내려받은 JSON 백업인지 확인하세요.');
      return;
    }
    setBackup(value);
    await check(value, mode);
  }
  async function run() {
    if (!preview || busy || (mode === 'replace' && typed !== confirmation)) return;
    setBusy(true);
    setError('');
    try {
      const done = await post(
        'restore',
        mode === 'replace' ? { mode, backup, confirm: typed } : { mode, backup },
      );
      setResult(done);
      setPreview(null);
      setBackup(null);
      setTyped('');
      onRestored();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const shown = result ?? preview;
  return (
    <section className="backup-page">
      <h2>백업·내보내기</h2>
      <section className="card">
        <h3>분석용 CSV</h3>
        <p>
          운동 일지의 세트를 한 행씩 UTF-8 CSV로 내려받습니다. 날짜는 YYYY-MM-DD, 중량은 머신
          기본중량을 포함한 총중량(kg)입니다. 머신이 없거나 기본중량을 모르면 빈 칸입니다.
        </p>
        <p>
          스프레드시트가 수식으로 실행하지 않도록 =, +, -, @, 탭, CR로 시작하는 글자 값 앞에
          작은따옴표(&apos;)를 붙입니다. CSV는 복원에 사용할 수 없습니다.
        </p>
        <a className="primary" href="/api/export/workouts.csv" download>
          CSV 내려받기
        </a>
      </section>
      <section className="card">
        <h3>복원용 백업 (JSON)</h3>
        <p>
          운동 일지·세트·목표·루틴·브랜드·머신과 그 연결을 버전이 있는 JSON 한 파일로 보관합니다.
          저장 재시도 키는 일시적인 중복 방지 기록이라 포함하지 않습니다. 백업 파일에는 개인 기록이
          들어 있으니 안전한 곳에 보관하세요.
        </p>
        <a className="primary" href="/api/backup" download>
          백업 파일 내려받기
        </a>
      </section>
      <section className="card">
        <h3>백업에서 복원</h3>
        <p>
          추가만(기본): 기존 기록은 수정·삭제하지 않고 새 기록만 추가합니다. 내용이 동일한 기록은
          건너뜁니다. 같은 브랜드·이름의 머신이 다르면 기존 값을 유지하고 충돌로 표시합니다.
        </p>
        <p>
          전체 교체: 현재 기록을 모두 삭제하고 백업 내용으로 바꿉니다. 저장 재시도 기록도
          초기화되므로 응답을 받지 못한 저장은 다시 저장하면 새 기록이 됩니다. 확인 문구 “
          {confirmation}”를 입력해야 실행됩니다.
        </p>
        <p>
          복원 전에 형식·버전·참조·크기(최대 10MB)를 검사하고 변경 요약을 미리 보여 줍니다. 복원은
          전부 성공하거나 전부 취소됩니다.
        </p>
        <label>
          복원 방식
          <select
            aria-label="복원 방식"
            value={mode}
            disabled={busy}
            onChange={(e) => {
              const next = e.target.value === 'replace' ? 'replace' : 'merge';
              setMode(next);
              setTyped('');
              if (backup !== null) void check(backup, next);
            }}
          >
            <option value="merge">추가만 (기본)</option>
            <option value="replace">전체 교체</option>
          </select>
        </label>
        <label>
          백업 파일
          <input
            aria-label="백업 파일 선택"
            type="file"
            accept=".json,application/json"
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void choose(file);
            }}
          />
        </label>
        {fileName && <p>선택한 파일: {fileName}</p>}
        {busy && <p role="status">백업을 확인하는 중…</p>}
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        {shown && (
          <div role="status">
            <h4>
              {result
                ? '복원을 완료했습니다.'
                : `미리보기 · ${mode === 'replace' ? '전체 교체' : '추가만'} (아직 변경되지 않았습니다)`}
            </h4>
            {shown.mode === 'replace' && !result && (
              <p className="error">
                기존 기록이 삭제됩니다. 삭제 수를 확인하세요. 진행 중이던 저장 재시도 기록도
                초기화됩니다({shown.retry_keys_cleared}건).
              </p>
            )}
            <ul>
              {labels.map(([key, label]) => {
                const c = shown.tables[key];
                return (
                  <li key={key}>
                    {label} · 추가 {c.added} · 건너뜀 {c.skipped}
                    {c.conflicts > 0 && ` · 충돌(기존 유지) ${c.conflicts}`}
                    {shown.mode === 'replace' && ` · 삭제 ${c.deleted}`}
                  </li>
                );
              })}
            </ul>
            {shown.conflicts.length > 0 && (
              <ul>
                {shown.conflicts.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            )}
          </div>
        )}
        {preview && !result && (
          <>
            {mode === 'replace' && (
              <label>
                확인 문구
                <input
                  aria-label="확인 문구"
                  value={typed}
                  placeholder={confirmation}
                  onChange={(e) => setTyped(e.target.value)}
                />
              </label>
            )}
            <button
              className="primary"
              disabled={busy || (mode === 'replace' && typed !== confirmation)}
              onClick={() => void run()}
            >
              복원 실행
            </button>
          </>
        )}
      </section>
    </section>
  );
}
