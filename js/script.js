let destinations = [];

/* ---------------- WISHLIST HELPERS (shared with wishlist.js) ---------------- */
const WISHLIST_KEY = 'wayfarer_wishlist';
const WISHLIST_HISTORY_KEY = 'wayfarer_wishlist_history';
const HISTORY_LIMIT = 30;

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

function logWishlistHistory(id, name, action) {
  let history = [];
  try {
    history = JSON.parse(localStorage.getItem(WISHLIST_HISTORY_KEY)) || [];
  } catch (e) {
    history = [];
  }
  history.unshift({ id, name, action, timestamp: new Date().toISOString() });
  localStorage.setItem(WISHLIST_HISTORY_KEY, JSON.stringify(history.slice(0, HISTORY_LIMIT)));
}

function isInWishlist(id) {
  return getWishlistIds().includes(id);
}

// Returns true if the destination was just added, false if it was just removed
function toggleWishlist(id, name) {
  let ids = getWishlistIds();
  const exists = ids.includes(id);
  if (exists) {
    ids = ids.filter(x => x !== id);
    logWishlistHistory(id, name, 'removed');
  } else {
    ids.push(id);
    logWishlistHistory(id, name, 'added');
  }
  saveWishlistIds(ids);
  return !exists;
}

function updateWishlistNavBadge() {
  const badge = document.getElementById('wishlistNavBadge');
  if (!badge) return;
  const count = getWishlistIds().length;
  if (count > 0) {
    badge.textContent = count;
    badge.style.display = 'inline-block';
  } else {
    badge.style.display = 'none';
  }
}

