import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';

import { FieldError, Input } from './field';
import { invalidProps } from './field-props';
import { keyboardInset } from './keyboard-inset';
import { Modal, ModalFooter } from './modal';

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

// #105: what an on-screen keyboard covers is the layout viewport below the visual one.
test('keyboardInset is the part of the screen below the visible area', () => {
  expect(keyboardInset(844, { height: 844, offsetTop: 0 })).toBe(0);
  expect(keyboardInset(844, { height: 508, offsetTop: 0 })).toBe(336);
  // iOS may also scroll the visible area up; only what is below it counts.
  expect(keyboardInset(844, { height: 508, offsetTop: 100 })).toBe(236);
  expect(keyboardInset(844, { height: 900, offsetTop: 0 })).toBe(0);
});

// #105: a mobile modal ends above the keyboard and brings the focused field back into view.
test('Modal follows the visual viewport so the keyboard does not cover the field being typed', () => {
  const listeners = new Map<string, () => void>();
  const viewport = {
    height: window.innerHeight,
    offsetTop: 0,
    addEventListener: (type: string, fn: () => void) => listeners.set(type, fn),
    removeEventListener: vi.fn(),
  };
  vi.stubGlobal('visualViewport', viewport);
  const scrolled = vi.fn();
  HTMLElement.prototype.scrollIntoView = scrolled;
  try {
    const { unmount } = render(
      <Modal title="새로운 운동 기록" layout="full" close={() => {}}>
        <label>
          운동 메모
          <textarea />
        </label>
      </Modal>,
    );
    const dialog = screen.getByRole('dialog', { name: '새로운 운동 기록' });
    expect(dialog).toHaveAttribute('data-layout', 'full');
    expect(dialog.style.getPropertyValue('--keyboard-inset')).toBe('0px');
    screen.getByLabelText('운동 메모').focus();
    viewport.height = window.innerHeight - 300;
    act(() => listeners.get('resize')!());
    expect(dialog.style.getPropertyValue('--keyboard-inset')).toBe('300px');
    expect(scrolled).toHaveBeenCalledWith({ block: 'nearest' });
    unmount();
    expect(viewport.removeEventListener).toHaveBeenCalledWith('resize', expect.any(Function));
  } finally {
    vi.unstubAllGlobals();
    // jsdom has no scrollIntoView of its own.
    delete (HTMLElement.prototype as Partial<HTMLElement>).scrollIntoView;
  }
});

test('a short form opens as a bottom sheet by default, with its footer inside the dialog', () => {
  render(
    <Modal title="머신 등록" close={() => {}}>
      <form>
        <ModalFooter>
          <button>저장</button>
        </ModalFooter>
      </form>
    </Modal>,
  );
  const dialog = screen.getByRole('dialog', { name: '머신 등록' });
  expect(dialog).toHaveAttribute('data-layout', 'sheet');
  const footer = screen.getByRole('button', { name: '저장' }).closest('[data-slot=modal-footer]');
  expect(dialog).toContainElement(footer as HTMLElement);
});
