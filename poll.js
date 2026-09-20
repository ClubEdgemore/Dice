// ============================================================
// Player poll logic — shows the current live poll, lets the
// device vote (preset option or write-in), and renders live
// results that are visible to everyone, whether they've voted
// or not.
// ============================================================

const DEVICE_ID_KEY = "dice_device_id"; // shared with app.js so it's one identity per device

function getDeviceId() {
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = "p_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

const deviceId = getDeviceId();

// ---- Firebase init ----
let db = null;
try {
  firebase.initializeApp(firebaseConfig);
  db = firebase.database();
} catch (e) {
  console.error("Firebase failed to initialize. Did you fill in firebase-config.js?", e);
}
const currentPollRef = db ? db.ref("polls/current") : null;
const votesRef = db ? db.ref("polls/votes") : null;

// ---- DOM ----
const noPollMsg = document.getElementById("noPollMsg");
const pollBody = document.getElementById("pollBody");
const questionText = document.getElementById("questionText");
const optionList = document.getElementById("optionList");
const writeInRow = document.getElementById("writeInRow");
const writeInInput = document.getElementById("writeInInput");
const submitVoteBtn = document.getElementById("submitVoteBtn");
const voteStatus = document.getElementById("voteStatus");
const resultsList = document.getElementById("resultsList");
const resultsCount = document.getElementById("resultsCount");

let currentPoll = null;
let selectedChoice = null;

function renderPoll(poll) {
  currentPoll = poll && poll.question ? poll : null;

  if (!currentPoll) {
    noPollMsg.style.display = "block";
    pollBody.style.display = "none";
    return;
  }

  noPollMsg.style.display = "none";
  pollBody.style.display = "block";
  questionText.textContent = currentPoll.question;

  optionList.innerHTML = "";
  (currentPoll.options || []).forEach((opt) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "dice-btn option-btn";
    btn.textContent = opt;
    btn.addEventListener("click", () => selectChoice(opt));
    optionList.appendChild(btn);
  });

  writeInRow.style.display = currentPoll.allowWriteIn ? "block" : "none";

  // Re-apply my previous vote's highlight, if any, once options exist.
  applyMyVoteHighlight();
}

function selectChoice(choice) {
  selectedChoice = choice;
  writeInInput.value = "";
  highlightSelectedButton(choice);
}

function highlightSelectedButton(choice) {
  const buttons = optionList.querySelectorAll(".option-btn");
  buttons.forEach((b) => {
    b.classList.toggle("selected", b.textContent === choice);
  });
}

writeInInput.addEventListener("input", () => {
  if (writeInInput.value.trim()) {
    selectedChoice = null;
    highlightSelectedButton(null);
  }
});

submitVoteBtn.addEventListener("click", () => {
  if (!votesRef || !currentPoll) return;

  const writeIn = writeInInput.value.trim();
  const choice = selectedChoice || writeIn;

  if (!choice) {
    voteStatus.style.color = "#ef4444";
    voteStatus.textContent = "Pick an option or write your own answer first.";
    setTimeout(() => (voteStatus.textContent = ""), 2000);
    return;
  }

  votesRef.child(deviceId).set({
    choice: choice,
    pollId: currentPoll.id,
    ts: firebase.database.ServerValue.TIMESTAMP,
  }).then(() => {
    voteStatus.style.color = "#22c55e";
    voteStatus.textContent = `You voted: "${choice}"`;
  }).catch((err) => {
    console.error("Failed to submit vote:", err);
    voteStatus.style.color = "#ef4444";
    voteStatus.textContent = "Couldn't submit your vote — try again.";
  });
});

// ---- Restore my own vote (so reloading shows what I picked) ----
function applyMyVoteHighlight() {
  if (!votesRef || !currentPoll) return;
  votesRef.child(deviceId).once("value").then((snap) => {
    const mine = snap.val();
    if (mine && mine.pollId === currentPoll.id) {
      const isPreset = (currentPoll.options || []).includes(mine.choice);
      if (isPreset) {
        selectedChoice = mine.choice;
        highlightSelectedButton(mine.choice);
      } else if (currentPoll.allowWriteIn) {
        writeInInput.value = mine.choice;
      }
      voteStatus.style.color = "#22c55e";
      voteStatus.textContent = `You voted: "${mine.choice}"`;
    } else {
      voteStatus.textContent = "";
    }
  });
}

// ---- Live results (visible to everyone, voted or not) ----
function renderResults(votesObj) {
  const allVotes = Object.values(votesObj || {});
  const relevant = currentPoll
    ? allVotes.filter((v) => v.pollId === currentPoll.id)
    : allVotes;

  resultsCount.textContent = `${relevant.length} vote${relevant.length === 1 ? "" : "s"}`;

  if (!currentPoll) {
    resultsList.innerHTML = '<div class="empty-state">No poll is live right now.</div>';
    return;
  }

  // Tally by exact choice text.
  const tally = new Map();
  relevant.forEach((v) => {
    const key = v.choice;
    tally.set(key, (tally.get(key) || 0) + 1);
  });

  // Preset options first, in their defined order, then any write-ins by count desc.
  const rows = [];
  (currentPoll.options || []).forEach((opt) => {
    rows.push({ label: opt, count: tally.get(opt) || 0 });
    tally.delete(opt);
  });
  const writeIns = Array.from(tally.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);
  rows.push(...writeIns);

  const total = relevant.length;

  if (total === 0 && rows.length === 0) {
    resultsList.innerHTML = '<div class="empty-state">No votes yet.</div>';
    return;
  }

  resultsList.innerHTML = "";
  rows.forEach((r) => {
    const pct = total > 0 ? Math.round((r.count / total) * 100) : 0;
    const row = document.createElement("div");
    row.className = "bar-row";
    row.innerHTML = `
      <div class="bar-top">
        <span class="bar-label">${escapeHtml(r.label)}</span>
        <span class="bar-count">${r.count} (${pct}%)</span>
      </div>
      <div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div>
    `;
    resultsList.appendChild(row);
  });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

if (currentPollRef) {
  currentPollRef.on("value", (snap) => {
    renderPoll(snap.val());
  });
}
if (votesRef) {
  votesRef.on("value", (snap) => {
    renderResults(snap.val());
  });
}