/* ---------------- 1. LOAD DESTINATION DATA ---------------- */
async function loadDestinations() {
  try {
    const res = await fetch('destinations.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    destinations = await res.json();
    console.log('Destinations loaded:', destinations.length);
    return destinations;
  } catch (err) {
    console.error('Failed to load destinations.json:', err);
    destinations = [];
    const grid = document.getElementById('destinationGrid');
    if (grid) {
      grid.innerHTML = `
        <div class="col-12 text-center py-5">
          <i class="bi bi-exclamation-triangle" style="font-size:2rem; color:var(--coral-500);"></i>
          <p class="mt-3 text-muted">Could not load destinations right now. Please refresh the page.</p>
        </div>`;
    }
    return destinations;
  }
}

/* ---------------- 2. UTILITIES ---------------- */
function formatINR(amount) {
  return '₹' + amount.toLocaleString('en-IN');
}

function showToast(message) {
  const toastMsg = document.getElementById('toastMessage');
  const toastEl = document.getElementById('actionToast');
  if (!toastMsg || !toastEl) return;
  toastMsg.textContent = message;
  new bootstrap.Toast(toastEl, { delay: 2500 }).show();
}

function categoryIcon(cat) {
  const map = {
    beaches: 'bi-umbrella',
    mountains: 'bi-triangle',
    adventure: 'bi-compass',
    historical: 'bi-bank',
    wildlife: 'bi-tree'
  };
  return map[cat] || 'bi-geo';
}

function categoryLabel(cat) {
  const map = {
    beaches: 'Beaches',
    mountains: 'Mountains',
    adventure: 'Adventure',
    historical: 'Historical',
    wildlife: 'Wildlife'
  };
  return map[cat] || cat;
}

/* ---------------- 3. RENDER CARDS ---------------- */
function renderCards(list) {
  const grid = document.getElementById('destinationGrid');
  const noResults = document.getElementById('noResults');

  if (!grid) {
    console.error('Destination grid not found!');
    return;
  }

  grid.innerHTML = '';

  if (!list || list.length === 0) {
    if (noResults) noResults.classList.add('show');
    return;
  }

  if (noResults) noResults.classList.remove('show');

  list.forEach(d => {
    const saved = isInWishlist(d.id);
    const col = document.createElement('div');
    col.className = 'col-lg-4 col-md-6';
    col.innerHTML = `
      <div class="dest-card">
        <div class="dest-card-img-wrap">
          <img src="${d.image}" alt="${d.destinationName}, ${d.country}" loading="lazy">
          <span class="dest-card-category"><i class="bi ${categoryIcon(d.category)} me-1"></i>${categoryLabel(d.category)}</span>
          <span class="dest-card-price-tag"><span>From</span>${formatINR(d.price)}</span>
          <button class="wishlist-heart-btn${saved ? ' active' : ''}" data-id="${d.id}" data-name="${d.destinationName}" aria-label="${saved ? 'Remove from wishlist' : 'Add to wishlist'}" aria-pressed="${saved}">
            <i class="bi ${saved ? 'bi-heart-fill' : 'bi-heart'}"></i>
          </button>
        </div>
        <div class="dest-card-body">
          <div class="dest-card-country"><i class="bi bi-geo-alt-fill"></i>${d.country}</div>
          <h3 class="dest-card-title">${d.destinationName}</h3>
          <div class="dest-card-rating"><i class="bi bi-star-fill"></i>${d.rating.toFixed(1)} <span class="text-muted fw-normal" style="font-size:.8rem;">/ 5</span></div>
          <p class="dest-card-desc">${d.description}</p>
          <button class="btn-view-details" data-id="${d.id}"><i class="bi bi-eye me-2"></i>View Details</button>
        </div>
      </div>
    `;
    grid.appendChild(col);
  });

  console.log('Rendered', list.length, 'cards');
}

/* ---------------- 4. RENDER BANNER ---------------- */
function renderBanner(list) {
  const bannerImg = document.querySelector('.dest-banner img');
  const bannerTitle = document.querySelector('.dest-banner-title');
  const bannerSub = document.querySelector('.dest-banner-sub');
  if (!bannerImg || !bannerTitle || !bannerSub || !list || list.length === 0) return;

  const featured = list.reduce((best, d) => (d.rating > best.rating ? d : best), list[0]);

  bannerImg.src = featured.image;
  bannerImg.alt = `${featured.destinationName}, ${featured.country} — featured destination`;
  bannerTitle.textContent = `${featured.destinationName}, ${featured.country}`;
  bannerSub.textContent = featured.description;
}

/* ---------------- 5. SEARCH + FILTER ---------------- */
let activeCategory = null;

function applyFilters() {
  const country = document.getElementById('searchCountry').value.trim().toLowerCase();
  const city = document.getElementById('searchCity').value.trim().toLowerCase();
  const category = document.getElementById('searchCategory').value;
  const attraction = document.getElementById('searchAttraction').value.trim().toLowerCase();
  const budget = document.getElementById('budgetFilter').value;

  let filtered = destinations.filter(d => {
    const matchCountry = !country || d.country.toLowerCase().includes(country);
    const matchCity = !city || d.city.toLowerCase().includes(city);
    const matchCategorySelect = !category || d.category === category;
    const matchChip = !activeCategory || d.category === activeCategory;
    const matchAttraction = !attraction || d.attractions.some(a => a.toLowerCase().includes(attraction));

    let matchBudget = true;
    if (budget) {
      const [min, max] = budget.split('-').map(Number);
      matchBudget = d.price >= min && d.price <= max;
    }

    return matchCountry && matchCity && matchCategorySelect && matchChip && matchAttraction && matchBudget;
  });

  renderCards(filtered);
}

/* ---------------- 6. SETUP EVENT LISTENERS ---------------- */
document.addEventListener('DOMContentLoaded', function() {
  document.getElementById('searchBtn').addEventListener('click', applyFilters);
  document.getElementById('searchCategory').addEventListener('change', applyFilters);
  document.getElementById('budgetFilter').addEventListener('change', applyFilters);

  ['searchCountry', 'searchCity', 'searchAttraction'].forEach(id => {
    document.getElementById(id).addEventListener('keyup', (e) => {
      if (e.key === 'Enter') applyFilters();
    });
  });

  document.querySelectorAll('.filter-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const filterVal = chip.dataset.filter;
      if (activeCategory === filterVal) {
        activeCategory = null;
        chip.classList.remove('active');
      } else {
        document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
        activeCategory = filterVal;
        chip.classList.add('active');
      }
      applyFilters();
    });
  });

  document.getElementById('clearFiltersBtn').addEventListener('click', () => {
    document.getElementById('searchCountry').value = '';
    document.getElementById('searchCity').value = '';
    document.getElementById('searchCategory').value = '';
    document.getElementById('searchAttraction').value = '';
    document.getElementById('budgetFilter').value = '';
    activeCategory = null;
    document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
    renderCards(destinations);
  });

  // View details buttons (event delegation)
  document.getElementById('destinationGrid').addEventListener('click', (e) => {
    const detailsBtn = e.target.closest('.btn-view-details');
    if (detailsBtn) {
      openDetails(Number(detailsBtn.dataset.id));
      return;
    }

    // Wishlist heart toggle (event delegation)
    const heartBtn = e.target.closest('.wishlist-heart-btn');
    if (heartBtn) {
      const id = Number(heartBtn.dataset.id);
      const name = heartBtn.dataset.name;
      const justAdded = toggleWishlist(id, name);

      heartBtn.classList.toggle('active', justAdded);
      heartBtn.setAttribute('aria-pressed', String(justAdded));
      heartBtn.querySelector('i').className = justAdded ? 'bi bi-heart-fill' : 'bi bi-heart';
      heartBtn.setAttribute('aria-label', justAdded ? 'Remove from wishlist' : 'Add to wishlist');

      showToast(justAdded ? `${name} added to wishlist` : `${name} removed from wishlist`);
      updateWishlistNavBadge();
    }
  });

  updateWishlistNavBadge();
});

