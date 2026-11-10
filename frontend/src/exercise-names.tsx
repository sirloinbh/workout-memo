import { Button } from './components/ui/button';
import { similarName } from './exercise-name-match';
import { cn } from './lib/utils';

// The user decides: the hint offers the existing spelling and never changes the value itself.
export function SimilarNameHint({
  value,
  names,
  onReplace,
}: {
  value: string;
  names: readonly string[];
  onReplace: (name: string) => void;
}) {
  const similar = similarName(value, names);
  return (
    // A live region without role="status", so it never competes with a form's own status line.
    <p
      aria-live="polite"
      className={cn('mt-1 text-meta text-muted-foreground', !similar && 'sr-only')}
    >
      {similar && (
        <>
          기존 이름 &lsquo;{similar}&rsquo;로 바꿀까요?{' '}
          <Button
            type="button"
            variant="link"
            size="sm"
            className="h-auto px-0 pointer-coarse:min-h-11"
            onClick={() => onReplace(similar)}
          >
            바꾸기
          </Button>
        </>
      )}
    </p>
  );
}
