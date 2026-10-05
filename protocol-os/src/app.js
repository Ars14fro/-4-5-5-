/* ============ PROTOCOL OS — App Logic ============ */
"use strict";

/* ---------- Constants & helpers ---------- */
const K = {
  DATA: "pos.data.v1", DONE: "pos.done.v1", WATER: "pos.water.v1",
  CHECK: "pos.check.v1", TIMERS: "pos.timers.v1", NOTIFIED: "pos.notified.v1",
  TAB: "pos.tab.v1", SEG: "pos.seg.v1", NB: "pos.nbdismiss.v1",
  SHIFT: "pos.shift.v1", PLANB: "pos.planb.v1", DIM: "pos.dim.v1",
  REMIND: "pos.remind.v1", REMINDON: "pos.remindon.v1", PRE: "pos.prenot.v1", WTS: "pos.water.ts.v1"
};
const DAYS = ["monday","tuesday","wednesday","thursday","friday","saturday","sunday"];
const DAY_RU = { monday:"Понедельник", tuesday:"Вторник", wednesday:"Среда", thursday:"Четверг", friday:"Пятница", saturday:"Суббота", sunday:"Воскресенье" };
const DAY_SHORT = { monday:"ПН", tuesday:"ВТ", wednesday:"СР", thursday:"ЧТ", friday:"ПТ", saturday:"СБ", sunday:"ВС" };
const TAGS = {
  routine:{ru:"Режим",c:"var(--tag-routine)"}, sport:{ru:"Спорт",c:"var(--tag-sport)"},
  study:{ru:"Учёба",c:"var(--tag-study)"}, food:{ru:"Питание",c:"var(--tag-food)"},
  care:{ru:"Уход",c:"var(--tag-care)"}, sleep:{ru:"Сон",c:"var(--tag-sleep)"}
};
const PX_PER_MIN = 1.5;
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const clone = o => JSON.parse(JSON.stringify(o));
const pad = n => String(n).padStart(2,"0");
const esc = s => String(s ?? "").replace(/[&<>"']/g, m => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
const toMin = hm => { const [h,m] = hm.split(":").map(Number); return h*60+m; };
const fmtMin = m => `${pad(Math.floor(m/60))}:${pad(m%60)}`;
const dateKey = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const dayKeyOf = d => DAYS[(d.getDay()+6)%7];
const midnight = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d,n) => { const x = new Date(d); x.setDate(x.getDate()+n); return x; };
const MONTHS = ["января","февраля","марта","апреля","мая","июня","июля","августа","сентября","октября","ноября","декабря"];
const WD = ["воскресенье","понедельник","вторник","среда","четверг","пятница","суббота"];

function S_get(k, def){ try{ const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; }catch(e){ return def; } }
function S_set(k, v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){} }

/* ---------- State ---------- */
let DATA = S_get(K.DATA, null) || clone(DEFAULT_DATA);
let viewDate = midnight(new Date());
let currentTab = S_get(K.TAB, "timeline");
let manageSeg = S_get(K.SEG, "builder");
let editDay = dayKeyOf(new Date());
let sheetCtx = null;        // {dateKey, dayKey, index, block}
let confirmCb = null;
let dragIdx = null;

const today0 = () => midnight(new Date());
const isToday = d => dateKey(d) === dateKey(new Date());
const nowMin = () => { const n = new Date(); return n.getHours()*60 + n.getMinutes(); };

function doneMap(dk){ const all = S_get(K.DONE, {}); return all[dk] || {}; }
function setDone(dk, bk, val){
  const all = S_get(K.DONE, {});
  all[dk] = all[dk] || {};
  if(val) all[dk][bk] = 1; else delete all[dk][bk];
  S_set(K.DONE, all);
}
const blockKey = b => `${b.start}|${b.title}`;

function blockStatus(dk, b){
  const d = new Date(dk + "T00:00:00");
  const t = new Date();
  if(d < today0()) return "past";
  if(d > today0()) return "future";
  const nm = t.getHours()*60 + t.getMinutes() + t.getSeconds()/60;
  if(nm < toMin(b.start)) return "future";
  if(nm >= toMin(b.end)) return "past";
  return "current";
}

/* ---------- Toast / Confirm ---------- */
let toastT = null;
function toast(msg, type){
  const t = $("#toast");
  t.textContent = msg; t.className = "show" + (type ? " " + type : "");
  clearTimeout(toastT); toastT = setTimeout(()=> t.className = "", 2600);
}
function askConfirm(msg, cb, okLabel){
  $("#confirm-text").textContent = msg;
  $("#confirm-ok").textContent = okLabel || "Подтвердить";
  confirmCb = cb;
  $("#confirm").classList.add("open");
}
$("#confirm-cancel").addEventListener("click", ()=> $("#confirm").classList.remove("open"));
$("#confirm-ok").addEventListener("click", ()=>{
  $("#confirm").classList.remove("open");
  if(confirmCb) confirmCb();
  confirmCb = null;
});

/* ---------- Sound / vibration / notifications ---------- */
let AC = null;
function beep(n){
  n = n || 3;
  try{
    AC = AC || new (window.AudioContext || window.webkitAudioContext)();
    if(AC.state === "suspended") AC.resume();
    let t = AC.currentTime;
    for(let i=0;i<n;i++){
      const o = AC.createOscillator(), g = AC.createGain();
      o.connect(g); g.connect(AC.destination);
      o.type = "sine"; o.frequency.value = i===n-1 ? 1174 : 880;
      g.gain.setValueAtTime(.0001, t);
      g.gain.exponentialRampToValueAtTime(.35, t+.02);
      g.gain.exponentialRampToValueAtTime(.0001, t+.3);
      o.start(t); o.stop(t+.32);
      t += .38;
    }
  }catch(e){}
  if(navigator.vibrate) try{ navigator.vibrate([200,100,200,100,400]); }catch(e){}
}
function notify(title, body){
  try{
    if("Notification" in window && Notification.permission === "granted"){
      const n = new Notification(title, { body: body || "", icon: ICON_URL, badge: ICON_URL, tag: title });
      if(n.onclick !== undefined) n.onclick = ()=>{ window.focus(); n.close(); };
      return true;
    }
  }catch(e){}
  return false;
}
function requestNotif(){
  if(!("Notification" in window)){ toast("Уведомления не поддерживаются этим браузером","err"); return; }
  Notification.requestPermission().then(p=>{
    updateNotifBanner();
    if(p === "granted"){ toast("Уведомления включены ✓","ok"); notify("Protocol OS","Уведомления о начале блоков активны."); }
    else toast("Разрешение не выдано — включи в настройках браузера","err");
  });
}
function updateNotifBanner(){
  const b = $("#notif-banner");
  if(!b) return;
  const show = "Notification" in window && Notification.permission === "default" && !S_get(K.NB, 0);
  b.classList.toggle("show", show);
}
function showAlert(emoji, title, sub){
  $("#alert-emoji").textContent = emoji;
  $("#alert-title").textContent = title;
  $("#alert-sub").textContent = sub || "";
  $("#alert").classList.add("open");
  beep(4);
}
$("#alert-ok").addEventListener("click", ()=> $("#alert").classList.remove("open"));

/* ---------- Timers (pomodoro / carb) ---------- */
let timers = S_get(K.TIMERS, { pomo:null, carb:null });
const POMO_WORK = 25*60*1000, POMO_BREAK = 5*60*1000, CARB_MS = 35*60*1000;

function saveTimers(){ S_set(K.TIMERS, timers); }

function pomoStart(bk, dk){
  timers.pomo = { running:true, mode:"work", endsAt:Date.now()+POMO_WORK, remain:POMO_WORK, cycles:0, bk, dk, alarmed:false };
  saveTimers(); renderTimersEverywhere();
  toast("Помодоро: 25 мин работы. Телефон — в авиарежим 📵","ok");
}
function pomoPause(){
  const p = timers.pomo; if(!p || !p.running) return;
  p.remain = Math.max(0, p.endsAt - Date.now()); p.running = false; saveTimers(); renderTimersEverywhere();
}
function pomoResume(){
  const p = timers.pomo; if(!p || p.running) return;
  p.endsAt = Date.now() + p.remain; p.running = true; p.alarmed = false; saveTimers(); renderTimersEverywhere();
}
function pomoReset(){ timers.pomo = null; saveTimers(); renderTimersEverywhere(); }
function carbStart(bk, dk){
  timers.carb = { endsAt:Date.now()+CARB_MS, bk, dk, alarmed:false };
  saveTimers(); renderTimersEverywhere();
  toast("Таймер углеводов запущен: 35 мин ⏱","ok");
}
function carbStop(){ timers.carb = null; saveTimers(); renderTimersEverywhere(); }

function timerTick(){
  const now = Date.now();
  let dirty = false;
  const p = timers.pomo;
  if(p && p.running && !p.alarmed && now >= p.endsAt){
    p.alarmed = true; dirty = true;
    if(p.mode === "work"){
      p.cycles = (p.cycles||0) + 1;
      p.mode = "break"; p.endsAt = now + POMO_BREAK; p.remain = POMO_BREAK; p.alarmed = false;
      saveTimers();
      notify("⏸ Помодоро: перерыв 5 мин", `Цикл ${p.cycles} завершён. Встань, пройдись, выпей воды.`);
      if(!document.hidden) showAlert("⏸","Перерыв 5 минут","Встань, пройдись, выпей воды. Потом — следующий цикл.");
      else beep(3);
    } else {
      p.mode = "work"; p.endsAt = now + POMO_WORK; p.remain = POMO_WORK; p.alarmed = false;
      saveTimers();
      notify("▶️ Помодоро: работа 25 мин", "Следующий цикл начался. Телефон в авиарежим.");
      if(!document.hidden) showAlert("▶️","Работа: 25 минут","Следующий помодоро-цикл начался. Фокус.");
      else beep(3);
    }
  }
  const c = timers.carb;
  if(c && !c.alarmed && now >= c.endsAt){
    c.alarmed = true; dirty = true;
    notify("🍚 Окно открыто: можно углеводы", "30–40 мин после спринта прошло — восстанавливаем гликоген.");
    if(!document.hidden) showAlert("🍚","Окно открыто: можно углеводы","35 минут после спринта прошло. Белок + овощи + углеводы — восстанавливаем гликоген.");
    else beep(4);
    saveTimers();
  }
  renderTimersEverywhere(dirty);
}

