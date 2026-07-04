// ======================== REMINDERS MANAGEMENT ========================
const REMINDERS_KEY = 'wayfarer_reminders';
const NOTIFICATIONS_KEY = 'wayfarer_notifications';       // unread, triggered notifications
const READ_NOTIFICATIONS_KEY = 'wayfarer_read_notifications'; // read/dismissed notifications (history)

let editingReminderId = null;

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
  const notifications = getUnreadNotifications();
  // Check if notification already exists (unread)
  if (!notifications.some(n => n.reminderId === reminderId)) {
    notifications.push({
      reminderId: reminderId,
      message: message,
      type: type || '',
      timestamp: new Date().toISOString()
    });
    saveNotifications(notifications);
  }
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
  const reminders = getReminders();
  const now = new Date();
  
  reminders.forEach(reminder => {
    if (!reminder.enabled) return;
    
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

// ========== FORM HANDLING ==========
document.getElementById('reminderForm').addEventListener('submit', function(e) {
  e.preventDefault();
  
  const destination = document.getElementById('reminderDestination').value.trim();
  const travelDate = document.getElementById('reminderTravelDate').value;
  const reminderDateTime = document.getElementById('reminderDateTime').value;
  const type = document.getElementById('reminderType').value;
  const enabled = document.getElementById('reminderEnabled').checked;
  
  // Validation
  let isValid = true;
  if (!destination) {
    document.getElementById('reminderDestination').classList.add('is-invalid');
    isValid = false;
  } else {
    document.getElementById('reminderDestination').classList.remove('is-invalid');
  }
  
  if (!travelDate) {
    document.getElementById('reminderTravelDate').classList.add('is-invalid');
    isValid = false;
  } else {
    document.getElementById('reminderTravelDate').classList.remove('is-invalid');
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
  
  const reminders = getReminders();
  
  if (editingReminderId) {
    // Edit existing
    const index = reminders.findIndex(r => r.id === editingReminderId);
    if (index !== -1) {
      reminders[index] = {
        ...reminders[index],
        destination,
        travelDate,
        reminderDateTime,
        type,
        enabled
      };
      showToast('Reminder updated successfully!');
    }
    editingReminderId = null;
    document.querySelector('.btn-submit-reminder').innerHTML = '<i class="bi bi-plus-circle me-2"></i>Add Reminder';
  } else {
    // Add new
    const newReminder = {
      id: generateId(),
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
  document.getElementById('reminderEnabled').checked = true;
});

// ========== EDIT REMINDER ==========
function editReminder(id) {
  const reminders = getReminders();
  const reminder = reminders.find(r => r.id === id);
  if (!reminder) return;
  
  editingReminderId = id;
  document.getElementById('reminderDestination').value = reminder.destination;
  document.getElementById('reminderTravelDate').value = reminder.travelDate;
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
  renderReminders();
  updateNotificationBadge();
  updateUnreadNotifications();
  renderNotifDropdown();

  // Refresh dropdown contents each time it's opened, so "days until" stays accurate
  const bellButton = document.getElementById('bellButton');
  if (bellButton) {
    bellButton.addEventListener('click', renderNotifDropdown);
  }
  
  // Check reminders every minute
  checkReminders();
  setInterval(checkReminders, 60000);
});
