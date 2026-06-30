
let destinations = [];   // populated by loadDestinations()

/* ---------------- 1. LOAD DESTINATION DATA ---------------- */
async function loadDestinations(){
  try{
    const res = await fetch('destinations.json');
    if(!res.ok) throw new Error(`HTTP ${res.status}`);
    destinations = await res.json();
  }catch(err){
    console.error('Failed to load destinations.json:', err);
    destinations = [];
    const grid = document.getElementById('destinationGrid');
    if(grid){
      grid.innerHTML = `
        <div class="col-12 text-center py-5">
          <i class="bi bi-exclamation-triangle" style="font-size:2rem; color:var(--coral-500);"></i>
          <p class="mt-3 text-muted">Could not load destinations right now. Please refresh the page.</p>
        </div>`;
    }
  }
  return destinations;
}

/* ---------------- 2. UTILITIES ---------------- */
function formatINR(amount){
  return '₹' + amount.toLocaleString('en-IN');
}
function showToast(message){
  const toastMsg = document.getElementById('toastMessage');
  const toastEl = document.getElementById('actionToast');
  if(!toastMsg || !toastEl) return;
  toastMsg.textContent = message;
  new bootstrap.Toast(toastEl, { delay: 2500 }).show();
}
function categoryIcon(cat){
  const map = {beaches:'bi-umbrella', mountains:'bi-triangle', adventure:'bi-compass', historical:'bi-bank', wildlife:'bi-tree'};
  return map[cat] || 'bi-geo';
}
function categoryLabel(cat){
  const map = {beaches:'Beaches', mountains:'Mountains', adventure:'Adventure', historical:'Historical', wildlife:'Wildlife'};
  return map[cat] || cat;
}


const grid = document.getElementById('destinationGrid');
const noResults = document.getElementById('noResults');