function fmtRemain(ms){
  ms = Math.max(0, ms);
  const s = Math.ceil(ms/1000);
  return `${pad(Math.floor(s/60))}:${pad(s%60)}`;
}

/* ---------- Effective schedule (with day shifts) ---------- */
function shiftsFor(dk){ return S_get(K.SHIFT, {})[dk] || []; }
function effSchedule(dayKey, dk){
  const day = DATA.week && DATA.week[dayKey];
  if(!day || !Array.isArray(day.schedule)) return [];
  const recs = shiftsFor(dk);
  if(!recs.length) return day.schedule;
  return day.schedule.map(b=>{
    let off = 0;
    recs.forEach(r=>{ if(toMin(b.start) >= r.anchor) off += r.offset; });
    if(!off) return b;
    const nb = Object.assign({}, b, {
      start: fmtMin(Math.min(toMin(b.start)+off, 23*60+55)),
      end: fmtMin(Math.min(toMin(b.end)+off, 23*60+59)),
      _shift: off
    });
    return nb;
  });
}
function applyShift(mins){
  const dk = dateKey(new Date());
  const all = S_get(K.SHIFT, {});
  all[dk] = (all[dk] || []).concat([{ anchor: nowMin(), offset: mins }]);
  S_set(K.SHIFT, all);
  toast(`Оставшиеся блоки сдвинуты на +${mins} мин. Держись!`, "ok");
  renderTimeline(false);
}
function resetShift(){
  const dk = dateKey(new Date());
  const all = S_get(K.SHIFT, {});
  delete all[dk];
  S_set(K.SHIFT, all);
  toast("Сдвиг сброшен — базовая сетка дня");
  renderTimeline(false);
}

/* ---------- Dim (evening warm) mode + lights-out countdown ---------- */
function applyDim(){
  const mode = S_get(K.DIM, "auto");
  const h = new Date().getHours();
  const on = mode === "on" || (mode === "auto" && (h >= 20 || h < 6));
  document.body.classList.toggle("dim", on);
  const btn = $("#dim-toggle");
  if(btn) btn.textContent = mode === "on" ? "🌙 вкл" : mode === "off" ? "☀️ выкл" : (on ? "🌙 авто·вкл" : "🌙 авто");
  btn && btn.classList.toggle("active", on);
}
function updateLightsOut(blocks, today){
  const el = $("#lo-line");
  if(!el) return;
  const sleepBlocks = blocks.filter(b=> b.tag === "sleep");
  if(!sleepBlocks.length){ el.textContent = ""; el.className = "lo-line"; return; }
  const endM = Math.max(...sleepBlocks.map(b=>toMin(b.end)));
  if(!today){
    el.textContent = `🌙 отбой в этот день: ${fmtMin(endM)}`;
    el.className = "lo-line";
    return;
  }
  const nm = nowMin();
  const diff = endM - nm;
  if(diff > 0){
    const h = Math.floor(diff/60), m = diff%60;
    el.textContent = `🌙 до отбоя ${h>0 ? h+" ч " : ""}${m} мин (${fmtMin(endM)})`;
    el.className = "lo-line";
  } else {
    el.textContent = "🌙 время отбоя — телефон в другую комнату";
    el.className = "lo-line late";
  }
}

/* ---------- Plan B (compressed day) ---------- */
function planBAnchors(blocks){
  if(!blocks.length) return [];
  const idx = [0];
  let si = -1, sl = 0;
  blocks.forEach((b,i)=>{ if(b.tag === "sport"){ const d = toMin(b.end)-toMin(b.start); if(d > sl){ sl = d; si = i; } } });
  if(si > 0) idx.push(si);
  const ec = blocks.findIndex(b=> b.tag === "care" && toMin(b.start) >= 20*60);
  if(ec > 0) idx.push(ec);
  const sb = blocks.findIndex(b=> b.tag === "sleep" && toMin(b.start) >= 21*60);
  if(sb > 0) idx.push(sb);
  return Array.from(new Set(idx));
}
function checkListHTML(items){
  return (items||[]).map((c,i)=>`
    <div class="check-item" data-ci="${i}">
      <div class="check-box"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></div>
      <div class="c-text">${esc(c)}</div>
    </div>`).join("");
}
function bindCheckList(dk, items, root, onDone){
  root.querySelectorAll(".check-item").forEach(it=>{
    const i = it.dataset.ci;
    const all = S_get(K.CHECK, {});
    it.classList.toggle("on", !!(all[dk] && all[dk][i]));
    it.addEventListener("click", ()=>{
      const a = S_get(K.CHECK, {});
      a[dk] = a[dk] || {};
      if(a[dk][i]) delete a[dk][i]; else a[dk][i] = 1;
      S_set(K.CHECK, a);
      it.classList.toggle("on");
      if(a[dk][i] && navigator.vibrate) try{ navigator.vibrate(25); }catch(e){}
      onDone && onDone();
    });
  });
}

/* ---------- Block-start + pre-notifications ---------- */
function checkBlockNotifs(){
  const now = new Date();
  const dk = dateKey(now);
  const dayKey = dayKeyOf(now);
  const blocks = effSchedule(dayKey, dk);
  if(!blocks.length) return;
  const notified = S_get(K.NOTIFIED, {});
  notified[dk] = notified[dk] || {};
  const hm = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  let changed = false;
  blocks.forEach(b=>{
    if(b.start === hm && !notified[dk][b.start]){
      notified[dk][b.start] = 1; changed = true;
      const body = b.callout ? b.callout.replace(/^[^\s]+\s/, m=>m) : (b.details||"").split("\n").find(l=>l.trim()) || "Время блока наступило.";
      notify(`${b.start} — ${b.title}`, body);
      if(!document.hidden && document.hasFocus()) beep(2);
      if(navigator.vibrate) try{ navigator.vibrate(300); }catch(e){}
    }
  });
  if(changed) S_set(K.NOTIFIED, notified);
  // pre-reminder: 10 min before block start
  const pre = S_get(K.PRE, {});
  pre[dk] = pre[dk] || {};
  const nmExact = now.getHours()*60 + now.getMinutes() + now.getSeconds()/60;
  let preChanged = false;
  blocks.forEach(b=>{
    const diff = toMin(b.start) - nmExact;
    if(diff > 0 && diff <= 10 && !pre[dk][b.start]){
      pre[dk][b.start] = 1; preChanged = true;
      const mins = Math.max(1, Math.round(diff));
      notify(`Через ${mins} мин — ${b.title}`, b.callout || "Пора готовиться к блоку.");
      if(!document.hidden && document.hasFocus()) toast(`⏳ Через ${mins} мин: ${b.title}`, "");
    }
  });
  if(preChanged) S_set(K.PRE, pre);
}

/* ---------- Smart 24/7 reminders (posture / water) ---------- */
const FOCUS_PINGS = [
  "🧍 Posture check: нить за макушку, плечи назад-вниз + chin tucks 10",
  "👅 Мьюинг: язык к нёбу, дыхание носом",
  "👁 20-20-20: отведи взгляд на ~6 м на 20 сек",
  "📵 Телефон экраном вниз. Ладони на виду"
];
function checkSmartReminders(){
  if(!S_get(K.REMINDON, 1)) return;
  const now = new Date();
  const t = now.getHours()*60 + now.getMinutes();
  const inWindow = (t >= 6*60+30 && t < 7*60) || (t >= 15*60 && t < 21*60);
  if(!inWindow) return;
  const dk = dateKey(now);
  const st = S_get(K.REMIND, {});
  const nowTs = Date.now();
  let changed = false;
  // water ping: no glass for 2h and goal not reached
  const H = DATA.habits_24_7 || {};
  const goal = (H.hydration && H.hydration.goal_ml) || 3000;
  const ml = (S_get(K.WATER, {})[dk]) || 0;
  const wts = (S_get(K.WTS, {})[dk]) || 0;
  if(ml < goal && nowTs - wts > 2*3600*1000 && nowTs - (st.waterPing||0) > 2*3600*1000){
    st.waterPing = nowTs; changed = true;
    notify("💧 Вода", "Давно не отмечал воду. Открой «Привычки 24/7» → +250 мл.");
  }
  // focus ping rotation every 2h
  if(nowTs - (st.focusPing||0) > 2*3600*1000){
    st.focusPing = nowTs;
    st.idx = ((st.idx||0) + 1) % FOCUS_PINGS.length;
    changed = true;
    notify("Фокус 24/7", FOCUS_PINGS[st.idx]);
  }
  if(changed) S_set(K.REMIND, st);
}

/* ---------- Tabs ---------- */
function setTab(t){
  currentTab = t; S_set(K.TAB, t);
  $$(".tabview").forEach(v=> v.classList.toggle("active", v.id === "tab-"+t));
  $$(".nav-btn").forEach(b=> b.classList.toggle("active", b.dataset.tab === t));
  if(t === "timeline") renderTimeline(true);
  if(t === "habits") renderHabits();
  if(t === "manage") renderManage();
  $("#screen").scrollTop = 0;
}
$$(".nav-btn").forEach(b=> b.addEventListener("click", ()=> setTab(b.dataset.tab)));

