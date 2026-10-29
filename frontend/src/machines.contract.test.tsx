import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test } from 'vitest';

import { App } from './app';
import { contractHandlers, setupContractApi } from './test/contract-api';
import { openPage } from './test/nav';

// The machine library through the OpenAPI contract mock (project-standards#281): no backend and
// no fetch stub. Every request must be an operation in docs/openapi.json, or the test fails.
// The contract has no success response schemas yet, so lists default to [] and the data this
// screen shows comes from overrides.
const api = setupContractApi({ emptyBody: [] });

const machine = {
  id: 5,
  brand_id: 2,
  brand: 'Hammer Strength',
  name: '내 체스트 프레스',
  base_weight: '20.00',
  notes: '',
  official_weight_id: null,
  official_status: null,
  official_model_name: null,
  official_setting: null,
  official_raw_value: null,
  official_raw_unit: null,
  official_weight_kg: null,
  official_basis: null,
  official_source_url: null,
  official_checked_date: null,
};

test('the machine library lists machines answered by the contract mock', async () => {
  api.use(
    ...contractHandlers({
      'GET /api/machines': [machine],
      'GET /api/brands': [{ id: 2, name: 'Hammer Strength' }],
    }),
  );
  const user = userEvent.setup();
  render(<App />);
  await openPage('머신 라이브러리', user);
  expect(await screen.findByText(/내 체스트 프레스/)).toBeInTheDocument();
  expect(document.querySelector('.workout-row')?.textContent).toMatch(/Hammer Strength/);
});
