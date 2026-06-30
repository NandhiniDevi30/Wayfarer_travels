/* ── helpers ─────────────────────────────────────── */
function switchView(view){
  document.querySelectorAll('.auth-view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.auth-tab-btn').forEach(b => {b.classList.remove('active'); b.setAttribute('aria-selected','false');});
  if(view === 'register'){
    document.getElementById('regView').classList.add('active');
    document.getElementById('tabRegBtn').classList.add('active');
    document.getElementById('tabRegBtn').setAttribute('aria-selected','true');
  } else {
    document.getElementById('loginView').classList.add('active');
    document.getElementById('tabLoginBtn').classList.add('active');
    document.getElementById('tabLoginBtn').setAttribute('aria-selected','true');
    hideErr('loginGenErr');
  }
}

function showErr(id, msg){
  const el = document.getElementById(id);
  el.querySelector('span').textContent = msg;
  el.classList.add('show');
  const input = el.previousElementSibling && el.previousElementSibling.classList.contains('field-input')
    ? el.previousElementSibling
    : el.closest('.field-wrap').querySelector('.field-input');
  if(input) input.classList.add('is-invalid');
}

function hideErr(id){
  const el = document.getElementById(id);
  el.classList.remove('show');
  const wrap = el.closest('.field-wrap');
  if(wrap){ const input = wrap.querySelector('.field-input'); if(input) input.classList.remove('is-invalid');}
}

function togglePw(inputId, btn){
  const inp = document.getElementById(inputId);
  const icon = btn.querySelector('i');
  if(inp.type === 'password'){
    inp.type = 'text';
    icon.className = 'bi bi-eye-slash';
    btn.setAttribute('aria-label','Hide password');
  } else {
    inp.type = 'password';
    icon.className = 'bi bi-eye';
    btn.setAttribute('aria-label','Show password');
  }
}

/* ── validation rules ────────────────────────────── */
function validateName(v){
  if(!v.trim()) return 'Full name is required.';
  if(v.trim().length < 3) return 'Name must be at least 3 characters.';
  if(!/^[a-zA-Z\s]+$/.test(v.trim())) return 'Name may only contain letters and spaces.';
  return '';
}

function validateEmail(v){
  if(!v.trim()) return 'Email address is required.';
  if(!v.includes('@')) return 'Email must include @.';
  if(!v.toLowerCase().includes('.com')) return 'Email must include .com.';
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())) return 'Please enter a valid email address.';
  return '';
}

function validatePassword(v){
  if(!v) return 'Password is required.';
  if(v.length < 8) return 'Password must be at least 8 characters.';
  if(!/[A-Z]/.test(v)) return 'Include at least one uppercase letter.';
  if(!/[a-z]/.test(v)) return 'Include at least one lowercase letter.';
  if(!/[0-9]/.test(v)) return 'Include at least one number.';
  if(!/[^A-Za-z0-9]/.test(v)) return 'Include at least one special character (e.g. @, #, !).';
  return '';
}

function validateConfirm(v, pw){
  if(!v) return 'Please confirm your password.';
  if(v !== pw) return 'Passwords do not match.';
  return '';
}

function validateLoginPassword(v){
  if(!v) return 'Password is required.';
  if(v.length < 8) return 'Password must be at least 8 characters.';
  return '';
}