/* ---------- Timeline ---------- */
function renderTimeline(scrollToNow){
  const dayKey = dayKeyOf(viewDate);
  const day = DATA.week && DATA.week[dayKey];
  const dk = dateKey(viewDate);
  const today = isToday(viewDate);

  // header
  const now = new Date();
  $("#dn-date").textContent = `${cap(WD_short(viewDate))}, ${viewDate.getDate()} ${MONTHS[viewDate.getMonth()]}`;
  $("#dn-accent").textContent = day ? (day.accent || "") : "";
  $("#today-pill").classList.toggle("show", !today);
  $("#notif-today").style.display = today ? "" : "none";

  const wrap = $("#timeline-wrap");
  renderShiftPanel(today, dk);
  const pbBtn = $("#planb-toggle");
  if(pbBtn) pbBtn.classList.toggle("active", !!S_get(K.PLANB, {})[dk]);
  const blocks = effSchedule(dayKey, dk);
  updateLightsOut(blocks, today);
  if(!blocks.length){
    wrap.innerHTML = `<div class="empty-day">На этот день блоков нет.<br>Добавь их в «Управление → Конструктор».</div>`;
    renderSummary(dk, [], day);
    return;
  }
  if(S_get(K.PLANB, {})[dk]){
    renderPlanB(dk, dayKey, blocks, day);
    return;
  }
  const done = doneMap(dk);
  const starts = blocks.map(b=>toMin(b.start)), ends = blocks.map(b=>toMin(b.end));
  const minM = Math.min(...starts), maxM = Math.max(...ends);
  const totalPx = (maxM - minM) * PX_PER_MIN;
  const nm = nowMin();

  let html = `<div class="timeline" style="height:${totalPx}px">`;
  // hour lines
  for(let m = Math.ceil(minM/60)*60; m <= maxM; m += 60){
    const y = (m - minM) * PX_PER_MIN;
    html += `<div class="hour-line" style="top:${y}px"></div><div class="hour-lab" style="top:${y}px">${fmtMin(m)}</div>`;
  }
  // now line
  if(today && nm >= minM && nm <= maxM){
    html += `<div class="now-line" id="now-line" style="top:${(nm - minM) * PX_PER_MIN}px"></div>`;
  }
  blocks.forEach((b,i)=>{
    const st = blockStatus(dk, b);
    const isDone = !!done[blockKey(b)];
    const top = (toMin(b.start) - minM) * PX_PER_MIN;
    const slotH = (toMin(b.end) - toMin(b.start)) * PX_PER_MIN;
    const compact = slotH < 52;
    const h = compact ? Math.max(slotH - 3, 30) : Math.max(slotH - 5, 44);
    const tag = TAGS[b.tag] || TAGS.routine;
    let cls = "block " + st + (compact ? " compact" : "");
    if(st === "past") cls += isDone ? " done-b" : " miss-b";
    let extra = "";
    if(st === "current"){
      const left = Math.max(0, Math.ceil(toMin(b.end) - (nm + new Date().getSeconds()/60)));
      extra = `<div class="b-left num">▶ сейчас · осталось ${left} мин</div>`;
    } else if(st === "past"){
      extra = isDone ? `<div class="b-done-lab">✓ Выполнено</div>` : `<div class="b-missed-lab">○ Не выполнено — нажми, чтобы отметить</div>`;
    }
    const toolsBadge = (b.tools||[]).filter(t=>t!=="none").length && st !== "past"
      ? `<div class="b-tool-badge">⏱ ${(b.tools||[]).includes("pomodoro")?"помодоро":""}${(b.tools||[]).includes("carb_timer")?"таймер углеводов":""}</div>` : "";
    html += `
    <div class="${cls}" style="top:${top}px;height:${h}px;--tagc:${tag.c}" data-i="${i}" data-dk="${dk}">
      <div class="b-bar"></div>
      <div class="b-time num">${esc(b.start)}–${esc(b.end)}</div>
      <div class="b-body">
        <div class="b-title">${esc(b.title)}${b._shift?`<span class="shift-badge">сдвиг +${b._shift}′</span>`:""}</div>
        <span class="b-tag">${tag.ru}</span>
        ${extra}${toolsBadge}
      </div>
      <button class="b-check ${isDone?"done":""}" data-check="${i}" aria-label="Отметить">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
      </button>
    </div>`;
  });
  html += `</div>`;
  wrap.innerHTML = html;

  // summary
  renderSummary(dk, blocks, day);

  // events
  wrap.querySelectorAll(".block").forEach(el=>{
    el.addEventListener("click", e=>{
      if(e.target.closest("[data-check]")) return;
      openSheet(dk, dayKey, +el.dataset.i);
    });
  });
  wrap.querySelectorAll("[data-check]").forEach(btn=>{
    btn.addEventListener("click", e=>{
      e.stopPropagation();
      const i = +btn.dataset.check;
      const b = blocks[i];
      const on = !doneMap(dk)[blockKey(b)];
      setDone(dk, blockKey(b), on);
      if(on && navigator.vibrate) try{ navigator.vibrate(30); }catch(e2){}
      renderTimeline(false); renderSummary(dk, blocks, day);
    });
  });

  if(scrollToNow && today){
    requestAnimationFrame(()=>{
      const nl = $("#now-line");
      const target = nl ? nl.offsetTop - 140 : 0;
      $("#screen").scrollTop = Math.max(0, target);
    });
  } else if(scrollToNow){
    $("#screen").scrollTop = 0;
  }
  updateTimerStrip();
}
function cap(s){ return s.charAt(0).toUpperCase()+s.slice(1); }
function WD_short(d){ return WD[d.getDay()]; }

function renderSummary(dk, blocks, day){
  const el = $("#day-summary");
  if(!blocks.length){ el.style.display = "none"; return; }
  const done = doneMap(dk);
  const total = blocks.length;
  let dn = 0;
  blocks.forEach(b=>{ if(done[blockKey(b)]) dn++; });
  const pct = Math.round(dn/total*100);
  const C = 2*Math.PI*20;
  el.style.display = "flex";
  el.innerHTML = `
    <div class="ds-ring">
      <svg width="46" height="46"><circle cx="23" cy="23" r="20" fill="none" stroke="var(--border)" stroke-width="4"/>
      <circle cx="23" cy="23" r="20" fill="none" stroke="var(--accent)" stroke-width="4" stroke-linecap="round"
        stroke-dasharray="${C}" stroke-dashoffset="${C*(1-pct/100)}"/></svg>
      <div class="ds-val num">${pct}%</div>
    </div>
    <div class="ds-text"><b>${dn} из ${total} блоков выполнено</b>${day && day.accent ? esc(day.accent) : ""}</div>`;
}

function renderShiftPanel(today, dk){
  const el = $("#shift-panel");
  if(!el) return;
  if(!today){ el.innerHTML = ""; return; }
  const recs = shiftsFor(dk);
  const total = recs.reduce((s,r)=>s+r.offset,0);
  el.innerHTML = `<span class="sp-q">День сдвинулся? Передвинь остаток сетки:</span>
    <button class="sp-btn" data-shift="30">+30 мин</button>
    <button class="sp-btn" data-shift="60">+60 мин</button>
    ${recs.length ? `<button class="sp-btn reset" data-shift="reset">сброс (сейчас +${total}′)</button>` : ""}`;
  el.querySelectorAll("[data-shift]").forEach(b=> b.addEventListener("click", ()=>{
    const v = b.dataset.shift;
    if(v === "reset") resetShift(); else applyShift(+v);
  }));
}

function renderPlanB(dk, dayKey, blocks, day){
  const wrap = $("#timeline-wrap");
  const H = DATA.habits_24_7 || {};
  const anchors = planBAnchors(blocks);
  const done = doneMap(dk);
  let html = `<div class="pb-head"><b>🅱️ План Б — сжатый день</b>
    <p>День развалился? Держи базу: чек-минимум + ${anchors.length} опорных блока. Остальное сегодня не важно.</p></div>
  <div class="section" style="padding-top:0"><div class="card">
    <div class="check-progress" id="pb-progress"></div>
    <div id="pb-checks">${checkListHTML(H.check_min)}</div>
  </div></div>
  <div class="sec-title" style="margin:6px 18px 8px">Опорные блоки дня</div>`;
  anchors.forEach(i=>{
    const b = blocks[i];
    const st = blockStatus(dk, b);
    const isDone = !!done[blockKey(b)];
    const tag = TAGS[b.tag] || TAGS.routine;
    html += `<div class="pb-card block ${st} ${st==="past" ? (isDone?"done-b":"miss-b") : ""}" style="--tagc:${tag.c}" data-i="${i}">
      <div class="b-bar"></div>
      <div class="b-time num">${esc(b.start)}–${esc(b.end)}</div>
      <div class="b-body"><div class="b-title">${esc(b.title)}</div><span class="b-tag">${tag.ru}</span></div>
      <button class="b-check ${isDone?"done":""}" data-check="${i}" aria-label="Отметить">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
      </button>
    </div>`;
  });
  html += `<div class="nb-hint" style="margin:12px 14px">Выключи План Б кнопкой наверху, когда день вернётся в колею.</div>`;
  wrap.innerHTML = html;
  const upd = ()=>{
    const cc = S_get(K.CHECK, {})[dk] || {};
    const n = Object.keys(cc).length, tot = (H.check_min||[]).length;
    const p = $("#pb-progress");
    if(p) p.innerHTML = `Закрыто: <b>${n} / ${tot}</b>${n===tot?" — день спасён 🏆":""}`;
  };
  bindCheckList(dk, H.check_min, $("#pb-checks"), upd); upd();
  wrap.querySelectorAll(".pb-card").forEach(el=>{
    el.addEventListener("click", e=>{
      if(e.target.closest("[data-check]")) return;
      openSheet(dk, dayKey, +el.dataset.i);
    });
  });
  wrap.querySelectorAll("[data-check]").forEach(btn=>{
    btn.addEventListener("click", e=>{
      e.stopPropagation();
      const b = blocks[+btn.dataset.check];
      const on = !doneMap(dk)[blockKey(b)];
      setDone(dk, blockKey(b), on);
      if(on && navigator.vibrate) try{ navigator.vibrate(30); }catch(e2){}
      renderTimeline(false);
    });
  });
  renderSummary(dk, blocks, day);
  updateTimerStrip();
}

$("#prev-day").addEventListener("click", ()=>{ viewDate = addDays(viewDate,-1); renderTimeline(true); });
$("#next-day").addEventListener("click", ()=>{ viewDate = addDays(viewDate,1); renderTimeline(true); });
$("#today-pill").addEventListener("click", ()=>{ viewDate = midnight(new Date()); renderTimeline(true); toast("Вернулись к сегодняшнему дню"); });

/* ---------- Timer strip (global) ---------- */
function updateTimerStrip(){
  const strip = $("#timer-strip");
  if(!strip) return;
  const p = timers.pomo, c = timers.carb;
  const now = Date.now();
  let parts = [];
  if(p && (p.running || p.remain>0)){
    const ms = p.running ? p.endsAt - now : p.remain;
    parts.push(`🍅 Помодоро ${p.mode==="work"?"работа":"перерыв"}: ${fmtRemain(ms)}`);
  }
  if(c && !c.alarmed){
    parts.push(`🍚 Углеводы через ${fmtRemain(c.endsAt - now)}`);
  } else if(c && c.alarmed){
    parts.push(`🍚 Окно углеводов ОТКРЫТО`);
  }
  if(parts.length){
    strip.classList.add("show");
    strip.querySelector(".ts-text").textContent = parts.join("  ·  ");
  } else strip.classList.remove("show");
}

