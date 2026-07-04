/* ============================================================
   WAYFARER — WISHLIST + CALENDAR MODULE
   ============================================================ */

const WISHLIST_KEY = 'wayfarer_wishlist';                  // array of destination IDs
const WISHLIST_HISTORY_KEY = 'wayfarer_wishlist_history';  // array of {id, name, action, timestamp}
const CALENDAR_KEY = 'wayfarer_calendar_trips';             // array of trip objects (see schema below)
const HISTORY_LIMIT = 30;

/* Trip schema:

let allDestinations = [];
let scheduleModalInstance = null;

/* ---------------- STORAGE HELPERS ---------------- */
function getWishlistIds() {
  try {
    const raw = JSON.parse(localStorage.getItem(WISHLIST_KEY));
    return Array.isArray(raw) ? raw : [];
  } catch (e) {
    return [];
  }
}

function saveWishlistIds(ids) {
  localStorage.setItem(WISHLIST_KEY, JSON.stringify(ids));
}

function getHistory() {
  try {
    const raw = JSON.parse(localStorage.getItem(WISHLIST_HISTORY_KEY));
    return Array.isArray(raw) ? raw : [];
  } catch (e) {
    return [];
  }
}

function logHistory(id, name, action) {
  const history = getHistory();
  history.unshift({ id, name, action, timestamp: new Date().toISOString() });
  localStorage.setItem(WISHLIST_HISTORY_KEY, JSON.stringify(history.slice(0, HISTORY_LIMIT)));
}

function getCalendarTrips() {
  try {
    const raw = JSON.parse(localStorage.getItem(CALENDAR_KEY));
    return Array.isArray(raw) ? raw : [];
  } catch (e) {
    return [];
  }
}

function saveCalendarTrips(trips) {
  localStorage.setItem(CALENDAR_KEY, JSON.stringify(trips));
}

function getTripByDestId(destId) {
  return getCalendarTrips().find(t => t.destId === destId) || null;
}

/* ---------------- PUBLIC WISHLIST API (also used by script.js on other pages) ---------------- */
function isInWishlist(id) {
  return getWishlistIds().includes(id);
}

function toggleWishlist(id, name) {
  let ids = getWishlistIds();
  const exists = ids.includes(id);
  if (exists) {
    ids = ids.filter(x => x !== id);
    logHistory(id, name, 'removed');
  } else {
    ids.push(id);
    logHistory(id, name, 'added');
  }
  saveWishlistIds(ids);
  return !exists; // returns true if it was just added
}

/* ---------------- UTILITIES ---------------- */
function formatINR(amount) {
  return '₹' + Number(amount).toLocaleString('en-IN');
}

function showToast(message) {
  const toastMsg = document.getElementById('toastMessage');
  const toastEl = document.getElementById('actionToast');
  if (!toastMsg || !toastEl) return;
  toastMsg.textContent = message;
  new bootstrap.Toast(toastEl, { delay: 2500 }).show();
}