/* ---------------- 7. DETAILS MODAL ---------------- */
const detailsModalEl = document.getElementById('detailsModal');
const detailsModal = new bootstrap.Modal(detailsModalEl);
let currentModalDestId = null;

function openDetails(id) {
  const d = destinations.find(x => x.id === id);
  if (!d) return;
  currentModalDestId = id;

  document.getElementById('modalHeroImg').src = d.image;
  document.getElementById('modalHeroImg').alt = d.destinationName;
  document.getElementById('modalTitle').textContent = `${d.destinationName}`;
  document.getElementById('modalCountry').innerHTML = `<i class="bi bi-geo-alt-fill" style="color:var(--coral-500);"></i> ${d.city}, ${d.country}`;
  document.getElementById('modalDescription').textContent = d.fullDescription;
  document.getElementById('modalCost').textContent = formatINR(d.travelCost) + '+';
  document.getElementById('modalWeather').textContent = d.weatherInformation;
  document.getElementById('modalBestTime').textContent = d.bestTimeToVisit;
  document.getElementById('modalRating').textContent = d.rating.toFixed(1) + ' / 5';

  document.getElementById('modalAttractions').innerHTML = d.attractions.map(a =>
    `<span class="attraction-pill"><i class="bi bi-pin-map-fill"></i>${a}</span>`
  ).join('');

  document.getElementById('modalGallery').innerHTML = d.imageGallery.map(img =>
    `<div class="col-6 col-md-3"><img src="${img}" class="gallery-thumb" alt="${d.destinationName} gallery photo"></div>`
  ).join('');

  document.getElementById('modalMapWrap').innerHTML =
    `<iframe src="https://www.google.com/maps?q=${d.locationMap.lat},${d.locationMap.lng}&z=10&output=embed" loading="lazy" referrerpolicy="no-referrer-when-downgrade" title="Map of ${d.destinationName}"></iframe>`;

  document.getElementById('modalTips').innerHTML = d.travelTips.map(t =>
    `<div class="tip-item"><i class="bi bi-lightbulb-fill"></i><span>${t}</span></div>`
  ).join('');

  const firstTab = detailsModalEl.querySelector('.nav-link');
  bootstrap.Tab.getOrCreateInstance(firstTab).show();

  detailsModal.show();
}

