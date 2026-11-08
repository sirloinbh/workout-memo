import { render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';

import { PageHeader } from './page-header';

test('it shows the eyebrow, the h1 with its closing dot, the description and the actions', () => {
  render(
    <main>
      <PageHeader
        eyebrow="YOUR PROGRESS, IN FOCUS"
        title="꾸준함을 기록하는 공간"
        description="운동의 흐름을 살펴보세요."
        actions={<button>운동 기록하기</button>}
      />
    </main>,
  );

  // The dot stays part of the heading so the page's h1 reads the same as before (#222).
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('꾸준함을 기록하는 공간.');
  expect(screen.getByText('YOUR PROGRESS, IN FOCUS')).toBeInTheDocument();
  expect(screen.getByText('운동의 흐름을 살펴보세요.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '운동 기록하기' })).toBeInTheDocument();
  // A plain block, not a second banner landmark next to the app shell's header.
  expect(screen.queryByRole('banner')).toBeNull();
});

test('without actions it renders no empty action group', () => {
  const { container } = render(<PageHeader eyebrow="E" title="T" description="D" />);

  expect(container.querySelector('[data-slot="page-header"]')?.children).toHaveLength(1);
});