/* ── password strength ───────────────────────────── */
function getStrength(pw){
  let score = 0;
  if(pw.length >= 8) score++;
  if(pw.length >= 12) score++;
  if(/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if(/[0-9]/.test(pw)) score++;
  if(/[^A-Za-z0-9]/.test(pw)) score++;
  return score;
}

document.getElementById('regPassword').addEventListener('input', function(){
  const pw = this.value;
  const wrap = document.getElementById('strengthWrap');
  const fill = document.getElementById('strengthFill');
  const label = document.getElementById('strengthLabel');
  if(!pw){ wrap.classList.remove('show'); return; }
  wrap.classList.add('show');
  const s = getStrength(pw);
  const pct = Math.min(100, s * 20) + '%';
  const colors = ['#dc3545','#fd7e14','#ffc107','#20c997','#198754'];
  const labels = ['Very weak','Weak','Fair','Strong','Very strong'];
  const idx = Math.max(0, Math.min(4, s - 1));
  fill.style.width = pct;
  fill.style.background = colors[idx];
  label.textContent = labels[idx];
  label.style.color = colors[idx];
});

/* ── "registered users" store ────────────────────────
   In-memory + persisted to localStorage so accounts created in one
   visit are still there if the page is refreshed. Seeded with a demo
   account so Sign In can be tested immediately. ────────────────── */
function loadUsers(){
  try{
    const stored = JSON.parse(localStorage.getItem('wayfarerUsers') || 'null');
    if(Array.isArray(stored) && stored.length) return stored;
  }catch(e){ /* ignore parse errors, fall through to default */ }
  return [{ name:'Demo User', email:'demo@wayfarer.com', password:'Demo@1234' }];
}

function saveUsers(list){
  try{ localStorage.setItem('wayfarerUsers', JSON.stringify(list)); }
  catch(e){ /* storage unavailable — registration just won't persist across reloads */ }
}

const users = loadUsers();

/* ── register submit ─────────────────────────────── */
document.getElementById('regForm').addEventListener('submit', function(e){
  e.preventDefault();
  const name = document.getElementById('regName').value;
  const email = document.getElementById('regEmail').value;
  const pw = document.getElementById('regPassword').value;
  const confirm = document.getElementById('regConfirm').value;

  const nameErr = validateName(name);
  const emailErr = validateEmail(email);
  const pwErr = validatePassword(pw);
  const confirmErr = validateConfirm(confirm, pw);

  ['regNameErr','regEmailErr','regPasswordErr','regConfirmErr'].forEach(hideErr);

  let valid = true;
  if(nameErr){ showErr('regNameErr', nameErr); valid = false; }
  if(emailErr){ showErr('regEmailErr', emailErr); valid = false; }
  if(pwErr){ showErr('regPasswordErr', pwErr); valid = false; }
  if(confirmErr){ showErr('regConfirmErr', confirmErr); valid = false; }

  if(!valid){ document.querySelector('#regView .field-input.is-invalid')?.focus(); return; }

  /* register the new user, replacing any existing record with the same email */
  const cleanEmail = email.trim().toLowerCase();
  const existingIdx = users.findIndex(u => u.email === cleanEmail);
  const newUser = { name: name.trim(), email: cleanEmail, password: pw };
  if(existingIdx >= 0){ users[existingIdx] = newUser; } else { users.push(newUser); }
  saveUsers(users);

  /* simulate success */
  document.getElementById('regFormWrap').style.display = 'none';
  document.getElementById('regSuccess').classList.add('show');

  /* pre-fill the login email so sign-in is one less step */
  const loginEmailField = document.getElementById('loginEmail');
  if(loginEmailField) loginEmailField.value = cleanEmail;
});

/* ── login submit ─────────────────────────────────
   On success: store the session, then redirect to the Wayfarer
   homepage (index.html) so the navbar shows the signed-in state. ── */
document.getElementById('loginForm').addEventListener('submit', function(e){
  e.preventDefault();
  const email = document.getElementById('loginEmail').value.trim().toLowerCase();
  const pw = document.getElementById('loginPassword').value;

  const emailErr = validateEmail(email);
  const pwErr = validateLoginPassword(pw);

  ['loginEmailErr','loginPasswordErr','loginGenErr'].forEach(hideErr);

  let valid = true;
  if(emailErr){ showErr('loginEmailErr', emailErr); valid = false; }
  if(pwErr){ showErr('loginPasswordErr', pwErr); valid = false; }
  if(!valid){ document.querySelector('#loginView .field-input.is-invalid')?.focus(); return; }

  /* check credentials */
  const match = users.find(u => u.email === email && u.password === pw);
  if(!match){
    const genErr = document.getElementById('loginGenErr');
    genErr.querySelector('span').textContent = 'Email or password is incorrect.';
    genErr.classList.add('show');
    return;
  }

  /* success → save session, briefly show confirmation, then redirect to the site */
  try{
    sessionStorage.setItem('wayfarerSession', JSON.stringify({ name: match.name, email: match.email }));
  }catch(e){ /* storage unavailable — redirect still proceeds, just no navbar greeting */ }

  const submitBtn = this.querySelector('button[type="submit"]');
  if(submitBtn){
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="bi bi-check-circle"></i>Signed in! Redirecting…';
  }

  setTimeout(() => {
    window.location.href = 'index.html';
  }, 700);
});

/* clear errors on input */
['regName','regEmail','regPassword','regConfirm'].forEach((id, i) => {
  const errIds = ['regNameErr','regEmailErr','regPasswordErr','regConfirmErr'];
  document.getElementById(id).addEventListener('input', () => hideErr(errIds[i]));
});
['loginEmail','loginPassword'].forEach((id, i) => {
  const errIds = ['loginEmailErr','loginPasswordErr'];
  document.getElementById(id).addEventListener('input', () => {
    hideErr(errIds[i]);
    hideErr('loginGenErr');
  });
});
