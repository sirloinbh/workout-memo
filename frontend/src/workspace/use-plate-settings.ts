import React from 'react';

import {
  defaultPlateSettings,
  parsePlateSettings,
  type PlateSettings,
  plateSettingsKey,
} from '../plates';

/** Bar weight and plate set, kept in this browser and shared by every set row. */
export function usePlateSettings() {
  const [settings, setSettings] = React.useState<PlateSettings>(() => {
    try {
      return parsePlateSettings(localStorage.getItem(plateSettingsKey));
    } catch {
      return defaultPlateSettings();
    }
  });
  const update = React.useCallback((next: PlateSettings) => {
    setSettings(next);
    try {
      localStorage.setItem(plateSettingsKey, JSON.stringify(next));
    } catch {
      // Private mode or full storage: the settings still apply until the page closes.
    }
  }, []);
  return { settings, update };
}
