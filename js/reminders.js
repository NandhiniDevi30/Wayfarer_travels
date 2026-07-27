// ======================== REMINDERS MANAGEMENT ========================
const REMINDERS_KEY = 'wayfarer_reminders';
const NOTIFICATIONS_KEY = 'wayfarer_notifications';       // unread, triggered notifications
const READ_NOTIFICATIONS_KEY = 'wayfarer_read_notifications'; // read/dismissed notifications (history)
const NOTIFIED_IDS_KEY = 'wayfarer_notified_reminder_ids';    // reminders that have already fired once
const TRIPS_KEY = 'wayfarerTrips'; // shared with Trip Planner / My Bookings

let editingReminderId = null;

// ========== SESSION / TRIP HELPERS ==========
// Reminders can only be created for trips the user planned in Trip Planner
// that are currently marked "Upcoming" — never a freehand destination/date.
function getSessionUser() {
  try {
    const raw = sessionStorage.getItem('wayfarerSession');
    if (raw) return JSON.parse(raw);
  } catch (e) { /* ignore */ }
  return null;
}

// Mirrors the derived-status logic in trip-planner.js / booking-management.js /
// profile.js: "cancelled" is the only status a user sets by hand, and it
// always wins. Otherwise Upcoming vs Completed is derived purely from
// today's date vs. the trip's end date — never stored, never stale.
function computeTripStatus(t) {
  if (t.status === 'cancelled') return 'cancelled';

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = new Date(t.endDate || t.startDate);
  end.setHours(0, 0, 0, 0);

  return end < today ? 'completed' : 'upcoming';
}

function getMyTripsRaw() {
  const session = getSessionUser();
  if (!session || !session.email) return [];
  try {
    const allTrips = JSON.parse(localStorage.getItem(TRIPS_KEY) || '{}');
    return allTrips[session.email] || [];
  } catch (e) {
    return [];
  }
}

function getMyUpcomingTrips() {
  return getMyTripsRaw().filter(function (t) {
    return computeTripStatus(t) === 'upcoming';
  });
}

// ========== ORPHANED REMINDER CLEANUP ==========
// If a trip is deleted outright in Trip Planner or My Bookings, its record
// disappears from wayfarerTrips entirely — unlike Cancelled, which just
// flips a flag. Nothing else was cleaning up reminders left pointing at a
// tripId that no longer exists, so a deleted trip's reminder would keep
// showing (and could even keep firing notifications) forever. This prunes
// any reminder whose trip is gone, along with its unread notification and
// "already notified" flag.
function pruneOrphanedReminders() {
  const validIds = new Set(getMyTripsRaw().map(function (t) { return t.id; }));
  const reminders = getReminders();

  const orphanedIds = reminders
    .filter(function (r) { return r.tripId && !validIds.has(r.tripId); })
    .map(function (r) { return r.id; });

  if (orphanedIds.length === 0) return false;

  const remaining = reminders.filter(function (r) { return orphanedIds.indexOf(r.id) === -1; });
  localStorage.setItem(REMINDERS_KEY, JSON.stringify(remaining));

  orphanedIds.forEach(function (id) { clearReminderNotified(id); });

  const notifications = getUnreadNotifications().filter(function (n) {
    return orphanedIds.indexOf(n.reminderId) === -1;
  });
  saveNotifications(notifications);

  return true;
}

