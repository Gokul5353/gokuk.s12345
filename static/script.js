// All calls go to the same Flask server: POST /translate (no API key needed).
const $ = (id) => document.getElementById(id);
const LANGS = [["en","English","en-US","eng"],["ta","Tamil","ta-IN","tam"],["hi","Hindi","hi-IN","hin"],["te","Telugu","te-IN","tel"],["ml","Malayalam","ml-IN","mal"],["kn","Kannada","kn-IN","kan"],["fr","French","fr-FR","fra"],["es","Spanish","es-ES","spa"],["de","German","de-DE","deu"],["it","Italian","it-IT","ita"],["pt","Portuguese","pt-PT","por"],["ru","Russian","ru-RU","rus"],["ar","Arabic","ar-SA","ara"],["ja","Japanese","ja-JP","jpn"],["ko","Korean","ko-KR","kor"],["zh-CN","Chinese","zh-CN","chi_sim"]];
const lang = (c) => LANGS.find((l) => l[0] === c);
const S = () => $("sourceLang").value;
const T = () => $("targetLang").value;
const MAX_BYTES = 500;
const bytes = (s) => new TextEncoder().encode(s).length;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
let a11y = false;

function fillLangs() {
  for (const id of ["sourceLang", "targetLang"]) {
    $(id).innerHTML = LANGS.map((l) => `<option value="${l[0]}">${l[1]}</option>`).join("");
  }
  $("sourceLang").value = "en";
  $("targetLang").value = "ta";
}
function showError(m) { $("error").textContent = m; $("error").hidden = false; }
function clearError() { $("error").hidden = true; }

// ---------- translation (with cache) ----------
const cache = {};
async function tr(text, to, from) {
  const k = from + "|" + to + "|" + text;
  if (cache[k]) return cache[k];
  let r;
  try {
    r = await fetch("/translate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, target: to, source: from }) });
  } catch (e) { throw new Error("Cannot connect to the server. Is Flask running?"); }
  let d = {};
  try { d = await r.json(); } catch (e) {}
  if (!r.ok) throw new Error(d.error || "Translation failed (" + r.status + ")");
  return (cache[k] = d.translatedText);
}

// ---------- speech out (pronunciation) ----------
function speak(text, code, rate = 1) {
  if (!("speechSynthesis" in window)) return showError("This browser cannot speak text.");
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang(code)[2]; u.rate = rate;
  const vs = speechSynthesis.getVoices();
  const v = vs.find((x) => x.lang.toLowerCase().startsWith(u.lang.slice(0, 2).toLowerCase()));
  if (v) u.voice = v; else if (vs.length) showError("No " + lang(code)[1] + " voice found on this device. Install one in your device speech settings.");
  speechSynthesis.speak(u);
}

// ---------- tabs, swap, accessibility ----------
document.querySelectorAll(".tab").forEach((b) => b.onclick = () => {
  document.querySelectorAll(".tab").forEach((x) => x.classList.toggle("active", x === b));
  document.querySelectorAll(".panel").forEach((p) => p.hidden = p.id !== "tab-" + b.dataset.tab);
  clearError();
});
$("swapBtn").onclick = () => { const s = S(); $("sourceLang").value = T(); $("targetLang").value = s; clearError(); };
function setA11y(on) {
  a11y = on; document.body.classList.toggle("a11y", on);
  $("a11yBtn").textContent = "Accessibility: " + (on ? "On" : "Off");
  $("a11yBtn").setAttribute("aria-pressed", on);
  try { localStorage.setItem("bb_a11y", on ? "1" : "0"); } catch (e) {}
}
$("a11yBtn").onclick = () => { setA11y(!a11y); if (a11y) speak("Accessibility mode on. Results will be spoken aloud.", "en"); };

// ---------- Translate tab + situations ----------
const CTX = {
  General: ["Hello", "Thank you", "Excuse me", "Where is the bathroom?", "How much is this?"],
  Restaurant: ["A table for two, please", "I am vegetarian", "No spicy food, please", "The bill, please", "Water, please"],
  Hotel: ["I have a reservation", "What time is check-out?", "Can I get an extra towel?", "Please call a taxi"],
  Transport: ["Where is the bus stop?", "One ticket to the airport, please", "Please stop here", "How long does it take?"],
  Emergency: ["Help!", "I need a doctor", "Call the police", "I am lost", "I need an ambulance"],
  Shopping: ["How much is this?", "Can you give a discount?", "Do you accept cards?", "Where is the market?"],
};
$("context").innerHTML = Object.keys(CTX).map((k) => `<option>${k}</option>`).join("");
function drawChips() {
  $("chips").innerHTML = "";
  CTX[$("context").value].forEach((p) => {
    const b = document.createElement("button");
    b.type = "button"; b.className = "chip"; b.textContent = p;
    b.onclick = () => { $("inputText").value = p; updateCounter(); doTranslate(); };
    $("chips").appendChild(b);
  });
}
$("context").onchange = drawChips;
function updateCounter() {
  const n = bytes($("inputText").value);
  $("counter").textContent = n + " / " + MAX_BYTES;
  $("counter").parentElement.classList.toggle("over", n > MAX_BYTES);
}
$("inputText").oninput = updateCounter;
$("inputText").onkeydown = (e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) doTranslate(); };