/* ---------------- 8. LOAD DATA AND RENDER ---------------- */
loadDestinations().then(list => {
  if (list && list.length > 0) {
    renderBanner(list);
    renderCards(list);
    console.log('Destinations loaded and rendered successfully!');
  } else {
    console.warn('No destinations data available');
  }
});

/* ---------------- 9. NAVBAR SCROLL EFFECT ---------------- */
const mainNav = document.getElementById('mainNav');
if (mainNav) {
  window.addEventListener('scroll', () => {
    mainNav.classList.toggle('scrolled', window.scrollY > 60);
  });
}

/* ---------------- 10. NAVBAR ACTIVE LINK ---------------- */
const sections = document.querySelectorAll('section[id], header[id]');
const navLinks = document.querySelectorAll('.navbar-wayfarer .nav-link');

window.addEventListener('scroll', () => {
  let current = '';
  sections.forEach(sec => {
    const top = sec.offsetTop - 120;
    if (window.scrollY >= top) current = sec.id;
  });
  navLinks.forEach(link => {
    link.classList.toggle('active', link.getAttribute('href') === `#${current}`);
  });
});

document.querySelectorAll('#navMenu .nav-link').forEach(link => {
  link.addEventListener('click', () => {
    const menu = document.getElementById('navMenu');
    if (menu.classList.contains('show')) {
      bootstrap.Collapse.getOrCreateInstance(menu).hide();
    }
  });
});

/* ---------------- 11. LOGGED-IN USER STATE ---------------- */
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
    window.location.hash = '#home';
  });
}

/* ---------------- 12. CONTACT FORM ---------------- */
const contactForm = document.getElementById('contactForm');
const formSuccessAlert = document.getElementById('formSuccessAlert');

if (contactForm) {
  contactForm.addEventListener('submit', (e) => {
    e.preventDefault();
    e.stopPropagation();

    let valid = true;
    const fields = [
      { el: document.getElementById('contactName'), check: v => v.trim().length >= 2 },
      { el: document.getElementById('contactEmail'), check: v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()) },
      { el: document.getElementById('contactPhone'), check: v => /^[0-9+\-\s()]{7,15}$/.test(v.trim()) },
      { el: document.getElementById('contactSubject'), check: v => v.trim().length > 0 },
      { el: document.getElementById('contactMessage'), check: v => v.trim().length >= 10 }
    ];

    fields.forEach(f => {
      if (f.check(f.el.value)) {
        f.el.classList.remove('is-invalid');
        f.el.classList.add('is-valid');
      } else {
        f.el.classList.add('is-invalid');
        f.el.classList.remove('is-valid');
        valid = false;
      }
    });

    if (!valid) {
      formSuccessAlert.classList.remove('show');
      return;
    }

    formSuccessAlert.classList.add('show');
    contactForm.reset();
    fields.forEach(f => f.el.classList.remove('is-valid'));
    setTimeout(() => formSuccessAlert.classList.remove('show'), 5000);
  });

  contactForm.querySelectorAll('input, select, textarea').forEach(el => {
    el.addEventListener('input', () => el.classList.remove('is-invalid'));
  });
}
// Add to script.js
function updateNotificationBadge() {
  try {
    const notifications = JSON.parse(localStorage.getItem('wayfarer_notifications') || '[]');
    const badge = document.getElementById('unreadBadge');
    if (badge) {
      const count = notifications.length;
      if (count > 0) {
        badge.textContent = count;
        badge.style.display = 'inline-block';
      } else {
        badge.style.display = 'none';
      }
    }
  } catch (e) {}
}

// Call on page load and when storage changes
document.addEventListener('DOMContentLoaded', updateNotificationBadge);
window.addEventListener('storage', updateNotificationBadge);