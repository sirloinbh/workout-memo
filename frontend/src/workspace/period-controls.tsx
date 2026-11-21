import { AlertBanner } from '../components/ui/alert-banner';
import { Button } from '../components/ui/button';
import { DateStepper, RangeSummary } from '../components/ui/date-stepper';
import { FieldError } from '../components/ui/field';
import { invalidProps } from '../components/ui/field-props';
import { Input as CommonInput } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { SegmentedControl } from '../components/ui/segmented-control';
import { checkRange, maxRangeDays } from '../date-range';
import { periodOptions } from './model';
import type { PeriodRange } from './use-period-range';

/** #17 period selection, shared by the dashboard, journal and body measurements. */
export function PeriodControls({ range }: { range: PeriodRange }) {
  const {
    customRange,
    badRangeAddress,
    setRangeAddress,
    customOpen,
    setCustomOpen,
    customDraft,
    setCustomDraft,
    customErrors,
    setCustomErrors,
    period,
    setPeriod,
    anchor,
    setAnchor,
    from,
    to,
    move,
  } = range;
  return (
    <>
      {/* #71: on narrow phones the date control wraps under the period tabs. */}
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <SegmentedControl
          label="Period"
          options={periodOptions}
          value={customRange || customOpen ? 'custom' : period}
          onValueChange={(key) => {
            if (key === 'custom') {
              setCustomOpen(true);
              setCustomDraft({ from, to });
              return;
            }
            setPeriod(key);
            setCustomOpen(false);
            setCustomErrors({});
            if (customRange || badRangeAddress) setRangeAddress(null);
          }}
          // The current preset also clears an invalid range left in the address.
          onReselect={() => {
            if (badRangeAddress) setRangeAddress(null);
          }}
        />
        {!customRange && !customOpen && (
          <DateStepper
            label="Reference date"
            value={anchor}
            onValueChange={setAnchor}
            onMove={move}
          />
        )}
      </div>
      {(customOpen || customRange) && (
        <form
          className="mt-3 flex flex-wrap items-start gap-x-3 gap-y-2"
          aria-label="Custom range"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            // Invalid ranges are explained per field and never requested.
            const errors = checkRange(customDraft.from, customDraft.to);
            setCustomErrors(errors);
            if (Object.keys(errors).length) return;
            setRangeAddress({ from: customDraft.from, to: customDraft.to });
            setCustomOpen(false);
          }}
        >
          <div className="flex flex-col gap-1">
            <Label htmlFor="range-from" className="text-meta leading-none">
              Start date
            </Label>
            <CommonInput
              id="range-from"
              type="date"
              className="w-36 md:pointer-coarse:text-base"
              value={customOpen ? customDraft.from : from}
              onChange={(e) => {
                setCustomOpen(true);
                setCustomDraft({
                  ...(customOpen ? customDraft : { from, to }),
                  from: e.target.value,
                });
              }}
              {...invalidProps('range-from', customErrors.from)}
            />
            <FieldError name="range-from">{customErrors.from}</FieldError>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="range-to" className="text-meta leading-none">
              End date
            </Label>
            <CommonInput
              id="range-to"
              type="date"
              className="w-36 md:pointer-coarse:text-base"
              value={customOpen ? customDraft.to : to}
              onChange={(e) => {
                setCustomOpen(true);
                setCustomDraft({
                  ...(customOpen ? customDraft : { from, to }),
                  to: e.target.value,
                });
              }}
              {...invalidProps('range-to', customErrors.to)}
            />
            <FieldError name="range-to">{customErrors.to}</FieldError>
          </div>
          {/* The label row is 12px (leading-none) plus a 4px gap, so the button lines up with the inputs. */}
          <Button type="submit" variant="secondary" className="mt-4">
            Apply
          </Button>
          <p className="m-0 basis-full text-meta">
            Both end dates included · up to {maxRangeDays} days
          </p>
        </form>
      )}
      {badRangeAddress && (
        <AlertBanner className="mt-3 mb-0">
          The period in the address is not valid, so the default period is shown. Choose a period
          again.
        </AlertBanner>
      )}
      <RangeSummary from={from} to={to}>
        Records for the selected period
      </RangeSummary>
    </>
  );
}
