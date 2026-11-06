import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';

import { AlertBanner } from './alert-banner';
import { Button } from './ui/button';

test('the banner is announced as an alert and keeps its action inside', async () => {
  const onRetry = vi.fn();
  render(
    <AlertBanner
      action={
        <Button type="button" onClick={onRetry}>
          다시 연결
        </Button>
      }
    >
      저장소 연결 실패
    </AlertBanner>,
  );
  const alert = screen.getByRole('alert');
  expect(alert).toHaveAttribute('data-slot', 'alert-banner');
  expect(alert).toHaveTextContent('저장소 연결 실패');
  await userEvent.click(within(alert).getByRole('button', { name: '다시 연결' }));
  expect(onRetry).toHaveBeenCalledOnce();
});

test('a banner without an action shows only its message, and className adds to the box', () => {
  render(<AlertBanner className="mb-0">로컬 저장 공간 오류</AlertBanner>);
  const alert = screen.getByRole('alert');
  expect(within(alert).queryByRole('button')).toBeNull();
  expect(alert).toHaveClass('mb-0', 'border-l-destructive');
  expect(alert).not.toHaveClass('mb-5');
});