/* ---------- Bottom sheet ---------- */
function openSheet(dk, dayKey, index){
  const day = DATA.week[dayKey];
  const b = day.schedule[index];
  if(!b) return;
  sheetCtx = { dk, dayKey, index, bk: blockKey(b) };
  $("#sheet").classList.add("open");
  $("#sheet-backdrop").classList.add("open");
  document.body.style.overflow = "hidden";
  renderSheet();
}
function closeSheet(force){
  const p = timers.pomo;
  const needConfirm = !force && p && p.running && sheetCtx && sheetCtx.bk === p.bk && sheetCtx.dk === p.dk;
  if(needConfirm){
    askConfirm("Помодоро-таймер работает. Закрыть шторку? Таймер продолжит идти и подаст сигнал.", ()=> closeSheet(true), "Закрыть");
    return;
  }
  $("#sheet").classList.remove("open");
  $("#sheet-backdrop").classList.remove("open");
  document.body.style.overflow = "";
  sheetCtx = null;
  setTimeout(()=>{ if(!$("#sheet").classList.contains("open")) $("#sheet-body").innerHTML=""; }, 350);
  renderTimeline(false);
}
$("#sheet-backdrop").addEventListener("click", ()=> closeSheet(false));

// swipe down to close
(function(){
  const sheet = $("#sheet"), handle = $("#sheet-handle-zone");
  let startY = null, dy = 0, dragging = false;
  handle.addEventListener("touchstart", e=>{ startY = e.touches[0].clientY; dragging = true; sheet.classList.add("dragging"); }, {passive:true});
  handle.addEventListener("touchmove", e=>{
    if(!dragging) return;
    dy = Math.max(0, e.touches[0].clientY - startY);
    if(dy > 0){
      const wide = window.innerWidth >= 560;
      sheet.style.transform = wide ? `translate(-50%,${dy}px)` : `translateY(${dy}px)`;
    }
  }, {passive:true});
  handle.addEventListener("touchend", ()=>{
    dragging = false; sheet.classList.remove("dragging"); sheet.style.transform = "";
    if(dy > 90) closeSheet(false);
    dy = 0;
  });
})();

function renderSheet(){
  if(!sheetCtx) return;
  const { dk, dayKey, index } = sheetCtx;
  const blocks = effSchedule(dayKey, dk);
  const b = blocks[index];
  if(!b){ closeSheet(true); return; }
  const tag = TAGS[b.tag] || TAGS.routine;
  const done = !!doneMap(dk)[blockKey(b)];
  const st = blockStatus(dk, b);
  const statusChip = st === "current"
    ? `<span class="chip-status chip-wait">▶ идёт сейчас</span>`
    : st === "past"
      ? (done ? `<span class="chip-status chip-done">✓ выполнено</span>` : `<span class="chip-status chip-miss">○ пропущено</span>`)
      : `<span class="chip-status chip-wait">ожидает</span>`;

  const d = new Date(dk + "T00:00:00");
  const dateLine = `${d.getDate()} ${MONTHS[d.getMonth()]}, ${DAY_RU[dayKey]}`;

  let html = `
    <div class="sheet-head">
      <div>
        <div class="sh-time num">${esc(b.start)}–${esc(b.end)} · <span style="color:var(--muted);font-weight:600">${dateLine}</span></div>
        <div class="sh-title">${esc(b.title)}</div>
        <div class="sh-tags">
          <span class="chip" style="color:${tag.c};background:color-mix(in srgb,${tag.c} 14%,transparent)">${tag.ru}</span>
          ${statusChip}
        </div>
      </div>
      <button class="sh-close" id="sheet-close" aria-label="Закрыть">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>`;

  if(b.callout){
    const danger = b.callout.includes("⛔");
    html += `<div class="callout ${danger?"danger":""}">${esc(b.callout)}</div>`;
  }

  // tools
  const tools = (b.tools||[]).filter(t=>t && t!=="none");
  if(tools.includes("pomodoro")) html += renderPomoBox(b);
  if(tools.includes("carb_timer")) html += renderCarbBox(b);
  if(tools.includes("breath")) html += renderBreathBox(b);

  if(b.details){
    html += `<div class="sh-details">${renderDetails(b.details)}</div>`;
  }

  $("#sheet-body").innerHTML = html;
  $("#sheet-close").addEventListener("click", ()=> closeSheet(false));

  // foot
  const foot = $("#sheet-foot");
  foot.innerHTML = done
    ? `<button class="done-btn undo" id="done-toggle">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M3 12a9 9 0 1 0 3-6.7"/><polyline points="3 4 3 9 8 9"/></svg>
        Снять отметку</button>`
    : `<button class="done-btn" id="done-toggle">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        Отметить выполненным</button>`;
  $("#done-toggle").addEventListener("click", ()=>{
    const nowDone = !doneMap(dk)[blockKey(b)];
    setDone(dk, blockKey(b), nowDone);
    if(nowDone && navigator.vibrate) try{ navigator.vibrate(40); }catch(e){}
    toast(nowDone ? "✓ Выполнено" : "Отметка снята", nowDone ? "ok" : "");
    renderSheet(); renderTimeline(false);
  });

  bindTimerButtons(b);
  updateSheetTimers();
}

function renderDetails(text){
  return text.split("\n").map(line=>{
    const t = line.trim();
    if(!t) return `<div class="d-line empty"></div>`;
    if(t.startsWith("•") || t.startsWith("-")) return `<div class="d-line bullet">${esc(t.replace(/^[•\-]\s*/,""))}</div>`;
    if(t.includes("⛔")) return `<div class="d-line ban">${esc(t.replace(/^•\s*/,""))}</div>`;
    if(/^\d+\./.test(t)) return `<div class="d-line sub">${esc(t)}</div>`;
    if(/^[A-ZА-ЯЁ\u{1F300}-\u{1FAFF}]/u.test(t) && (t.endsWith(":") || t.length < 34)) return `<div class="d-line head">${esc(t)}</div>`;
    return `<div class="d-line">${esc(t)}</div>`;
  }).join("");
}

/* ----- pomodoro box ----- */
function renderPomoBox(b){
  const p = timers.pomo;
  const mine = p && p.bk === blockKey(b) && sheetCtx && p.dk === sheetCtx.dk;
  const R = 62, C = 2*Math.PI*R;
  return `
  <div class="timer-box" id="pomo-box">
    <div class="t-lab">🍅 Помодоро · 25 / 5</div>
    <div class="pomo-ring ${mine && p.mode==="break" ? "break":""}" id="pomo-ring">
      <svg width="150" height="150">
        <circle class="ring-bg" cx="75" cy="75" r="${R}" fill="none" stroke-width="7"/>
        <circle class="ring-fg" id="pomo-arc" cx="75" cy="75" r="${R}" fill="none" stroke-width="7" stroke-linecap="round"
          stroke-dasharray="${C}" stroke-dashoffset="${C}"/>
      </svg>
      <div class="pomo-center">
        <div class="pomo-time num" id="pomo-time">25:00</div>
        <div class="pomo-phase" id="pomo-phase">${mine ? (p.mode==="work"?"работа":"перерыв") : "фокус"}</div>
        ${mine ? `<div class="pomo-cycles num" id="pomo-cycles">циклов: ${p.cycles||0}</div>` : ""}
      </div>
    </div>
    <div class="timer-btns" id="pomo-btns">
      ${!mine || !p
        ? `<button class="t-btn" id="pomo-start">▶ Старт 25 мин</button>`
        : p.running
          ? `<button class="t-btn ghost" id="pomo-pause">⏸ Пауза</button><button class="t-btn ghost" id="pomo-reset">⟲ Сброс</button>`
          : `<button class="t-btn" id="pomo-resume">▶ Продолжить</button><button class="t-btn ghost" id="pomo-reset">⟲ Сброс</button>`}
    </div>
    <div class="timer-global-note">Сигнал прозвучит даже если закрыть приложение. Случайное закрытие шторки заблокировано во время работы.</div>
  </div>`;
}
function renderCarbBox(b){
  const c = timers.carb;
  const mine = c && sheetCtx && c.bk === blockKey(b) && c.dk === sheetCtx.dk;
  let inner;
  if(!mine || !c){
    inner = `<div class="carb-sub" style="margin-top:8px">После финиша спринта: 30–40 мин без углеводов.</div>
      <div class="timer-btns"><button class="t-btn" id="carb-start" style="background:var(--warn);color:#241503">⏱ Запустить таймер углеводов (35 мин)</button></div>`;
  } else if(!c.alarmed){
    inner = `<div class="carb-time num" id="carb-time">${fmtRemain(c.endsAt - Date.now())}</div>
      <div class="carb-sub">до открытия углеводного окна</div>
      <div class="timer-btns"><button class="t-btn ghost" id="carb-stop">Отменить</button></div>`;
  } else {
    inner = `<div class="carb-done-msg">🍚 ОКНО ОТКРЫТО: можно углеводы</div>
      <div class="carb-sub">Белок + овощи + углеводы — восстанавливаем гликоген.</div>
      <div class="timer-btns"><button class="t-btn ghost" id="carb-stop">Скрыть</button></div>`;
  }
  return `<div class="timer-box" id="carb-box"><div class="t-lab">🍚 Таймер углеводного окна</div>${inner}</div>`;
}
function renderBreathBox(b){
  const t = timers.breath;
  const mine = t && sheetCtx && t.bk === blockKey(b) && t.dk === sheetCtx.dk;
  let inner;
  if(!mine || !t){
    inner = `<div class="carb-sub" style="margin-top:8px">15 циклов «вдох 6 сек — выдох 12 сек» (~4.5 мин). Парасимпатика, откат кортизола перед сном.</div>
      <div class="timer-btns"><button class="t-btn" id="breath-start" style="background:var(--blue);color:#04101f">🫁 Начать дыхание 6/12</button></div>`;
  } else if(!t.ended){
    inner = `<div class="breath-wrap"><div class="breath-circle" id="breath-circle"></div>
      <div class="breath-cycles num" id="breath-cycles">цикл 1 / ${t.cycles}</div>
      <div class="breath-phase" id="breath-phase">вдох 6</div></div>
      <div class="timer-btns"><button class="t-btn ghost" id="breath-stop">Завершить</button></div>`;
  } else {
    inner = `<div class="carb-done-msg">🫁 Сессия завершена: ${t.doneCycles||t.cycles} циклов</div>
      <div class="carb-sub">Пульс ниже, голова тише. Дальше — сон-стек.</div>
      <div class="timer-btns"><button class="t-btn ghost" id="breath-stop">Скрыть</button></div>`;
  }
  return `<div class="timer-box" id="breath-box"><div class="t-lab">🫁 Дыхание 6/12 (вдох 6 — выдох 12)</div>${inner}</div>`;
}
function bindTimerButtons(b){
  const bk = blockKey(b), dk = sheetCtx ? sheetCtx.dk : null;
  const $id = id => document.getElementById(id);
  if($id("pomo-start")) $id("pomo-start").onclick = ()=>{ pomoStart(bk, dk); renderSheet(); };
  if($id("pomo-pause")) $id("pomo-pause").onclick = ()=>{ pomoPause(); renderSheet(); };
  if($id("pomo-resume")) $id("pomo-resume").onclick = ()=>{ pomoResume(); renderSheet(); };
  if($id("pomo-reset")) $id("pomo-reset").onclick = ()=>{ askConfirm("Сбросить помодоро-таймер?", ()=>{ pomoReset(); renderSheet(); }, "Сбросить"); };
  if($id("carb-start")) $id("carb-start").onclick = ()=>{ carbStart(bk, dk); renderSheet(); };
  if($id("carb-stop")) $id("carb-stop").onclick = ()=>{ carbStop(); renderSheet(); };
  if($id("breath-start")) $id("breath-start").onclick = ()=>{
    timers.breath = { startAt: Date.now(), cycles: 15, bk, dk, ended: false, doneCycles: 0, lastPhase: "" };
    saveTimers(); renderSheet();
    toast("Дыхание 6/12: вдох носом 6 сек — выдох 12 сек 🫁","ok");
  };
  if($id("breath-stop")) $id("breath-stop").onclick = ()=>{ timers.breath = null; saveTimers(); renderSheet(); };
}
function updateSheetTimers(){
  if(!sheetCtx) return;
  const p = timers.pomo;
  const arc = document.getElementById("pomo-arc"), tEl = document.getElementById("pomo-time");
  if(arc && tEl && p){
    const total = p.mode === "work" ? POMO_WORK : POMO_BREAK;
    const ms = p.running ? Math.max(0, p.endsAt - Date.now()) : p.remain;
    const C = 2*Math.PI*62;
    arc.style.strokeDashoffset = String(C * (1 - ms/total));
    tEl.textContent = fmtRemain(ms);
    const ring = document.getElementById("pomo-ring");
    if(ring) ring.classList.toggle("break", p.mode === "break");
    const ph = document.getElementById("pomo-phase");
    if(ph) ph.textContent = p.running ? (p.mode==="work" ? "работа — фокус" : "перерыв") : "пауза";
    const cyc = document.getElementById("pomo-cycles");
    if(cyc) cyc.textContent = `циклов: ${p.cycles||0}`;
  }
  const c = timers.carb, ct = document.getElementById("carb-time");
  if(ct && c && !c.alarmed) ct.textContent = fmtRemain(c.endsAt - Date.now());
  // breathing 6/12
  const bt = timers.breath;
  const circle = document.getElementById("breath-circle");
  if(circle && bt && !bt.ended){
    const el = (Date.now() - bt.startAt) / 1000;
    const cyc = Math.floor(el / 18);
    if(cyc >= bt.cycles){
      bt.ended = true; bt.doneCycles = bt.cycles; saveTimers();
      notify("🫁 Дыхание завершено", "15 циклов 6/12 сделано. Отбой-ритуал близко.");
      if(!document.hidden) beep(2);
      renderSheet();
      return;
    }
    const pos = el % 18;
    const inhale = pos < 6;
    const ph = document.getElementById("breath-phase");
    const cy = document.getElementById("breath-cycles");
    if(ph){
      ph.textContent = inhale ? `вдох 6 · ${6 - Math.floor(pos)}` : `выдох 12 · ${12 - Math.floor(pos - 6)}`;
      ph.style.color = inhale ? "var(--blue)" : "var(--muted)";
    }
    if(cy) cy.textContent = `цикл ${cyc + 1} / ${bt.cycles}`;
    circle.style.transition = `transform ${inhale ? 6 : 12}s cubic-bezier(.45,0,.55,1)`;
    const target = inhale ? 1.45 : 0.78;
    if(bt.lastPhase !== (inhale ? "in" : "out")){
      bt.lastPhase = inhale ? "in" : "out";
      circle.style.transform = `scale(${target})`;
    }
  }
}
function renderTimersEverywhere(){
  updateSheetTimers();
  updateTimerStrip();
}

