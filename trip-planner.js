// ============================================================
// AUTHENTICATION CHECK FOR TRIP PLANNER PAGE
// ============================================================
(function() {
  "use strict";

  // Get session from sessionStorage (same as authentication.html)
  function getSessionUser() {
    try {
      const raw = sessionStorage.getItem('wayfarerSession');
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return null;
  }

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

  // Toast helper for logout
  function showToast(message) {
    const toastMsg = document.getElementById('toastMessage');
    const toastEl = document.getElementById('actionToast');
    if (!toastMsg || !toastEl) return;
    toastMsg.textContent = message;
    new bootstrap.Toast(toastEl, { delay: 2500 }).show();
  }

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

