/* ============================================================
   Wayfarer — Expense Planner
   CRUD for expense plans, validation, live cost calc,
   summary + highest-expense-category insight.
   Data persists in localStorage under "wayfarer_expense_plans".
   ============================================================ */

(function () {
  "use strict";

  const STORAGE_KEY = "wayfarer_expense_plans";
  const ID_COUNTER_KEY = "wayfarer_expense_id_counter";

  const CATEGORIES = [
    { key: "accommodation", label: "Accommodation", icon: "bi-building" },
    { key: "transportation", label: "Transportation", icon: "bi-airplane" },
    { key: "food", label: "Food", icon: "bi-cup-hot" },
    { key: "shopping", label: "Shopping", icon: "bi-bag" },
    { key: "activities", label: "Activities", icon: "bi-ticket-perforated" },
    { key: "misc", label: "Miscellaneous", icon: "bi-three-dots" }
  ];

  const FIELD_IDS = {
    accommodation: "expAccommodation",
    transportation: "expTransportation",
    food: "expFood",
    shopping: "expShopping",
    activities: "expActivities",
    misc: "expMisc"
  };

  const currencyFmt = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0
  });

  // ---------- State ----------
  let editingId = null; // null = creating a new plan
  let deleteTargetId = null;

  // ---------- DOM refs ----------
  const $ = (id) => document.getElementById(id);

  const authRequiredEl = $("authRequired");
  const contentEl = $("expensePlannerContent");
  const form = $("expensePlanForm");
  const destinationInput = $("destinationName");
  const travelersInput = $("numTravelers");
  const costPreviewValue = $("costPreviewValue");
  const formExpenseId = $("formExpenseId");
  const formHeading = $("formHeading");
  const submitBtnLabel = $("submitBtnLabel");
  const cancelEditBtn = $("cancelEditBtn");
  const plansListEl = $("myExpensePlansList");
  const emptyPlansMsg = $("emptyPlansMsg");
  const summaryPanel = $("summaryPanel");
  const summaryStatRows = $("summaryStatRows");
  const highestBadge = $("highestBadge");
  const grandTotalValue = $("grandTotalValue");
  const deleteConfirmModalEl = $("deleteConfirmModal");
  const confirmDeleteBtn = $("confirmDeleteBtn");

  let deleteModal = null;
  let toastInstance = null;

  // ---------- Auth check ----------
  // Consistent with the rest of the Wayfarer site (index.html / script.js /
  // authentication.html): a logged-in user is represented by a
  // "wayfarerSession" record in sessionStorage, e.g. { name: "...", ... }.
  function getCurrentUser() {
    try {
      const raw = sessionStorage.getItem("wayfarerSession");
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function applyAuthState() {
    const user = getCurrentUser();
    const authButtons = $("authButtons");
    const userProfile = $("userProfile");
    const userNameDisplay = $("userNameDisplay");

    if (user) {
      if (authRequiredEl) authRequiredEl.style.display = "none";
      if (contentEl) contentEl.style.display = "block";
      if (authButtons) authButtons.style.display = "none";
      if (userProfile) userProfile.style.display = "block";
      if (userNameDisplay) userNameDisplay.textContent = user.name || "User";
    } else {
      if (authRequiredEl) authRequiredEl.style.display = "block";
      if (contentEl) contentEl.style.display = "none";
      if (authButtons) authButtons.style.display = "block";
      if (userProfile) userProfile.style.display = "none";
    }
    return !!user;
  }

  // ---------- Storage helpers ----------
  function loadPlans() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      console.error("Could not read saved expense plans:", e);
      return [];
    }
  }

  function savePlans(plans) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(plans));
      return true;
    } catch (e) {
      console.error("Could not save expense plans:", e);
      return false;
    }
  }

  function nextExpenseId() {
    let counter = parseInt(localStorage.getItem(ID_COUNTER_KEY) || "0", 10);
    counter += 1;
    localStorage.setItem(ID_COUNTER_KEY, String(counter));
    return "EXP-" + String(counter).padStart(4, "0");
  }

  function peekNextExpenseId() {
    const counter = parseInt(localStorage.getItem(ID_COUNTER_KEY) || "0", 10) + 1;
    return "EXP-" + String(counter).padStart(4, "0");
  }

  // ---------- Validation ----------
  // Destination: required, min 3 chars.
  // Travelers: required, > 0, whole numbers only.
  // Expense fields: numeric only, cannot be negative, default 0.
  function validateForm() {
    let valid = true;

    const destination = destinationInput.value.trim();
    if (destination.length < 3) {
      destinationInput.classList.add("is-invalid");
      valid = false;
    } else {
      destinationInput.classList.remove("is-invalid");
    }

    const travelersRaw = travelersInput.value;
    const travelers = Number(travelersRaw);
    const isWholeNumber = Number.isInteger(travelers);
    if (travelersRaw === "" || !isWholeNumber || travelers <= 0) {
      travelersInput.classList.add("is-invalid");
      valid = false;
    } else {
      travelersInput.classList.remove("is-invalid");
    }

    CATEGORIES.forEach(({ key }) => {
      const input = $(FIELD_IDS[key]);
      const raw = input.value;
      const num = Number(raw);
      const isValidNumber = raw !== "" && !Number.isNaN(num) && num >= 0;
      if (!isValidNumber) {
        input.classList.add("is-invalid");
        valid = false;
      } else {
        input.classList.remove("is-invalid");
      }
    });

    return valid;
  }

  function readExpenseValues() {
    const values = {};
    CATEGORIES.forEach(({ key }) => {
      const input = $(FIELD_IDS[key]);
      const num = Number(input.value);
      values[key] = Number.isFinite(num) && num >= 0 ? num : 0;
    });
    return values;
  }

  function calcTotal(values) {
    return CATEGORIES.reduce((sum, { key }) => sum + (values[key] || 0), 0);
  }

  // ---------- Live cost preview ----------
  function updateCostPreview() {
    const values = readExpenseValues();
    const total = calcTotal(values);
    costPreviewValue.textContent = currencyFmt.format(total);
  }

  // ---------- Form <-> state ----------
  function resetFormToCreateMode() {
    editingId = null;
    form.reset();
    travelersInput.value = 2;
    CATEGORIES.forEach(({ key }) => {
      $(FIELD_IDS[key]).value = 0;
    });
    [destinationInput, travelersInput, ...CATEGORIES.map(c => $(FIELD_IDS[c.key]))]
      .forEach(el => el.classList.remove("is-invalid"));

    formHeading.textContent = "New Expense Plan";
    formExpenseId.textContent = peekNextExpenseId();
    submitBtnLabel.textContent = "Save Expense Plan";
    cancelEditBtn.classList.add("d-none");
    updateCostPreview();
  }

  function loadPlanIntoForm(plan) {
    editingId = plan.id;
    destinationInput.value = plan.destination;
    travelersInput.value = plan.travelers;
    CATEGORIES.forEach(({ key }) => {
      $(FIELD_IDS[key]).value = plan.expenses[key];
    });
    [destinationInput, travelersInput, ...CATEGORIES.map(c => $(FIELD_IDS[c.key]))]
      .forEach(el => el.classList.remove("is-invalid"));

    formHeading.textContent = "Edit Expense Plan";
    formExpenseId.textContent = plan.id;
    submitBtnLabel.textContent = "Update Expense Plan";
    cancelEditBtn.classList.remove("d-none");
    updateCostPreview();

    form.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // ---------- Render: saved plans list ----------
  function highestCategoryFor(expenses) {
    let topKey = null;
    let topVal = -1;
    CATEGORIES.forEach(({ key }) => {
      if (expenses[key] > topVal) {
        topVal = expenses[key];
        topKey = key;
      }
    });
    if (topVal <= 0) return null;
    const cat = CATEGORIES.find(c => c.key === topKey);
    return { ...cat, value: topVal };
  }

  function renderPlansList() {
    const plans = loadPlans();

    if (plans.length === 0) {
      plansListEl.innerHTML = "";
      plansListEl.appendChild(emptyPlansMsg);
      emptyPlansMsg.style.display = "block";
      summaryPanel.style.display = "none";
      return;
    }

    emptyPlansMsg.style.display = "none";
    plansListEl.innerHTML = "";

    // newest first
    [...plans].reverse().forEach((plan) => {
      const total = calcTotal(plan.expenses);
      const highest = highestCategoryFor(plan.expenses);

      const item = document.createElement("div");
      item.className = "trip-item";
      item.innerHTML = `
        <div class="trip-top">
          <div class="trip-info">
            <h6>${escapeHtml(plan.destination)}</h6>
            <small>${escapeHtml(plan.id)} · ${plan.travelers} traveler${plan.travelers > 1 ? "s" : ""}</small>
          </div>
          <div class="trip-actions">
            <button class="btn-icon edit" data-action="edit" data-id="${plan.id}" title="Edit plan" aria-label="Edit expense plan">
              <i class="bi bi-pencil"></i>
            </button>
            <button class="btn-icon remove" data-action="delete" data-id="${plan.id}" title="Delete plan" aria-label="Delete expense plan">
              <i class="bi bi-trash"></i>
            </button>
          </div>
        </div>
        <div class="trip-meta">
          <span><i class="bi bi-cash-stack"></i>Total: <strong class="trip-total-cost">${currencyFmt.format(total)}</strong></span>
        </div>
        ${highest ? `<div class="trip-highest"><i class="bi bi-trophy"></i>Highest: ${highest.label} (${currencyFmt.format(highest.value)})</div>` : ""}
      `;
      plansListEl.appendChild(item);
    });

    renderSummary(plans);
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  // ---------- Render: summary across all plans ----------
  function renderSummary(plans) {
    if (!plans.length) {
      summaryPanel.style.display = "none";
      return;
    }
    summaryPanel.style.display = "block";

    const totals = {};
    CATEGORIES.forEach(({ key }) => (totals[key] = 0));
    plans.forEach((plan) => {
      CATEGORIES.forEach(({ key }) => {
        totals[key] += plan.expenses[key] || 0;
      });
    });

    const grandTotal = CATEGORIES.reduce((sum, { key }) => sum + totals[key], 0);
    grandTotalValue.textContent = currencyFmt.format(grandTotal);

    let topKey = null;
    let topVal = -1;
    CATEGORIES.forEach(({ key }) => {
      if (totals[key] > topVal) {
        topVal = totals[key];
        topKey = key;
      }
    });
    const topCat = CATEGORIES.find(c => c.key === topKey);
    highestBadge.innerHTML = topCat && topVal > 0
      ? `<i class="bi bi-trophy"></i>${topCat.label}`
      : `<i class="bi bi-trophy"></i>—`;

    summaryStatRows.innerHTML = CATEGORIES.map(({ key, label, icon }) => {
      const val = totals[key];
      const pct = grandTotal > 0 ? Math.round((val / grandTotal) * 100) : 0;
      return `
        <div class="summary-stat-row">
          <span class="cat-label"><i class="bi ${icon}" style="color:var(--gold-600);"></i>${label}</span>
          <span class="cat-bar-track"><span class="cat-bar-fill" style="width:${pct}%;"></span></span>
          <span class="cat-value">${currencyFmt.format(val)}</span>
        </div>
      `;
    }).join("");
  }

  // ---------- Toast ----------
  function showToast(message) {
    $("toastMessage").textContent = message;
    if (!toastInstance) {
      toastInstance = new bootstrap.Toast($("actionToast"), { delay: 2600 });
    }
    toastInstance.show();
  }

  // ---------- Event handlers ----------
  function handleFormSubmit(e) {
    e.preventDefault();
    if (!validateForm()) {
      form.classList.add("was-validated");
      return;
    }

    const destination = destinationInput.value.trim();
    const travelers = parseInt(travelersInput.value, 10);
    const expenses = readExpenseValues();
    const total = calcTotal(expenses);

    const plans = loadPlans();

    if (editingId) {
      const idx = plans.findIndex(p => p.id === editingId);
      if (idx !== -1) {
        plans[idx] = {
          ...plans[idx],
          destination,
          travelers,
          expenses,
          total,
          updatedAt: new Date().toISOString()
        };
      }
      savePlans(plans);
      showToast("Expense plan updated.");
    } else {
      const newPlan = {
        id: nextExpenseId(),
        destination,
        travelers,
        expenses,
        total,
        createdAt: new Date().toISOString()
      };
      plans.push(newPlan);
      savePlans(plans);
      showToast("Expense plan saved.");
    }

    form.classList.remove("was-validated");
    resetFormToCreateMode();
    renderPlansList();
  }

  function handlePlansListClick(e) {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;
    const id = btn.getAttribute("data-id");
    const action = btn.getAttribute("data-action");

    if (action === "edit") {
      const plans = loadPlans();
      const plan = plans.find(p => p.id === id);
      if (plan) loadPlanIntoForm(plan);
    } else if (action === "delete") {
      deleteTargetId = id;
      if (!deleteModal) {
        deleteModal = new bootstrap.Modal(deleteConfirmModalEl);
      }
      deleteModal.show();
    }
  }

  function handleConfirmDelete() {
    if (!deleteTargetId) return;
    let plans = loadPlans();
    plans = plans.filter(p => p.id !== deleteTargetId);
    savePlans(plans);

    if (editingId === deleteTargetId) {
      resetFormToCreateMode();
    }

    deleteTargetId = null;
    if (deleteModal) deleteModal.hide();
    renderPlansList();
    showToast("Expense plan deleted.");
  }

  // ---------- Navbar scroll effect (matches rest of site) ----------
  function initNavbarScroll() {
    const nav = $("mainNav");
    if (!nav) return;
    const onScroll = () => {
      nav.classList.toggle("scrolled", window.scrollY > 40);
    };
    window.addEventListener("scroll", onScroll);
    onScroll();
  }

  // ---------- Init ----------
  function init() {
    initNavbarScroll();

    const isLoggedIn = applyAuthState();

    // Live totals as the user types
    CATEGORIES.forEach(({ key }) => {
      $(FIELD_IDS[key]).addEventListener("input", updateCostPreview);
    });

    form.addEventListener("submit", handleFormSubmit);
    cancelEditBtn.addEventListener("click", () => {
      resetFormToCreateMode();
    });
    plansListEl.addEventListener("click", handlePlansListClick);
    confirmDeleteBtn.addEventListener("click", handleConfirmDelete);

    const logoutBtn = $("logoutBtn");
    if (logoutBtn) {
      logoutBtn.addEventListener("click", (e) => {
        e.preventDefault();
        sessionStorage.removeItem("wayfarerSession");
        applyAuthState();
      });
    }

    // Keep auth state in sync if the user logs in/out in another tab
    window.addEventListener("storage", (e) => {
      if (e.key === null || e.key === "wayfarerSession") {
        const nowLoggedIn = applyAuthState();
        if (nowLoggedIn) {
          resetFormToCreateMode();
          renderPlansList();
        }
      }
    });

    if (isLoggedIn) {
      resetFormToCreateMode();
      renderPlansList();
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
