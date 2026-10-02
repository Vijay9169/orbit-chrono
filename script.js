// Constants & Lookups
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const WEEKDAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

// DOM Element References
const dialDays = document.getElementById('dialDays');
const dialMonths = document.getElementById('dialMonths');
const dialWeekdays = document.getElementById('dialWeekdays');
const viewProfile = document.getElementById('viewProfile');
const viewHands = document.getElementById('viewHands');
const viewPomo = document.getElementById('viewPomo');
const handHour = document.getElementById('handHour');
const handMinute = document.getElementById('handMinute');
const handSecond = document.getElementById('handSecond');
const pomoDigits = document.getElementById('pomoDigits');
const pomoLabel = document.getElementById('pomoLabel');
const canvas = document.getElementById('progressCanvas');
const ctx = canvas.getContext('2d');
const tzSelect = document.getElementById('tzSelect');
const tzBadge = document.getElementById('tzBadge');
const btnSound = document.getElementById('btnSound');

// State Engine
let currentMode = 'clock'; // 'clock' | 'profile' | 'pomo'
let selectedZone = localStorage.getItem('orbit_tz') || 'local';
let audioEnabled = false;
let audioCtx = null;
let lastSecondTick = -1;

// Drag / Scrubbing State
let isDragging = false;
let dragAngleOffset = 0;
let userScrubAngle = 0;
let isScrubbing = false;

// Pomodoro State
let pomoDuration = 25 * 60;
let pomoRemaining = pomoDuration;
let pomoIsRunning = false;
let pomoInterval = null;

// 1. Initial Setup
function initApp() {
  tzSelect.value = selectedZone;
  initDials();
  setupDragInteraction();
  setupThemes();
  renderHubView();
}

function initDials() {
  // Days (01-31)
  dialDays.innerHTML = '';
  for (let i = 1; i <= 31; i++) {
    const el = document.createElement('div');
    el.className = 'dial-item';
    el.innerText = i < 10 ? `0${i}` : `${i}`;
    const angle = (i - 1) * (360 / 31);
    el.style.transform = `rotate(${angle}deg)`;
    dialDays.appendChild(el);
  }

  // Months
  dialMonths.innerHTML = '';
  MONTHS.forEach((m, idx) => {
    const el = document.createElement('div');
    el.className = 'dial-item';
    el.innerText = m;
    const angle = idx * (360 / 12);
    el.style.transform = `rotate(${angle}deg)`;
    dialMonths.appendChild(el);
  });

  // Weekdays
  dialWeekdays.innerHTML = '';
  WEEKDAYS.forEach((w, idx) => {
    const el = document.createElement('div');
    el.className = 'dial-item';
    el.innerText = w;
    const angle = idx * (360 / 7);
    el.style.transform = `rotate(${angle}deg)`;
    dialWeekdays.appendChild(el);
  });
}

// 2. Timezone Engine using Intl API
function getZoneTime(tz) {
  const now = new Date();
  if (tz === 'local') {
    const offset = -now.getTimezoneOffset();
    const sign = offset >= 0 ? '+' : '-';
    const hrs = Math.floor(Math.abs(offset) / 60);
    const mins = Math.abs(offset) % 60;
    return {
      day: now.getDate(),
      monthIdx: now.getMonth(),
      rawDay: now.getDay(),
      hours: now.getHours(),
      minutes: now.getMinutes(),
      seconds: now.getSeconds(),
      millis: now.getMilliseconds(),
      offsetLabel: `UTC${sign}${hrs}:${mins === 0 ? '00' : mins}`
    };
  }

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: false
  });

  const parts = Object.fromEntries(formatter.formatToParts(now).map(p => [p.type, p.value]));
  const weekdayMap = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 0 };

  return {
    day: parseInt(parts.day, 10),
    monthIdx: parseInt(parts.month, 10) - 1,
    rawDay: weekdayMap[parts.weekday],
    hours: parseInt(parts.hour, 10) % 24,
    minutes: parseInt(parts.minute, 10),
    seconds: parseInt(parts.second, 10),
    millis: now.getMilliseconds(),
    offsetLabel: tz.split('/')[1] || tz
  };
}