if(grid){

/* ---------------- 3. DESTINATION BANNER (FEATURED) ---------------- */
function renderBanner(list){
  const bannerImg = document.querySelector('.dest-banner img');
  const bannerTitle = document.querySelector('.dest-banner-title');
  const bannerSub = document.querySelector('.dest-banner-sub');
  if(!bannerImg || !bannerTitle || !bannerSub || list.length === 0) return;

  const featured = list.reduce((best, d) => (d.rating > best.rating ? d : best), list[0]);

  bannerImg.src = featured.image;
  bannerImg.alt = `${featured.destinationName}, ${featured.country} — featured destination`;
  bannerTitle.textContent = `${featured.destinationName}, ${featured.country}`;
  bannerSub.textContent = featured.description;
}

/* ---------------- 4. RENDER DESTINATION CARDS ---------------- */
function renderCards(list){
  grid.innerHTML = '';
  if(list.length === 0){
    noResults.classList.add('show');
    return;
  }
  noResults.classList.remove('show');

  list.forEach(d => {
    const col = document.createElement('div');
    col.className = 'col-lg-4 col-md-6';
    col.innerHTML = `
      <div class="dest-card">
        <div class="dest-card-img-wrap">
          <img src="${d.image}" alt="${d.destinationName}, ${d.country}" loading="lazy">
          <span class="dest-card-category"><i class="bi ${categoryIcon(d.category)} me-1"></i>${categoryLabel(d.category)}</span>
          <span class="dest-card-price-tag"><span>From</span>${formatINR(d.price)}</span>
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
}

/* Populate trip planner destination dropdown once */
function populateTripDropdown(list){
  const select = document.getElementById('tripDestination');
  if(!select) return;
  list.forEach(d => {
    const opt = document.createElement('option');
    opt.value = d.id;
    opt.textContent = `${d.destinationName}, ${d.country}`;
    select.appendChild(opt);
  });
}

/* ---------------- 5. SEARCH + FILTER LOGIC ---------------- */
let activeCategory = null; // single-select category chip

function applyFilters(){
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
    if(budget){
      const [min, max] = budget.split('-').map(Number);
      matchBudget = d.price >= min && d.price <= max;
    }

    return matchCountry && matchCity && matchCategorySelect && matchChip && matchAttraction && matchBudget;
  });

  renderCards(filtered);
}

document.getElementById('searchBtn').addEventListener('click', applyFilters);
document.getElementById('searchCategory').addEventListener('change', applyFilters);
document.getElementById('budgetFilter').addEventListener('change', applyFilters);

// Live search on text inputs (Enter key triggers search)
['searchCountry','searchCity','searchAttraction'].forEach(id => {
  document.getElementById(id).addEventListener('keyup', (e) => {
    if(e.key === 'Enter') applyFilters();
  });
});

// Filter chips (toggle single-select)
document.querySelectorAll('.filter-chip').forEach(chip => {
  chip.addEventListener('click', () => {
    const filterVal = chip.dataset.filter;
    if(activeCategory === filterVal){
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

/* ---------------- 6. DESTINATION DETAILS MODAL ---------------- */
const detailsModalEl = document.getElementById('detailsModal');
const detailsModal = new bootstrap.Modal(detailsModalEl);
let currentModalDestId = null;

grid.addEventListener('click', (e) => {
  const btn = e.target.closest('.btn-view-details');
  if(!btn) return;
  const id = Number(btn.dataset.id);
  openDetails(id);
});

function openDetails(id){
  const d = destinations.find(x => x.id === id);
  if(!d) return;
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

  // Attractions
  document.getElementById('modalAttractions').innerHTML = d.attractions.map(a =>
    `<span class="attraction-pill"><i class="bi bi-pin-map-fill"></i>${a}</span>`
  ).join('');

  // Gallery
  document.getElementById('modalGallery').innerHTML = d.imageGallery.map(img =>
    `<div class="col-6 col-md-3"><img src="${img}" class="gallery-thumb" alt="${d.destinationName} gallery photo"></div>`
  ).join('');

  // Map
  document.getElementById('modalMapWrap').innerHTML =
    `<iframe src="https://www.google.com/maps?q=${d.locationMap.lat},${d.locationMap.lng}&z=10&output=embed" loading="lazy" referrerpolicy="no-referrer-when-downgrade" title="Map of ${d.destinationName}"></iframe>`;

  // Tips
  document.getElementById('modalTips').innerHTML = d.travelTips.map(t =>
    `<div class="tip-item"><i class="bi bi-lightbulb-fill"></i><span>${t}</span></div>`
  ).join('');

  // Reset to first tab
  const firstTab = detailsModalEl.querySelector('.nav-link');
  bootstrap.Tab.getOrCreateInstance(firstTab).show();

  detailsModal.show();
}

document.getElementById('addToTripBtn').addEventListener('click', () => {
  if(currentModalDestId === null) return;
  const d = destinations.find(x => x.id === currentModalDestId);
  addTrip({
    destinationId: d.id,
    name: d.destinationName,
    country: d.country,
    travelers: 2,
    startDate: '',
    endDate: '',
    notes: 'Bookmarked from destination details'
  });
  showToast(`${d.destinationName} added to My Trips`);
});

/* ---------------- 7. TRIP PLANNER (My Trips) ---------------- */
let myTrips = [];
let tripIdCounter = 1;

function addTrip(trip){
  trip.tripId = tripIdCounter++;
  myTrips.push(trip);
  renderTrips();
}

function removeTrip(tripId){
  myTrips = myTrips.filter(t => t.tripId !== tripId);
  renderTrips();
}

function renderTrips(){
  const list = document.getElementById('myTripsList');
  const emptyMsg = document.getElementById('emptyTripsMsg');

  if(myTrips.length === 0){
    list.innerHTML = '';
    list.appendChild(emptyMsg);
    return;
  }

  list.innerHTML = myTrips.map(t => {
    const dateRange = (t.startDate && t.endDate)
      ? `${formatDateShort(t.startDate)} – ${formatDateShort(t.endDate)}`
      : 'Dates not set';
    return `
      <div class="trip-item" data-trip-id="${t.tripId}">
        <div class="trip-info">
          <h6>${t.name}, ${t.country}</h6>
          <small><i class="bi bi-people me-1"></i>${t.travelers} traveler(s) &nbsp;•&nbsp; ${dateRange}</small>
        </div>
        <button class="btn-remove-trip" data-trip-id="${t.tripId}" aria-label="Remove trip"><i class="bi bi-x-circle"></i></button>
      </div>
    `;
  }).join('');
}

function formatDateShort(isoDate){
  const dt = new Date(isoDate);
  if(isNaN(dt)) return isoDate;
  return dt.toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' });
}

document.getElementById('myTripsList').addEventListener('click', (e) => {
  const btn = e.target.closest('.btn-remove-trip');
  if(!btn) return;
  removeTrip(Number(btn.dataset.tripId));
  showToast('Trip removed');
});

// Trip Planner Form submission + validation
const tripPlanForm = document.getElementById('tripPlanForm');
tripPlanForm.addEventListener('submit', (e) => {
  e.preventDefault();
  e.stopPropagation();

  const destSelect = document.getElementById('tripDestination');
  const startInput = document.getElementById('tripStartDate');
  const endInput = document.getElementById('tripEndDate');
  const travelersInput = document.getElementById('tripTravelers');
  const notesInput = document.getElementById('tripNotes');

  let valid = true;

  if(!destSelect.value){
    destSelect.classList.add('is-invalid');
    valid = false;
  } else {
    destSelect.classList.remove('is-invalid');
  }

  if(!startInput.value){
    startInput.classList.add('is-invalid');
    valid = false;
  } else {
    startInput.classList.remove('is-invalid');
  }

  if(!endInput.value || (startInput.value && endInput.value < startInput.value)){
    endInput.classList.add('is-invalid');
    valid = false;
  } else {
    endInput.classList.remove('is-invalid');
  }

  if(!valid) return;

  const dest = destinations.find(d => d.id === Number(destSelect.value));
  addTrip({
    destinationId: dest.id,
    name: dest.destinationName,
    country: dest.country,
    travelers: Number(travelersInput.value) || 1,
    startDate: startInput.value,
    endDate: endInput.value,
    notes: notesInput.value.trim()
  });

  showToast(`Trip to ${dest.destinationName} added`);
  tripPlanForm.reset();
  document.getElementById('tripTravelers').value = 2;
});

/* ---------------- 8. CONTACT FORM VALIDATION ---------------- */
const contactForm = document.getElementById('contactForm');
const formSuccessAlert = document.getElementById('formSuccessAlert');

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
    if(f.check(f.el.value)){
      f.el.classList.remove('is-invalid');
      f.el.classList.add('is-valid');
    } else {
      f.el.classList.add('is-invalid');
      f.el.classList.remove('is-valid');
      valid = false;
    }
  });

  if(!valid){
    formSuccessAlert.classList.remove('show');
    return;
  }

  // Simulate successful submission
  formSuccessAlert.classList.add('show');
  contactForm.reset();
  fields.forEach(f => f.el.classList.remove('is-valid'));

  setTimeout(() => formSuccessAlert.classList.remove('show'), 5000);
});

// Clear invalid state as user types
contactForm.querySelectorAll('input, select, textarea').forEach(el => {
  el.addEventListener('input', () => el.classList.remove('is-invalid'));
});

/* ---------------- 9. MIN DATE GUARDS FOR TRIP FORM ---------------- */
const todayISO = new Date().toISOString().split('T')[0];
document.getElementById('tripStartDate').min = todayISO;
document.getElementById('tripEndDate').min = todayISO;
document.getElementById('tripStartDate').addEventListener('change', (e) => {
  document.getElementById('tripEndDate').min = e.target.value;
});


loadDestinations().then(list => {
  renderBanner(list);
  renderCards(list);
  populateTripDropdown(list);
});

} 

/* ---------------- 10. NAVBAR SCROLL EFFECT + ACTIVE LINK ---------------- */
const mainNav = document.getElementById('mainNav');
if(mainNav){
  window.addEventListener('scroll', () => {
    mainNav.classList.toggle('scrolled', window.scrollY > 60);
  });

  const sections = document.querySelectorAll('section[id], header[id]');
  const navLinks = document.querySelectorAll('.navbar-wayfarer .nav-link');

  window.addEventListener('scroll', () => {
    let current = '';
    sections.forEach(sec => {
      const top = sec.offsetTop - 120;
      if(window.scrollY >= top) current = sec.id;
    });
    navLinks.forEach(link => {
      link.classList.toggle('active', link.getAttribute('href') === `#${current}`);
    });
  });

  // Collapse mobile menu after clicking a link
  document.querySelectorAll('#navMenu .nav-link').forEach(link => {
    link.addEventListener('click', () => {
      const menu = document.getElementById('navMenu');
      if(menu.classList.contains('show')){
        bootstrap.Collapse.getOrCreateInstance(menu).hide();
      }
    });
  });
}

/* ---------------- 11. LOGGED-IN USER STATE (NAVBAR) ---------------- */
function applyLoggedInState(){
  const authBtns = document.getElementById('authButtons');
  const userProfile = document.getElementById('userProfile');
  const userNameDisplay = document.getElementById('userNameDisplay');
  if(!authBtns || !userProfile) return;

  let session = null;
  try{
    session = JSON.parse(sessionStorage.getItem('wayfarerSession') || 'null');
  }catch(e){
    session = null;
  }

  if(session && session.name){
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
if(logoutBtn){
  logoutBtn.addEventListener('click', (e) => {
    e.preventDefault();
    sessionStorage.removeItem('wayfarerSession');
    applyLoggedInState();
    showToast('You have been signed out');
    window.location.hash = '#home';
  });
}
