# Playback stops when the phone locks

An open bug, not yet reproduced. The owner, listening on Android (Chrome), sometimes finds that the player has stopped after the screen locks. Opening the page and pressing play starts it again. It isn't known whether it stops partway through a chapter or where one chapter should roll into the next.

## Done so far, on suspicion

- The site's service worker (`public/sw.js`) no longer relays audio or video. It was relaying every chapter's byte-range stream, and a phone that pauses the worker while locked would stall that stream.
- The player downloads the next chapter whole while one plays (`player.tsx`), so a chapter change needs no network. That covers a stop at a chapter boundary: the Nana biography's 17-second Cold Open reaches one almost as soon as it starts.

Neither is confirmed as the cause. The e2e tests block the service worker, so they can't show whether the first one helped.

## If it happens again

Note which it was: partway through a chapter, or at a chapter's end. Then:

- **Partway through:** look at what Chrome does to a backgrounded tab's media (network, the media session's state). A remote-debugged Android Chrome (`chrome://inspect` on a desktop) shows the audio element's events and the console while the phone is locked.
- **At a chapter's end:** check whether `play()` on the new chapter is refused while the screen is locked. The player calls it from the `loadedmetadata` that follows `ended`, and a refusal shows in the console as an unhandled rejection.

Once the cause is found, keep only the fixes that address it, and delete this doc.
