import { Download } from 'lucide-react';
import React, { useState } from 'react';

import { Button } from './components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from './components/ui/card';
import { Input } from './components/ui/input';
import { Label } from './components/ui/label';
import { Notice } from './components/ui/notice';
import { cn } from './lib/utils';

// Analysis CSV and restore backup are separate artifacts (#33). The server validates and
// computes every summary; this page only shows it and asks for explicit confirmation.
const maxBytes = 10 * 1024 * 1024;
const confirmation = '전체 교체';
// Each paragraph takes the size itself: the legacy `p` rule (12px) applies to the element directly.
const copy = 'flex flex-col gap-2';
const text = 'text-body-sm text-muted-foreground';
const field = 'flex flex-col gap-2';
// The browser's own select stays, as in the #101 set rows: the common Select (Radix) picks
// values differently, so every screen test and e2e step that chooses an option would change.
// Touch screens keep 16px text at every width (iOS zooms in below that), as the #101 set rows do.
const nativeSelect =
  'h-9 w-full rounded-md border border-input bg-transparent px-3 text-base shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 pointer-coarse:min-h-11 md:text-body-sm md:pointer-coarse:text-base dark:bg-input/30';
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
    <section className="flex flex-col gap-4">
      <h2>백업·내보내기</h2>
      <Card>
        <CardHeader>
          <CardTitle className="text-body font-semibold">분석용 CSV</CardTitle>
        </CardHeader>
        <CardContent className={copy}>
          <p className={text}>
            운동 일지의 세트를 한 행씩 UTF-8 CSV로 내려받습니다. 날짜는 YYYY-MM-DD, 중량은 머신
            기본중량을 포함한 총중량(kg)입니다. 머신이 없거나 기본중량을 모르면 빈 칸입니다.
          </p>
          <p className={text}>
            스프레드시트가 수식으로 실행하지 않도록 =, +, -, @, 탭, CR로 시작하는 글자 값 앞에
            작은따옴표(&apos;)를 붙입니다. CSV는 복원에 사용할 수 없습니다.
          </p>
        </CardContent>
        <CardFooter>
          <Button asChild>
            <a href="/api/export/workouts.csv" download>
              <Download aria-hidden />
              CSV 내려받기
            </a>
          </Button>
        </CardFooter>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-body font-semibold">복원용 백업 (JSON)</CardTitle>
        </CardHeader>
        <CardContent className={copy}>
          <p className={text}>
            운동 일지·세트·목표·루틴·브랜드·머신과 그 연결을 버전이 있는 JSON 한 파일로 보관합니다.
            저장 재시도 키는 일시적인 중복 방지 기록이라 포함하지 않습니다. 백업 파일에는 개인
            기록이 들어 있으니 안전한 곳에 보관하세요.
          </p>
        </CardContent>
        <CardFooter>
          <Button asChild>
            <a href="/api/backup" download>
              <Download aria-hidden />
              백업 파일 내려받기
            </a>
          </Button>
        </CardFooter>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-body font-semibold">백업에서 복원</CardTitle>
        </CardHeader>
        <CardContent className={copy}>
          <p className={text}>
            추가만(기본): 기존 기록은 수정·삭제하지 않고 새 기록만 추가합니다. 내용이 동일한 기록은
            건너뜁니다. 같은 브랜드·이름의 머신이 다르면 기존 값을 유지하고 충돌로 표시합니다.
          </p>
          <p className={text}>
            전체 교체: 현재 기록을 모두 삭제하고 백업 내용으로 바꿉니다. 저장 재시도 기록도
            초기화되므로 응답을 받지 못한 저장은 다시 저장하면 새 기록이 됩니다. 확인 문구 “
            {confirmation}”를 입력해야 실행됩니다.
          </p>
          <p className={text}>
            복원 전에 형식·버전·참조·크기(최대 10MB)를 검사하고 변경 요약을 미리 보여 줍니다. 복원은
            전부 성공하거나 전부 취소됩니다.
          </p>
        </CardContent>
        <CardContent className="flex flex-col gap-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className={field}>
              <Label htmlFor="backup-mode">복원 방식</Label>
              <select
                id="backup-mode"
                className={nativeSelect}
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
            </div>
            <div className={field}>
              <Label htmlFor="backup-file">백업 파일 선택</Label>
              <Input
                id="backup-file"
                className="md:pointer-coarse:text-base"
                type="file"
                accept=".json,application/json"
                disabled={busy}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void choose(file);
                }}
              />
            </div>
          </div>
          {fileName && (
            <p className="text-body-sm text-muted-foreground">선택한 파일: {fileName}</p>
          )}
          <Notice
            notice={
              busy
                ? { kind: 'status', text: preview ? '복원하는 중…' : '백업을 확인하는 중…' }
                : undefined
            }
          />
          <Notice notice={error ? { kind: 'error', text: error } : undefined} />
          {shown && (
            <div role="status" className="flex flex-col gap-3 rounded-lg border p-4">
              <h4 className="text-body-sm font-semibold">
                {result
                  ? '복원을 완료했습니다.'
                  : `미리보기 · ${mode === 'replace' ? '전체 교체' : '추가만'} (아직 변경되지 않았습니다)`}
              </h4>
              {shown.mode === 'replace' && !result && (
                <p className="text-body-sm text-destructive">
                  기존 기록이 삭제됩니다. 삭제 수를 확인하세요. 진행 중이던 저장 재시도 기록도
                  초기화됩니다({shown.retry_keys_cleared}건).
                </p>
              )}
              <ul aria-label="변경 요약" className="flex flex-col gap-1.5 text-body-sm">
                {labels.map(([key, label]) => {
                  const c = shown.tables[key];
                  return (
                    <li key={key}>
                      <span className="font-medium">{label}</span>
                      <span className="text-muted-foreground">
                        {' '}
                        · 추가 {c.added} · 건너뜀 {c.skipped}
                        {c.conflicts > 0 && ` · 충돌(기존 유지) ${c.conflicts}`}
                        {shown.mode === 'replace' && ` · 삭제 ${c.deleted}`}
                      </span>
                    </li>
                  );
                })}
              </ul>
              {shown.conflicts.length > 0 && (
                <ul
                  aria-label="충돌"
                  className="flex flex-col gap-1 border-t pt-3 text-body-sm text-muted-foreground"
                >
                  {shown.conflicts.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {preview && !result && (
            <div className="flex flex-col items-start gap-4 md:flex-row md:items-end">
              {mode === 'replace' && (
                <div className={cn(field, 'w-full md:w-64')}>
                  <Label htmlFor="backup-confirm">확인 문구</Label>
                  <Input
                    id="backup-confirm"
                    className="md:pointer-coarse:text-base"
                    value={typed}
                    placeholder={confirmation}
                    autoComplete="off"
                    onChange={(e) => setTyped(e.target.value)}
                  />
                </div>
              )}
              <Button
                variant={mode === 'replace' ? 'destructive' : 'default'}
                disabled={busy || (mode === 'replace' && typed !== confirmation)}
                onClick={() => void run()}
              >
                복원 실행
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
