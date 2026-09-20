# Live Dice Roller + Poll

A small static site for a live presentation: people enter their name, pick a
die (D4–D20), roll it with an animation, and everyone's rolls show up in a
shared live feed on every device. There's also a live poll (with a write-in
option) that shows vote counts to everyone in real time, plus admin pages to
clear rolls and to write/publish new poll questions.

Because GitHub Pages only serves static files, the "everyone sees the same
live data instantly" part needs a tiny real-time backend. This uses
**Firebase Realtime Database**, which is free for this scale (100 people
rolling dice and voting a few times is nowhere near the free-tier limits) and
needs no server code.

## Files

- `index.html` / `app.js` — the dice player page (name, dice picker, roll, live feed)
- `admin.html` / `admin.js` — the dice admin page (password gate, live feed, clear button)
- `poll.html` / `poll.js` — the poll player page (vote, write-in, live results — no login needed)
- `poll-admin.html` / `poll-admin.js` — the poll admin page: write a question and options, publish, clear votes
- `admin-config.js` — the shared admin password used by both admin pages
- `style.css` — shared styling
- `firebase-config.js` — **you must edit this** with your own Firebase project's keys
- `bg-hero.jpg` — the background image; make sure this file gets pushed to your repo too

## 1. Create a free Firebase project (~5 minutes)

1. Go to https://console.firebase.google.com and sign in with any Google account.
2. Click **Add project**, give it any name (e.g. `dice-roller`), and finish the wizard (you can skip Google Analytics).
3. In the left sidebar, go to **Build → Realtime Database**.
4. Click **Create Database**. Choose any location. Start in **test mode** for now (you'll lock it down in step 3 below).
5. In the left sidebar, click the ⚙️ gear → **Project settings**.
6. Scroll to **Your apps** → click the **</>** (web) icon → register an app (any nickname, no need for Firebase Hosting).
7. Firebase will show you a `firebaseConfig` object like:

   ```js
   const firebaseConfig = {
     apiKey: "AIza...",
     authDomain: "dice-roller-xxxx.firebaseapp.com",
     databaseURL: "https://dice-roller-xxxx-default-rtdb.firebaseio.com",
     projectId: "dice-roller-xxxx",
     storageBucket: "dice-roller-xxxx.appspot.com",
     messagingSenderId: "...",
     appId: "..."
   };
   ```

8. Copy those values into `firebase-config.js` in this project, replacing the placeholders.

## 2. Set your admin password

Open `admin-config.js` and change this line:

```js
const ADMIN_PASSWORD = "changeme123";
```

This one password unlocks both `admin.html` (dice) and `poll-admin.html` (polls).

**Security note:** this password only hides the admin *UI* — it doesn't stop
someone technical from opening their browser console on the player page and
writing to the database directly, because the database rules (below) allow
anyone to write/delete under `/rolls` and `/polls` so the site works with no
login system. For a low-stakes live presentation this is a reasonable
tradeoff. If you need real protection, the next step up is Firebase
Authentication with an admin account — ask if you'd like that added.

## 3. Set Realtime Database rules

In the Firebase console, go to **Realtime Database → Rules** and use:

```json
{
  "rules": {
    "rolls": {
      ".read": true,
      ".write": true,
      "$deviceId": {
        ".validate": "newData.hasChildren(['name', 'diceId', 'result', 'ts'])"
      }
    },
    "polls": {
      "current": {
        ".read": true,
        ".write": true
      },
      "votes": {
        ".read": true,
        ".write": true,
        "$deviceId": {
          ".validate": "newData.hasChildren(['choice', 'pollId', 'ts'])"
        }
      }
    }
  }
}
```

This keeps everything scoped to the `rolls` and `polls` paths (so nothing
else in your database can be touched from the site) and requires each entry
to have the expected fields. Click **Publish**.

## 4. Test locally (optional)

You can just open `index.html` directly in a browser, or run a tiny local
server from this folder:

```bash
python3 -m http.server 8000
```

then visit `http://localhost:8000`. Open it in two browser tabs to see rolls
sync live between them.

## 5. Deploy to GitHub Pages

1. Create a new GitHub repo and push **all** the files listed above
   (`index.html`, `admin.html`, `poll.html`, `poll-admin.html`, `style.css`,
   `app.js`, `admin.js`, `poll.js`, `poll-admin.js`, `admin-config.js`,
   `firebase-config.js`, `bg-hero.jpg`).
2. In the repo, go to **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to `Deploy from a branch`,
   pick your default branch and `/ (root)`, then save.
4. GitHub will give you a URL like `https://yourname.github.io/your-repo/`.
   Share that with your ~100 people; share
   `.../admin.html` and `.../poll-admin.html` only with yourself.

## During the session

**Dice:**
- Each device remembers its own name and dice choice (localStorage), and
  re-rolling updates that same device's entry rather than piling up duplicates
  — so the live feed always shows one current roll per person.
- Open `admin.html`, enter your password, and use **Clear All Rolls** to wipe
  the board before the next round. Everyone's screens update instantly.

**Poll:**
- Open `poll-admin.html`, enter your password, type a question, add answer
  options (2 or more), and hit **Publish Poll**. This immediately shows up on
  everyone's `poll.html` and clears any previous votes.
- People vote by tapping an option or typing their own answer in "Or write
  your own," then hitting **Submit Vote**. Live counts and percentages are
  visible to everyone on `poll.html`, whether they've voted yet or not — no
  login needed for that page.
- Write-in answers are tallied by their exact text, so minor spelling/casing
  differences show up as separate bars — that's expected for a live crowd.
- Re-opening the poll admin page prefills the form with whatever question is
  currently live, so it's easy to tweak and republish, or use **Clear Votes
  (keep this question)** to re-run the same question for a new group without
  changing it.

## Scaling notes

100 concurrent users doing occasional dice rolls and poll votes is very light
load — Firebase's free Spark plan (100 simultaneous connections, 1GB stored,
10GB/mo downloaded) comfortably covers this for a single presentation
session. If you expect a much bigger audience or plan to reuse this
constantly, consider upgrading to the Blaze (pay-as-you-go) plan, which is
still effectively free at this scale.
