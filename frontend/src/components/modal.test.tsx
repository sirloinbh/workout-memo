import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';

import { FieldError, Input } from './field';
import { invalidProps } from './field-props';
import { Modal } from './modal';

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

// #159: the modal now uses the common Dialog (radix): focus is trapped inside and
// Escape or the close button call close(); a click inside does not.
test('Modal is labelled, keeps focus inside and closes on Escape or the close button', async () => {
  const user = userEvent.setup();
  const close = vi.fn();
  render(
    <Modal title="머신 등록" close={close}>
      <p>내용</p>
    </Modal>,
  );
  const dialog = screen.getByRole('dialog', { name: '머신 등록' });
  expect(dialog).toContainElement(document.activeElement as HTMLElement);
  await user.click(screen.getByText('내용'));
  expect(close).not.toHaveBeenCalled();
  await user.keyboard('{Escape}');
  expect(close).toHaveBeenCalledTimes(1);
  await user.click(screen.getByRole('button', { name: '닫기' }));
  expect(close).toHaveBeenCalledTimes(2);
});
