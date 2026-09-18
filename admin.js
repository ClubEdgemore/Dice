// ============================================================
// Admin panel logic — password gate (UI-level only, see README
// for the security caveat), live roll count/feed, clear button.
// ============================================================

// CHANGE THIS to your own password before deploying.
const ADMIN_PASSWORD = "Leah311";

let db = null;
try {
  firebase.initializeApp(firebaseConfig);
  db = firebase.database();
} catch (e) {
  console.error("Firebase failed to initialize. Did you fill in firebase-config.js?", e);
}
const rollsRef = db ? db.ref("rolls") : null;

const loginCard = document.getElementById("loginCard");
const adminCard = document.getElementById("adminCard");
const feedHeader = document.getElementById("feedHeader");
const pwInput = document.getElementById("pwInput");
const loginBtn = document.getElementById("loginBtn");
const loginError = document.getElementById("loginError");
const totalCount = document.getElementById("totalCount");
const clearBtn = document.getElementById("clearBtn");
const statusMsg = document.getElementById("statusMsg");
const feed = document.getElementById("feed");
const feedCount = document.getElementById("feedCount");

function unlock() {
  loginCard.style.display = "none";
  adminCard.style.display = "block";
  feedHeader.style.display = "flex";
  startListening();
}

loginBtn.addEventListener("click", attemptLogin);
pwInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") attemptLogin();
});

function attemptLogin() {
  if (pwInput.value === ADMIN_PASSWORD) {
    loginError.style.display = "none";
    unlock();
  } else {
    loginError.style.display = "block";
  }
}

function startListening() {
  if (!rollsRef) {
    statusMsg.textContent = "Not connected — check firebase-config.js.";
    statusMsg.style.color = "#ef4444";
    return;
  }
  rollsRef.on("value", (snapshot) => {
    const rollsObj = snapshot.val() || {};
    const entries = Object.values(rollsObj);
    entries.sort((a, b) => (b.ts || 0) - (a.ts || 0));

    totalCount.textContent = entries.length;
    feedCount.textContent = `${entries.length} roll${entries.length === 1 ? "" : "s"}`;

    if (entries.length === 0) {
      feed.innerHTML = '<div class="empty-state">No rolls yet.</div>';
      return;
    }
    feed.innerHTML = "";
    entries.forEach((r) => {
      const card = document.createElement("div");
      card.className = "roll-card";
      card.innerHTML = `
        <div class="name">${escapeHtml(r.name || "Anonymous")}</div>
        <div class="dice">${escapeHtml(r.diceLabel || "")}</div>
        <div class="value">${r.result}</div>
      `;
      feed.appendChild(card);
    });
  });
}

clearBtn.addEventListener("click", () => {
  if (!rollsRef) return;
  const ok = confirm("Clear all rolls for everyone? This can't be undone.");
  if (!ok) return;
  rollsRef.remove()
    .then(() => {
      statusMsg.textContent = "All rolls cleared.";
      statusMsg.style.color = "#22c55e";
      setTimeout(() => (statusMsg.textContent = ""), 2500);
    })
    .catch((err) => {
      statusMsg.textContent = "Failed to clear: " + err.message;
      statusMsg.style.color = "#ef4444";
    });
});

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
