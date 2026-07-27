/* ═══════════════════════════════════════════════════════════════
   Wayfarer — Booking Management Module
   ═══════════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  const TRIPS_KEY = 'wayfarerTrips';

  /* ── AUTH GUARD ─────────────────────────────────────────────── */
  function getSessionUser() {
    try {
      const raw = sessionStorage.getItem('wayfarerSession');
      if (raw) return JSON.parse(raw);
    } catch (e) { /* ignore */ }
    return null;
  }

  const session = getSessionUser();
  if (!session || !session.email) {
    window.location.href = 'authentication.html';
    return;
  }

  /* Chart.js instances, kept so we can destroy/rebuild on every render */
  let statusChartInstance = null;
  let revenueChartInstance = null;

  document.addEventListener('DOMContentLoaded', init);

  function init() {
    const nameDisplay = document.getElementById('userNameDisplay');
    if (nameDisplay) nameDisplay.textContent = session.name || session.email;

    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', function (e) {
        e.preventDefault();
        sessionStorage.removeItem('wayfarerSession');
        window.location.href = 'index.html';
      });
    }

    renderTable();

    document.getElementById('searchInput').addEventListener('input', renderTable);
    document.getElementById('statusFilter').addEventListener('change', renderTable);
    document.getElementById('sortSelect').addEventListener('change', renderTable);

    document.getElementById('bookingTbody').addEventListener('click', handleTableClick);
    document.getElementById('editForm').addEventListener('submit', handleEditSubmit);
    document.getElementById('confirmActionBtn').addEventListener('click', handleConfirmAction);

    /* keep bookings in sync with other open tabs (e.g. Trip Planner) */
    window.addEventListener('storage', function (e) {
      if (e.key === TRIPS_KEY) renderTable();
    });

    /* collapse mobile nav on link click, matching the rest of the site */
    document.querySelectorAll('#navMenu .nav-link').forEach(function (link) {
      link.addEventListener('click', function () {
        const menu = document.getElementById('navMenu');
        if (menu.classList.contains('show')) {
          bootstrap.Collapse.getOrCreateInstance(menu).hide();
        }
      });
    });
  }

  /* ── STORAGE (shared with Trip Planner) ──────────────────────── */
  function loadAllTrips() {
    try {
      const parsed = JSON.parse(localStorage.getItem(TRIPS_KEY) || '{}');
      if (parsed && typeof parsed === 'object') return parsed;
    } catch (e) { /* fall through */ }
    return {};
  }

  function saveAllTrips(all) {
    try { localStorage.setItem(TRIPS_KEY, JSON.stringify(all)); }
    catch (e) { /* storage unavailable */ }
  }

  /* ── DERIVE BOOKING STATUS FROM A TRIP RECORD ─────────────────
     Mirrors the logic in trip-planner.js: "cancelled" is the only
     status a user sets by hand (trip.status === 'cancelled'), and it
     always wins. Otherwise, Upcoming vs Completed is derived purely
     from today's date vs. the trip's end date — never stored, never
     stale, and never something a dropdown can leave out of sync. */
  function computeBookingStatus(t) {
    if (t.status === 'cancelled') return 'cancelled';

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const end = new Date(t.endDate || t.startDate);
    end.setHours(0, 0, 0, 0);

    return end < today ? 'completed' : 'upcoming';
  }

  /* Every trip is a booking. This getter also migrates legacy trips
     so they have the fields the Booking module additionally needs
     (a stable id — same migration trip-planner.js already does —
     plus a paymentStatus, which trips never tracked before). */
  function getMyTrips() {
    const all = loadAllTrips();
    const trips = all[session.email] || [];
    let changed = false;

    trips.forEach(function (t) {
      if (!t.id) {
        t.id = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
        changed = true;
      }
      if (!t.paymentStatus) {
        const derived = computeBookingStatus(t);
        t.paymentStatus = derived === 'cancelled' ? 'Refunded'
                         : derived === 'completed' ? 'Paid'
                         : 'Pending';
        changed = true;
      }
    });

    if (changed) {
      all[session.email] = trips;
      saveAllTrips(all);
    }
    return trips;
  }

  function setMyTrips(list) {
    const all = loadAllTrips();
    all[session.email] = list;
    saveAllTrips(all);
    if (window.refreshProfileStats) window.refreshProfileStats();
  }

  /* ── STATUS MAPPING (trip-planner stores lowercase; we display Title Case) ── */
  function toDisplayStatus(status) {
    if (status === 'completed') return 'Completed';
    if (status === 'cancelled') return 'Cancelled';
    return 'Upcoming';
  }

  /* ── DERIVE BOOKING VIEW FROM A TRIP RECORD ──────────────────── */
  function tripToBooking(t) {
    const derivedStatus = computeBookingStatus(t); // 'upcoming' | 'completed' | 'cancelled'
    const bookingStatus = toDisplayStatus(derivedStatus);

    // Payment status is automatic once a trip is no longer Upcoming:
    // Completed trips are always Paid, Cancelled trips are always
    // Refunded. Only Upcoming trips keep whatever payment status was
    // recorded (e.g. paid in advance, or still pending) since that's
    // the only state where "has it been paid yet?" is still an open
    // question.
    let paymentStatus = t.paymentStatus || 'Pending';
    if (derivedStatus === 'completed') paymentStatus = 'Paid';
    else if (derivedStatus === 'cancelled') paymentStatus = 'Refunded';

    return {
      id: t.id,
      displayId: 'WF-' + String(t.id).toUpperCase(),
      destination: t.destination,
      travelerName: session.name || session.email,
      bookingDate: t.createdAt ? t.createdAt.slice(0, 10) : t.startDate,
      travelDate: t.startDate,
      travelers: t.travelers,
      amount: t.totalCost,
      paymentStatus: paymentStatus,
      bookingStatus: bookingStatus
    };
  }

  /* ── RENDER ─────────────────────────────────────────────────── */
  function getFilteredSortedBookings() {
    const query = document.getElementById('searchInput').value.trim().toLowerCase();
    const statusFilter = document.getElementById('statusFilter').value;
    const sortMode = document.getElementById('sortSelect').value;

    let list = getMyTrips().map(tripToBooking);

    if (query) {
      list = list.filter(function (b) {
        return b.displayId.toLowerCase().includes(query) ||
               b.destination.toLowerCase().includes(query) ||
               b.travelerName.toLowerCase().includes(query);
      });
    }

    if (statusFilter !== 'all') {
      list = list.filter(function (b) { return b.bookingStatus === statusFilter; });
    }

    list.sort(function (a, b) {
      const da = new Date(a.travelDate).getTime();
      const db = new Date(b.travelDate).getTime();
      return sortMode === 'travelDateDesc' ? db - da : da - db;
    });

    return list;
  }

  function formatDate(dateStr) {
    if (!dateStr) return '—';
    const d = new Date(dateStr + 'T00:00:00');
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' });
  }

  function formatCurrency(amount) {
    return '₹' + Number(amount || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });
  }

  function formatCurrencyCompact(amount) {
    const n = Number(amount || 0);
    if (n >= 100000) return '₹' + (n / 100000).toFixed(1).replace(/\.0$/, '') + 'L';
    if (n >= 1000) return '₹' + (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
    return '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 0 });
  }

  function statusBadge(status) {
    const map = {
      Upcoming: ['badge-upcoming', 'bi-clock-history'],
      Completed: ['badge-completed', 'bi-check-circle-fill'],
      Cancelled: ['badge-cancelled', 'bi-x-circle-fill']
    };
    const cfg = map[status] || ['badge-upcoming', 'bi-clock-history'];
    return '<span class="badge-pill ' + cfg[0] + '"><i class="bi ' + cfg[1] + '"></i>' + status + '</span>';
  }

  function paymentBadge(status) {
    const map = { Paid: 'badge-paid', Pending: 'badge-pending', Refunded: 'badge-refunded' };
    return '<span class="badge-pill ' + (map[status] || 'badge-pending') + '">' + status + '</span>';
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
  }

  /* ── STATS DASHBOARD ──────────────────────────────────────────
     Reads ALL of the user's bookings (unfiltered by the search box
     / status dropdown) so the dashboard always reflects the whole
     account, not just the current table view.

     Total Revenue = sum of `amount` across every booking that is
     NOT Cancelled (regardless of its individual paymentStatus).
     Cancelled bookings are excluded because they're refunded and
     therefore aren't real revenue. */
  function computeStats() {
    const all = getMyTrips().map(tripToBooking);

    let confirmed = 0, pending = 0, cancelled = 0, revenue = 0;
    const monthlyRevenue = {}; // 'YYYY-MM' -> amount

    all.forEach(function (b) {
      const isCancelled = b.bookingStatus === 'Cancelled';

      if (isCancelled) {
        cancelled++;
      } else {
        if (b.paymentStatus === 'Paid') {
          confirmed++;
        } else if (b.paymentStatus === 'Pending') {
          pending++;
        }

        // Count revenue from every non-cancelled booking, not just Paid ones.
        revenue += Number(b.amount || 0);
        const monthKey = (b.travelDate || '').slice(0, 7); // YYYY-MM
        if (monthKey) {
          monthlyRevenue[monthKey] = (monthlyRevenue[monthKey] || 0) + Number(b.amount || 0);
        }
      }
    });

    return {
      total: all.length,
      confirmed: confirmed,
      pending: pending,
      cancelled: cancelled,
      revenue: revenue,
      monthlyRevenue: monthlyRevenue
    };
  }

  function renderStatCards(stats) {
    document.getElementById('statTotal').textContent = stats.total;
    document.getElementById('statConfirmed').textContent = stats.confirmed;
    document.getElementById('statPending').textContent = stats.pending;
    document.getElementById('statCancelled').textContent = stats.cancelled;
    document.getElementById('statRevenue').textContent = formatCurrency(stats.revenue);
  }

  function getChartColors() {
    const styles = getComputedStyle(document.documentElement);
    return {
      teal: styles.getPropertyValue('--teal-700').trim() || '#1a625a',
      success: styles.getPropertyValue('--success-600').trim() || '#1a7a4c',
      gold: styles.getPropertyValue('--gold-600').trim() || '#b5924f',
      danger: styles.getPropertyValue('--danger-600').trim() || '#dc3545',
      coral: styles.getPropertyValue('--coral-500').trim() || '#e8714a',
      ink: styles.getPropertyValue('--ink-600').trim() || '#52605c',
      sand: styles.getPropertyValue('--sand-200').trim() || '#e9dcc0'
    };
  }

  function renderStatusChart(stats) {
    const canvas = document.getElementById('statusChart');
    const emptyEl = document.getElementById('statusChartEmpty');
    if (!canvas || typeof Chart === 'undefined') return;

    if (statusChartInstance) {
      statusChartInstance.destroy();
      statusChartInstance = null;
    }

    if (stats.total === 0) {
      canvas.classList.add('d-none');
      emptyEl.classList.remove('d-none');
      return;
    }
    canvas.classList.remove('d-none');
    emptyEl.classList.add('d-none');

    const colors = getChartColors();

    statusChartInstance = new Chart(canvas.getContext('2d'), {
      type: 'doughnut',
      data: {
        labels: ['Confirmed', 'Pending', 'Cancelled'],
        datasets: [{
          data: [stats.confirmed, stats.pending, stats.cancelled],
          backgroundColor: [colors.success, colors.gold, colors.danger],
          borderColor: '#ffffff',
          borderWidth: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '65%',
        plugins: {
          legend: {
            position: 'bottom',
            labels: { color: colors.ink, font: { family: 'Inter', size: 12 }, padding: 14, usePointStyle: true }
          },
          tooltip: {
            callbacks: {
              label: function (ctx) {
                const total = stats.confirmed + stats.pending + stats.cancelled;
                const pct = total ? Math.round((ctx.raw / total) * 100) : 0;
                return ctx.label + ': ' + ctx.raw + ' (' + pct + '%)';
              }
            }
          }
        }
      }
    });
  }

  function renderRevenueChart(stats) {
    const canvas = document.getElementById('revenueChart');
    const emptyEl = document.getElementById('revenueChartEmpty');
    if (!canvas || typeof Chart === 'undefined') return;

    if (revenueChartInstance) {
      revenueChartInstance.destroy();
      revenueChartInstance = null;
    }

    const months = Object.keys(stats.monthlyRevenue).sort();

    if (!months.length) {
      canvas.classList.add('d-none');
      emptyEl.classList.remove('d-none');
      return;
    }
    canvas.classList.remove('d-none');
    emptyEl.classList.add('d-none');

    const colors = getChartColors();
    const labels = months.map(function (m) {
      const d = new Date(m + '-01T00:00:00');
      return isNaN(d.getTime()) ? m : d.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
    });
    const data = months.map(function (m) { return stats.monthlyRevenue[m]; });

    revenueChartInstance = new Chart(canvas.getContext('2d'), {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: 'Revenue',
          data: data,
          backgroundColor: colors.coral,
          borderRadius: 6,
          maxBarThickness: 42
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: function (ctx) { return formatCurrency(ctx.raw); }
            }
          }
        },
        scales: {
          x: { grid: { display: false }, ticks: { color: colors.ink, font: { family: 'Inter', size: 11 } } },
          y: {
            beginAtZero: true,
            grid: { color: colors.sand },
            ticks: {
              color: colors.ink,
              font: { family: 'Inter', size: 11 },
              callback: function (val) { return formatCurrencyCompact(val); }
            }
          }
        }
      }
    });
  }

  function renderDashboard() {
    const stats = computeStats();
    renderStatCards(stats);
    renderStatusChart(stats);
    renderRevenueChart(stats);
  }

  function renderTable() {
    const list = getFilteredSortedBookings();
    const tbody = document.getElementById('bookingTbody');
    const emptyState = document.getElementById('emptyState');
    const table = document.getElementById('bookingTable');
    const resultCount = document.getElementById('resultCount');
    const totalCount = getMyTrips().length;

    resultCount.textContent = list.length + ' of ' + totalCount + ' booking' + (totalCount === 1 ? '' : 's');

    /* Stats/charts always reflect the full account, independent of
       the table's current search/filter, so refresh them every render. */
    renderDashboard();

    if (!list.length) {
      tbody.innerHTML = '';
      table.classList.add('d-none');
      emptyState.classList.remove('d-none');
      document.getElementById('emptyStateMsg').innerHTML = totalCount === 0
        ? 'You don\'t have any trips booked yet. <a href="trip-planner.html">Plan a trip</a> to see it here.'
        : 'Try adjusting your search or filters.';
      return;
    }

    table.classList.remove('d-none');
    emptyState.classList.add('d-none');

    tbody.innerHTML = list.map(function (b) {
      const isCancelled = b.bookingStatus === 'Cancelled';
      return (
        '<tr data-id="' + escapeHtml(b.id) + '">' +
          '<td class="booking-id-cell">' + escapeHtml(b.displayId) + '</td>' +
          '<td class="dest-cell">' + escapeHtml(b.destination) + '<small>Booked ' + formatDate(b.bookingDate) + '</small></td>' +
          '<td>' + escapeHtml(b.travelerName) + '</td>' +
          '<td>' + formatDate(b.bookingDate) + '</td>' +
          '<td>' + formatDate(b.travelDate) + '</td>' +
          '<td>' + escapeHtml(b.travelers) + '</td>' +
          '<td>' + formatCurrency(b.amount) + '</td>' +
          '<td>' + paymentBadge(b.paymentStatus) + '</td>' +
          '<td>' + statusBadge(b.bookingStatus) + '</td>' +
          '<td>' +
            '<div class="action-btns">' +
              '<button class="action-btn view-btn" data-action="view" title="View Booking" aria-label="View booking ' + escapeHtml(b.displayId) + '"><i class="bi bi-eye"></i></button>' +
              '<button class="action-btn edit-btn" data-action="edit" title="Edit Booking" aria-label="Edit booking ' + escapeHtml(b.displayId) + '"><i class="bi bi-pencil"></i></button>' +
              '<button class="action-btn cancel-btn" data-action="cancel" title="Cancel Booking" aria-label="Cancel booking ' + escapeHtml(b.displayId) + '" ' + (isCancelled ? 'disabled' : '') + '><i class="bi bi-x-circle"></i></button>' +
              '<button class="action-btn delete-btn" data-action="delete" title="Delete Booking" aria-label="Delete booking ' + escapeHtml(b.displayId) + '"><i class="bi bi-trash"></i></button>' +
            '</div>' +
          '</td>' +
        '</tr>'
      );
    }).join('');
  }

  /* ── ACTIONS ────────────────────────────────────────────────── */
  function handleTableClick(e) {
    const btn = e.target.closest('.action-btn');
    if (!btn || btn.disabled) return;
    const row = btn.closest('tr');
    const id = row.getAttribute('data-id');
    const action = btn.getAttribute('data-action');

    if (action === 'view') openViewModal(id);
    else if (action === 'edit') openEditModal(id);
    else if (action === 'cancel') openConfirmModal('cancel', id);
    else if (action === 'delete') openConfirmModal('delete', id);
  }

  function findBooking(id) {
    const trip = getMyTrips().find(function (t) { return t.id === id; });
    return trip ? tripToBooking(trip) : null;
  }

  function showToast(message) {
    const toastMsg = document.getElementById('toastMessage');
    const toastEl = document.getElementById('actionToast');
    if (!toastMsg || !toastEl) return;
    toastMsg.textContent = message;
    bootstrap.Toast.getOrCreateInstance(toastEl, { delay: 2500 }).show();
  }

  function openViewModal(id) {
    const b = findBooking(id);
    if (!b) return;
    const body = document.getElementById('viewModalBody');
    body.innerHTML =
      '<div class="detail-row"><span>Booking ID</span><span>' + escapeHtml(b.displayId) + '</span></div>' +
      '<div class="detail-row"><span>Destination</span><span>' + escapeHtml(b.destination) + '</span></div>' +
      '<div class="detail-row"><span>Traveler Name</span><span>' + escapeHtml(b.travelerName) + '</span></div>' +
      '<div class="detail-row"><span>Booking Date</span><span>' + formatDate(b.bookingDate) + '</span></div>' +
      '<div class="detail-row"><span>Travel Date</span><span>' + formatDate(b.travelDate) + '</span></div>' +
      '<div class="detail-row"><span>Number of Travelers</span><span>' + escapeHtml(b.travelers) + '</span></div>' +
      '<div class="detail-row"><span>Booking Amount</span><span>' + formatCurrency(b.amount) + '</span></div>' +
      '<div class="detail-row"><span>Payment Status</span><span>' + paymentBadge(b.paymentStatus) + '</span></div>' +
      '<div class="detail-row"><span>Booking Status</span><span>' + statusBadge(b.bookingStatus) + '</span></div>';
    bootstrap.Modal.getOrCreateInstance(document.getElementById('viewModal')).show();
  }

  function openEditModal(id) {
    const b = findBooking(id);
    if (!b) return;
    document.getElementById('editBookingId').value = b.id;
    document.getElementById('editTravelerName').value = b.travelerName;
    document.getElementById('editTravelers').value = b.travelers;
    document.getElementById('editTravelDate').value = b.travelDate;
    document.getElementById('editAmount').value = b.amount;
    document.getElementById('editPaymentStatus').value = b.paymentStatus;
    document.getElementById('editBookingStatus').value = b.bookingStatus;
    document.getElementById('editErrorWrap').style.display = 'none';
    bootstrap.Modal.getOrCreateInstance(document.getElementById('editModal')).show();
  }

  function handleEditSubmit(e) {
    e.preventDefault();
    const id = document.getElementById('editBookingId').value;
    const travelers = parseInt(document.getElementById('editTravelers').value, 10);
    const travelDate = document.getElementById('editTravelDate').value;
    const amount = parseFloat(document.getElementById('editAmount').value);
    const paymentStatus = document.getElementById('editPaymentStatus').value;
    const bookingStatus = document.getElementById('editBookingStatus').value;

    const errWrap = document.getElementById('editErrorWrap');
    const errMsg = document.getElementById('editErrorMsg');

    if (!travelDate) {
      errMsg.textContent = 'Travel date is required.';
      errWrap.style.display = 'block';
      return;
    }
    if (!travelers || travelers < 1) {
      errMsg.textContent = 'Number of travelers must be at least 1.';
      errWrap.style.display = 'block';
      return;
    }
    if (isNaN(amount) || amount < 0) {
      errMsg.textContent = 'Booking amount must be a valid, non-negative number.';
      errWrap.style.display = 'block';
      return;
    }

    const trips = getMyTrips();
    const idx = trips.findIndex(function (t) { return t.id === id; });
    if (idx === -1) return;

    trips[idx].travelers = travelers;
    trips[idx].startDate = travelDate;
    trips[idx].totalCost = amount;
    trips[idx].paymentStatus = paymentStatus;

    // Cancelled is the only manual status override (matches trip-planner.js).
    // Picking anything else in the dropdown just clears the override and
    // lets Upcoming/Completed go back to being derived from the date.
    if (bookingStatus === 'Cancelled') {
      trips[idx].status = 'cancelled';
    } else {
      delete trips[idx].status;
    }

    setMyTrips(trips);

    bootstrap.Modal.getInstance(document.getElementById('editModal')).hide();
    showToast('Booking updated successfully');
    renderTable();
  }

  let pendingConfirmAction = null;
  let pendingConfirmId = null;

  function openConfirmModal(type, id) {
    const b = findBooking(id);
    if (!b) return;
    pendingConfirmAction = type;
    pendingConfirmId = id;

    const iconWrap = document.getElementById('confirmIconWrap');
    const icon = document.getElementById('confirmIcon');
    const title = document.getElementById('confirmTitle');
    const msg = document.getElementById('confirmMsg');
    const actionBtn = document.getElementById('confirmActionBtn');

    if (type === 'cancel') {
      iconWrap.style.background = 'rgba(232,113,74,.12)';
      icon.className = 'bi bi-x-circle';
      icon.style.color = 'var(--coral-600)';
      title.textContent = 'Cancel this booking?';
      msg.textContent = 'This will mark ' + b.displayId + ' (' + b.destination + ') as Cancelled in both My Bookings and Trip Planner.';
      actionBtn.textContent = 'Cancel Booking';
    } else {
      iconWrap.style.background = 'rgba(220,53,69,.1)';
      icon.className = 'bi bi-trash';
      icon.style.color = 'var(--danger-600)';
      title.textContent = 'Delete this booking?';
      msg.textContent = 'This will permanently remove ' + b.displayId + ' (' + b.destination + ') from your trips. This action cannot be undone.';
      actionBtn.textContent = 'Delete Booking';
    }

    bootstrap.Modal.getOrCreateInstance(document.getElementById('confirmModal')).show();
  }

  function handleConfirmAction() {
    if (!pendingConfirmId || !pendingConfirmAction) return;
    const trips = getMyTrips();
    const idx = trips.findIndex(function (t) { return t.id === pendingConfirmId; });
    if (idx === -1) return;

    if (pendingConfirmAction === 'cancel') {
      trips[idx].status = 'cancelled';
      trips[idx].paymentStatus = 'Refunded';
      setMyTrips(trips);
      showToast('Booking cancelled');
    } else if (pendingConfirmAction === 'delete') {
      trips.splice(idx, 1);
      setMyTrips(trips);
      showToast('Booking deleted');
    }

    pendingConfirmAction = null;
    pendingConfirmId = null;

    bootstrap.Modal.getInstance(document.getElementById('confirmModal')).hide();
    renderTable();
  }

})();