// 3. Web Audio Procedural Escapement (Zero external files)
function playTick() {
  if (!audioEnabled) return;
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();

  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();

  osc.type = 'triangle';
  osc.frequency.setValueAtTime(1200, audioCtx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(120, audioCtx.currentTime + 0.025);

  gain.gain.setValueAtTime(0.04, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.025);

  osc.connect(gain);
  gain.connect(audioCtx.destination);

  osc.start();
  osc.stop(audioCtx.currentTime + 0.025);
}

// 4. Sector Progress Rendering on Canvas
function drawProgressArcs(t) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;

  if (currentMode === 'pomo') {
    // Render countdown progress ring
    const pomoRatio = (pomoDuration - pomoRemaining) / pomoDuration;
    const startAngle = -Math.PI / 2;

    ctx.strokeStyle = getComputedStyle(document.body).getPropertyValue('--pomo-accent').trim() || '#ff9500';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(cx, cy, 95, startAngle, startAngle + (Math.PI * 2 * pomoRatio));
    ctx.stroke();
    return;
  }

  // Normal progression arcs
  const dayRatio = t.day / 31;
  const monthRatio = (t.monthIdx + 1) / 12;
  const dayOfWeek = t.rawDay === 0 ? 7 : t.rawDay;
  const weekRatio = dayOfWeek / 7;

  const startAngle = -Math.PI / 2;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.038)';

  // Outer track (Days)
  ctx.beginPath();
  ctx.arc(cx, cy, 242, startAngle, startAngle + (Math.PI * 2 * dayRatio));
  ctx.arc(cx, cy, 192, startAngle + (Math.PI * 2 * dayRatio), startAngle, true);
  ctx.closePath();
  ctx.fill();

  // Middle track (Months)
  ctx.beginPath();
  ctx.arc(cx, cy, 188, startAngle, startAngle + (Math.PI * 2 * monthRatio));
  ctx.arc(cx, cy, 142, startAngle + (Math.PI * 2 * monthRatio), startAngle, true);
  ctx.closePath();
  ctx.fill();

  // Inner track (Weekdays)
  ctx.beginPath();
  ctx.arc(cx, cy, 138, startAngle, startAngle + (Math.PI * 2 * weekRatio));
  ctx.arc(cx, cy, 88, startAngle + (Math.PI * 2 * weekRatio), startAngle, true);
  ctx.closePath();
  ctx.fill();
}

// 5. Main Animation Loop (60 FPS)
function renderLoop() {
  const t = getZoneTime(selectedZone);
  tzBadge.innerText = t.offsetLabel;

  if (t.seconds !== lastSecondTick) {
    playTick();
    lastSecondTick = t.seconds;
  }

  const weekdayIdx = t.rawDay === 0 ? 6 : t.rawDay - 1;

  // Outer Dial (Days): Follows drag/scrub or real date
  if (!isScrubbing) {
    const dayAngle = -(t.day - 1) * (360 / 31);
    dialDays.style.transform = `rotate(${dayAngle}deg)`;
  } else {
    dialDays.style.transform = `rotate(${userScrubAngle}deg)`;
  }

  // Middle Dial (Months) & Inner Dial (Weekdays)
  const monthAngle = -t.monthIdx * (360 / 12);
  dialMonths.style.transform = `rotate(${monthAngle}deg)`;

  const weekdayAngle = -weekdayIdx * (360 / 7);
  dialWeekdays.style.transform = `rotate(${weekdayAngle}deg)`;

  // Dynamic Highlights
  Array.from(dialDays.children).forEach((el, idx) => {
    el.classList.toggle('active-date', idx === t.day - 1);
  });
  Array.from(dialMonths.children).forEach((el, idx) => {
    el.classList.toggle('active-month', idx === t.monthIdx);
  });
  Array.from(dialWeekdays.children).forEach((el, idx) => {
    el.classList.toggle('active-day', idx === weekdayIdx);
  });

  // Smooth Hands
  const smoothSec = t.seconds + t.millis / 1000;
  const smoothMin = t.minutes + smoothSec / 60;
  const smoothHour = (t.hours % 12) + smoothMin / 60;

  handSecond.style.transform = `rotate(${smoothSec * 6}deg)`;
  handMinute.style.transform = `rotate(${smoothMin * 6}deg)`;
  handHour.style.transform = `rotate(${smoothHour * 30}deg)`;

  drawProgressArcs(t);
  requestAnimationFrame(renderLoop);
}

