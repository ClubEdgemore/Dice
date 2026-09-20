// ============================================================
// Player app logic — name entry, dice picker, roll animation,
// writing this device's roll, and rendering the live feed.
// ============================================================

const DICE = [
  { id: "d4", label: "D4", max: 4 },
  { id: "d6", label: "D6", max: 6 },
  { id: "d8", label: "D8", max: 8 },
  { id: "d10", label: "D10", max: 10 },
  { id: "d12", label: "D12", max: 12 },
  { id: "d20", label: "D20", max: 20 },
];

// Each die gets its own silhouette (more sides = rounder), so the icon
// actually changes when you pick a different die instead of always
// showing the same cube.
const DIE_SHAPES = {
  d4: { sides: 3, rotation: -90 },   // triangle
  d6: { sides: 4, rotation: 45 },    // square
  d8: { sides: 4, rotation: -90 },   // diamond
  d10: { sides: 5, rotation: -90 },  // pentagon
  d12: { sides: 6, rotation: -90 },  // hexagon
  d20: { sides: 8, rotation: -90 },  // octagon
};

function polygonPoints(sides, rotationDeg, cx, cy, r) {
  const pts = [];
  for (let i = 0; i < sides; i++) {
    const angle = ((rotationDeg + (i * 360) / sides) * Math.PI) / 180;
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);
    pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  }
  return pts.join(" ");
}

function buildDieSvg(diceId) {
  const shape = DIE_SHAPES[diceId] || DIE_SHAPES.d6;
  const pts = polygonPoints(shape.sides, shape.rotation, 50, 50, 40);
  return `
    <svg viewBox="0 0 100 100" width="100" height="100" xmlns="http://www.w3.org/2000/svg">
      <polygon points="${pts}" style="fill:rgba(0,0,0,0.35); stroke:var(--accent); stroke-width:5; stroke-linejoin:round;" />
    </svg>
  `;
}

function updateDieShape() {
  dieFace.innerHTML = buildDieSvg(selectedDice);
}

const DEVICE_ID_KEY = "dice_device_id";
const NAME_KEY = "dice_player_name";
const DICE_KEY = "dice_selected";

function getDeviceId() {
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = "p_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

const deviceId = getDeviceId();
let selectedDice = localStorage.getItem(DICE_KEY) || "d20";

// ---- Firebase init ----
let db = null;
try {
  firebase.initializeApp(firebaseConfig);
  db = firebase.database();
} catch (e) {
  console.error("Firebase failed to initialize. Did you fill in firebase-config.js?", e);
}
const rollsRef = db ? db.ref("rolls") : null;

// ---- DOM ----
const nameInput = document.getElementById("nameInput");
const diceGrid = document.getElementById("diceGrid");
const rollBtn = document.getElementById("rollBtn");
const dieFace = document.getElementById("dieFace");
const resultNumber = document.getElementById("resultNumber");
const resultLabel = document.getElementById("resultLabel");
const feed = document.getElementById("feed");
const feedCount = document.getElementById("feedCount");

// Restore saved name
nameInput.value = localStorage.getItem(NAME_KEY) || "";
nameInput.addEventListener("input", () => {
  localStorage.setItem(NAME_KEY, nameInput.value.trim());
});

// ---- Build dice buttons ----
function renderDiceButtons() {
  diceGrid.innerHTML = "";
  DICE.forEach((d) => {
    const btn = document.createElement("button");
    btn.className = "dice-btn" + (d.id === selectedDice ? " selected" : "");
    btn.textContent = d.label;
    btn.type = "button";
    btn.addEventListener("click", () => {
      selectedDice = d.id;
      localStorage.setItem(DICE_KEY, selectedDice);
      renderDiceButtons();
      updateDieShape();
    });
    diceGrid.appendChild(btn);
  });
}
renderDiceButtons();
updateDieShape();

// ---- Roll animation + write ----
let rolling = false;

function currentDiceConfig() {
  return DICE.find((d) => d.id === selectedDice) || DICE[DICE.length - 1];
}

rollBtn.addEventListener("click", () => {
  if (rolling) return;

  const name = nameInput.value.trim();
  if (!name) {
    nameInput.focus();
    nameInput.style.borderColor = "#ef4444";
    setTimeout(() => (nameInput.style.borderColor = ""), 900);
    return;
  }
  if (!rollsRef) {
    alert("Not connected to the live session yet — check firebase-config.js.");
    return;
  }

  const dice = currentDiceConfig();
  const finalResult = 1 + Math.floor(Math.random() * dice.max);

  rolling = true;
  rollBtn.disabled = true;
  dieFace.classList.add("rolling");
  resultNumber.textContent = "";
  resultLabel.textContent = "";

  let ticks = 0;
  const maxTicks = 14;
  const interval = setInterval(() => {
    ticks++;
    const preview = 1 + Math.floor(Math.random() * dice.max);
    resultNumber.textContent = preview;
    if (ticks >= maxTicks) {
      clearInterval(interval);
      finishRoll(name, dice, finalResult);
    }
  }, 70);
});

function finishRoll(name, dice, finalResult) {
  dieFace.classList.remove("rolling");
  resultNumber.textContent = finalResult;
  resultLabel.textContent = `You rolled a ${dice.label} → ${finalResult}`;

  rollsRef.child(deviceId).set({
    name: name,
    diceId: dice.id,
    diceLabel: dice.label,
    result: finalResult,
    ts: firebase.database.ServerValue.TIMESTAMP,
  }).catch((err) => {
    console.error("Failed to write roll:", err);
  });

  rolling = false;
  rollBtn.disabled = false;
}

// ---- Live feed ----
function renderFeed(rollsObj) {
  const entries = Object.values(rollsObj || {});
  entries.sort((a, b) => (b.ts || 0) - (a.ts || 0));

  feedCount.textContent = `${entries.length} roll${entries.length === 1 ? "" : "s"}`;

  if (entries.length === 0) {
    feed.innerHTML = '<div class="empty-state">No rolls yet — be the first!</div>';
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
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

if (rollsRef) {
  rollsRef.on("value", (snapshot) => {
    renderFeed(snapshot.val());
  });
}