/* ---------- Habits tab ---------- */
function renderHabits(){
  const dk = dateKey(viewDateForHabits());
  const H = DATA.habits_24_7 || {};
  const hyd = H.hydration || { goal_ml:3000, step_ml:250 };
  const waters = S_get(K.WATER, {});
  const ml = waters[dk] || 0;
  const pct = Math.min(100, Math.round(ml / hyd.goal_ml * 100));

  let html = `
  <div class="hdr" style="position:static">
    <div class="hdr-title">Фокус 24/7</div>
    <div class="hdr-sub">Фоновые правила, вода и чек-минимум · ${cap(WD_short(new Date()))}, ${new Date().getDate()} ${MONTHS[new Date().getMonth()]}</div>
  </div>
  <div class="section" style="padding:0 16px 2px">
    <div class="switch-row">
      <div class="switch ${S_get(K.REMINDON,1)?"on":""}" id="remind-switch"></div>
      <span>Мягкие напоминания 24/7 (осанка / мьюинг / вода)<br>
      <small style="color:var(--faint)">окна 6:30–7:00 и 15:00–21:00, не чаще раза в 2 ч, без звука</small></span>
    </div>
  </div>
  <div class="section">
    <div class="sec-title">💧 Водный баланс</div>
    <div class="card water-card">
      <div class="water-top">
        <div class="w-lab">Сегодня выпито</div>
        <div class="w-val num">${(ml/1000).toFixed(2)} <small>/ ${(hyd.goal_ml/1000).toFixed(1)} л</small></div>
      </div>
      <div class="water-bar"><div class="water-fill" id="water-fill" style="width:${pct}%"></div></div>
      <div class="water-goal"><span>${pct}% цели</span><span>сброс в полночь</span></div>
      <button class="water-btn" id="water-add">+ ${hyd.step_ml} мл — стакан 💧</button>
      <button class="water-reset" id="water-minus">− отменить ${hyd.step_ml} мл</button>
    </div>
    ${hyd.note ? `<div class="json-hint" style="margin-top:8px">${esc(hyd.note)}</div>` : ""}

    <div class="sec-title">🎯 Постоянный фокус</div>
    <div class="card">
      ${(H.focus||[]).map(f=>`
      <div class="focus-item">
        <div class="focus-ic">${f.icon ? esc(f.icon) : "•"}</div>
        <div><b>${esc(f.title)}</b><p>${esc(f.text||"")}</p></div>
      </div>`).join("")}
    </div>

    <div class="sec-title">✅ Ежедневный чек-минимум — спасение дня</div>
    <div class="card">
      <div class="check-progress" id="check-progress"></div>
      <div id="check-list">${checkListHTML(H.check_min)}</div>
      <div class="json-hint">День пошёл не по плану? Закрой хотя бы эти 10 пунктов — базовая дисциплина сохранена.</div>
    </div>

    <div class="sec-title">📓 Бумажный блокнот (без экранов)</div>
    ${(H.notebook||[]).map(n=>`
    <div class="card nb-card">
      <b>📓 ${esc(n.title)}</b>
      <p>${esc(n.text||"")}</p>
    </div>`).join("")}
    <div class="nb-hint">Полей ввода нет специально: открой бумажный дневник и запиши туда. Экран перед сном — враг.</div>
  </div>`;
  $("#tab-habits").innerHTML = html;

  // states
  function updateCheckProgress(){
    const cc = S_get(K.CHECK, {})[dk] || {};
    const n = Object.keys(cc).length, total = (H.check_min||[]).length;
    $("#check-progress").innerHTML = `Закрыто: <b>${n} / ${total}</b>${n===total?" — день спасён 🏆":""}`;
  }
  bindCheckList(dk, H.check_min, $("#check-list"), updateCheckProgress);
  updateCheckProgress();

  $("#remind-switch").addEventListener("click", ()=>{
    const on = !S_get(K.REMINDON, 1);
    S_set(K.REMINDON, on ? 1 : 0);
    $("#remind-switch").classList.toggle("on", on);
    toast(on ? "Мягкие напоминания включены" : "Мягкие напоминания выключены");
  });

  $("#water-add").addEventListener("click", ()=>{
    const w = S_get(K.WATER, {}); w[dk] = (w[dk]||0) + hyd.step_ml; S_set(K.WATER, w);
    const wts = S_get(K.WTS, {}); wts[dk] = Date.now(); S_set(K.WTS, wts);
    if(navigator.vibrate) try{ navigator.vibrate(20); }catch(e){}
    renderHabits();
  });
  $("#water-minus").addEventListener("click", ()=>{
    const w = S_get(K.WATER, {}); w[dk] = Math.max(0, (w[dk]||0) - hyd.step_ml); S_set(K.WATER, w);
    renderHabits();
  });
}
function viewDateForHabits(){ return new Date(); }

/* ---------- Manage tab ---------- */
function renderManage(){
  let html = `
  <div class="hdr" style="position:static">
    <div class="hdr-title">Управление</div>
    <div class="hdr-sub">Конструктор расписания · JSON для нейросетей</div>
  </div>
  <div class="seg">
    <button data-seg="builder" class="${manageSeg==="builder"?"active":""}">🛠 Конструктор</button>
    <button data-seg="json" class="${manageSeg==="json"?"active":""}">{ } JSON</button>
  </div>
  <div id="manage-body"></div>`;
  $("#tab-manage").innerHTML = html;
  $$("#tab-manage .seg button").forEach(b=> b.addEventListener("click", ()=>{
    manageSeg = b.dataset.seg; S_set(K.SEG, manageSeg); renderManage();
  }));
  if(manageSeg === "builder") renderBuilder(); else renderJsonPanel();
}

