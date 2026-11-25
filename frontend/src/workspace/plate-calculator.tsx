import React from 'react';

import { Button } from '../components/ui/button';
import {
  defaultPlateSettings,
  formatKg,
  parsePlateText,
  type PlateSettings,
  splitPlates,
} from '../plates';

/** #479: which plates to load on each side of the bar for a total target weight. */
export function PlateCalculator({
  target,
  settings,
  onSettings,
  id,
}: {
  target: number;
  settings: PlateSettings;
  onSettings: (next: PlateSettings) => void;
  id: string;
}) {
  const split = splitPlates(target, settings);
  const [bar, setBar] = React.useState(String(settings.bar));
  const [plates, setPlates] = React.useState(settings.plates.join(', '));
  const parsedBar = Number(bar);
  const parsedPlates = parsePlateText(plates);
  const valid = bar.trim() !== '' && parsedBar > 0 && parsedBar <= 100 && parsedPlates !== null;
  const list = (perSide: { plate: number; count: number }[]) =>
    perSide.length === 0
      ? 'No plates, just the bar'
      : perSide.map((p) => `${p.count} × ${formatKg(p.plate)}`).join(' + ');
  return (
    <details data-slot="plate-calculator" className="text-meta md:col-span-2">
      <summary className="min-h-11 cursor-pointer py-2.5 text-muted-foreground">Plates</summary>
      <div className="grid gap-2 pb-2">
        <p className="m-0">
          {!Number.isFinite(target) && 'Enter a weight to see the plates.'}
          {Number.isFinite(target) &&
            split.kind === 'below-bar' &&
            `The target is below the ${formatKg(split.bar)} bar.`}
          {split.kind === 'exact' && `Each side: ${list(split.perSide)}`}
          {split.kind === 'inexact' &&
            `Cannot be made with these plates. Closest: ${formatKg(split.nearest)}${
              split.perSide.length ? ` (each side: ${list(split.perSide)})` : ''
            }`}
        </p>
        <div className="grid gap-2 min-[480px]:grid-cols-2">
          <label htmlFor={`${id}-bar`} className="grid gap-1">
            Bar weight (kg)
            <input
              id={`${id}-bar`}
              inputMode="decimal"
              value={bar}
              aria-invalid={bar.trim() !== '' && !(parsedBar > 0 && parsedBar <= 100)}
              onChange={(e) => setBar(e.target.value)}
            />
          </label>
          <label htmlFor={`${id}-plates`} className="grid gap-1">
            Plates (kg, comma separated)
            <input
              id={`${id}-plates`}
              value={plates}
              aria-invalid={parsedPlates === null}
              onChange={(e) => setPlates(e.target.value)}
            />
          </label>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!valid}
            onClick={() => onSettings({ format: 1, bar: parsedBar, plates: parsedPlates! })}
          >
            Use these plates
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              const d = defaultPlateSettings();
              setBar(String(d.bar));
              setPlates(d.plates.join(', '));
              onSettings(d);
            }}
          >
            Default plates
          </Button>
        </div>
      </div>
    </details>
  );
}
