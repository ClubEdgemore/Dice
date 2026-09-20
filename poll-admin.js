// ============================================================
// Poll admin logic — password gate (shared with admin.js via
// admin-config.js), a form to build/publish poll questions,
// clearing votes, and a live results view.
// ============================================================

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
const loginCard = document.getElementById("loginCard");
const adminCard = document.getElementById("adminCard");
const pwInput = document.getElementById("pwInput");
const loginBtn = document.getElementById("loginBtn");
const loginError = document.getElementById("loginError");

const questionInput = document.getElementById("questionInput");
const optionsContainer = document.getElementById("optionsContainer");
const addOptionBtn = document.getElementById("addOptionBtn");
const allowWriteInCheckbox = document.getElementById("allowWriteInCheckbox");
const publishBtn = document.getElementById("publishBtn");
const publishHint = document.getElementById("publishHint");
const clearVotesBtn = document.getElementById("clearVotesBtn");
const statusMsg = document.getElementById("statusMsg");

const resultsHeader = document.getElementById("resultsHeader");
const resultsCard = document.getElementById("resultsCard");
const resultsList = document.getElementById("resultsList");
const resultsCount = document.getElementById("resultsCount");

let liveCurrentPoll = null;

// ---- Login ----
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

function unlock() {
  loginCard.style.display = "none";
  adminCard.style.display = "block";
  resultsHeader.style.display = "flex";
  resultsCard.style.display = "block";
  loadExistingPoll();
  startListening();
}

// ---- Option rows ----
function addOptionRow(value) {
  const row = document.createElement("div");
  row.className = "option-row";

  const input = document.createElement("input");
  input.type = "text";
  input.className = "option-row-input";
  input.maxLength = 60;
  input.placeholder = "Answer option";
  input.value = value || "";

  const removeBtn = document.createElement("button");
  removeBtn.type = "button";
  removeBtn.className = "remove-option-btn";
  removeBtn.textContent = "×";
  removeBtn.title = "Remove option";
  removeBtn.addEventListener("click", () => {
    row.remove();
  });

  row.appendChild(input);
  row.appendChild(removeBtn);
  optionsContainer.appendChild(row);
}

addOptionBtn.addEventListener("click", () => addOptionRow(""));

function getOptionValues() {
  return Array.from(optionsContainer.querySelectorAll(".option-row-input"))
    .map((i) => i.value.trim())
    .filter((v) => v.length > 0);
}

// Prefill the form with whatever poll is currently live, so it's easy to tweak and republish.
function loadExistingPoll() {
  if (!currentPollRef) return;
  currentPollRef.once("value").then((snap) => {
    const poll = snap.val();
    optionsContainer.innerHTML = "";
    if (poll && poll.question) {
      questionInput.value = poll.question;
      (poll.options || []).forEach((opt) => addOptionRow(opt));
      allowWriteInCheckbox.checked = !!poll.allowWriteIn;
    } else {
      addOptionRow("");
      addOptionRow("");
    }
    // Always leave a couple of blank rows for quick editing.
    if (optionsContainer.querySelectorAll(".option-row-input").length < 2) {
      addOptionRow("");
    }
  });
}

// ---- Publish ----
publishBtn.addEventListener("click", () => {
  const question = questionInput.value.trim();
  const options = getOptionValues();

  if (!question || options.length < 2) {
    publishHint.style.display = "block";
    setTimeout(() => (publishHint.style.display = "none"), 2500);
    return;
  }
  if (!currentPollRef || !votesRef) return;

  const poll = {
    id: Date.now().toString(36),
    question: question,
    options: options,
    allowWriteIn: allowWriteInCheckbox.checked,
    publishedAt: firebase.database.ServerValue.TIMESTAMP,
  };

  currentPollRef.set(poll)
    .then(() => votesRef.remove())
    .then(() => {
      statusMsg.style.color = "#22c55e";
      statusMsg.textContent = "Poll published — previous votes cleared.";
      setTimeout(() => (statusMsg.textContent = ""), 3000);
    })
    .catch((err) => {
      statusMsg.style.color = "#ef4444";
      statusMsg.textContent = "Failed to publish: " + err.message;
    });
});

// ---- Clear votes only (keep the same question live) ----
clearVotesBtn.addEventListener("click", () => {
  if (!votesRef) return;
  const ok = confirm("Clear all votes for the current question? This can't be undone.");
  if (!ok) return;
  votesRef.remove()
    .then(() => {
      statusMsg.style.color = "#22c55e";
      statusMsg.textContent = "Votes cleared.";
      setTimeout(() => (statusMsg.textContent = ""), 2500);
    })
    .catch((err) => {
      statusMsg.style.color = "#ef4444";
      statusMsg.textContent = "Failed to clear: " + err.message;
    });
});

// ---- Live results ----
function startListening() {
  if (!currentPollRef || !votesRef) {
    statusMsg.textContent = "Not connected — check firebase-config.js.";
    statusMsg.style.color = "#ef4444";
    return;
  }
  currentPollRef.on("value", (snap) => {
    liveCurrentPoll = snap.val();
    renderResultsFromCache();
  });
  votesRef.on("value", (snap) => {
    lastVotesSnapshot = snap.val();
    renderResultsFromCache();
  });
}

let lastVotesSnapshot = null;

function renderResultsFromCache() {
  const allVotes = Object.values(lastVotesSnapshot || {});
  const relevant = liveCurrentPoll
    ? allVotes.filter((v) => v.pollId === liveCurrentPoll.id)
    : allVotes;

  resultsCount.textContent = `${relevant.length} vote${relevant.length === 1 ? "" : "s"}`;

  if (!liveCurrentPoll) {
    resultsList.innerHTML = '<div class="empty-state">No poll published yet.</div>';
    return;
  }

  const tally = new Map();
  relevant.forEach((v) => tally.set(v.choice, (tally.get(v.choice) || 0) + 1));

  const rows = [];
  (liveCurrentPoll.options || []).forEach((opt) => {
    rows.push({ label: opt, count: tally.get(opt) || 0 });
    tally.delete(opt);
  });
  const writeIns = Array.from(tally.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);
  rows.push(...writeIns);

  const total = relevant.length;

  resultsList.innerHTML = "";
  if (rows.length === 0) {
    resultsList.innerHTML = '<div class="empty-state">No votes yet.</div>';
    return;
  }
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
