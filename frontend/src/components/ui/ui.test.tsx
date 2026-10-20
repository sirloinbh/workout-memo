import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import { cn } from '../../lib/cn';
import { Button } from './button';
import { Dialog } from './dialog';
import { FieldError, Input, invalidProps } from './field';

// #66: shared UI keeps the existing class names so the look does not change.
test('Button variants render the existing button classes', () => {
  render(
    <>
      <Button>저장</Button>
      <Button full>전체 저장</Button>
      <Button variant="subtle">세트 추가</Button>
      <Button variant="text">수정</Button>
      <Button variant="icon" aria-label="닫기" />
    </>,
  );
  expect(screen.getByRole('button', { name: '저장' })).toHaveAttribute('class', 'primary');
  expect(screen.getByRole('button', { name: '전체 저장' })).toHaveAttribute(
    'class',
    'primary full',
  );
  expect(screen.getByRole('button', { name: '세트 추가' })).toHaveAttribute(
    'class',
    'subtle-button',
  );
  expect(screen.getByRole('button', { name: '수정' })).toHaveAttribute('class', 'text-button');
  expect(screen.getByRole('button', { name: '닫기' })).toHaveAttribute('class', 'icon-button');
});

test('cn merges conflicting Tailwind utilities, keeping the later one', () => {
  const hidden = false;
  expect(cn('primary', 'px-2', hidden && 'hidden', 'px-4')).toBe('primary px-4');
});

test('a field message is linked to its control and absent without a message', () => {
  const { rerender } = render(
    <>
      <label>
        총중량 kg
        <Input {...invalidProps('sets.0.weight', '총중량은 0~99999 kg으로 입력하세요')} />
      </label>
      <FieldError name="sets.0.weight">총중량은 0~99999 kg으로 입력하세요</FieldError>
    </>,
  );
  const input = screen.getByLabelText('총중량 kg');
  expect(input).toHaveAttribute('aria-invalid', 'true');
  expect(input).toHaveAccessibleDescription('총중량은 0~99999 kg으로 입력하세요');
  expect(document.getElementById('issue-sets-0-weight')).toHaveClass('field-error');
  rerender(
    <>
      <label>
        총중량 kg
        <Input {...invalidProps('sets.0.weight', undefined)} />
      </label>
      <FieldError name="sets.0.weight">{undefined}</FieldError>
    </>,
  );
  expect(screen.getByLabelText('총중량 kg')).not.toHaveAttribute('aria-invalid');
  expect(document.getElementById('issue-sets-0-weight')).toBeNull();
});

test('Dialog is labelled, focuses close, locks scroll and closes on Escape or backdrop', async () => {
  const user = userEvent.setup();
  const close = vi.fn();
  const { unmount } = render(
    <Dialog title="머신 등록" close={close}>
      <p>내용</p>
    </Dialog>,
  );
  const dialog = screen.getByRole('dialog', { name: '머신 등록' });
  expect(dialog).toHaveAttribute('aria-modal', 'true');
  expect(screen.getByRole('button', { name: '닫기' })).toHaveFocus();
  expect(document.body.style.overflow).toBe('hidden');
  await user.click(screen.getByText('내용'));
  expect(close).not.toHaveBeenCalled();
  await user.keyboard('{Escape}');
  expect(close).toHaveBeenCalledTimes(1);
  await user.click(dialog.parentElement!);
  expect(close).toHaveBeenCalledTimes(2);
  unmount();
  expect(document.body.style.overflow).toBe('');
});
