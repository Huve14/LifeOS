// Bridge between the typed data layer in src/ and the legacy global .jsx
// screens. Follows the existing pattern set by window.__suvedaAuth and
// window.__suvedaShopping: one namespace object, assigned before the .jsx
// modules load.

import * as call from './call';
import * as community from './community';
import * as couples from './couples';
import * as aiProfile from './aiProfile';
import * as automations from './automations';
import * as budget from './budget';
import * as daylight from './daylight';
import * as ice from './ice';
import * as journal from './journal';
import * as home from './home';
import * as games from './games';
import * as lock from './lock';
import * as native from './native';
import * as net from './net';
import * as outbox from './outbox';
import * as preferences from './preferences';
import * as performance from './performance';
import * as prices from './prices';
import * as prompts from './prompts';
import * as push from './push';
import * as recording from './recording';
import * as spaces from './spaces';
import * as sync from './sync';
import * as time from './time';
import * as trips from './trips';
import * as videoNotes from './videoNotes';

export const lifeos = {
  aiProfile,
  automations,
  budget,
  call,
  community,
  couples,
  daylight,
  games,
  home,
  ice,
  journal,
  lock,
  native,
  net,
  outbox,
  preferences,
  performance,
  prices,
  prompts,
  push,
  recording,
  spaces,
  sync,
  time,
  trips,
  videoNotes,
};

export type LifeOS = typeof lifeos;

export function installLifeOS(): void {
  window.__lifeos = lifeos;
}