/* ----- Builder ----- */
function renderBuilder(){
  const body = $("#manage-body");
  const day = DATA.week[editDay] || { schedule: [] };
  const todayK = dayKeyOf(new Date());
  let html = `<div class="daytabs">${DAYS.map(k=>
    `<button class="daytab ${k===editDay?"active":""} ${k===todayK?"today-mark":""}" data-day="${k}">${DAY_SHORT[k]}</button>`).join("")}</div>`;
  html += `<div style="padding:0 14px 6px;font-size:13px;color:var(--muted)"><b style="color:var(--text)">${esc(day.label||DAY_RU[editDay])}</b>${day.accent?` — <span style="color:var(--accent)">${esc(day.accent)}</span>`:""} · блоков: ${(day.schedule||[]).length}</div>`;
  html += `<div style="padding:6px 14px" id="ed-list">`;
  (day.schedule||[]).forEach((b,i)=>{
    const tag = TAGS[b.tag] || TAGS.routine;
    const tl = (b.tools||[]).filter(t=>t!=="none").map(t=>t==="pomodoro"?"🍅":"🍚").join("");
    html += `
    <div class="ed-item" draggable="true" data-i="${i}">
      <div class="ed-grip"><svg viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg></div>
      <div class="ed-time num">${esc(b.start)}–${esc(b.end)}</div>
      <div class="ed-title" data-edit="${i}">${esc(b.title)}${tl?` <span style="font-size:11px">${tl}</span>`:""}<small style="color:${tag.c}">${tag.ru}</small></div>
      <div class="reorder-col">
        <button data-up="${i}" aria-label="Вверх"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><polyline points="6 14 12 8 18 14"/></svg></button>
        <button data-down="${i}" aria-label="Вниз"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><polyline points="6 10 12 16 18 10"/></svg></button>
      </div>
      <button class="icon-btn danger" data-del="${i}" aria-label="Удалить"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg></button>
    </div>`;
  });
  html += `</div><button class="add-btn" id="add-block">＋ Добавить блок</button>`;
  body.innerHTML = html;

  body.querySelectorAll(".daytab").forEach(t=> t.addEventListener("click", ()=>{ editDay = t.dataset.day; renderBuilder(); }));
  body.querySelectorAll("[data-edit]").forEach(t=> t.addEventListener("click", ()=> openEditor(+t.dataset.edit)));
  $("#add-block").addEventListener("click", ()=> openEditor(-1));
  body.querySelectorAll("[data-del]").forEach(t=> t.addEventListener("click", ()=>{
    const i = +t.dataset.del, b = DATA.week[editDay].schedule[i];
    askConfirm(`Удалить блок «${b.title}» (${b.start}–${b.end})?`, ()=>{
      DATA.week[editDay].schedule.splice(i,1); saveData(); renderBuilder(); toast("Блок удалён");
    }, "Удалить");
  }));
  body.querySelectorAll("[data-up]").forEach(t=> t.addEventListener("click", ()=>{ moveBlock(+t.dataset.up, -1); }));
  body.querySelectorAll("[data-down]").forEach(t=> t.addEventListener("click", ()=>{ moveBlock(+t.dataset.down, 1); }));

  // drag & drop reorder
  body.querySelectorAll(".ed-item").forEach(item=>{
    item.addEventListener("dragstart", e=>{ dragIdx = +item.dataset.i; item.classList.add("dragging"); e.dataTransfer.effectAllowed = "move"; try{e.dataTransfer.setData("text/plain","");}catch(err){} });
    item.addEventListener("dragend", ()=>{ item.classList.remove("dragging"); dragIdx = null; body.querySelectorAll(".ed-item").forEach(x=>x.classList.remove("drag-over")); });
    item.addEventListener("dragover", e=>{ e.preventDefault(); item.classList.add("drag-over"); });
    item.addEventListener("dragleave", ()=> item.classList.remove("drag-over"));
    item.addEventListener("drop", e=>{
      e.preventDefault(); item.classList.remove("drag-over");
      const to = +item.dataset.i;
      if(dragIdx !== null && dragIdx !== to){
        const arr = DATA.week[editDay].schedule;
        const [x] = arr.splice(dragIdx,1);
        arr.splice(to,0,x);
        saveData(); renderBuilder();
      }
    });
  });
}
function moveBlock(i, dir){
  const arr = DATA.week[editDay].schedule;
  const j = i + dir;
  if(j < 0 || j >= arr.length) return;
  [arr[i], arr[j]] = [arr[j], arr[i]];
  saveData(); renderBuilder();
}
function saveData(){
  S_set(K.DATA, DATA);
  if(currentTab === "timeline") renderTimeline(false);
}

/* ----- Editor modal ----- */
function openEditor(i){
  const isNew = i < 0;
  const day = DATA.week[editDay];
  const b = isNew ? { start:"12:00", end:"12:30", title:"", tag:"routine", callout:"", tools:[], details:"" } : clone(day.schedule[i]);
  b.tools = (b.tools||[]).filter(t=>t!=="none");
  const m = $("#editor");
  $("#ed-mode-title").textContent = isNew ? "Новый блок" : "Редактировать блок";
  $("#f-start").value = b.start; $("#f-end").value = b.end;
  $("#f-title").value = b.title || ""; $("#f-callout").value = b.callout || "";
  $("#f-details").value = b.details || "";
  $$("#editor .tag-pick").forEach(t=> t.classList.toggle("active", t.dataset.tag === b.tag));
  $("#tp-pomodoro").classList.toggle("active", b.tools.includes("pomodoro"));
  $("#tp-carb").classList.toggle("active", b.tools.includes("carb_timer"));
  $("#tp-breath").classList.toggle("active", b.tools.includes("breath"));
  m.dataset.index = String(i);
  $("#editor-backdrop").classList.add("open");
  m.classList.add("open");
}
function closeEditor(){ $("#editor").classList.remove("open"); $("#editor-backdrop").classList.remove("open"); }
$$("#editor .tag-pick").forEach(t=> t.addEventListener("click", ()=>{
  $$("#editor .tag-pick").forEach(x=>x.classList.remove("active")); t.classList.add("active");
}));
$("#tp-pomodoro").addEventListener("click", ()=> $("#tp-pomodoro").classList.toggle("active"));
$("#tp-carb").addEventListener("click", ()=> $("#tp-carb").classList.toggle("active"));
$("#tp-breath").addEventListener("click", ()=> $("#tp-breath").classList.toggle("active"));
$("#ed-cancel").addEventListener("click", closeEditor);
$("#ed-cancel2").addEventListener("click", closeEditor);
$("#editor-backdrop").addEventListener("click", closeEditor);
$("#ed-save").addEventListener("click", ()=>{
  const i = +$("#editor").dataset.index;
  const start = $("#f-start").value, end = $("#f-end").value;
  const title = $("#f-title").value.trim();
  if(!/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end)){ toast("Проверь формат времени (ЧЧ:ММ)","err"); return; }
  if(toMin(end) <= toMin(start)){ toast("Время окончания должно быть позже начала","err"); return; }
  if(!title){ toast("Введи название блока","err"); return; }
  const tag = ($("#editor .tag-pick.active") || {}).dataset?.tag || "routine";
  const tools = [];
  if($("#tp-pomodoro").classList.contains("active")) tools.push("pomodoro");
  if($("#tp-carb").classList.contains("active")) tools.push("carb_timer");
  if($("#tp-breath").classList.contains("active")) tools.push("breath");
  const block = { start, end, title, tag, callout: $("#f-callout").value.trim() || null, tools, details: $("#f-details").value };
  const arr = DATA.week[editDay].schedule = DATA.week[editDay].schedule || [];
  if(i < 0) arr.push(block); else arr[i] = block;
  arr.sort((a,b2)=> toMin(a.start) - toMin(b2.start) || toMin(a.end) - toMin(b2.end));
  saveData(); closeEditor(); renderBuilder();
  toast(i < 0 ? "Блок добавлен ✓" : "Изменения сохранены ✓", "ok");
});