// 6. Interactive Drag & Scrubbing Logic
function setupDragInteraction() {
  const getAngle = (e) => {
    const rect = dialDays.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return Math.atan2(clientY - cy, clientX - cx) * (180 / Math.PI);
  };

  const onStart = (e) => {
    isDragging = true;
    isScrubbing = true;
    dragAngleOffset = getAngle(e) - userScrubAngle;
  };

  const onMove = (e) => {
    if (!isDragging) return;
    userScrubAngle = getAngle(e) - dragAngleOffset;
  };

  const onEnd = () => {
    if (!isDragging) return;
    isDragging = false;
    // Auto-spring back to live time after 2 seconds
    setTimeout(() => {
      isScrubbing = false;
    }, 2000);
  };

  dialDays.addEventListener('mousedown', onStart);
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onEnd);

  dialDays.addEventListener('touchstart', onStart, { passive: true });
  window.addEventListener('touchmove', onMove, { passive: true });
  window.addEventListener('touchend', onEnd);
}

// 7. Pomodoro Countdown Engine
function togglePomodoro() {
  if (pomoIsRunning) {
    clearInterval(pomoInterval);
    pomoIsRunning = false;
    pomoLabel.innerText = 'PAUSED';
  } else {
    pomoIsRunning = true;
    pomoLabel.innerText = 'FOCUS';
    pomoInterval = setInterval(() => {
      if (pomoRemaining > 0) {
        pomoRemaining--;
        updatePomoDisplay();
      } else {
        clearInterval(pomoInterval);
        pomoIsRunning = false;
        pomoLabel.innerText = 'COMPLETE';
      }
    }, 1000);
  }
}

function updatePomoDisplay() {
  const m = Math.floor(pomoRemaining / 60);
  const s = pomoRemaining % 60;
  pomoDigits.innerText = `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
}

// 8. View Routing
function switchMode(newMode) {
  currentMode = newMode;
  renderHubView();

  document.getElementById('btnModeClock').classList.toggle('active', newMode === 'clock');
  document.getElementById('btnModeProfile').classList.toggle('active', newMode === 'profile');
  document.getElementById('btnModePomo').classList.toggle('active', newMode === 'pomo');
}

function renderHubView() {
  viewHands.classList.toggle('hidden', currentMode !== 'clock');
  viewProfile.classList.toggle('hidden', currentMode !== 'profile');
  viewPomo.classList.toggle('hidden', currentMode !== 'pomo');
}

// 9. Themes Engine with LocalStorage
function setupThemes() {
  const savedTheme = localStorage.getItem('orbit_theme') || 'dark';
  document.body.setAttribute('data-theme', savedTheme);

  document.querySelectorAll('.theme-dot').forEach(dot => {
    dot.classList.toggle('active', dot.getAttribute('data-set-theme') === savedTheme);
    dot.addEventListener('click', () => {
      const theme = dot.getAttribute('data-set-theme');
      document.body.setAttribute('data-theme', theme);
      localStorage.setItem('orbit_theme', theme);
      document.querySelectorAll('.theme-dot').forEach(d => d.classList.remove('active'));
      dot.classList.add('active');
    });
  });
}

// Event Listeners
tzSelect.addEventListener('change', (e) => {
  selectedZone = e.target.value;
  localStorage.setItem('orbit_tz', selectedZone);
});

btnSound.addEventListener('click', () => {
  audioEnabled = !audioEnabled;
  btnSound.classList.toggle('active', audioEnabled);
  if (audioEnabled && !audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
});

document.getElementById('centerHub').addEventListener('click', () => {
  if (currentMode === 'pomo') {
    togglePomodoro();
  } else {
    switchMode(currentMode === 'clock' ? 'profile' : 'clock');
  }
});

document.getElementById('btnModeClock').addEventListener('click', () => switchMode('clock'));
document.getElementById('btnModeProfile').addEventListener('click', () => switchMode('profile'));
document.getElementById('btnModePomo').addEventListener('click', () => switchMode('pomo'));

// Launch Application
initApp();
requestAnimationFrame(renderLoop);