const IDIOMS = ["break a leg", "piece of cake", "under the weather", "kick the bucket", "raining cats and dogs", "hit the road", "cost an arm", "spill the beans", "once in a blue moon", "call it a day"];
const words = (s) => (s.toLowerCase().match(/\p{L}+/gu) || []);

async function doTranslate() {
  clearError();
  const text = $("inputText").value.trim();
  if (!text) return showError("Please type some text to translate.");
  if (bytes(text) > MAX_BYTES) return showError("Text is too long. Please shorten it.");
  if (S() === T()) return showError("Please choose two different languages.");
  $("translateBtn").disabled = true; $("translateBtn").textContent = "Translating...";
  try {
    const out = await tr(text, T(), S());
    $("output").textContent = out; $("actions").hidden = false;
    if (a11y) speak(out, T());
    checkMeaning(text, out);
  } catch (e) { $("output").textContent = ""; $("actions").hidden = true; $("backBox").hidden = true; showError(e.message); }
  finally { $("translateBtn").disabled = false; $("translateBtn").textContent = "Translate"; }
}
// Misunderstanding prevention: translate back and compare
async function checkMeaning(text, out) {
  const box = $("backBox"); box.hidden = false; box.className = "check"; box.textContent = "Checking meaning...";
  const idioms = IDIOMS.filter((i) => text.toLowerCase().includes(i));
  try {
    const back = await tr(out, S(), T());
    const a = words(text), b = new Set(words(back));
    const score = a.length ? Math.round(100 * a.filter((w) => b.has(w)).length / a.length) : 100;
    let msg = "They will understand: \"" + back + "\" (meaning match " + score + "%). ";
    let bad = false;
    if (score < 50) { msg += "May be misunderstood. Try shorter, simpler words."; bad = true; } else msg += "Looks safe.";
    if (idioms.length) { msg += " Idiom \"" + idioms[0] + "\" may not translate literally."; bad = true; }
    box.textContent = msg; box.classList.toggle("warn", bad);
  } catch (e) { box.textContent = "Could not double-check the meaning (" + e.message + ")"; }
}
$("translateBtn").onclick = doTranslate;
$("speakBtn").onclick = () => speak($("output").textContent, T());
$("slowBtn").onclick = () => speak($("output").textContent, T(), 0.5);
$("copyBtn").onclick = async () => {
  try { await navigator.clipboard.writeText($("output").textContent); $("copyBtn").textContent = "Copied!"; } catch (e) { $("copyBtn").textContent = "Copy failed"; }
  setTimeout(() => $("copyBtn").textContent = "Copy", 1500);
};

// ---------- Two-way voice ----------
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
function listen(who) {
  clearError();
  if (!SR) return showError("Voice input needs Chrome or Edge.");
  if (S() === T()) return showError("Please choose two different languages.");
  const from = who === "me" ? S() : T(), to = who === "me" ? T() : S();
  const rec = new SR(), btn = $(who === "me" ? "micMe" : "micThem");
  rec.lang = lang(from)[2]; rec.interimResults = false;
  btn.classList.add("live");
  rec.onresult = async (e) => {
    const said = e.results[0][0].transcript;
    try { const out = await tr(said, to, from); addBubble(who, said, out); speak(out, to); } catch (err) { showError(err.message); }
  };
  rec.onerror = (e) => showError("Microphone problem: " + e.error);
  rec.onend = () => btn.classList.remove("live");
  rec.start();
}
function addBubble(who, said, out) {
  const d = document.createElement("div"); d.className = "bubble " + who;
  const s = document.createElement("small"); s.textContent = said;
  const o = document.createElement("div"); o.textContent = out;
  d.append(s, o); $("chat").appendChild(d); d.scrollIntoView({ behavior: "smooth" });
}
$("micMe").onclick = () => listen("me");
$("micThem").onclick = () => listen("them");