function timeAgo(isoString) {
  const diffMs = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function todayISODate() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** Parses a 'YYYY-MM-DD' string into a local Date at midnight (avoids UTC offset bugs). */
function parseLocalDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function addDays(dateStr, days) {
  const d = parseLocalDate(dateStr);
  d.setDate(d.getDate() + Number(days));
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function toCompactDate(dateStr) {
  return dateStr.replaceAll('-', ''); // YYYYMMDD
}

const MONTH_ABBR = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];

function formatDayMonth(dateStr) {
  const d = parseLocalDate(dateStr);
  return { day: pad2(d.getDate()), month: MONTH_ABBR[d.getMonth()] };
}

function formatDateLabel(dateStr) {
  const d = parseLocalDate(dateStr);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatTimeLabel(timeStr) {
  if (!timeStr) return '';
  const [h, m] = timeStr.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${pad2(m)} ${period}`;
}

function isPastDate(dateStr) {
  return parseLocalDate(dateStr) < parseLocalDate(todayISODate());
}

function generateTripId() {
  return 'trip_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

/* ---------------- LOAD DATA ---------------- */
async function loadDestinations() {
  try {
    const res = await fetch('destinations.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    allDestinations = await res.json();
  } catch (err) {
    console.error('Failed to load destinations.json:', err);
    allDestinations = [];
  }
  return allDestinations;
}

/* ---------------- RENDER WISHLIST GRID ---------------- */
function renderWishlist() {
  const grid = document.getElementById('wishlistGrid');
  const empty = document.getElementById('wishlistEmpty');
  const loading = document.getElementById('wishlistLoading');
  const countText = document.getElementById('wishlistCountText');
  if (!grid) return;

  if (loading) loading.classList.remove('show');

  const ids = getWishlistIds();
  const items = ids
    .map(id => allDestinations.find(d => d.id === id))
    .filter(Boolean); // drop any stale IDs whose destination no longer exists

  grid.innerHTML = '';
  updateNavBadge(items.length);

  if (countText) {
    countText.textContent = items.length === 0
      ? 'Nothing saved yet.'
      : `${items.length} destination${items.length === 1 ? '' : 's'} saved for future planning.`;
  }

  if (items.length === 0) {
    if (empty) empty.classList.add('show');
    return;
  }
  if (empty) empty.classList.remove('show');

  items.forEach(d => {
    const trip = getTripByDestId(d.id);
    const col = document.createElement('div');
    col.className = 'col-lg-4 col-md-6';
    col.innerHTML = `
      <div class="dest-card">
        <div class="dest-card-img-wrap">
          <img src="${d.image}" alt="${d.destinationName}, ${d.country}" loading="lazy">
          <span class="dest-card-price-tag"><span>From</span>${formatINR(d.price)}</span>
          <button class="wishlist-remove-btn" data-id="${d.id}" aria-label="Remove ${d.destinationName} from wishlist">
            <i class="bi bi-heart-fill"></i>
          </button>
        </div>
        <div class="dest-card-body">
          <div class="dest-card-country"><i class="bi bi-geo-alt-fill"></i>${d.country}</div>
          <h3 class="dest-card-title">${d.destinationName}</h3>
          <div class="dest-card-rating"><i class="bi bi-star-fill"></i>${d.rating.toFixed(1)} <span class="text-muted fw-normal" style="font-size:.8rem;">/ 5</span></div>
          <div class="dest-card-besttime"><i class="bi bi-calendar-event"></i>Best time: ${d.bestTimeToVisit}</div>
          <div class="dest-card-calendar-row">
            <button class="btn-calendar-add ${trip ? 'is-scheduled' : ''}" data-id="${d.id}" data-name="${d.destinationName}" data-country="${d.country}">
              <i class="bi ${trip ? 'bi-pencil' : 'bi-calendar-plus'}"></i>${trip ? 'Reschedule' : 'Add to Calendar'}
            </button>
            ${trip ? `<span class="scheduled-chip"><i class="bi bi-check-circle-fill"></i>${formatDateLabel(trip.date)}</span>` : ''}
          </div>
        </div>
      </div>
    `;
    grid.appendChild(col);
  });
}

/* ---------------- NAVBAR BADGE ---------------- */
function updateNavBadge(count) {
  const badge = document.getElementById('wishlistNavBadge');
  if (!badge) return;
  if (count > 0) {
    badge.textContent = count;
    badge.style.display = 'inline-block';
  } else {
    badge.style.display = 'none';
  }
}

/* ---------------- ACTIVITY / HISTORY PANEL ---------------- */
function renderActivity() {
  const list = document.getElementById('activityList');
  if (!list) return;
  const history = getHistory();

  if (history.length === 0) {
    list.innerHTML = `<li style="border-bottom:none; color:var(--ink-400);"><i class="bi bi-info-circle"></i>No activity yet — add a destination to your wishlist to see it here.</li>`;
    return;
  }

  const ICONS = {
    added: 'bi-heart-fill',
    removed: 'bi-heartbreak',
    scheduled: 'bi-calendar-check',
    unscheduled: 'bi-calendar-x'
  };
  const LABELS = {
    added: 'Added',
    removed: 'Removed',
    scheduled: 'Scheduled',
    unscheduled: 'Removed calendar entry for'
  };

  list.innerHTML = history.map(h => `
    <li class="${h.action}">
      <i class="bi ${ICONS[h.action] || 'bi-info-circle'}"></i>
      ${LABELS[h.action] || h.action} <strong>${h.name}</strong>
      <span class="activity-time">${timeAgo(h.timestamp)}</span>
    </li>
  `).join('');
}

/* ---------------- UPCOMING TRIPS (CALENDAR) PANEL ---------------- */
function renderUpcomingTrips() {
  const list = document.getElementById('upcomingTripsList');
  const empty = document.getElementById('upcomingTripsEmpty');
  if (!list) return;

  const trips = getCalendarTrips().slice().sort((a, b) => {
    const key = t => t.date + 'T' + (t.time || '00:00');
    return key(a).localeCompare(key(b));
  });

  list.innerHTML = '';

  if (trips.length === 0) {
    if (empty) empty.classList.add('show');
    return;
  }
  if (empty) empty.classList.remove('show');

  trips.forEach(trip => {
    const { day, month } = formatDayMonth(trip.date);
    const past = isPastDate(trip.date);
    const item = document.createElement('div');
    item.className = `upcoming-trip-item ${past ? 'is-past' : ''}`;
    item.dataset.tripId = trip.tripId;
    item.innerHTML = `
      <div class="utd-date"><span class="utd-day">${day}</span><span class="utd-month">${month}</span></div>
      <div class="upcoming-trip-info">
        <h4>${trip.name}${past ? '<span class="past-badge">Past</span>' : ''}</h4>
        <p><i class="bi bi-geo-alt-fill"></i>${trip.country} &nbsp;•&nbsp; ${trip.duration} day${trip.duration == 1 ? '' : 's'}</p>
        ${trip.time ? `<p><i class="bi bi-clock"></i>${formatTimeLabel(trip.time)}</p>` : ''}
      </div>
      <div class="upcoming-trip-actions">
        <button class="utd-btn utd-ics" data-id="${trip.tripId}" title="Download .ics for Apple / Outlook"><i class="bi bi-download"></i></button>
        <button class="utd-btn utd-google" data-id="${trip.tripId}" title="Add to Google Calendar"><i class="bi bi-google"></i></button>
        <button class="utd-btn utd-remove" data-id="${trip.tripId}" title="Remove from calendar"><i class="bi bi-trash"></i></button>
      </div>
    `;
    list.appendChild(item);
  });
}

/* ---------------- ICS GENERATION ---------------- */
function buildICS(trip) {
  const hasTime = !!trip.time;
  const startDate = trip.date;
  const endDate = addDays(startDate, trip.duration || 1);

  let dtStart, dtEnd;
  if (hasTime) {
    const compactTime = trip.time.replace(':', '') + '00';
    dtStart = `DTSTART:${toCompactDate(startDate)}T${compactTime}`;
    dtEnd = `DTEND:${toCompactDate(endDate)}T${compactTime}`;
  } else {
    dtStart = `DTSTART;VALUE=DATE:${toCompactDate(startDate)}`;
    dtEnd = `DTEND;VALUE=DATE:${toCompactDate(endDate)}`;
  }

  const now = new Date();
  const dtStamp = now.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const escape = (str) => String(str || '').replace(/([,;])/g, '\\$1').replace(/\n/g, '\\n');

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Wayfarer//Trip Planner//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${trip.tripId}@wayfarer.app`,
    `DTSTAMP:${dtStamp}`,
    dtStart,
    dtEnd,
    `SUMMARY:${escape('Trip to ' + trip.name)}`,
    `DESCRIPTION:${escape((trip.notes ? trip.notes + ' — ' : '') + 'Saved via Wayfarer Wishlist.')}`,
    `LOCATION:${escape(trip.country)}`,
    'END:VEVENT',
    'END:VCALENDAR'
  ].join('\r\n');
}

function downloadICS(trip) {
  const content = buildICS(trip);
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${trip.name.replace(/[^a-z0-9]+/gi, '-')}-trip.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function buildGoogleCalendarUrl(trip) {
  const hasTime = !!trip.time;
  const startDate = trip.date;
  const endDate = addDays(startDate, trip.duration || 1);
  let dates;
  if (hasTime) {
    const compactTime = trip.time.replace(':', '') + '00';
    dates = `${toCompactDate(startDate)}T${compactTime}/${toCompactDate(endDate)}T${compactTime}`;
  } else {
    dates = `${toCompactDate(startDate)}/${toCompactDate(endDate)}`;
  }
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: `Trip to ${trip.name}`,
    dates,
    details: (trip.notes ? trip.notes + ' — ' : '') + 'Saved via Wayfarer Wishlist.',
    location: trip.country,
    ctz: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/* ---------------- SCHEDULE MODAL ---------------- */
function openScheduleModal(destId, name, country) {
  const existing = getTripByDestId(destId);
  document.getElementById('scheduleDestId').value = destId;
  document.getElementById('scheduleModalDest').textContent = `${name}, ${country}`;

  const dateInput = document.getElementById('tripDate');
  dateInput.min = todayISODate();
  dateInput.value = existing ? existing.date : '';
  dateInput.classList.remove('is-invalid');
  document.getElementById('tripTime').value = existing ? existing.time : '';
  document.getElementById('tripDuration').value = existing ? String(existing.duration) : '3';
  document.getElementById('tripNotes').value = existing ? existing.notes : '';

  if (!scheduleModalInstance) {
    scheduleModalInstance = new bootstrap.Modal(document.getElementById('scheduleModal'));
  }
  scheduleModalInstance.show();
}

function readTripFromModal() {
  const destId = Number(document.getElementById('scheduleDestId').value);
  const dest = allDestinations.find(d => d.id === destId);
  const dateInput = document.getElementById('tripDate');
  const date = dateInput.value;

  if (!date || isPastDate(date)) {
    dateInput.classList.add('is-invalid');
    dateInput.focus();
    return null;
  }
  dateInput.classList.remove('is-invalid');

  const existing = getTripByDestId(destId);
  return {
    tripId: existing ? existing.tripId : generateTripId(),
    destId,
    name: dest ? dest.destinationName : 'Destination',
    country: dest ? dest.country : '',
    date,
    time: document.getElementById('tripTime').value || '',
    duration: Number(document.getElementById('tripDuration').value) || 1,
    notes: document.getElementById('tripNotes').value.trim(),
    createdAt: existing ? existing.createdAt : new Date().toISOString()
  };
}

function upsertTrip(trip) {
  const trips = getCalendarTrips().filter(t => t.destId !== trip.destId);
  trips.push(trip);
  saveCalendarTrips(trips);
  logHistory(trip.destId, trip.name, 'scheduled');
}

function removeCalendarTrip(tripId) {
  const trips = getCalendarTrips();
  const trip = trips.find(t => t.tripId === tripId);
  if (!trip) return;
  saveCalendarTrips(trips.filter(t => t.tripId !== tripId));
  logHistory(trip.destId, trip.name, 'unscheduled');
}

/* ---------------- EVENT WIRING ---------------- */
document.addEventListener('DOMContentLoaded', async () => {
  const loading = document.getElementById('wishlistLoading');
  if (loading) loading.classList.add('show');

  await loadDestinations();
  renderWishlist();
  renderActivity();
  renderUpcomingTrips();

  // Remove-from-wishlist button (event delegation)
  document.getElementById('wishlistGrid').addEventListener('click', (e) => {
    const removeBtn = e.target.closest('.wishlist-remove-btn');
    if (removeBtn) {
      const id = Number(removeBtn.dataset.id);
      const dest = allDestinations.find(d => d.id === id);
      if (!dest) return;

      toggleWishlist(id, dest.destinationName);
      // If a destination is removed from the wishlist, drop its calendar entry too
      const trip = getTripByDestId(id);
      if (trip) removeCalendarTrip(trip.tripId);

      showToast(`${dest.destinationName} removed from wishlist`);
      renderWishlist();
      renderActivity();
      renderUpcomingTrips();
      return;
    }

    const calBtn = e.target.closest('.btn-calendar-add');
    if (calBtn) {
      openScheduleModal(Number(calBtn.dataset.id), calBtn.dataset.name, calBtn.dataset.country);
    }
  });

  // Schedule modal — save & download .ics
  document.getElementById('btnDownloadIcs').addEventListener('click', () => {
    const trip = readTripFromModal();
    if (!trip) return;
    upsertTrip(trip);
    downloadICS(trip);
    scheduleModalInstance.hide();
    renderWishlist();
    renderUpcomingTrips();
    renderActivity();
    showToast(`${trip.name} added to your calendar — .ics downloaded`);
  });

  // Schedule modal — save & open Google Calendar
  document.getElementById('btnAddGoogle').addEventListener('click', () => {
    const trip = readTripFromModal();
    if (!trip) return;
    upsertTrip(trip);
    window.open(buildGoogleCalendarUrl(trip), '_blank', 'noopener');
    scheduleModalInstance.hide();
    renderWishlist();
    renderUpcomingTrips();
    renderActivity();
    showToast(`${trip.name} added — opening Google Calendar`);
  });

  // Upcoming trips panel actions (event delegation)
  document.getElementById('upcomingTripsList').addEventListener('click', (e) => {
    const icsBtn = e.target.closest('.utd-ics');
    const googleBtn = e.target.closest('.utd-google');
    const removeBtn = e.target.closest('.utd-remove');
    const id = (icsBtn || googleBtn || removeBtn)?.dataset.id;
    if (!id) return;
    const trip = getCalendarTrips().find(t => t.tripId === id);
    if (!trip) return;

    if (icsBtn) {
      downloadICS(trip);
      showToast(`.ics downloaded for ${trip.name}`);
    } else if (googleBtn) {
      window.open(buildGoogleCalendarUrl(trip), '_blank', 'noopener');
    } else if (removeBtn) {
      removeCalendarTrip(id);
      renderWishlist();
      renderUpcomingTrips();
      renderActivity();
      showToast(`${trip.name} removed from calendar`);
    }
  });

  // Activity panel toggle
  const activityToggle = document.getElementById('activityToggle');
  const activityPanel = document.getElementById('activityPanel');
  if (activityToggle && activityPanel) {
    activityToggle.addEventListener('click', () => {
      const expanded = activityToggle.getAttribute('aria-expanded') === 'true';
      activityToggle.setAttribute('aria-expanded', String(!expanded));
      activityPanel.classList.toggle('show', !expanded);
    });
  }

  // Clear history
  const clearBtn = document.getElementById('clearHistoryBtn');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      localStorage.removeItem(WISHLIST_HISTORY_KEY);
      renderActivity();
      showToast('Wishlist activity cleared');
    });
  }

  // Keep everything in sync if changed in another tab
  window.addEventListener('storage', (e) => {
    if (e.key === WISHLIST_KEY) renderWishlist();
    if (e.key === WISHLIST_HISTORY_KEY) renderActivity();
    if (e.key === CALENDAR_KEY) {
      renderUpcomingTrips();
      renderWishlist();
    }
  });
});

