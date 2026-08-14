# Building the iOS app

The app is wrapped with [Capacitor](https://capacitorjs.com). The web build in
`dist/` is bundled into the app, so it opens and shows the timeline before it
has a network. Supabase is still the live backend.

Everything below has to happen on a Mac with Xcode. Nothing in this repo can
build an `.ipa` on its own.

## One time setup

```bash
npm install
npm run ios:sync     # builds the web app and copies it into ios/
npm run ios:open     # opens Xcode
```

In Xcode, select the **App** target, then **Signing & Capabilities**:

1. Set **Team** to your Apple Developer team.
2. Bundle identifier is `app.lifeos.suveda`. Change it in
   `capacitor.config.ts` and here if you want a different one, and keep the two
   in step.
3. Add the **Push Notifications** capability. This rewrites
   `ios/App/App/App.entitlements`, which is committed so the capability
   survives a regenerated project.
4. Add **Background Modes** and tick *Remote notifications* and
   *Background processing*.

Then run on a device. The simulator has no camera, so the video journal cannot
be tested there.

## After changing web code

```bash
npm run ios:sync
```

Then run again from Xcode. `ios:sync` runs `vite build` and `cap sync`, so it
picks up both web changes and new plugins.

## Push notifications

Three pieces have to line up.

### 1. The APNs key, from Apple

In the Apple Developer portal, **Certificates, Identifiers & Profiles > Keys**,
create a key with **Apple Push Notifications service (APNs)** enabled.
Download the `.p8` once; Apple will not let you download it again.

You need three values:

| Value | Where it is |
|---|---|
| Key ID | The 10 character id on the key you just made |
| Team ID | Top right of the developer portal, next to your name |
| Bundle ID | `app.lifeos.suveda` |

### 2. The Edge Function secrets

```bash
supabase secrets set \
  APNS_KEY_ID=XXXXXXXXXX \
  APNS_TEAM_ID=YYYYYYYYYY \
  APNS_BUNDLE_ID=app.lifeos.suveda \
  APNS_PRODUCTION=false \
  --project-ref snpgmoedtkstbcpbtpcc

supabase secrets set APNS_PRIVATE_KEY="$(cat AuthKey_XXXXXXXXXX.p8)" \
  --project-ref snpgmoedtkstbcpbtpcc
```

`APNS_PRODUCTION` is `false` for builds run from Xcode and `true` for anything
from TestFlight or the App Store. Getting this wrong is the single most common
reason a push silently never arrives: a sandbox token sent to the production
host is rejected with `BadDeviceToken`.

### 3. Deploy and schedule the function

```bash
supabase functions deploy notify --project-ref snpgmoedtkstbcpbtpcc
```

The function drains a queue rather than being called per event, because a
database trigger has no business waiting on Apple. Triggers on
`lifeos_video_notes` and `lifeos_prompt_answers` write into
`lifeos_notifications`; the function sends whatever is pending.

Schedule it with pg_cron:

```sql
select cron.schedule(
  'lifeos-notify',
  '* * * * *',
  $$
    select net.http_post(
      url := 'https://snpgmoedtkstbcpbtpcc.supabase.co/functions/v1/notify',
      headers := jsonb_build_object(
        'Authorization', 'Bearer <service-role-key>',
        'Content-Type', 'application/json'
      )
    );
  $$
);
```

`pg_cron` and `pg_net` both need enabling under **Database > Extensions**
first.

### What gets sent

- A new video note notifies the other person.
- A prompt answer notifies the other person **only once both have answered**.
  Notifying on the first answer would leak through the notification itself that
  the other person had answered, which is exactly what the reveal gate exists
  to prevent.

Nobody is ever notified about their own action.

## TestFlight

For your partner in Abu Dhabi to install it, TestFlight is the route. Archive
in Xcode (**Product > Archive**), upload to App Store Connect, then add her as
an **internal tester**. Internal testers need no App Store review and no wait.

Set `APNS_PRODUCTION=true` before the first TestFlight build, or push will not
work for that build.

## Face ID

The lock is off by default. Turn it on under the **More** tab, at the bottom of
the sheet. It asks for Face ID once before switching on, so a device where
biometry is broken cannot lock anyone out. Failing a face scan falls back to
the device passcode, and it re-locks after two minutes in the background rather
than on every glance away.

The lock is a front door, not encryption. The data is still protected by the
device passcode and by RLS on the server.

## What being native actually changes

- **Storage is durable.** iOS Safari evicts IndexedDB after roughly seven days
  of non-use. That is where the offline outbox lives, so a queued video note
  recorded on bad hotel wifi could have vanished before it ever uploaded. Inside
  the app container that eviction does not apply.
- **Uploads survive backgrounding.** Leaving the app now asks iOS for extra
  execution time so an upload in flight can finish. This is a continuation of
  tens of seconds, not true out-of-process upload: a large clip on weak wifi
  still finishes on the next open, which is what the outbox is for.
- **Connectivity is honest.** `navigator.onLine` reports true on a wifi network
  with no route out, which is the hotel captive portal case. The native network
  plugin reflects the real state.
- **Notifications work.** Web push on iOS only works once installed and is
  unreliable.
- **Camera permission is a real prompt**, granted through Info.plist, rather
  than Safari's standalone-mode behaviour, which has varied by iOS version.

## Troubleshooting

**No device token reaches Supabase.** Check `lifeos_devices` has a row. If not,
the usual cause is the Push Notifications capability missing in Xcode, or the
two forwarding methods in `AppDelegate.swift` having been removed.

**Notifications queue but never send.** Look at `last_error` in
`lifeos_notifications`. `BadDeviceToken` almost always means `APNS_PRODUCTION`
does not match how the build was installed.

**Camera does nothing.** Confirm on a real device, not the simulator, and check
`NSCameraUsageDescription` is still in `Info.plist`.
