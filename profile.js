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
      // 2. CHECK AUTHENTICATION
      // ============================================================
      const session = getSessionUser();
      const profileContent = document.getElementById('profileContent');
      const authRequired = document.getElementById('authRequired');

      if (!session || !session.email) {
        // Not authenticated - show login prompt
        profileContent.style.display = 'none';
        authRequired.classList.add('show');
        // Still update navbar with "Guest"
        document.getElementById('userNameDisplay').textContent = 'Guest';
        return; // Stop execution - user needs to login
      }

      // User is authenticated - show profile
      profileContent.style.display = 'block';
      authRequired.classList.remove('show');

      // ============================================================
      // 3. LOAD USER DATA
      // ============================================================
      const userEmail = session.email;
      const userName = session.name || 'User';

      // Load profile data or create default
      let profile = getUserProfile(userEmail);
      if (!profile) {
        profile = {
          name: userName,
          email: userEmail,
          phone: '',
          address: '',
          dob: '',
          stats: {
            total: 12,
            upcoming: 3,
            completed: 7,
            cancelled: 2,
            spent: 245000
          }
        };
        saveUserProfile(userEmail, profile);
      }

      // ============================================================
      // 4. POPULATE UI
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
      // 5. LOGOUT 
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
      // 6. EDIT PROFILE
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

        // Update profile
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
      // 7. CHANGE PASSWORD
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

        // In a real app, you'd verify the current password against the stored hash
        // For demo, we just show success
        showToast('Password changed successfully!');
        pwdModal.hide();
        this.reset();
      });

      // ============================================================
      // 8. TOAST HELPER
      // ============================================================
      function showToast(message) {
        const toastMsg = document.getElementById('toastMessage');
        const toastEl = document.getElementById('actionToast');
        if (!toastMsg || !toastEl) return;
        toastMsg.textContent = message;
        new bootstrap.Toast(toastEl, { delay: 2500 }).show();
      }

      // ============================================================
      // 9. CHARTS
      // ============================================================
      function initCharts() {
        const s = profile.stats || { total: 12, upcoming: 3, completed: 7, cancelled: 2, spent: 245000 };

        // Status pie chart
        const ctx1 = document.getElementById('statusChart').getContext('2d');
        new Chart(ctx1, {
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

        // Monthly spending bar chart (mock data)
        const ctx2 = document.getElementById('spendingChart').getContext('2d');
        new Chart(ctx2, {
          type: 'bar',
          data: {
            labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
            datasets: [{
              label: 'Spent (₹)',
              data: [12000, 28000, 15000, 42000, 31000, 26000],
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

      initCharts();

      // ============================================================
      // 10. NAVBAR ACTIVE LINK
      // ============================================================
      document.querySelectorAll('.navbar-wayfarer .nav-link').forEach(link => {
        if (link.getAttribute('href') === 'profile.html') {
          link.classList.add('active');
        }
      });

      // ============================================================
      // 11. COLLAPSE MOBILE MENU
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