/* ---------------- NAVBAR SCROLL EFFECT (shared behavior) ---------------- */
const mainNav = document.getElementById('mainNav');
if (mainNav) {
  window.addEventListener('scroll', () => {
    mainNav.classList.toggle('scrolled', window.scrollY > 60);
  });
}

/* ---------------- LOGGED-IN USER STATE (shared behavior) ---------------- */
function applyLoggedInState() {
  const authBtns = document.getElementById('authButtons');
  const userProfile = document.getElementById('userProfile');
  const userNameDisplay = document.getElementById('userNameDisplay');
  if (!authBtns || !userProfile) return;

  let session = null;
  try {
    session = JSON.parse(sessionStorage.getItem('wayfarerSession') || 'null');
  } catch (e) {
    session = null;
  }

  if (session && session.name) {
    authBtns.style.display = 'none';
    userProfile.style.display = '';
    userNameDisplay.textContent = session.name;
  } else {
    authBtns.style.display = '';
    userProfile.style.display = 'none';
  }
}
applyLoggedInState();

const logoutBtn = document.getElementById('logoutBtn');
if (logoutBtn) {
  logoutBtn.addEventListener('click', (e) => {
    e.preventDefault();
    sessionStorage.removeItem('wayfarerSession');
    applyLoggedInState();
    showToast('You have been signed out');
  });
}
