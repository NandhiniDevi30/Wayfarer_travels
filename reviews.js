// ======================== REVIEWS MANAGEMENT ========================
let selectedRating = 0;
let editingIndex = -1;

// ------------------------------------------------------------
// SESSION HELPER (matches profile.js / trip-planner.js)
// ------------------------------------------------------------
function getSessionUser() {
  try {
    const raw = sessionStorage.getItem('wayfarerSession');
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return null;
}

// ------------------------------------------------------------
// COMPLETED TRIP DESTINATIONS 

function getCompletedTripDestinations() {
  const session = getSessionUser();
  if (!session || !session.email) return [];

  try {
    const allTrips = JSON.parse(localStorage.getItem('wayfarerTrips') || '{}');
    const userTrips = allTrips[session.email] || [];

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const completedDestinations = userTrips
      .filter(trip => {
        if (trip.status === 'cancelled') return false;
        const tripEnd = new Date(trip.endDate);
        tripEnd.setHours(0, 0, 0, 0);
        return trip.status === 'completed' || tripEnd < today;
      })
      .map(trip => trip.destination);

    // De-duplicate case-insensitively while keeping original casing
    const seen = new Set();
    const unique = [];
    completedDestinations.forEach(dest => {
      const key = dest.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(dest);
      }
    });

    return unique;
  } catch (e) {
    console.error('Error reading completed trips:', e);
    return [];
  }
}

function loadReviews() {
  try {
    const stored = localStorage.getItem('wayfarerReviews');
    return stored ? JSON.parse(stored) : [];
  } catch (e) {
    console.error('Error loading reviews:', e);
    return [];
  }
}

function saveReviews(reviews) {
  try {
    localStorage.setItem('wayfarerReviews', JSON.stringify(reviews));
  } catch (e) {
    console.error('Error saving reviews:', e);
  }
}

function generateReviewId() {
  return Math.random().toString(36).substr(2, 9);
}

function formatDate(date) {
  const options = { year: 'numeric', month: 'short', day: 'numeric' };
  return new Date(date).toLocaleDateString('en-US', options);
}

// Check if the signed-in user has a completed trip to this destination
function hasVisitedDestination(destination) {
  const completed = getCompletedTripDestinations();
  return completed.some(dest => dest.toLowerCase() === destination.toLowerCase());
}

// Get suggestions for completed-trip destinations (autocomplete)
function getVisitedSuggestions(input) {
  const completed = getCompletedTripDestinations();
  return completed.filter(dest =>
    dest.toLowerCase().includes(input.toLowerCase())
  );
}

// ------------------------------------------------------------
// REVIEW FORM GATING
// Disables the form and shows a notice when the user is not
// signed in, or has no completed trips to review yet.
// ------------------------------------------------------------
function updateReviewFormGate() {
  const session = getSessionUser();
  const completedDestinations = getCompletedTripDestinations();
  const notice = document.getElementById('reviewGateNotice');
  const noticeText = document.getElementById('reviewGateNoticeText');
  const submitBtn = document.getElementById('submitReviewBtn');
  const formFields = document.querySelectorAll('#reviewForm input, #reviewForm textarea, #reviewForm .star-btn');

  let gated = false;
  let message = '';

  if (!session || !session.email) {
    gated = true;
    message = 'Please <a href="authentication.html">sign in</a> to write a review.';
  } else if (completedDestinations.length === 0) {
    gated = true;
    message = 'You have no completed trips yet. Once a trip is marked <strong>Completed</strong> in <a href="trip-planner.html">Trip Planner</a>, you can review it here.';
  }

  if (gated) {
    notice.classList.add('show');
    noticeText.innerHTML = message;
    submitBtn.disabled = true;
    formFields.forEach(el => el.disabled = true);
  } else {
    notice.classList.remove('show');
    noticeText.innerHTML = '';
    submitBtn.disabled = false;
    formFields.forEach(el => el.disabled = false);
  }

  return !gated;
}

// Star Rating Handler
document.querySelectorAll('.star-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    if (btn.disabled) return;
    selectedRating = parseInt(btn.dataset.rating);
    updateStarDisplay();
    document.getElementById('ratingError').textContent = '';
  });
});

