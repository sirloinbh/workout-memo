import { render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';

import { PageHeader } from './page-header';

test('it shows the eyebrow, the h1 with its closing dot, the description and the actions', () => {
  render(
    <main>
      <PageHeader
        eyebrow="YOUR PROGRESS, IN FOCUS"
        title="A place to record consistency"
        description="See how your training flows."
        actions={<button>Log workout</button>}
      />
    </main>,
  );

  // The dot stays part of the heading so the page's h1 reads the same as before (#222).
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
    'A place to record consistency.',
  );
  expect(screen.getByText('YOUR PROGRESS, IN FOCUS')).toBeInTheDocument();
  expect(screen.getByText('See how your training flows.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Log workout' })).toBeInTheDocument();
  // A plain block, not a second banner landmark next to the app shell's header.
  expect(screen.queryByRole('banner')).toBeNull();
});

test('without actions it renders no empty action group', () => {
  const { container } = render(<PageHeader eyebrow="E" title="T" description="D" />);

  expect(container.querySelector('[data-slot="page-header"]')?.children).toHaveLength(1);
});
