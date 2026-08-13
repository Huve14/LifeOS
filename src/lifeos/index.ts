// Bridge between the typed data layer in src/ and the legacy global .jsx
// screens. Follows the existing pattern set by window.__suvedaAuth and
// window.__suvedaShopping: one namespace object, assigned before the .jsx
// modules load.

import * as members from './members';
import * as net from './net';
import * as outbox from './outbox';
import * as prompts from './prompts';
import * as recording from './recording';
import * as sync from './sync';
import * as time from './time';
import * as trips from './trips';
import * as videoNotes from './videoNotes';

export const lifeos = {
  members,
  net,
  outbox,
  prompts,
  recording,
  sync,
  time,
  trips,
  videoNotes,
};

export type LifeOS = typeof lifeos;

export function installLifeOS(): void {
  window.__lifeos = lifeos;
}