// ---------- Readless mode ----------
const ICONS = [["💧","Water, please"],["🍽️","I want to eat"],["🚻","Where is the bathroom?"],["🏨","I need a hotel"],["🚕","I need a taxi"],["🏥","I need a doctor"],["👮","Call the police"],["🆘","Help!"],["💰","How much is this?"],["🙏","Thank you"],["📍","Where is this place?"],["🐢","Please speak slowly"]];
ICONS.forEach(([emoji, phrase]) => {
  const b = document.createElement("button");
  b.type = "button"; b.className = "icon"; b.textContent = emoji; b.setAttribute("aria-label", phrase);
  b.onclick = async () => {
    clearError();
    if (S() === T()) return showError("Please choose two different languages.");
    $("bigOut").textContent = "...";
    try { const out = await tr(phrase, T(), "en"); $("bigOut").textContent = out; speak(out, T()); } catch (e) { $("bigOut").textContent = ""; showError(e.message); }
  };
  $("grid").appendChild(b);
});

// ---------- Trip pack + offline ----------
const PACK = {
  Essentials: ["Hello", "Thank you", "Please", "Sorry", "Yes", "No", "I do not understand", "Do you speak English?"],
  Transport: ["Where is the bus stop?", "Please take me to this address", "How much is the ticket?"],
  Food: ["A table for two, please", "Water, please", "I am vegetarian", "The bill, please"],
  Hotel: ["I have a reservation", "Where is the bathroom?"],
  Directions: ["Where is this place?", "Turn left", "Turn right", "Straight ahead"],
  Emergency: ["Help!", "I need a doctor", "Call the police", "I am lost", "I need an ambulance"],
};
// Please re-check these numbers before you travel.
const NUMS = { india: "112 (all emergencies)", japan: "Police 110, Ambulance/Fire 119", france: "112 (all emergencies)", spain: "112 (all emergencies)", germany: "112 (all emergencies)", italy: "112 (all emergencies)", singapore: "Police 999, Ambulance 995", thailand: "Police 191, Ambulance 1669", korea: "Police 112, Fire/Ambulance 119", china: "Police 110, Ambulance 120, Fire 119", uk: "999 or 112", england: "999 or 112", usa: "911", america: "911", uae: "Police 999, Ambulance 998", dubai: "Police 999, Ambulance 998" };
function emergencyFor(dest) {
  const d = dest.toLowerCase();
  const k = Object.keys(NUMS).find((x) => d.includes(x));
  return k ? NUMS[k] : "112 works in many countries. Check the local number for your destination.";
}
let pack = null;
async function genPack() {
  clearError();
  if (S() === T()) return showError("Please choose two different languages.");
  const need = [...document.querySelectorAll("[data-need]")].filter((c) => c.checked).map((c) => c.dataset.need);
  const names = ["Essentials", ...need, "Directions", "Emergency"];
  const total = names.reduce((n, k) => n + PACK[k].length, 0);
  const btn = $("genPack"); btn.disabled = true;
  const p = { dest: $("dest").value.trim(), dates: [$("d1").value, $("d2").value].filter(Boolean).join(" to "), itin: $("itin").value.trim(), to: T(), sos: emergencyFor($("dest").value), sections: {} };
  let done = 0;
  try {
    for (const k of names) {
      p.sections[k] = [];
      for (const en of PACK[k]) {
        btn.textContent = "Translating " + (++done) + "/" + total + "...";
        p.sections[k].push([en, await tr(en, T(), "en")]);
      }
    }
    pack = p; try { localStorage.setItem("bb_pack", JSON.stringify(p)); } catch (e) {}
    renderPack(p);
  } catch (e) { showError(e.message); }
  finally { btn.disabled = false; btn.textContent = "Prepare my travel pack"; }
}
function renderPack(p) {
  pack = p;
  const box = $("packOut"); box.className = "pack"; box.innerHTML = "";
  const h = document.createElement("h3");
  h.textContent = (p.dest || "My trip") + (p.dates ? " (" + p.dates + ")" : "") + " - " + lang(p.to)[1];
  box.appendChild(h);
  if (p.itin) { const i = document.createElement("div"); i.className = "output"; i.textContent = p.itin; box.appendChild(i); }
  const sos = document.createElement("div"); sos.className = "sos"; sos.textContent = "Emergency numbers: " + p.sos; box.appendChild(sos);
  for (const [k, list] of Object.entries(p.sections)) {
    const t = document.createElement("h3"); t.textContent = k; box.appendChild(t);
    const ul = document.createElement("ul");
    list.forEach(([en, x]) => {
      const li = document.createElement("li");
      const sp = document.createElement("span"); sp.textContent = en + " - " + x;
      const b = document.createElement("button"); b.type = "button"; b.textContent = "Speak"; b.onclick = () => speak(x, p.to);
      li.append(sp, b); ul.appendChild(li);
    });
    box.appendChild(ul);
  }
  $("packActions").hidden = false;
}
function packHtml(p) {
  let h = `<!DOCTYPE html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>BridgeBack Pack</title><style>body{font-family:system-ui,sans-serif;max-width:600px;margin:auto;padding:16px}li{margin:10px 0}button{margin-left:8px;padding:4px 10px}.sos{background:#fdecec;color:#b42318;padding:10px;border-radius:8px;font-weight:600}</style>`;
  h += `<h1>${esc(p.dest || "My trip")}</h1><p>${esc(p.dates)}</p><p>${esc(p.itin).replace(/\n/g, "<br>")}</p><div class="sos">Emergency numbers: ${esc(p.sos)}</div>`;
  for (const [k, list] of Object.entries(p.sections)) {
    h += `<h2>${esc(k)}</h2><ul>` + list.map(([en, x]) => `<li>${esc(en)} - <b>${esc(x)}</b><button data-t="${esc(x)}">Speak</button></li>`).join("") + "</ul>";
  }
  h += `<script>document.addEventListener("click",function(e){var t=e.target.dataset.t;if(t){speechSynthesis.cancel();var u=new SpeechSynthesisUtterance(t);u.lang="${lang(p.to)[2]}";speechSynthesis.speak(u)}})<\/script>`;
  return h;
}
$("genPack").onclick = genPack;
$("dlPack").onclick = () => {
  if (!pack) return;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([packHtml(pack)], { type: "text/html" }));
  a.download = "bridgeback-travel-pack.html"; a.click(); URL.revokeObjectURL(a.href);
};
$("loadPack").onclick = () => {
  clearError();
  try { const p = JSON.parse(localStorage.getItem("bb_pack")); if (!p) throw 0; renderPack(p); } catch (e) { showError("No saved pack yet. Prepare one first."); }
};

// ---------- Menu / signboard scanner (OCR in the browser) ----------
function loadScript(src) {
  return new Promise((ok, no) => { const s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = () => no(new Error("Could not load the scanner. Check your internet.")); document.head.appendChild(s); });
}
$("scanBtn").onclick = async () => {
  clearError();
  const f = $("img").files[0];
  if (!f) return showError("Choose or take a photo first.");
  if (S() === T()) return showError("Please choose two different languages.");
  const btn = $("scanBtn"); btn.disabled = true; btn.textContent = "Reading...";
  try {
    if (!window.Tesseract) await loadScript("https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js");
    const r = await Tesseract.recognize(f, lang(T())[3]);
    const text = r.data.text.replace(/\s+/g, " ").trim();
    if (!text) throw new Error("No text found. Try a clearer, closer photo.");
    $("scanText").textContent = text;
    const out = await tr(text.slice(0, 150), S(), T());
    $("scanOut").textContent = out; speak(out, S());
  } catch (e) { showError(e.message); }
  finally { btn.disabled = false; btn.textContent = "Read and translate"; }
};

// ---------- start ----------
fillLangs(); drawChips(); updateCounter();
try { if (localStorage.getItem("bb_a11y") === "1") setA11y(true); } catch (e) {}