/* ----- JSON panel ----- */
function renderJsonPanel(){
  const body = $("#manage-body");
  body.innerHTML = `
  <div class="section" style="padding-top:0">
    <div class="card json-card">
      <div class="sec-title" style="margin-top:0">Экспорт — скормить нейросети</div>
      <div class="btn-row" style="margin-top:0">
        <button class="btn btn-ghost" id="j-copy">📋 Скопировать JSON</button>
        <button class="btn btn-ghost" id="j-download" style="flex:none;width:52px;padding:14px 0">⬇</button>
      </div>
      <div class="ai-prompt"><b>Пример запроса ИИ:</b> «Вот мой текущий план в JSON. Перенеси спринты со среды на четверг и добавь больше времени на домашку во вторник. Верни ТОЛЬКО валидный JSON в той же схеме, без пояснений.»</div>
      <button class="btn btn-accent" id="j-prompt" style="margin-top:10px">🧠 Собрать запрос для ИИ (JSON + факты недели)</button>
    </div>

    <div class="card json-card" style="margin-top:12px">
      <div class="sec-title" style="margin-top:0">Импорт — вставить новый JSON</div>
      <textarea id="j-input" spellcheck="false" placeholder='Вставь сюда JSON от нейросети…\nНапример: {"week": {"monday": {"schedule": [...]}}}'></textarea>
      <div class="val-report" id="j-report"></div>
      <div class="btn-row">
        <button class="btn btn-accent" id="j-apply">✓ Применить изменения</button>
      </div>
      <div class="json-hint">Защита от ошибок: если синтаксис или схема нарушены — текущий план <b style="color:var(--text)">не изменяется</b>, а ты получишь понятный список ошибок. Можно вставлять как всю неделю, так и отдельные дни — остальные не пострадают.</div>
    </div>

    <div class="card json-card" style="margin-top:12px">
      <div class="sec-title" style="margin-top:0">Опасная зона</div>
      <button class="btn btn-danger-ghost" id="j-reset">⟲ Сбросить к заводскому плану (Мега-гайд v2.6)</button>
    </div>

    <div class="modal-backdrop" id="pm-backdrop"></div>
    <div class="modal" id="pm-modal">
      <div class="modal-head"><h3>🧠 Запрос для ИИ</h3>
        <button class="sh-close" id="pm-close"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
      </div>
      <div class="modal-scroll">
        <div class="field"><label>Цель правки</label>
          <div class="tag-picks" id="pm-goals">
            <button class="tag-pick active" data-g="Адаптируй план на следующую неделю с учётом фактов">Адаптация недели</button>
            <button class="tag-pick" data-g="Перенеси спринты на другой день, сохранив 72 ч до следующего и 48 ч после тяжёлых ног">Перенос спринтов</button>
            <button class="tag-pick" data-g="Добавь больше времени на домашку, не трогая тренировки и сон">Больше домашки</button>
            <button class="tag-pick" data-g="Снизь нагрузку: замени один спринт на Zone 2 и облегчи воскресную качалку">Снизить нагрузку</button>
          </div>
        </div>
        <div class="field"><label>Твой комментарий (необязательно)</label><input type="text" id="pm-note" placeholder="Напр.: в пятницу тренировка заканчивается в 18:00" autocomplete="off"></div>
        <div class="field"><label>Факты недели (автоподставлено)</label><div class="ai-prompt" id="pm-facts"></div></div>
        <div class="field"><label>Готовый промпт — скопируй и вставь в ChatGPT/Claude</label><textarea id="pm-out" spellcheck="false" style="min-height:170px"></textarea></div>
      </div>
      <div class="modal-foot">
        <button class="btn btn-ghost" id="pm-regen" style="flex:none;width:140px">↻ Обновить</button>
        <button class="btn btn-accent" id="pm-copy">📋 Скопировать промпт</button>
      </div>
    </div>
  </div>`;

  const getJson = ()=> JSON.stringify(DATA, null, 2);
  $("#j-copy").addEventListener("click", async ()=>{
    const txt = getJson();
    try{
      await navigator.clipboard.writeText(txt);
      toast("JSON скопирован в буфер ✓","ok");
    }catch(e){
      const ta = $("#j-input"); ta.value = txt; ta.focus(); ta.select();
      try{ document.execCommand("copy"); toast("JSON скопирован ✓","ok"); }
      catch(e2){ toast("Не удалось скопировать — JSON вставлен в поле ниже, выдели и скопируй вручную","err"); }
    }
  });
  $("#j-download").addEventListener("click", ()=>{
    const blob = new Blob([getJson()], {type:"application/json"});
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `protocol-os-plan-${dateKey(new Date())}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    toast("Файл скачан ✓","ok");
  });
  $("#j-apply").addEventListener("click", ()=> applyJson($("#j-input").value));
  $("#j-prompt").addEventListener("click", openPromptModal);
  $("#j-reset").addEventListener("click", ()=>{
    askConfirm("Сбросить все изменения расписания к заводскому плану из Мега-гайда v2.6? Отметки выполнения и вода сохранятся.", ()=>{
      DATA = clone(DEFAULT_DATA); saveData(); renderManage(); toast("Заводской план восстановлен","ok");
    }, "Сбросить");
  });
}

/* ----- Week facts & AI prompt builder ----- */
function weekFacts(){
  const missed = {};
  let doneAll = 0, totAll = 0, waterSum = 0, waterDays = 0, cmSum = 0, cmDays = 0;
  for(let i = 6; i >= 0; i--){
    const d = addDays(today0(), -i);
    const dk = dateKey(d), dayKey = dayKeyOf(d);
    const blocks = effSchedule(dayKey, dk);
    const done = doneMap(dk);
    blocks.forEach(b=>{
      totAll++;
      if(done[blockKey(b)]) doneAll++;
      else if(blockStatus(dk, b) === "past") missed[b.title] = (missed[b.title]||0) + 1;
    });
    const w = (S_get(K.WATER, {})[dk]) || 0;
    if(w > 0){ waterSum += w; waterDays++; }
    const cc = S_get(K.CHECK, {})[dk];
    if(cc && Object.keys(cc).length){ cmSum += Object.keys(cc).length; cmDays++; }
  }
  const pct = totAll ? Math.round(doneAll/totAll*100) : 0;
  const topMissed = Object.entries(missed).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([t,n])=>`«${t}» — ${n} из 7`);
  return {
    pct,
    topMissed,
    waterAvg: waterDays ? (waterSum/waterDays/1000).toFixed(1) + " л" : "нет данных",
    cmAvg: cmDays ? (cmSum/cmDays).toFixed(1) + "/10" : "нет данных"
  };
}
function buildPrompt(goal, note){
  const f = weekFacts();
  return `Ты — мой личный планировщик дисциплины. Не давай советов и пояснений — верни ТОЛЬКО валидный JSON плана.
Схема JSON: {"week": {"monday"…"sunday": {"label","accent","schedule":[{"start","end","title","tag","callout"|null,"tools":[],"details"}]}}}; tag: routine|sport|study|food|care|sleep; tools: pomodoro|carb_timer|breath; время строго "06:00"; end > start; блоки дня не пересекаются.

ФАКТЫ МОЕЙ НЕДЕЛИ (последние 7 дней): выполнение блоков ${f.pct}%; чаще всего провалены: ${f.topMissed.join(", ") || "—"}; вода в среднем: ${f.waterAvg}; чек-минимум в среднем: ${f.cmAvg}.

ЗАДАЧА: ${goal}.${note ? " Уточнение от меня: " + note + "." : ""}
Сохрани философию плана: подъём 6:00 (±30 мин в выходные), отбой 21:30 край; спринты Ср и Сб (72 ч между); тяжёлые ноги только Пн (48 ч до спринтов); Вс — лёгкая качалка; в спринт-дни еда за 3 ч до и углеводы через 30–40 мин после; помодоро в домашке; сон и SPF неприкосновенны.

Верни ТОЛЬКО валидный JSON (всю неделю или только изменённые дни в той же схеме), без текста вокруг.

МОЙ ТЕКУЩИЙ JSON:
${JSON.stringify(DATA, null, 2)}`;
}
function openPromptModal(){
  const f = weekFacts();
  $("#pm-facts").innerHTML = `Выполнение: <b style="color:var(--accent)">${f.pct}%</b> · провалены: ${f.topMissed.length ? esc(f.topMissed.join(", ")) : "—"} · вода: ${esc(f.waterAvg)} · чек-мин: ${esc(f.cmAvg)}`;
  const rebuild = ()=>{
    const goal = ($("#pm-goals .tag-pick.active") || {dataset:{g:"Адаптируй план"}}).dataset.g;
    $("#pm-out").value = buildPrompt(goal, $("#pm-note").value.trim());
  };
  $$("#pm-goals .tag-pick").forEach(t=> t.onclick = ()=>{
    $$("#pm-goals .tag-pick").forEach(x=>x.classList.remove("active"));
    t.classList.add("active"); rebuild();
  });
  $("#pm-note").oninput = rebuild;
  $("#pm-regen").onclick = rebuild;
  $("#pm-copy").onclick = async ()=>{
    const txt = $("#pm-out").value;
    try{ await navigator.clipboard.writeText(txt); toast("Промпт скопирован — вставь в ChatGPT/Claude ✓","ok"); }
    catch(e){ $("#pm-out").focus(); $("#pm-out").select(); try{ document.execCommand("copy"); toast("Промпт скопирован ✓","ok"); }catch(e2){ toast("Скопируй текст вручную из поля","err"); } }
  };
  $("#pm-close").onclick = closePromptModal;
  $("#pm-backdrop").onclick = closePromptModal;
  rebuild();
  $("#pm-modal").classList.add("open");
  $("#pm-backdrop").classList.add("open");
}
function closePromptModal(){
  $("#pm-modal").classList.remove("open");
  $("#pm-backdrop").classList.remove("open");
}

/* ----- Validator ----- */
const VALID_TAGS = ["routine","sport","study","food","care","sleep"];
const VALID_TOOLS = ["none","pomodoro","carb_timer","breath"];

function lineOf(text, pos){
  const before = text.slice(0, pos);
  const line = before.split("\n").length;
  const col = pos - before.lastIndexOf("\n");
  return { line, col };
}
function validateImport(text){
  const errors = [], warnings = [];
  if(!text || !text.trim()){ errors.push("Поле пустое — вставь JSON от нейросети."); return { ok:false, errors, warnings, data:null }; }
  let obj;
  try{
    obj = JSON.parse(text);
  }catch(e){
    let loc = "";
    const mPos = e.message.match(/position\s+(\d+)/i);
    const mLine = e.message.match(/line\s+(\d+)\s+column\s+(\d+)/i);
    if(mLine) loc = ` — строка ${mLine[1]}, колонка ${mLine[2]}`;
    else if(mPos){ const {line,col} = lineOf(text, +mPos[1]); loc = ` — строка ${line}, колонка ${col}`; }
    let msg = e.message;
    if(/unexpected end/i.test(msg)) msg = "JSON обрывается — не хватает закрывающей скобки или кавычки";
    else if(/unexpected token/i.test(msg)) msg = "Лишний или неверный символ (проверь запятые и кавычки — JSON требует двойные кавычки \")";
    else if(/expected/i.test(msg)) msg = "Синтаксическая ошибка JSON";
    errors.push(`Нарушен синтаксис JSON${loc}: ${msg}.`);
    return { ok:false, errors, warnings, data:null };
  }
  if(typeof obj !== "object" || obj === null || Array.isArray(obj)){
    errors.push("Ожидался JSON-объект {…}, а получен " + (Array.isArray(obj) ? "массив […]" : typeof obj) + ".");
    return { ok:false, errors, warnings, data:null };
  }

  // accept: full structure {week:{...}} | bare {monday:...} | {schedule-days...}
  let week = null;
  if(obj.week && typeof obj.week === "object") week = obj.week;
  else if(DAYS.some(k => obj[k] && typeof obj[k] === "object")) week = obj;
  if(!week){
    errors.push("Не найден раздел \"week\" (или дни monday…sunday в корне). Проверь, что нейросеть вернула план, а не пояснения.");
    return { ok:false, errors, warnings, data:null };
  }

  const newDays = {};
  let daysFound = 0;
  DAYS.forEach(k=>{
    if(!(k in week)) return;
    const d = week[k];
    if(d === null){ newDays[k] = null; daysFound++; return; } // explicit clear
    if(typeof d !== "object" || Array.isArray(d)){ errors.push(`День «${DAY_RU[k]}»: ожидался объект с полем "schedule".`); return; }
    daysFound++;
    const label = typeof d.label === "string" ? d.label : DAY_RU[k];
    const accent = typeof d.accent === "string" ? d.accent : (DATA.week[k] && DATA.week[k].accent) || "";
    const sched = d.schedule;
    if(!Array.isArray(sched)){ errors.push(`День «${label}»: отсутствует массив "schedule" (или это не массив).`); return; }
    const blocks = [];
    sched.forEach((b, bi)=>{
      const name = `«${DAY_RU[k]}», блок ${bi+1}${b && b.title ? ` „${b.title}"` : ""}`;
      if(typeof b !== "object" || b === null || Array.isArray(b)){ errors.push(`${name}: блок должен быть объектом {start,end,title,…}.`); return; }
      if(typeof b.start !== "string" || !/^([01]?\d|2[0-3]):[0-5]\d$/.test(b.start.trim())){ errors.push(`${name}: не указано или неверно время начала "start" (нужен формат "06:00").`); return; }
      if(typeof b.end !== "string" || !/^([01]?\d|2[0-3]):[0-5]\d$/.test(b.end.trim())){ errors.push(`${name}: не указано или неверно время окончания "end" (нужен формат "07:30").`); return; }
      const st = b.start.trim(), en = b.end.trim();
      if(toMin(en) <= toMin(st)){ errors.push(`${name}: время окончания (${en}) должно быть позже начала (${st}).`); return; }
      if(typeof b.title !== "string" || !b.title.trim()){ errors.push(`${name}: пустое или отсутствующее название "title".`); return; }
      let tag = typeof b.tag === "string" ? b.tag.trim().toLowerCase() : "";
      if(!VALID_TAGS.includes(tag)){
        if(tag) warnings.push(`${name}: неизвестный тег "${b.tag}" → заменён на "routine". Допустимые: ${VALID_TAGS.join(", ")}.`);
        tag = "routine";
      }
      let tools = [];
      if(b.tools !== undefined && b.tools !== null){
        if(!Array.isArray(b.tools)) errors.push(`${name}: "tools" должен быть массивом, например ["pomodoro"].`);
        else {
          b.tools.forEach(t=>{
            if(!VALID_TOOLS.includes(t)) warnings.push(`${name}: неизвестная утилита "${t}" — пропущена. Допустимые: ${VALID_TOOLS.join(", ")}.`);
            else if(t !== "none" && !tools.includes(t)) tools.push(t);
          });
        }
      }
      let callout = null;
      if(b.callout !== undefined && b.callout !== null){
        if(typeof b.callout !== "string") warnings.push(`${name}: "callout" должен быть строкой или null — пропущен.`);
        else callout = b.callout;
      }
      let details = "";
      if(b.details !== undefined && b.details !== null){
        if(typeof b.details !== "string") details = String(b.details);
        else details = b.details;
      }
      blocks.push({ start:st, end:en, title:b.title.trim(), tag, callout, tools, details });
    });
    if(errors.length) return;
    // overlaps — warning only
    const sorted = blocks.slice().sort((a,b2)=> toMin(a.start)-toMin(b2.start));
    for(let j=1;j<sorted.length;j++){
      if(toMin(sorted[j].start) < toMin(sorted[j-1].end)){
        warnings.push(`«${DAY_RU[k]}»: блоки „${sorted[j-1].title}" (${sorted[j-1].start}–${sorted[j-1].end}) и „${sorted[j].title}" (${sorted[j].start}–${sorted[j].end}) пересекаются.`);
      }
    }
    newDays[k] = { label, accent, short: (DATA.week[k]&&DATA.week[k].short) || DAY_SHORT[k], schedule: blocks };
  });

  if(!daysFound){ errors.push("В JSON нет ни одного дня недели (monday, tuesday, …, sunday)."); }

  // habits (optional)
  let habits = null;
  const hSrc = obj.habits_24_7 || (obj.habits ? obj.habits : null);
  if(hSrc && typeof hSrc === "object"){
    habits = clone(DATA.habits_24_7 || DEFAULT_DATA.habits_24_7);
    if(hSrc.hydration && typeof hSrc.hydration === "object"){
      const g = Number(hSrc.hydration.goal_ml), s = Number(hSrc.hydration.step_ml);
      if(g > 0 && g <= 10000) habits.hydration.goal_ml = g; else if(hSrc.hydration.goal_ml !== undefined) errors.push("habits_24_7.hydration.goal_ml: число мл от 1 до 10000.");
      if(s > 0 && s <= 2000) habits.hydration.step_ml = s;
    }
    if(hSrc.focus !== undefined){
      if(!Array.isArray(hSrc.focus)) errors.push("habits_24_7.focus: ожидался массив.");
      else habits.focus = hSrc.focus.map(f=> typeof f === "string" ? {title:f, text:"", icon:"•"} : { title:String(f.title||""), text:String(f.text||""), icon:f.icon||"•" });
    }
    if(hSrc.check_min !== undefined){
      if(!Array.isArray(hSrc.check_min)) errors.push("habits_24_7.check_min: ожидался массив строк.");
      else habits.check_min = hSrc.check_min.map(String);
    }
    if(hSrc.notebook !== undefined){
      if(!Array.isArray(hSrc.notebook)) errors.push("habits_24_7.notebook: ожидался массив.");
      else habits.notebook = hSrc.notebook.map(n=> typeof n === "string" ? {title:n, text:""} : { title:String(n.title||""), text:String(n.text||"") });
    }
  }

  const ok = errors.length === 0 && daysFound > 0;
  return { ok, errors, warnings, data: ok ? { newDays, habits } : null };
}

function applyJson(text){
  const ta = $("#j-input"), rep = $("#j-report");
  const r = validateImport(text);
  rep.className = "val-report show " + (r.ok ? "success" : "error");
  ta.classList.remove("err","ok");
  if(!r.ok){
    ta.classList.add("err");
    rep.innerHTML = `<b>⛔ План НЕ изменён — найдены ошибки (${r.errors.length}):</b><ul>${r.errors.slice(0,15).map(e=>`<li>${esc(e)}</li>`).join("")}${r.errors.length>15?`<li>…и ещё ${r.errors.length-15}</li>`:""}</ul>${r.warnings.length?`<ul style="opacity:.75">${r.warnings.slice(0,5).map(e=>`<li>${esc(e)}</li>`).join("")}</ul>`:""}`;
    toast("В JSON есть ошибки — план не тронут","err");
    if(navigator.vibrate) try{ navigator.vibrate([100,60,100]); }catch(e){}
    return;
  }
  // apply (merge days)
  Object.entries(r.data.newDays).forEach(([k,v])=>{
    if(v === null) DATA.week[k] = { label:DAY_RU[k], short:DAY_SHORT[k], accent:"", schedule:[] };
    else DATA.week[k] = v;
  });
  if(r.data.habits) DATA.habits_24_7 = r.data.habits;
  DATA.meta = DATA.meta || {};
  DATA.meta.updated = new Date().toISOString().slice(0,16).replace("T"," ");
  saveData();
  ta.classList.add("ok");
  const updatedDays = Object.keys(r.data.newDays).map(k=> DAY_SHORT[k]).join(", ");
  rep.className = "val-report show success";
  rep.innerHTML = `<b>✓ План успешно обновлён</b>Изменены дни: ${updatedDays}${r.data.habits ? " + привычки 24/7" : ""}.${r.warnings.length ? `<ul style="margin-top:6px;opacity:.8">${r.warnings.slice(0,10).map(w=>`<li>${esc(w)}</li>`).join("")}</ul>` : ""}`;
  toast("План успешно обновлён ✓","ok");
  if(navigator.vibrate) try{ navigator.vibrate(60); }catch(e){}
  renderTimeline(false);
}

/* ---------- Live clock tick ---------- */
let lastMinute = -1;
function tick(){
  const n = new Date();
  const m = n.getHours()*60 + n.getMinutes();
  timerTick();
  if(m !== lastMinute){
    lastMinute = m;
    checkBlockNotifs();
    checkSmartReminders();
    applyDim();
    if(currentTab === "timeline" && !sheetCtx) renderTimeline(false);
    const nl = $("#now-line");
    if(nl && isToday(viewDate)){
      const day = DATA.week[dayKeyOf(viewDate)];
      if(day && day.schedule && day.schedule.length){
        const minM = Math.min(...day.schedule.map(b=>toMin(b.start)));
        nl.style.top = ((n.getHours()*60 + n.getMinutes() + n.getSeconds()/60) - minM) * PX_PER_MIN + "px";
      }
    }
    // midnight rollover
    if(n.getHours() === 0 && n.getMinutes() === 0){ renderHabits(); renderTimeline(false); }
  }
}

/* ---------- PWA ---------- */
const ICON_URL = (document.querySelector('link[rel="apple-touch-icon"]')||{}).href || "";
function initPWA(){
  if(location.protocol === "http:" || location.protocol === "https:"){
    // prefer real manifest + service worker when served
    const link = document.createElement("link");
    link.rel = "manifest"; link.href = "manifest.json";
    document.head.appendChild(link);
    if("serviceWorker" in navigator){
      window.addEventListener("load", ()=>{ navigator.serviceWorker.register("sw.js").catch(()=>{}); });
    }
  }
}

/* ---------- Init ---------- */
function init(){
  initPWA();
  updateNotifBanner();
  $("#notif-enable").addEventListener("click", requestNotif);
  $("#notif-dismiss").addEventListener("click", ()=>{ S_set(K.NB, 1); updateNotifBanner(); });
  $("#planb-toggle").addEventListener("click", ()=>{
    const dk = dateKey(viewDate);
    const all = S_get(K.PLANB, {});
    if(all[dk]) delete all[dk]; else all[dk] = 1;
    S_set(K.PLANB, all);
    renderTimeline(false);
    toast(all[dk] ? "🅱️ План Б включён: только база дня" : "План Б выключен — полная сетка");
  });
  $("#dim-toggle").addEventListener("click", ()=>{
    const m = S_get(K.DIM, "auto");
    const next = m === "auto" ? "on" : m === "on" ? "off" : "auto";
    S_set(K.DIM, next);
    applyDim();
    toast(next === "on" ? "🌙 Тёплый режим включён" : next === "off" ? "☀️ Тёплый режим выключен" : "🌙 Тёплый режим: авто (20:00–6:00)");
  });
  applyDim();
  $("#timer-strip").addEventListener("click", ()=>{
    const p = timers.pomo, c = timers.carb;
    const ref = p || c;
    if(ref && ref.dk === dateKey(viewDate)){
      const day = DATA.week[dayKeyOf(viewDate)];
      const i = day.schedule.findIndex(b=> blockKey(b) === ref.bk);
      if(i >= 0){ setTab("timeline"); openSheet(ref.dk, dayKeyOf(viewDate), i); return; }
    }
    setTab("timeline");
  });
  setTab(currentTab);
  renderTimeline(true);
  tick();
  setInterval(tick, 1000);
  setInterval(checkBlockNotifs, 20000);
  // re-render on tab focus / visibility
  document.addEventListener("visibilitychange", ()=>{ if(!document.hidden){ tick(); if(currentTab==="timeline"&&!sheetCtx) renderTimeline(false); } });
  // unlock audio on first touch (iOS)
  const unlock = ()=>{ try{ AC = AC || new (window.AudioContext||window.webkitAudioContext)(); if(AC.state==="suspended") AC.resume(); }catch(e){} document.removeEventListener("touchend", unlock); };
  document.addEventListener("touchend", unlock);
}
document.addEventListener("DOMContentLoaded", init);
