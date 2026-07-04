// ============================================================
// AUTHENTICATION CHECK FOR TRIP PLANNER PAGE
// ============================================================
(function() {
  "use strict";

  // Get session from sessionStorage 
  function getSessionUser() {
    try {
      const raw = sessionStorage.getItem('wayfarerSession');
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return null;
  }

  // ============================================================
  // SAVE TRIP TO LOCAL STORAGE AND UPDATE STATS
  // ============================================================
  function saveTripToStorage(tripData) {
    const session = getSessionUser();
    if (!session || !session.email) return false;

    try {
      // Get existing trips
      const allTrips = JSON.parse(localStorage.getItem('wayfarerTrips') || '{}');
      if (!allTrips[session.email]) allTrips[session.email] = [];
      
      // Add new trip
      allTrips[session.email].push(tripData);
      localStorage.setItem('wayfarerTrips', JSON.stringify(allTrips));
      
      // Refresh profile stats if profile page is open
      if (window.refreshProfileStats) {
        window.refreshProfileStats();
      }
      
      return true;
    } catch (e) {
      console.error('Error saving trip:', e);
      return false;
    }
  }

  // ============================================================
  // UPDATE TRIP STATUS (mark as completed / cancelled / upcoming)
  // ============================================================
  function updateTripStatus(index, newStatus) {
    const session = getSessionUser();
    if (!session || !session.email) return;

    try {
      const allTrips = JSON.parse(localStorage.getItem('wayfarerTrips') || '{}');
      const userTrips = allTrips[session.email] || [];

      if (userTrips[index]) {
        userTrips[index].status = newStatus;
        allTrips[session.email] = userTrips;
        localStorage.setItem('wayfarerTrips', JSON.stringify(allTrips));

        loadSavedTrips();

        if (window.refreshProfileStats) {
          window.refreshProfileStats();
        }

        showToast(`Trip marked as ${newStatus.charAt(0).toUpperCase() + newStatus.slice(1)}`);
      }
    } catch (e) {
      console.error('Error updating trip status:', e);
      showToast('Error updating trip status');
    }
  }

  // ============================================================
  // LOAD SAVED TRIPS
  // ============================================================
  function loadSavedTrips() {
    const session = getSessionUser();
    if (!session || !session.email) {
      document.getElementById('myTripsList').innerHTML = `
        <div class="empty-trips">
          <i class="bi bi-lock"></i>
          Please sign in to view your trips.
        </div>
      `;
      return;
    }

    try {
      const allTrips = JSON.parse(localStorage.getItem('wayfarerTrips') || '{}');
      const userTrips = allTrips[session.email] || [];
      const tripsList = document.getElementById('myTripsList');

      if (userTrips.length === 0) {
        tripsList.innerHTML = `
          <div class="empty-trips" id="emptyTripsMsg">
            <i class="bi bi-airplane"></i>
            No trips yet — fill out the form to plan your first trip.
          </div>
        `;
        return;
      }

      // Sort trips by start date (newest first)
      userTrips.sort((a, b) => new Date(b.startDate) - new Date(a.startDate));

      let html = '';
      userTrips.forEach((trip, index) => {
        const startDate = new Date(trip.startDate).toLocaleDateString('en-IN', {
          day: 'numeric',
          month: 'short',
          year: 'numeric'
        });
        const endDate = new Date(trip.endDate).toLocaleDateString('en-IN', {
          day: 'numeric',
          month: 'short',
          year: 'numeric'
        });

        // Determine status — explicit status takes priority, then falls back to date-based auto-detection
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tripEnd = new Date(trip.endDate);
        tripEnd.setHours(0, 0, 0, 0);

        let statusClass = 'status-pending';
        let statusText = 'Upcoming';

        if (trip.status === 'cancelled') {
          statusClass = 'status-cancelled';
          statusText = 'Cancelled';
        } else if (trip.status === 'completed' || tripEnd < today) {
          statusClass = 'status-confirmed';
          statusText = 'Completed';
        }

        html += `
          <div class="trip-item">
            <div class="trip-top">
              <div class="trip-info">
                <h6>${trip.destination}</h6>
                <small>${startDate} — ${endDate}</small>
              </div>
              <div class="d-flex align-items-center gap-2">
                <div class="dropdown">
                  <button class="btn-remove-trip dropdown-toggle" type="button" data-bs-toggle="dropdown" aria-expanded="false" title="Change status" style="font-size:0.95rem;">
                    <i class="bi bi-three-dots-vertical"></i>
                  </button>
                  <ul class="dropdown-menu dropdown-menu-end" style="background:var(--teal-950); border-color:rgba(255,255,255,0.1); min-width:170px;">
                    <li><a class="dropdown-item trip-status-action" href="#" data-index="${index}" data-status="upcoming" style="color:rgba(255,255,255,0.85);"><i class="bi bi-calendar-check me-2"></i>Mark Upcoming</a></li>
                    <li><a class="dropdown-item trip-status-action" href="#" data-index="${index}" data-status="completed" style="color:rgba(255,255,255,0.85);"><i class="bi bi-check-circle me-2"></i>Mark Completed</a></li>
                    <li><a class="dropdown-item trip-status-action" href="#" data-index="${index}" data-status="cancelled" style="color:rgba(255,255,255,0.85);"><i class="bi bi-x-circle me-2"></i>Mark Cancelled</a></li>
                    <li><hr class="dropdown-divider" style="border-color:rgba(255,255,255,0.1);"></li>
                    <li><a class="dropdown-item btn-remove-trip-action" href="#" data-index="${index}" style="color:var(--coral-500);"><i class="bi bi-trash me-2"></i>Remove Trip</a></li>
                  </ul>
                </div>
              </div>
            </div>
            <div class="trip-meta">
              <span><i class="bi bi-people"></i> ${trip.travelers} traveler${trip.travelers > 1 ? 's' : ''}</span>
              <span><i class="bi bi-cash-coin"></i> ₹${Number(trip.totalCost).toLocaleString('en-IN')}</span>
              <span class="status-badge ${statusClass}">${statusText}</span>
            </div>
            ${trip.notes ? `<div style="font-size:0.8rem;color:rgba(255,255,255,0.6);margin-top:0.4rem;"><i class="bi bi-pencil"></i> ${trip.notes}</div>` : ''}
          </div>
        `;
      });

      tripsList.innerHTML = html;

      // Status change actions
      document.querySelectorAll('.trip-status-action').forEach(action => {
        action.addEventListener('click', function(e) {
          e.preventDefault();
          const index = parseInt(this.dataset.index);
          const newStatus = this.dataset.status;
          updateTripStatus(index, newStatus);
        });
      });

      // Remove trip actions
      document.querySelectorAll('.btn-remove-trip-action').forEach(btn => {
        btn.addEventListener('click', function(e) {
          e.preventDefault();
          const index = parseInt(this.dataset.index);
          removeTrip(index);
        });
      });

    } catch (e) {
      console.error('Error loading trips:', e);
    }
  }

  // ============================================================
  // REMOVE TRIP
  // ============================================================
  function removeTrip(index) {
    const session = getSessionUser();
    if (!session || !session.email) return;

    if (confirm('Are you sure you want to remove this trip?')) {
      try {
        const allTrips = JSON.parse(localStorage.getItem('wayfarerTrips') || '{}');
        if (allTrips[session.email]) {
          allTrips[session.email].splice(index, 1);
          localStorage.setItem('wayfarerTrips', JSON.stringify(allTrips));
          
          // Refresh the list
          loadSavedTrips();
          
          // Refresh profile stats
          if (window.refreshProfileStats) {
            setTimeout(window.refreshProfileStats, 100);
          }
          
          showToast('Trip removed successfully');
        }
      } catch (e) {
        console.error('Error removing trip:', e);
        showToast('Error removing trip');
      }
    }
  }

  // ============================================================
  // DESTINATION DATA
  // ============================================================
  function getDestinations() {
    try {
      const data = localStorage.getItem('wayfarerDestinations');
      if (data) return JSON.parse(data);
    } catch (e) {}
    return [];
  }

  function getDestinationCost(destinationName) {
    const destinations = getDestinations();
    const found = destinations.find(d => 
      d.name.toLowerCase() === destinationName.toLowerCase() ||
      d.city?.toLowerCase() === destinationName.toLowerCase()
    );
    return found ? found.costPerPerson || found.price || 5000 : 5000;
  }

  // ============================================================
  // POPULATE DESTINATION DROPDOWN
  // ============================================================
  function populateDestinations() {
    const select = document.getElementById('tripDestination');
    const destinations = getDestinations();
    
    if (destinations.length === 0) {
      // Default destinations if none in localStorage
      const defaultDestinations = [
        { name: 'Paris, France', costPerPerson: 25000 },
        { name: 'Tokyo, Japan', costPerPerson: 30000 },
        { name: 'New York, USA', costPerPerson: 28000 },
        { name: 'Bali, Indonesia', costPerPerson: 15000 },
        { name: 'Rome, Italy', costPerPerson: 22000 },
        { name: 'Dubai, UAE', costPerPerson: 20000 },
        { name: 'Singapore', costPerPerson: 18000 },
        { name: 'Bangkok, Thailand', costPerPerson: 12000 }
      ];
      localStorage.setItem('wayfarerDestinations', JSON.stringify(defaultDestinations));
      
      let options = '<option value="" selected disabled>Select a destination</option>';
      defaultDestinations.forEach(d => {
        options += `<option value="${d.name}">${d.name}</option>`;
      });
      select.innerHTML = options;
      return;
    }

    let options = '<option value="" selected disabled>Select a destination</option>';
    destinations.forEach(d => {
      const name = d.name || d.city || 'Unknown';
      options += `<option value="${name}">${name}</option>`;
    });
    select.innerHTML = options;
  }

  // ============================================================
  // UPDATE COST PREVIEW
  // ============================================================
  function updateCostPreview() {
    const destination = document.getElementById('tripDestination');
    const travelers = document.getElementById('tripTravelers');
    const startDate = document.getElementById('tripStartDate');
    const endDate = document.getElementById('tripEndDate');
    const costDisplay = document.getElementById('costPreviewValue');

    if (!destination.value || !startDate.value || !endDate.value) {
      costDisplay.textContent = '₹0';
      return;
    }

    try {
      const destinationName = destination.options[destination.selectedIndex].text;
      const baseCost = getDestinationCost(destinationName);
      const travelerCount = parseInt(travelers.value) || 1;
      
      const start = new Date(startDate.value);
      const end = new Date(endDate.value);
      const days = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) || 1;
      
      const totalCost = baseCost * travelerCount * days;
      costDisplay.textContent = '₹' + totalCost.toLocaleString('en-IN');
    } catch (e) {
      costDisplay.textContent = '₹0';
    }
  }

  // ============================================================
  // HANDLE TRIP FORM SUBMISSION
  // ============================================================
  document.getElementById('tripPlanForm').addEventListener('submit', function(e) {
    e.preventDefault();
    
    const session = getSessionUser();
    if (!session || !session.email) {
      showToast('Please sign in to save trips');
      return;
    }

    // Validate form
    const destination = document.getElementById('tripDestination');
    const travelers = document.getElementById('tripTravelers');
    const startDate = document.getElementById('tripStartDate');
    const endDate = document.getElementById('tripEndDate');
    const notes = document.getElementById('tripNotes');

    // Reset validation
    [destination, travelers, startDate, endDate].forEach(el => {
      el.classList.remove('is-invalid');
    });

    let isValid = true;

    if (!destination.value) {
      destination.classList.add('is-invalid');
      isValid = false;
    }

    const travelerCount = parseInt(travelers.value);
    if (!travelerCount || travelerCount < 1 || travelerCount > 10) {
      travelers.classList.add('is-invalid');
      isValid = false;
    }

    const start = new Date(startDate.value);
    const end = new Date(endDate.value);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (!startDate.value || start < today) {
      startDate.classList.add('is-invalid');
      isValid = false;
    }

    if (!endDate.value || end < start) {
      endDate.classList.add('is-invalid');
      isValid = false;
    }

    if (!isValid) return;

    // Calculate cost
    const destinationName = destination.options[destination.selectedIndex].text;
    const baseCost = getDestinationCost(destinationName);
    const days = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) || 1;
    const totalCost = baseCost * travelerCount * days;

    // Build trip object
    const trip = {
      id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
      destination: destinationName,
      travelers: travelerCount,
      startDate: startDate.value,
      endDate: endDate.value,
      notes: notes.value || '',
      totalCost: totalCost,
      createdAt: new Date().toISOString(),
      status: 'upcoming' // Default status
    };

    // Save trip
    if (saveTripToStorage(trip)) {
      showToast('Trip saved successfully! 🎉');
      loadSavedTrips(); // Refresh the trips list
      this.reset(); // Reset form
      updateCostPreview(); // Reset cost preview
      
      // Refresh profile stats if available
      if (window.refreshProfileStats) {
        setTimeout(window.refreshProfileStats, 100);
      }
    } else {
      showToast('Failed to save trip. Please try again.');
    }
  });

  // ============================================================
  // EVENT LISTENERS FOR COST PREVIEW
  // ============================================================
  document.getElementById('tripDestination').addEventListener('change', updateCostPreview);
  document.getElementById('tripTravelers').addEventListener('input', updateCostPreview);
  document.getElementById('tripStartDate').addEventListener('change', updateCostPreview);
  document.getElementById('tripEndDate').addEventListener('change', updateCostPreview);

  // ============================================================
  // TOAST HELPER
  // ============================================================
  function showToast(message) {
    const toastMsg = document.getElementById('toastMessage');
    const toastEl = document.getElementById('actionToast');
    if (!toastMsg || !toastEl) return;
    toastMsg.textContent = message;
    new bootstrap.Toast(toastEl, { delay: 2500 }).show();
  }

  // ============================================================
  // INITIALIZATION
  // ============================================================
  const session = getSessionUser();
  const authRequired = document.getElementById('authRequired');
  const tripPlannerContent = document.getElementById('tripPlannerContent');
  const authButtons = document.getElementById('authButtons');
  const userProfile = document.getElementById('userProfile');
  const userNameDisplay = document.getElementById('userNameDisplay');

  // Update navbar based on auth state
  function updateNavbar() {
    const session = getSessionUser();
    if (session && session.name) {
      if (authButtons) authButtons.style.display = 'none';
      if (userProfile) {
        userProfile.style.display = '';
        if (userNameDisplay) userNameDisplay.textContent = session.name;
      }
    } else {
      if (authButtons) authButtons.style.display = '';
      if (userProfile) userProfile.style.display = 'none';
    }
  }

  // Check authentication
  if (session && session.name) {
    // User is signed in - show trip planner content
    if (authRequired) authRequired.style.display = 'none';
    if (tripPlannerContent) tripPlannerContent.style.display = 'block';
    updateNavbar();
    
    // Initialize trip planner
    populateDestinations();
    loadSavedTrips();
    updateCostPreview();
  } else {
    // User is not signed in - show auth required message
    if (authRequired) authRequired.style.display = 'block';
    if (tripPlannerContent) tripPlannerContent.style.display = 'none';
    updateNavbar();
  }

  // Logout handler
  document.getElementById('logoutBtn')?.addEventListener('click', function(e) {
    e.preventDefault();
    sessionStorage.removeItem('wayfarerSession');
    showToast('You have been signed out');
    setTimeout(() => {
      window.location.href = 'index.html';
    }, 500);
  });

  // Apply logged in state on page load
  updateNavbar();

  // Collapse mobile menu
  document.querySelectorAll('#navMenu .nav-link').forEach(link => {
    link.addEventListener('click', function() {
      const menu = document.getElementById('navMenu');
      if (menu.classList.contains('show')) {
        bootstrap.Collapse.getOrCreateInstance(menu).hide();
      }
    });
  });

})();
