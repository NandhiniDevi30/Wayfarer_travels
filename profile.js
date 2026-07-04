(function() {
  "use strict";

  // ============================================================
  // 1. SESSION MANAGEMENT 
  // ============================================================
  function getSessionUser() {
    try {
      const raw = sessionStorage.getItem('wayfarerSession');
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return null;
  }

  function setSessionUser(data) {
    sessionStorage.setItem('wayfarerSession', JSON.stringify(data));
  }

  // User profile data stored in localStorage (separate from auth)
  function getUserProfile(email) {
    try {
      const profiles = JSON.parse(localStorage.getItem('wayfarerProfiles') || '{}');
      return profiles[email] || null;
    } catch (e) {
      return null;
    }
  }

  function saveUserProfile(email, data) {
    try {
      const profiles = JSON.parse(localStorage.getItem('wayfarerProfiles') || '{}');
      profiles[email] = { ...profiles[email], ...data };
      localStorage.setItem('wayfarerProfiles', JSON.stringify(profiles));
    } catch (e) {}
  }

  // ============================================================
  // 2. TRIP DATA MANAGEMENT
  // ============================================================
  function getUserTrips(email) {
    try {
      const allTrips = JSON.parse(localStorage.getItem('wayfarerTrips') || '{}');
      return allTrips[email] || [];
    } catch (e) {
      return [];
    }
  }

  function saveUserTrip(email, trip) {
    try {
      const allTrips = JSON.parse(localStorage.getItem('wayfarerTrips') || '{}');
      if (!allTrips[email]) allTrips[email] = [];
      allTrips[email].push(trip);
      localStorage.setItem('wayfarerTrips', JSON.stringify(allTrips));
    } catch (e) {}
  }

  function updateUserTrips(email, trips) {
    try {
      const allTrips = JSON.parse(localStorage.getItem('wayfarerTrips') || '{}');
      allTrips[email] = trips;
      localStorage.setItem('wayfarerTrips', JSON.stringify(allTrips));
    } catch (e) {}
  }

  // ============================================================
  // 3. DESTINATION DATA (for cost calculations)
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
  // 4. CHECK AUTHENTICATION
  // ============================================================
  const session = getSessionUser();
  const profileContent = document.getElementById('profileContent');
  const authRequired = document.getElementById('authRequired');

  if (!session || !session.email) {
    // Not authenticated - show login prompt
    profileContent.style.display = 'none';
    authRequired.classList.add('show');
    document.getElementById('userNameDisplay').textContent = 'Guest';
    return;
  }

  // User is authenticated - show profile
  profileContent.style.display = 'block';
  authRequired.classList.remove('show');

  // ============================================================
  // 5. CALCULATE STATISTICS FROM TRIPS
  // ============================================================
  function calculateStatsFromTrips(trips) {
    const stats = {
      total: 0,
      upcoming: 0,
      completed: 0,
      cancelled: 0,
      spent: 0
    };

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    trips.forEach(trip => {
      stats.total++;

      // Determine trip status based on dates
      const startDate = new Date(trip.startDate);
      const endDate = new Date(trip.endDate);
      startDate.setHours(0, 0, 0, 0);
      endDate.setHours(0, 0, 0, 0);

      // If trip has explicit status, use it
      if (trip.status) {
        if (trip.status === 'cancelled') {
          stats.cancelled++;
        } else if (trip.status === 'completed' || endDate < today) {
          stats.completed++;
          stats.spent += trip.totalCost || 0;
        } else if (trip.status === 'upcoming' || startDate >= today) {
          stats.upcoming++;
        }
      } else {
        // Auto-determine status
        if (endDate < today) {
          stats.completed++;
          stats.spent += trip.totalCost || 0;
        } else if (startDate > today) {
          stats.upcoming++;
        } else {
          // Trip is currently ongoing - count as upcoming
          stats.upcoming++;
        }
      }
    });

    return stats;
  }

  // ============================================================
  // 6. LOAD USER DATA AND UPDATE STATS
  // ============================================================
  const userEmail = session.email;
  const userName = session.name || 'User';

  // Get all trips for this user
  let userTrips = getUserTrips(userEmail);
  
  // Calculate stats from trips
  const calculatedStats = calculateStatsFromTrips(userTrips);

  // Load profile data
  let profile = getUserProfile(userEmail);
  if (!profile) {
    profile = {
      name: userName,
      email: userEmail,
      phone: '',
      address: '',
      dob: '',
      stats: calculatedStats
    };
    saveUserProfile(userEmail, profile);
  } else {
    // Update profile stats with calculated values
    profile.stats = calculatedStats;
    saveUserProfile(userEmail, profile);
  }

  // ============================================================
  // 7. POPULATE UI
  // ============================================================
  function populateProfile(p) {
    document.getElementById('profileFullName').textContent = p.name || 'User';
    document.getElementById('profileEmail').textContent = p.email || userEmail;
    document.getElementById('profilePhone').textContent = p.phone || 'Not set';
    document.getElementById('profileAddress').textContent = p.address || 'Not set';
    document.getElementById('profileDob').textContent = p.dob || 'Not set';

    // Update navbar
    document.getElementById('userNameDisplay').textContent = p.name || 'User';

    // Profile photo
    const photo = document.getElementById('profilePhoto');
    if (photo && p.name) {
      photo.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(p.name)}&background=e8714a&color=fff&size=120`;
    }

    // Stats
    const s = p.stats || {};
    document.getElementById('totalTrips').textContent = s.total || 0;
    document.getElementById('upcomingTrips').textContent = s.upcoming || 0;
    document.getElementById('completedTrips').textContent = s.completed || 0;
    document.getElementById('cancelledTrips').textContent = s.cancelled || 0;
    document.getElementById('totalSpent').textContent = s.spent ? '₹' + Number(s.spent).toLocaleString('en-IN') : '₹0';
  }

  populateProfile(profile);

  // ============================================================
  // 8. LOGOUT 
  // ============================================================
  document.getElementById('logoutBtn').addEventListener('click', function(e) {
    e.preventDefault();
    sessionStorage.removeItem('wayfarerSession');
    showToast('You have been signed out');
    setTimeout(() => {
      window.location.href = 'index.html';
    }, 500);
  });

  // ============================================================
  // 9. EDIT PROFILE
  // ============================================================
  const editModal = new bootstrap.Modal(document.getElementById('editProfileModal'));

  document.getElementById('editProfileBtn').addEventListener('click', function() {
    const form = document.getElementById('editProfileForm');
    document.getElementById('editName').value = profile.name || '';
    document.getElementById('editEmail').value = profile.email || '';
    document.getElementById('editPhone').value = profile.phone || '';
    document.getElementById('editAddress').value = profile.address || '';
    document.getElementById('editDob').value = profile.dob || '';
    form.classList.remove('was-validated');
    editModal.show();
  });

  document.getElementById('editProfileForm').addEventListener('submit', function(e) {
    e.preventDefault();
    const form = this;
    const name = document.getElementById('editName');
    const email = document.getElementById('editEmail');
    const phone = document.getElementById('editPhone');
    const address = document.getElementById('editAddress');
    const dob = document.getElementById('editDob');

    let valid = true;

    // Validate name
    if (!name.value || name.value.trim().length < 3) {
      name.classList.add('is-invalid');
      valid = false;
    } else {
      name.classList.remove('is-invalid');
    }

    // Validate email
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email.value || !emailPattern.test(email.value.trim())) {
      email.classList.add('is-invalid');
      valid = false;
    } else {
      email.classList.remove('is-invalid');
    }

    // Validate phone (exactly 10 digits)
    const phoneClean = phone.value.replace(/\D/g, '');
    if (phoneClean.length !== 10) {
      phone.classList.add('is-invalid');
      valid = false;
    } else {
      phone.classList.remove('is-invalid');
    }

    if (!valid) return;

    // Update profile (keep existing stats)
    const updatedProfile = {
      name: name.value.trim(),
      email: email.value.trim(),
      phone: phoneClean,
      address: address.value.trim() || 'Not set',
      dob: dob.value || 'Not set',
      stats: profile.stats || {}
    };

    saveUserProfile(updatedProfile.email, updatedProfile);
    profile = updatedProfile;
    populateProfile(profile);

    // Update session name if changed
    if (session) {
      session.name = updatedProfile.name;
      setSessionUser(session);
    }

    editModal.hide();
    showToast('Profile updated successfully!');
  });

  // ============================================================
  // 10. CHANGE PASSWORD
  // ============================================================
  const pwdModal = new bootstrap.Modal(document.getElementById('changePasswordModal'));

  document.getElementById('changePasswordBtn').addEventListener('click', function() {
    document.getElementById('changePasswordForm').reset();
    document.getElementById('changePasswordForm').classList.remove('was-validated');
    pwdModal.show();
  });

  document.getElementById('changePasswordForm').addEventListener('submit', function(e) {
    e.preventDefault();
    const current = document.getElementById('currentPwd');
    const newPwd = document.getElementById('newPwd');
    const confirmPwd = document.getElementById('confirmPwd');

    let valid = true;

    if (!current.value || current.value.length < 6) {
      current.classList.add('is-invalid');
      valid = false;
    } else {
      current.classList.remove('is-invalid');
    }

    if (!newPwd.value || newPwd.value.length < 6) {
      newPwd.classList.add('is-invalid');
      valid = false;
    } else {
      newPwd.classList.remove('is-invalid');
    }

    if (newPwd.value !== confirmPwd.value || confirmPwd.value.length < 6) {
      confirmPwd.classList.add('is-invalid');
      valid = false;
    } else {
      confirmPwd.classList.remove('is-invalid');
    }

    if (!valid) return;

    showToast('Password changed successfully!');
    pwdModal.hide();
    this.reset();
  });

  // ============================================================
  // 11. TOAST HELPER
  // ============================================================
  function showToast(message) {
    const toastMsg = document.getElementById('toastMessage');
    const toastEl = document.getElementById('actionToast');
    if (!toastMsg || !toastEl) return;
    toastMsg.textContent = message;
    new bootstrap.Toast(toastEl, { delay: 2500 }).show();
  }

  // ============================================================
  // 12. CHARTS
  // ============================================================
  let statusChartInstance = null;
  let spendingChartInstance = null;

  function initCharts() {
    const s = profile.stats || { total: 12, upcoming: 3, completed: 7, cancelled: 2, spent: 245000 };

    // Status pie chart
    const ctx1 = document.getElementById('statusChart').getContext('2d');
    
    // Destroy existing chart if it exists
    if (statusChartInstance) {
      statusChartInstance.destroy();
    }
    
    statusChartInstance = new Chart(ctx1, {
      type: 'doughnut',
      data: {
        labels: ['Upcoming', 'Completed', 'Cancelled'],
        datasets: [{
          data: [s.upcoming || 0, s.completed || 0, s.cancelled || 0],
          backgroundColor: ['#e8714a', '#1a625a', '#8a9591'],
          borderWidth: 0,
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { position: 'bottom', labels: { boxWidth: 12 } }
        },
        cutout: '70%'
      }
    });

    // Monthly spending bar chart (generate from actual trip data)
    const monthlySpending = generateMonthlySpending(userTrips);
    
    const ctx2 = document.getElementById('spendingChart').getContext('2d');
    
    if (spendingChartInstance) {
      spendingChartInstance.destroy();
    }
    
    spendingChartInstance = new Chart(ctx2, {
      type: 'bar',
      data: {
        labels: monthlySpending.labels,
        datasets: [{
          label: 'Spent (₹)',
          data: monthlySpending.data,
          backgroundColor: 'rgba(232,113,74,0.7)',
          borderRadius: 6,
        }]
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: {
          y: {
            beginAtZero: true,
            grid: { color: 'rgba(0,0,0,0.04)' }
          }
        }
      }
    });
  }

  // ============================================================
  // 13. GENERATE MONTHLY SPENDING FROM TRIPS
  // ============================================================
  function generateMonthlySpending(trips) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthlyData = {};
    
    // Initialize all months with 0
    months.forEach(month => {
      monthlyData[month] = 0;
    });

    // Get current year
    const currentYear = new Date().getFullYear();

    trips.forEach(trip => {
      if (trip.status === 'cancelled') return; // Skip cancelled trips
      
      const startDate = new Date(trip.startDate);
      const endDate = new Date(trip.endDate);
      
      // Only count trips from current year
      if (startDate.getFullYear() === currentYear || endDate.getFullYear() === currentYear) {
        const monthIndex = startDate.getMonth();
        const monthName = months[monthIndex];
        monthlyData[monthName] = (monthlyData[monthName] || 0) + (trip.totalCost || 0);
      }
    });

    // Get last 6 months
    const today = new Date();
    const last6Months = [];
    const last6Data = [];
    
    for (let i = 5; i >= 0; i--) {
      const monthIndex = (today.getMonth() - i + 12) % 12;
      const monthName = months[monthIndex];
      last6Months.push(monthName);
      last6Data.push(monthlyData[monthName] || 0);
    }

    return {
      labels: last6Months,
      data: last6Data
    };
  }

  // ============================================================
  // 14. REFRESH STATS (call when trips are updated)
  // ============================================================
  function refreshProfileStats() {
    // Get latest trips
    const freshTrips = getUserTrips(userEmail);
    const freshStats = calculateStatsFromTrips(freshTrips);
    
    // Update profile stats
    profile.stats = freshStats;
    saveUserProfile(userEmail, profile);
    
    // Re-populate UI
    populateProfile(profile);
    
    // Re-initialize charts
    initCharts();
  }

  // Expose refresh function globally so trip-planner can call it
  window.refreshProfileStats = refreshProfileStats;

  // ============================================================
  // 15. INITIALIZE
  // ============================================================
  initCharts();

  // ============================================================
  // 16. NAVBAR ACTIVE LINK
  // ============================================================
  document.querySelectorAll('.navbar-wayfarer .nav-link').forEach(link => {
    if (link.getAttribute('href') === 'profile.html') {
      link.classList.add('active');
    }
  });

  // ============================================================
  // 17. COLLAPSE MOBILE MENU
  // ============================================================
  document.querySelectorAll('#navMenu .nav-link').forEach(link => {
    link.addEventListener('click', function() {
      const menu = document.getElementById('navMenu');
      if (menu.classList.contains('show')) {
        bootstrap.Collapse.getOrCreateInstance(menu).hide();
      }
    });
  });

})();