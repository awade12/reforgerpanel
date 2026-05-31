import type { PanelStore } from "./shared";
import {
  decryptInstanceAlerts,
  decryptSettingsRecord,
  encryptInstanceAlerts,
  encryptSettingsRecord,
} from "../../lib/shared/secrets";

export function hydrateStoreSecrets(store: PanelStore): PanelStore {
  return {
    ...store,
    settings: decryptSettingsRecord(store.settings),
    instances: store.instances.map((instance) => ({
      ...instance,
      alerts: decryptInstanceAlerts(instance.alerts),
    })),
  };
}

export function sealStoreSecrets(store: PanelStore): PanelStore {
  return {
    ...store,
    settings: encryptSettingsRecord(store.settings),
    instances: store.instances.map((instance) => ({
      ...instance,
      alerts: encryptInstanceAlerts(instance.alerts),
    })),
  };
}