function updateStarDisplay() {
  document.querySelectorAll('.star-btn').forEach(btn => {
    const rating = parseInt(btn.dataset.rating);
    if (rating <= selectedRating) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
}

// Character counters
document.getElementById('reviewTitle').addEventListener('input', function() {
  document.getElementById('titleCount').textContent = this.value.length;
});

document.getElementById('reviewDesc').addEventListener('input', function() {
  document.getElementById('descCount').textContent = this.value.length;
});

// Destination input autocomplete — now sourced from completed trips only
document.getElementById('destName').addEventListener('input', function() {
  const input = this.value.trim();
  const suggestions = getVisitedSuggestions(input);
  
  // Remove existing datalist if any
  let existingDatalist = document.getElementById('visitedDestinations');
  if (existingDatalist) {
    existingDatalist.remove();
  }
  
  if (suggestions.length > 0 && input.length > 0) {
    const datalist = document.createElement('datalist');
    datalist.id = 'visitedDestinations';
    suggestions.forEach(dest => {
      const option = document.createElement('option');
      option.value = dest;
      datalist.appendChild(option);
    });
    this.parentNode.appendChild(datalist);
    this.setAttribute('list', 'visitedDestinations');
  } else {
    this.removeAttribute('list');
  }
});

// Show full list of completed destinations as soon as the field is focused
document.getElementById('destName').addEventListener('focus', function() {
  if (this.value.trim().length === 0) {
    const completed = getCompletedTripDestinations();
    let existingDatalist = document.getElementById('visitedDestinations');
    if (existingDatalist) existingDatalist.remove();

    if (completed.length > 0) {
      const datalist = document.createElement('datalist');
      datalist.id = 'visitedDestinations';
      completed.forEach(dest => {
        const option = document.createElement('option');
        option.value = dest;
        datalist.appendChild(option);
      });
      this.parentNode.appendChild(datalist);
      this.setAttribute('list', 'visitedDestinations');
    }
  }
});

// Form Validation & Submit
document.getElementById('reviewForm').addEventListener('submit', function(e) {
  e.preventDefault();

  // Re-check gating at submit time in case trip data changed in another tab
  if (!updateReviewFormGate()) {
    return;
  }

  const destName = document.getElementById('destName').value.trim();
  const userName = document.getElementById('userName').value.trim();
  const rating = selectedRating;
  const title = document.getElementById('reviewTitle').value.trim();
  const desc = document.getElementById('reviewDesc').value.trim();

  // Validation
  let isValid = true;
  let errors = {};

  if (!destName) {
    errors.destName = 'Destination name is required.';
    isValid = false;
  } else if (!hasVisitedDestination(destName)) {
    errors.destName = 'You can only review destinations from trips marked Completed in your Trip Planner.';
    isValid = false;
  }
  
  if (!userName) {
    errors.userName = 'Name is required.';
    isValid = false;
  }
  if (rating < 1 || rating > 5) {
    document.getElementById('ratingError').textContent = 'Please select a rating from 1 to 5.';
    isValid = false;
  } else {
    document.getElementById('ratingError').textContent = '';
  }
  if (title.length < 5) {
    errors.reviewTitle = 'Review title must be at least 5 characters.';
    isValid = false;
  }
  if (desc.length < 20) {
    errors.reviewDesc = 'Review description must be at least 20 characters.';
    isValid = false;
  }

  // Clear previous invalid states before applying new ones
  ['destName', 'userName', 'reviewTitle', 'reviewDesc'].forEach(field => {
    const el = document.getElementById(field);
    if (el) el.classList.remove('is-invalid');
  });

  if (!isValid) {
    // Show errors
    Object.keys(errors).forEach(field => {
      const el = document.getElementById(field);
      if (el) {
        el.classList.add('is-invalid');
        const feedback = el.parentElement.querySelector('.invalid-feedback');
        if (feedback) feedback.textContent = errors[field];
      }
    });
    return;
  }

  // Create review object
  const review = {
    id: editingIndex === -1 ? generateReviewId() : loadReviews()[editingIndex].id,
    destination: destName,
    userName: userName,
    rating: rating,
    title: title,
    description: desc,
    date: editingIndex === -1 ? new Date().toISOString() : loadReviews()[editingIndex].date
  };

  // Save review
  let reviews = loadReviews();
  if (editingIndex === -1) {
    reviews.push(review);
  } else {
    reviews[editingIndex] = review;
    editingIndex = -1;
  }
  saveReviews(reviews);

  // Show toast
  showToast(editingIndex === -1 ? 'Review submitted successfully!' : 'Review updated successfully!');

  // Reset form
  resetForm();
  renderReviews();
});

function resetForm() {
  document.getElementById('reviewForm').reset();
  selectedRating = 0;
  document.querySelectorAll('.star-btn').forEach(btn => btn.classList.remove('active'));
  document.getElementById('titleCount').textContent = '0';
  document.getElementById('descCount').textContent = '0';
  document.getElementById('ratingError').textContent = '';
  editingIndex = -1;
  document.querySelector('.btn-submit-review').innerHTML = '<i class="bi bi-plus-circle me-2"></i>Submit Review';

  // Clear invalid states
  ['destName', 'userName', 'reviewTitle', 'reviewDesc'].forEach(field => {
    const el = document.getElementById(field);
    if (el) el.classList.remove('is-invalid');
  });
  
  // Remove autocomplete datalist
  const datalist = document.getElementById('visitedDestinations');
  if (datalist) datalist.remove();
  document.getElementById('destName').removeAttribute('list');
}

function editReview(index) {
  const reviews = loadReviews();
  const review = reviews[index];
  
  document.getElementById('destName').value = review.destination;
  document.getElementById('userName').value = review.userName;
  document.getElementById('reviewTitle').value = review.title;
  document.getElementById('reviewDesc').value = review.description;
  document.getElementById('titleCount').textContent = review.title.length;
  document.getElementById('descCount').textContent = review.description.length;
  
  selectedRating = review.rating;
  updateStarDisplay();
  
  editingIndex = index;
  document.querySelector('.btn-submit-review').innerHTML = '<i class="bi bi-pencil me-2"></i>Update Review';
  document.getElementById('addReviewSection').scrollIntoView({ behavior: 'smooth' });
}

function deleteReview(index) {
  if (confirm('Are you sure you want to delete this review?')) {
    const reviews = loadReviews();
    reviews.splice(index, 1);
    saveReviews(reviews);
    showToast('Review deleted successfully');
    renderReviews();
  }
}

function renderReviews() {
  const reviews = loadReviews();
  const reviewsList = document.getElementById('reviewsList');
  const emptyReviews = document.getElementById('emptyReviews');
  const reviewCount = document.getElementById('reviewCount');

  reviewCount.textContent = `(${reviews.length})`;

  if (reviews.length === 0) {
    reviewsList.innerHTML = '';
    emptyReviews.style.display = 'block';
    return;
  }

  emptyReviews.style.display = 'none';
  reviewsList.innerHTML = reviews.map((review, idx) => `
    <div class="review-card">
      <div class="review-header">
        <div class="review-meta">
          <div class="review-destination">${review.destination}</div>
          <div class="review-user">${review.userName}</div>
          <div class="review-rating">
            ${Array(review.rating).fill('<i class="bi bi-star-fill"></i>').join('')}
          </div>
          <div class="review-date">
            <i class="bi bi-calendar-event me-1"></i>${formatDate(review.date)}
          </div>
        </div>
        <div class="review-actions">
          <button class="btn-edit-review" onclick="editReview(${idx})" title="Edit review">
            <i class="bi bi-pencil"></i>
          </button>
          <button class="btn-delete-review" onclick="deleteReview(${idx})" title="Delete review">
            <i class="bi bi-trash"></i>
          </button>
        </div>
      </div>
      <h4 class="review-title">${review.title}</h4>
      <p class="review-description">${review.description}</p>
    </div>
  `).join('');
}

function showToast(message) {
  const toast = document.getElementById('actionToast');
  const toastMsg = document.getElementById('toastMessage');
  toastMsg.textContent = message;
  const bsToast = new bootstrap.Toast(toast);
  bsToast.show();
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
  updateReviewFormGate();
  renderReviews();
});

// Re-check gating if trip data changes in another tab (e.g. trip marked Completed there)
window.addEventListener('storage', function(e) {
  if (e.key === 'wayfarerTrips') {
    updateReviewFormGate();
  }
});
