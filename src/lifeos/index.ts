// Bridge between the typed data layer in src/ and the legacy global .jsx
// screens. Follows the existing pattern set by window.__suvedaAuth and
// window.__suvedaShopping: one namespace object, assigned before the .jsx
// modules load.

import * as members from './members';
import * as net from './net';
import * as outbox from './outbox';
import * as recording from './recording';
import * as time from './time';
import * as videoNotes from './videoNotes';

export const lifeos = {
  members,
  net,
  outbox,
  recording,
  time,
  videoNotes,
};

export type LifeOS = typeof lifeos;

export function installLifeOS(): void {
  window.__lifeos = lifeos;
}
