import { expect, test } from 'vitest';

import nginx from '../nginx.conf?raw';
import raw from '../public/.well-known/assetlinks.json?raw';

// #110: Digital Asset Links for the Android TWA. nginx serves frontend/public/.well-known/assetlinks.json
// as a plain static file (the sign-in guards only /api), so this file is the whole configuration:
// fill in the SHA-256 fingerprints there, no code change. docs/mobile-app.md has the steps.
const PACKAGE = 'kr.sirloinbh.workoutmemo';
const FINGERPRINT = /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/;

type Statement = {
  relation: string[];
  target: { namespace: string; package_name: string; sha256_cert_fingerprints: string[] };
};

const statements = JSON.parse(raw) as Statement[];

test('assetlinks.json is a JSON array, valid before any fingerprint is added', () => {
  expect(Array.isArray(statements)).toBe(true);
});

test('every statement targets the workout-memo package with well-formed SHA-256 fingerprints', () => {
  for (const statement of statements) {
    expect(statement.relation).toEqual(['delegate_permission/common.handle_all_urls']);
    expect(statement.target.namespace).toBe('android_app');
    expect(statement.target.package_name).toBe(PACKAGE);
    expect(statement.target.sha256_cert_fingerprints.length).toBeGreaterThan(0);
    for (const fingerprint of statement.target.sha256_cert_fingerprints)
      expect(fingerprint).toMatch(FINGERPRINT);
  }
});

test('nginx.conf has no rule for /.well-known/, so the static file is served as is', () => {
  expect(nginx).not.toMatch(/well-known/);
  expect(nginx).toMatch(/location \/ \{\s*try_files \$uri/);
});
