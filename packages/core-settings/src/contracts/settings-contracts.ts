import type { SettingsDomainEvent } from '../domain/events/settings-events.js';

export interface ISettingsEventBus {
  publish(event: SettingsDomainEvent): Promise<void> | void;
}

export interface ISettingsClock {
  now(): Date;
}

export class SystemSettingsClock implements ISettingsClock {
  now(): Date {
    return new Date();
  }
}