// ========== DATA HELPERS ==========
function getReminders() {
  try {
    const stored = localStorage.getItem(REMINDERS_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch (e) {
    return [];
  }
}

function saveReminders(reminders) {
  localStorage.setItem(REMINDERS_KEY, JSON.stringify(reminders));
  updateNotificationBadge();
  updateUnreadNotifications();
  renderNotifDropdown();
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

function formatDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { 
    year: 'numeric', 
    month: 'short', 
    day: 'numeric' 
  });
}

function formatDateTime(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function timeAgo(dateStr) {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now - d;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

function getReminderTypeLabel(type) {
  const map = {
    '7days': '7 Days Before Trip',
    '1day': '1 Day Before Trip',
    'started': 'Trip Started Notification'
  };
  return map[type] || type;
}

function getReminderTypeClass(type) {
  const map = {
    '7days': 'early',
    '1day': 'day-before',
    'started': 'started'
  };
  return map[type] || '';
}

function getReminderTypeIcon(type) {
  const map = {
    '7days': 'bi-calendar-check',
    '1day': 'bi-alarm',
    'started': 'bi-airplane-fill'
  };
  return map[type] || 'bi-bell';
}

// ========== "ALREADY NOTIFIED" TRACKING (survives mark-as-read) ==========
// This is the key that fixes re-notification: once a reminder has fired,
// its id goes in here permanently (until the reminder is edited/deleted/
// re-enabled), independent of whether the notification itself was read,
// dismissed, or aged out of the capped read-history list.
function getNotifiedIds() {
  try {
    const stored = localStorage.getItem(NOTIFIED_IDS_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch (e) {
    return [];
  }
}

function saveNotifiedIds(ids) {
  localStorage.setItem(NOTIFIED_IDS_KEY, JSON.stringify(ids));
}

function hasBeenNotified(reminderId) {
  return getNotifiedIds().includes(reminderId);
}

function markReminderNotified(reminderId) {
  const ids = getNotifiedIds();
  if (!ids.includes(reminderId)) {
    ids.push(reminderId);
    saveNotifiedIds(ids);
  }
}

// Clears the "already notified" flag so the reminder is eligible to fire
// again. Called when a reminder is edited (new date/type), deleted, or
// re-enabled after being paused.
function clearReminderNotified(reminderId) {
  const ids = getNotifiedIds().filter(id => id !== reminderId);
  saveNotifiedIds(ids);
}

// ========== NOTIFICATION HELPERS (UNREAD) ==========
function getUnreadNotifications() {
  try {
    const stored = localStorage.getItem(NOTIFICATIONS_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch (e) {
    return [];
  }
}

function saveNotifications(notifications) {
  localStorage.setItem(NOTIFICATIONS_KEY, JSON.stringify(notifications));
}

function getReadNotifications() {
  try {
    const stored = localStorage.getItem(READ_NOTIFICATIONS_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch (e) {
    return [];
  }
}

function saveReadNotifications(notifications) {
  localStorage.setItem(READ_NOTIFICATIONS_KEY, JSON.stringify(notifications));
}

// Unique-ish key for matching a notification when undoing (reminderId + timestamp pair)
function notifKey(n) {
  return `${n.reminderId}::${n.timestamp}`;
}

// Mark a single notification (by reminderId) as read: move it from unread -> read.
// Shows a toast with an Undo action that restores it to unread.
function markNotificationsAsRead(reminderId) {
  let notifications = getUnreadNotifications();
  const target = notifications.find(n => n.reminderId === reminderId);
  if (!target) return;

  notifications = notifications.filter(n => n.reminderId !== reminderId);
  saveNotifications(notifications);

  const readList = getReadNotifications();
  readList.unshift(target);
  saveReadNotifications(readList.slice(0, 50)); // keep last 50

  // NOTE: we deliberately do NOT clear the "notified" flag here.
  // Marking as read should not make the reminder eligible to re-fire
  // on the next 60s checkReminders() pass — that was the bug.

  updateNotificationBadge();
  updateUnreadNotifications();
  renderNotifDropdown();
  renderReminders();

  showToast('Marked as read', () => undoMarkAsRead(target));
}

// Mark ALL unread notifications as read. Also undoable.
function markAllAsRead() {
  const notifications = getUnreadNotifications();
  if (notifications.length === 0) return;

  const readList = getReadNotifications();
  const merged = [...notifications, ...readList].slice(0, 50);
  saveReadNotifications(merged);
  saveNotifications([]);

  updateNotificationBadge();
  updateUnreadNotifications();
  renderNotifDropdown();
  renderReminders();

  showToast(`${notifications.length} notification${notifications.length === 1 ? '' : 's'} marked as read`, () => undoMarkAllAsRead(notifications));
}

// Restore a single notification that was marked as read
function undoMarkAsRead(notification) {
  let readList = getReadNotifications().filter(n => notifKey(n) !== notifKey(notification));
  saveReadNotifications(readList);

  const unread = getUnreadNotifications();
  if (!unread.some(n => notifKey(n) === notifKey(notification))) {
    unread.push(notification);
  }
  saveNotifications(unread);

  updateNotificationBadge();
  updateUnreadNotifications();
  renderNotifDropdown();
  renderReminders();
  showToast('Restored to unread');
}

// Restore a whole batch that was marked as read via "Mark all read"
function undoMarkAllAsRead(originalUnread) {
  const keysToRestore = new Set(originalUnread.map(notifKey));
  let readList = getReadNotifications().filter(n => !keysToRestore.has(notifKey(n)));
  saveReadNotifications(readList);
  saveNotifications(originalUnread);

  updateNotificationBadge();
  updateUnreadNotifications();
  renderNotifDropdown();
  renderReminders();
  showToast('Restored to unread');
}

function addNotification(reminderId, message, type) {
  // Already fired once for this reminder (whether it's still sitting
  // unread, was marked read, or aged out of read history) — don't re-add.
  if (hasBeenNotified(reminderId)) return;

  const notifications = getUnreadNotifications();
  notifications.push({
    reminderId: reminderId,
    message: message,
    type: type || '',
    timestamp: new Date().toISOString()
  });
  saveNotifications(notifications);
  markReminderNotified(reminderId);

  updateNotificationBadge();
  updateUnreadNotifications();
  renderNotifDropdown();
  renderReminders();
}

// ========== 1. DISPLAY UNREAD REMINDER COUNT ==========
// Updates both the navbar bell badge AND a visible chip on the page itself,
// so the unread count is never hidden behind a dropdown click.
function updateNotificationBadge() {
  const badge = document.getElementById('unreadBadge');
  const bellBtn = document.getElementById('bellButton');
  const count = getUnreadNotifications().length;

  if (badge) {
    if (count > 0) {
      badge.textContent = count > 99 ? '99+' : count;
      badge.style.display = 'flex';
      if (bellBtn) bellBtn.classList.add('has-unread');
    } else {
      badge.style.display = 'none';
      if (bellBtn) bellBtn.classList.remove('has-unread');
    }
  }

  const chip = document.getElementById('unreadCountChip');
  if (chip) {
    if (count > 0) {
      chip.innerHTML = `<i class="bi bi-bell-fill"></i>${count} unread`;
      chip.classList.remove('is-zero');
    } else {
      chip.innerHTML = `<i class="bi bi-bell"></i>0 unread`;
      chip.classList.add('is-zero');
    }
  }
}

// ========== 3. HIGHLIGHT UNREAD NOTIFICATIONS (bell icon + reminder cards) ==========
function updateUnreadNotifications() {
  const bellIcon = document.querySelector('#bellButton i');
  if (bellIcon) {
    const count = getUnreadNotifications().length;
    if (count > 0) {
      bellIcon.style.color = 'var(--coral-500)';
    } else {
      bellIcon.style.color = '';
    }
  }
}

// ========== 2. SHOW ALL UPCOMING REMINDERS (bell dropdown) ==========
function getUpcomingReminders() {
  const reminders = getReminders();
  const now = new Date();
  return reminders
    .filter(r => r.enabled && new Date(r.travelDate) >= now)
    .sort((a, b) => new Date(a.travelDate) - new Date(b.travelDate));
}

function renderNotifDropdown() {
  const listEl = document.getElementById('notifDropdownList');
  const emptyEl = document.getElementById('emptyNotifDropdown');
  const markAllBtn = document.getElementById('markAllReadBtn');
  if (!listEl) return;

  const unread = getUnreadNotifications();
  const unreadIds = new Set(unread.map(n => n.reminderId));
  const upcoming = getUpcomingReminders();

  markAllBtn.style.display = unread.length > 0 ? 'inline-block' : 'none';

  let html = '';

  // Unread (triggered) notifications first, newest first — visually highlighted
  unread
    .slice()
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .forEach(n => {
      html += `
        <div class="notif-item unread" onclick="markNotificationsAsRead('${n.reminderId}')" title="Click to mark as read">
          <div class="notif-icon type-${getReminderTypeClass(n.type)}"><i class="bi ${getReminderTypeIcon(n.type)}"></i></div>
          <div class="notif-body">
            <div class="notif-msg">${n.message}</div>
            <div class="notif-time">${timeAgo(n.timestamp)}</div>
          </div>
        </div>`;
    });

  // Upcoming reminders that haven't triggered a notification yet
  upcoming
    .filter(r => !unreadIds.has(r.id))
    .slice(0, 10)
    .forEach(r => {
      const travelDate = new Date(r.travelDate);
      const daysUntil = Math.ceil((travelDate - new Date()) / (1000 * 60 * 60 * 24));
      const daysLabel = daysUntil === 0 ? 'today' : daysUntil === 1 ? 'in 1 day' : `in ${daysUntil} days`;
      html += `
        <div class="notif-item" onclick="editReminder('${r.id}')" title="View reminder">
          <div class="notif-icon type-upcoming"><i class="bi bi-clock-history"></i></div>
          <div class="notif-body">
            <div class="notif-msg">Trip to ${r.destination} starts ${daysLabel}</div>
            <div class="notif-time">${getReminderTypeLabel(r.type)} · ${formatDate(r.travelDate)}</div>
          </div>
        </div>`;
    });

  if (html === '') {
    listEl.innerHTML = '';
    emptyEl.style.display = 'block';
  } else {
    emptyEl.style.display = 'none';
    listEl.innerHTML = html;
  }
}

// ========== CHECK AND TRIGGER REMINDERS ==========
function checkReminders() {
  // Trips can be deleted while the reminders page is sitting open with the
  // 60s interval running, so prune orphans here too, not just on load.
  const pruned = pruneOrphanedReminders();
  if (pruned) renderReminders();

  const reminders = getReminders();
  const now = new Date();
  
  reminders.forEach(reminder => {
    if (!reminder.enabled) return;
    if (hasBeenNotified(reminder.id)) return; // already fired — skip re-check entirely
    
    const reminderTime = new Date(reminder.reminderDateTime);
    const travelDate = new Date(reminder.travelDate);
    const daysUntilTravel = Math.ceil((travelDate - now) / (1000 * 60 * 60 * 24));
    
    let shouldNotify = false;
    let message = '';
    
    // Check if reminder should be triggered
    switch(reminder.type) {
      case '7days':
        if (daysUntilTravel === 7 && now >= reminderTime) {
          shouldNotify = true;
          message = `⏰ Reminder: Your trip to ${reminder.destination} starts in 7 days!`;
        }
        break;
      case '1day':
        if (daysUntilTravel === 1 && now >= reminderTime) {
          shouldNotify = true;
          message = `⏰ Reminder: Your trip to ${reminder.destination} starts tomorrow!`;
        }
        break;
      case 'started':
        if (daysUntilTravel <= 0 && daysUntilTravel > -1 && now >= reminderTime) {
          shouldNotify = true;
          message = `🎉 Your trip to ${reminder.destination} has started! Have a great journey!`;
        }
        break;
    }
    
    if (shouldNotify) {
      addNotification(reminder.id, message, reminder.type);
    }
  });

  renderNotifDropdown();
}

// ========== RENDER REMINDERS ==========
function renderReminders() {
  const reminders = getReminders();
  const list = document.getElementById('remindersList');
  const empty = document.getElementById('emptyReminders');

  updateNotificationBadge();

  if (reminders.length === 0) {
    list.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  
  empty.style.display = 'none';
  
  // Sort by travel date (upcoming first)
  reminders.sort((a, b) => new Date(a.travelDate) - new Date(b.travelDate));

  // Reminders with a pending unread notification get highlighted in the list itself
  const unreadReminderIds = new Set(getUnreadNotifications().map(n => n.reminderId));

  list.innerHTML = reminders.map(reminder => {
    const hasUnread = unreadReminderIds.has(reminder.id);
    return `
    <div class="reminder-card ${reminder.enabled ? '' : 'disabled'} ${hasUnread ? 'has-unread-notif' : ''}" data-id="${reminder.id}">
      ${hasUnread ? '<span class="reminder-new-tag">New</span>' : ''}
      <div class="d-flex justify-content-between align-items-start flex-wrap">
        <div>
          <h5 class="fw-bold mb-1">${reminder.destination}</h5>
          <div class="mb-2">
            <span class="reminder-type ${getReminderTypeClass(reminder.type)}">
              ${getReminderTypeLabel(reminder.type)}
            </span>
            <span class="reminder-status ${reminder.enabled ? 'active' : 'inactive'} ms-2">
              ${reminder.enabled ? '✓ Active' : '✗ Disabled'}
            </span>
          </div>
          <div style="font-size:.9rem; color:var(--ink-600);">
            <div><i class="bi bi-calendar-event me-1"></i>Travel: ${formatDate(reminder.travelDate)}</div>
            <div><i class="bi bi-clock me-1"></i>Reminder: ${formatDateTime(reminder.reminderDateTime)}</div>
          </div>
        </div>
        <div class="d-flex gap-1 mt-2 mt-sm-0">
          ${hasUnread ? `<button class="btn-toggle-reminder" onclick="markNotificationsAsRead('${reminder.id}')" title="Mark notification as read"><i class="bi bi-check2-circle"></i></button>` : ''}
          <button class="btn-toggle-reminder" onclick="toggleReminder('${reminder.id}')" title="${reminder.enabled ? 'Disable' : 'Enable'} reminder">
            <i class="bi ${reminder.enabled ? 'bi-pause-circle' : 'bi-play-circle'}"></i>
          </button>
          <button class="btn-edit-reminder" onclick="editReminder('${reminder.id}')" title="Edit reminder">
            <i class="bi bi-pencil"></i>
          </button>
          <button class="btn-delete-reminder" onclick="deleteReminder('${reminder.id}')" title="Delete reminder">
            <i class="bi bi-trash"></i>
          </button>
        </div>
      </div>
    </div>
  `;
  }).join('');
}

// ========== TRIP SELECT DROPDOWN (only Upcoming trips) ==========
function populateTripSelect() {
  const select = document.getElementById('reminderTripSelect');
  const destInput = document.getElementById('reminderDestination');
  const dateInput = document.getElementById('reminderTravelDate');
  const formSection = document.getElementById('addReminderSection');
  const noTripsMsg = document.getElementById('noUpcomingTripsMsg');
  const submitBtn = document.getElementById('reminderSubmitBtn');
  if (!select) return;

  const previouslySelected = select.value;
  const trips = getMyUpcomingTrips().sort((a, b) => new Date(a.startDate) - new Date(b.startDate));

  if (trips.length === 0) {
    select.innerHTML = '<option value="" selected disabled>No upcoming trips available</option>';
    if (destInput) destInput.value = '';
    if (dateInput) dateInput.value = '';
    if (formSection) formSection.classList.add('d-none');
    if (noTripsMsg) noTripsMsg.classList.remove('d-none');
    return;
  }

  if (formSection) formSection.classList.remove('d-none');
  if (noTripsMsg) noTripsMsg.classList.add('d-none');
  if (submitBtn) submitBtn.disabled = false;

  let options = '<option value="" selected disabled>Select a trip...</option>';
  trips.forEach(t => {
    options += `<option value="${t.id}">${t.destination} — ${formatDate(t.startDate)}</option>`;
  });
  select.innerHTML = options;

  // Re-select whatever was chosen before, if it's still a valid option
  // (e.g. after a background storage sync from another tab).
  if (previouslySelected && trips.some(t => t.id === previouslySelected)) {
    select.value = previouslySelected;
  }
}

function handleTripSelectChange() {
  const select = document.getElementById('reminderTripSelect');
  const destInput = document.getElementById('reminderDestination');
  const dateInput = document.getElementById('reminderTravelDate');
  const trips = getMyUpcomingTrips();
  const trip = trips.find(t => t.id === select.value);

  select.classList.remove('is-invalid');

  if (trip) {
    destInput.value = trip.destination;
    dateInput.value = formatDate(trip.startDate);
  } else {
    destInput.value = '';
    dateInput.value = '';
  }
}

// ========== FORM HANDLING ==========
document.getElementById('reminderForm').addEventListener('submit', function(e) {
  e.preventDefault();

  const tripSelect = document.getElementById('reminderTripSelect');
  const upcomingTrips = getMyUpcomingTrips();
  const trip = upcomingTrips.find(t => t.id === tripSelect.value);

  const reminderDateTime = document.getElementById('reminderDateTime').value;
  const type = document.getElementById('reminderType').value;
  const enabled = document.getElementById('reminderEnabled').checked;

  // Validation
  let isValid = true;

  const tripFeedback = document.getElementById('reminderTripSelectFeedback');
  if (!trip) {
    tripSelect.classList.add('is-invalid');
    tripFeedback.textContent = upcomingTrips.length === 0
      ? 'You have no upcoming trips. Plan a trip first, then come back to set a reminder.'
      : 'Please select one of your upcoming trips.';
    isValid = false;
  } else {
    tripSelect.classList.remove('is-invalid');
  }

  if (!reminderDateTime) {
    document.getElementById('reminderDateTime').classList.add('is-invalid');
    isValid = false;
  } else {
    document.getElementById('reminderDateTime').classList.remove('is-invalid');
  }

  if (!type) {
    document.getElementById('reminderType').classList.add('is-invalid');
    isValid = false;
  } else {
    document.getElementById('reminderType').classList.remove('is-invalid');
  }

  if (!isValid) return;

  // Destination and travel date always come straight from the selected
  // Upcoming trip — never freehand text — so a reminder can never point
  // at a trip that isn't actually Upcoming.
  const destination = trip.destination;
  const travelDate = trip.startDate;

  const reminders = getReminders();

  if (editingReminderId) {
    // Edit existing
    const index = reminders.findIndex(r => r.id === editingReminderId);
    if (index !== -1) {
      reminders[index] = {
        ...reminders[index],
        tripId: trip.id,
        destination,
        travelDate,
        reminderDateTime,
        type,
        enabled
      };

      // The trip's date/type may have changed, so any prior "already
      // notified" state (and any stale unread notification for the old
      // version of this reminder) is no longer valid — clear it so the
      // edited reminder can fire fresh against its new schedule.
      clearReminderNotified(editingReminderId);
      const staleUnread = getUnreadNotifications().filter(n => n.reminderId !== editingReminderId);
      saveNotifications(staleUnread);

      showToast('Reminder updated successfully!');
    }
    editingReminderId = null;
    document.querySelector('.btn-submit-reminder').innerHTML = '<i class="bi bi-plus-circle me-2"></i>Add Reminder';
  } else {
    // Add new
    const newReminder = {
      id: generateId(),
      tripId: trip.id,
      destination,
      travelDate,
      reminderDateTime,
      type,
      enabled,
      createdAt: new Date().toISOString()
    };
    reminders.push(newReminder);
    showToast('Reminder added successfully!');
  }
  
  saveReminders(reminders);
  renderReminders();
  this.reset();
  document.getElementById('reminderDestination').value = '';
  document.getElementById('reminderTravelDate').value = '';
  document.getElementById('reminderEnabled').checked = true;
  populateTripSelect();
});

document.getElementById('reminderTripSelect').addEventListener('change', handleTripSelectChange);

// ========== EDIT REMINDER ==========
function editReminder(id) {
  const reminders = getReminders();
  const reminder = reminders.find(r => r.id === id);
  if (!reminder) return;

  editingReminderId = id;

  // Make sure the form (and its trip dropdown) is visible and current,
  // even if the user currently has zero *other* upcoming trips.
  document.getElementById('addReminderSection').classList.remove('d-none');
  document.getElementById('noUpcomingTripsMsg').classList.add('d-none');
  populateTripSelect();

  const select = document.getElementById('reminderTripSelect');
  const destInput = document.getElementById('reminderDestination');
  const dateInput = document.getElementById('reminderTravelDate');

  const optionStillValid = reminder.tripId &&
    Array.from(select.options).some(o => o.value === reminder.tripId);

  if (optionStillValid) {
    select.value = reminder.tripId;
    select.classList.remove('is-invalid');
  } else {
    // The trip this reminder was created for is no longer Upcoming
    // (completed, cancelled, or deleted). Show its original info for
    // context, but require the user to pick a currently-Upcoming trip
    // before they can save changes.
    select.value = '';
    const feedback = document.getElementById('reminderTripSelectFeedback');
    feedback.textContent = 'The original trip for this reminder is no longer Upcoming. Please select a current upcoming trip.';
  }

  destInput.value = reminder.destination;
  dateInput.value = formatDate(reminder.travelDate);

  document.getElementById('reminderDateTime').value = reminder.reminderDateTime;
  document.getElementById('reminderType').value = reminder.type;
  document.getElementById('reminderEnabled').checked = reminder.enabled;

  document.querySelector('.btn-submit-reminder').innerHTML = '<i class="bi bi-pencil me-2"></i>Update Reminder';
  document.getElementById('addReminderSection').scrollIntoView({ behavior: 'smooth' });
}

// ========== DELETE REMINDER ==========
function deleteReminder(id) {
  if (!confirm('Are you sure you want to delete this reminder?')) return;
  
  let reminders = getReminders();
  reminders = reminders.filter(r => r.id !== id);
  saveReminders(reminders);

  // Also clean up any related unread notification (no undo toast here —
  // the reminder itself is gone, so there's nothing meaningful to restore to)
  const notifications = getUnreadNotifications().filter(n => n.reminderId !== id);
  saveNotifications(notifications);
  clearReminderNotified(id); // free up the id in case it's ever reused
  updateNotificationBadge();
  updateUnreadNotifications();
  renderNotifDropdown();

  showToast('Reminder deleted successfully');
  renderReminders();
}

// ========== TOGGLE REMINDER ==========
function toggleReminder(id) {
  const reminders = getReminders();
  const reminder = reminders.find(r => r.id === id);
  if (!reminder) return;
  
  reminder.enabled = !reminder.enabled;

  // Re-enabling a paused reminder should let it fire again if its window
  // still applies — otherwise a paused-then-resumed reminder would stay
  // silent forever because it was already marked "notified" earlier.
  if (reminder.enabled) {
    clearReminderNotified(id);
  }

  saveReminders(reminders);
  renderReminders();
  showToast(`Reminder ${reminder.enabled ? 'enabled' : 'disabled'}`);
}

// ========== TOAST (supports an optional Undo action) ==========
function showToast(message, undoCallback) {
  const toastEl = document.getElementById('actionToast');
  const toastMsg = document.getElementById('toastMessage');
  const oldUndoBtn = document.getElementById('toastUndoBtn');
  toastMsg.textContent = message;

  // Replace the button to strip any previously-attached click handlers
  const undoBtn = oldUndoBtn.cloneNode(true);
  oldUndoBtn.parentNode.replaceChild(undoBtn, oldUndoBtn);

  const existingInstance = bootstrap.Toast.getInstance(toastEl);
  if (existingInstance) existingInstance.dispose();

  if (typeof undoCallback === 'function') {
    undoBtn.style.display = 'inline-block';
    undoBtn.addEventListener('click', () => {
      undoCallback();
      bootstrap.Toast.getInstance(toastEl)?.hide();
    });
  } else {
    undoBtn.style.display = 'none';
  }

  const bsToast = new bootstrap.Toast(toastEl, { delay: undoCallback ? 6000 : 3000 });
  bsToast.show();
}

// ========== INITIALIZATION ==========
document.addEventListener('DOMContentLoaded', function() {
  const session = getSessionUser();
  const authRequired = document.getElementById('authRequired');
  const mainContent = document.getElementById('remindersMainContent');

  if (!session || !session.email) {
    // Not signed in: show the sign-in prompt and skip initializing the
    // reminders UI entirely (there's no per-user trip data to show).
    if (authRequired) authRequired.style.display = 'block';
    if (mainContent) mainContent.style.display = 'none';
    return;
  }

  if (authRequired) authRequired.style.display = 'none';
  if (mainContent) mainContent.style.display = 'block';

  // Deleted trips (removed entirely, not just cancelled) can leave
  // orphaned reminders behind — clear those out before the first render.
  pruneOrphanedReminders();

  populateTripSelect();
  renderReminders();
  updateNotificationBadge();
  updateUnreadNotifications();
  renderNotifDropdown();

  // Refresh dropdown contents each time it's opened, so "days until" stays accurate
  const bellButton = document.getElementById('bellButton');
  if (bellButton) {
    bellButton.addEventListener('click', renderNotifDropdown);
  }

  // Keep the trip dropdown in sync if trips change in another tab
  // (e.g. a trip is marked Cancelled, or deleted outright, in Trip
  // Planner or My Bookings).
  window.addEventListener('storage', function (e) {
    if (e.key === TRIPS_KEY) {
      const pruned = pruneOrphanedReminders();
      populateTripSelect();
      if (pruned) renderReminders();
    }
  });
  
  // Check reminders every minute
  checkReminders();
  setInterval(checkReminders, 60000);
});