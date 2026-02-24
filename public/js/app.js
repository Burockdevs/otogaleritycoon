// ============ GLOBAL STATE & UTILS ============
const API = '';
let currentPage = 'home';
let playerData = {};
let currentCarId = null;
let profitChart = null;
let selectedMechanic = 'normal';

// Utils first to avoid reference errors
const fmt = n => {
    if (n === null || n === undefined) return '0';
    return Number(n).toLocaleString('tr-TR');
};
const fmtPrice = n => fmt(n) + '₺';

// Socket initialization with safety
let socket;
try {
    if (typeof io !== 'undefined') {
        socket = io();
        console.log('Socket.io connected (Real-time features active)');
    } else {
        console.warn('Socket.io script failed to load. Using mock socket.');
        socket = { on: () => { }, emit: () => { }, connected: false };
    }
} catch (e) {
    console.error('Socket error during init:', e);
    socket = { on: () => { }, emit: () => { }, connected: false };
}

// ============ SOCKET DISCONNECT / RECONNECT ============
let isReconnecting = false;
if (socket && socket.on) {
    socket.on('disconnect', () => {
        isReconnecting = true;
        // Loader overlay göster
        const loader = document.getElementById('globalLoader');
        if (loader) {
            const loaderText = loader.querySelector('.loader-text');
            if (loaderText) loaderText.textContent = 'Yeniden bağlanılıyor...';
            loader.classList.remove('hidden');
        }
    });

    socket.on('connect', () => {
        if (isReconnecting) {
            isReconnecting = false;
            // Loader gizle
            const loader = document.getElementById('globalLoader');
            if (loader) {
                const loaderText = loader.querySelector('.loader-text');
                if (loaderText) loaderText.textContent = 'OtoGaleri Tycoon Yükleniyor...';
                loader.classList.add('hidden');
            }
            notify('Bağlantı yeniden kuruldu! <i class="fa-solid fa-wifi"></i>', 'success');
            // Oyuncu verisini ve mevcut sayfayı tazele
            if (typeof loadPlayer === 'function') loadPlayer();
            if (typeof navigateTo === 'function' && currentPage) {
                const loaders = {
                    home: () => typeof loadHome === 'function' && loadHome(true),
                    explore: () => typeof loadCars === 'function' && loadCars(1, true),
                    listings: () => typeof loadListings === 'function' && loadListings(true),
                    mycars: () => typeof loadMyCars === 'function' && loadMyCars(),
                };
                if (loaders[currentPage]) loaders[currentPage]();
            }
        }
    });
}

// ============ AUTH FUNCTIONS (Defined early) ============
function switchAuthTab(tab) {
    const loginTab = document.getElementById('loginTab');
    const registerTab = document.getElementById('registerTab');
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');

    if (loginTab) loginTab.classList.toggle('active', tab === 'login');
    if (registerTab) registerTab.classList.toggle('active', tab === 'register');
    if (loginForm) loginForm.style.display = tab === 'login' ? 'flex' : 'none';
    if (registerForm) registerForm.style.display = tab === 'register' ? 'flex' : 'none';

    const err = document.getElementById('authError');
    if (err) err.textContent = '';
}

// ============ SHOW / HIDE AUTH SCREEN ============
function showAuthScreen() {
    const screen = document.getElementById('authScreen');
    if (screen) {
        screen.classList.remove('hidden');
        screen.style.display = 'flex';
    }
    // Ana UI'ı gizle ya da pointerEvents kapat
    const els = ['.top-bar', '.sidebar', '.main-content', '.bottom-nav', '.more-menu-overlay', '.more-menu', '.xp-bar-container', '.xp-text', '.risk-bar-container'];
    els.forEach(selector => {
        const el = document.querySelector(selector);
        if (el) el.style.setProperty('display', 'none', 'important');
    });
}

function hideAuthScreen() {
    const screen = document.getElementById('authScreen');
    if (screen) {
        screen.classList.add('hidden');
        screen.style.display = 'none';
    }
    // Ana UI'ı göster
    const els = ['.top-bar', '.sidebar', '.main-content', '.bottom-nav', '.more-menu-overlay', '.more-menu', '.xp-bar-container', '.xp-text', '.risk-bar-container'];
    els.forEach(selector => {
        const el = document.querySelector(selector);
        if (el) el.style.removeProperty('display');
    });
}

// ============ AUTH CHECK ON LOAD ============
async function checkAuth() {
    try {
        const r = await fetch('/api/auth/me');
        const data = await r.json();
        if (data.success && data.loggedIn) {
            hideAuthScreen();
            // Oyunu başlat
            initGame();
        } else {
            showAuthScreen();
            const loader = document.getElementById('globalLoader');
            if (loader) loader.classList.add('hidden');
        }
    } catch (e) {
        console.error('Auth check failed:', e);
        showAuthScreen();
        const loader = document.getElementById('globalLoader');
        if (loader) loader.classList.add('hidden');
    }
}

async function initGame() {
    try {
        await loadBrandsForFilter();
        await loadPlayer();
        navigateTo('home');
    } catch (e) {
        console.error('Game init error:', e);
    } finally {
        const loader = document.getElementById('globalLoader');
        if (loader) loader.classList.add('hidden');
    }
}

// ============ HANDLE LOGIN ============
async function handleLogin(event) {
    event.preventDefault();
    const btn = document.getElementById('loginBtn');
    const errEl = document.getElementById('authError');
    errEl.textContent = '';

    const username = document.getElementById('loginUsername').value.trim();
    const password = document.getElementById('loginPassword').value;

    if (!username || !password) {
        errEl.textContent = ' Kullanıcı adı ve şifre gerekli!';
        const icon = document.createElement('i');
        icon.className = 'fa-solid fa-circle-xmark';
        errEl.prepend(icon);
        errEl.innerHTML = ' <i class="fa-solid fa-circle-xmark"></i> ' + 'Kullanıcı adı ve şifre gerekli!';
        return false;
    }

    // Buton loading state
    btn.disabled = true;
    btn.innerHTML = '<div class="btn-spinner"></div> Giriş yapılıyor...';

    try {
        const r = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ username, password })
        });
        const data = await r.json();

        if (data.success) {
            errEl.style.color = '#34d399';
            errEl.textContent = ' ' + data.message;
            errEl.innerHTML = ' <i class="fa-solid fa-circle-check"></i> ' + data.message;
            setTimeout(() => {
                hideAuthScreen();
                initGame();
            }, 800);
        } else {
            errEl.style.color = '#f87171';
            errEl.textContent = ' ' + (data.error || 'Giriş başarısız!');
            errEl.innerHTML = ' <i class="fa-solid fa-circle-xmark"></i> ' + (data.error || 'Giriş başarısız!');
            btn.disabled = false;
            btn.innerHTML = '<img src="/img/logo1.png" class="auth-btn-icon" alt="logo"> Giriş Yap';
        }
    } catch (e) {
        errEl.style.color = '#f87171';
        errEl.innerHTML = '<i class="fa-solid fa-circle-xmark"></i> Sunucuya bağlanılamadı. Lütfen bir kaç saniye bekleyip tekrar deneyin.';
        btn.disabled = false;
        btn.innerHTML = '<img src="/img/logo1.png" class="auth-btn-icon" alt="logo"> Giriş Yap';
    }
    return false;
}

// ============ HANDLE REGISTER ============
async function handleRegister(event) {
    event.preventDefault();
    const btn = document.getElementById('registerBtn');
    const errEl = document.getElementById('authError');
    errEl.textContent = '';
    errEl.style.color = '#f87171';

    const username = document.getElementById('regUsername').value.trim();
    const password = document.getElementById('regPassword').value;
    const tosChecked = document.getElementById('tosCheckbox').checked;

    if (!username || !password) {
        errEl.innerHTML = '<i class="fa-solid fa-circle-xmark"></i> Kullanıcı adı ve şifre gerekli!';
        return false;
    }
    if (username.length < 3 || username.length > 30) {
        errEl.innerHTML = '<i class="fa-solid fa-circle-xmark"></i> Kullanıcı adı 3-30 karakter olmalı!';
        return false;
    }
    if (/[<>]/.test(username)) {
        errEl.innerHTML = '<i class="fa-solid fa-circle-xmark"></i> Kullanıcı adında geçersiz karakter var!';
        return false;
    }
    if (password.length < 4) {
        errEl.innerHTML = '<i class="fa-solid fa-circle-xmark"></i> Şifre en az 4 karakter olmalı!';
        return false;
    }
    if (!tosChecked) {
        errEl.innerHTML = '<i class="fa-solid fa-circle-xmark"></i> Kullanıcı sözleşmesini kabul etmelisiniz!';
        return false;
    }

    // Buton loading state
    btn.disabled = true;
    btn.innerHTML = '<div class="btn-spinner"></div> Hesap oluşturuluyor...';

    try {
        const r = await fetch('/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ username, password, tos_accepted: true })
        });
        const data = await r.json();

        if (data.success) {
            errEl.style.color = '#34d399';
            errEl.innerHTML = '<i class="fa-solid fa-cake-candles"></i> ' + data.message;
            setTimeout(() => {
                hideAuthScreen();
                initGame();
            }, 1000);
        } else {
            errEl.style.color = '#f87171';
            errEl.innerHTML = '<i class="fa-solid fa-circle-xmark"></i> ' + (data.error || 'Kayıt başarısız!');
            btn.disabled = false;
            btn.innerHTML = '<img src="/img/logo2.png" class="auth-btn-icon" alt="logo"> Hesap Oluştur & Oyna <i class="fa-solid fa-rocket"></i>';
        }
    } catch (e) {
        errEl.style.color = '#f87171';
        errEl.innerHTML = '<i class="fa-solid fa-circle-xmark"></i> Sunucuya bağlanılamadı. Lütfen bir kaç saniye bekleyip tekrar deneyin.';
        btn.disabled = false;
        btn.innerHTML = '<img src="/img/logo2.png" class="auth-btn-icon" alt="logo"> Hesap Oluştur & Oyna <i class="fa-solid fa-rocket"></i>';
    }
    return false;
}

// ============ PASSWORD VISIBILITY TOGGLE ============
function togglePwVisibility(inputId, btn) {
    const input = document.getElementById(inputId);
    if (!input) return;
    if (input.type === 'password') {
        input.type = 'text';
        btn.innerHTML = '<i class="fa-solid fa-eye-slash"></i>';
    } else {
        input.type = 'password';
        btn.innerHTML = '<i class="fa-solid fa-eye"></i>';
    }
}

// ============ REHBER & AI ASİSTAN ============
async function sendAiMessage() {
    const input = document.getElementById('aiChatInput');
    const box = document.getElementById('aiChatBox');
    const msg = input.value.trim();
    if (!msg) return;

    // Kullanıcı Mesajını Ekle
    const userBubble = document.createElement('div');
    userBubble.style = "align-self: flex-end; background: linear-gradient(135deg, var(--accent), #2563eb); color:white; padding:10px 15px; border-radius:15px 15px 0 15px; max-width:80%;";
    userBubble.textContent = msg;
    box.appendChild(userBubble);
    box.scrollTop = box.scrollHeight;
    input.value = '';

    // Yükleniyor Mesajı
    const loadingBubble = document.createElement('div');
    loadingBubble.style = "align-self: flex-start; background: var(--bg-card); padding:10px 15px; border-radius:15px 15px 15px 0; border:1px solid var(--border); max-width:80%; color:var(--text-muted);";
    loadingBubble.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Düşünüyor...';
    box.appendChild(loadingBubble);
    box.scrollTop = box.scrollHeight;

    try {
        const r = await post('/api/ai/ask', { message: msg });
        box.removeChild(loadingBubble);

        if (r.success) {
            const aiBubble = document.createElement('div');
            aiBubble.style = "align-self: flex-start; background: var(--bg-card); padding:10px 15px; border-radius:15px 15px 15px 0; border:1px solid var(--border); max-width:80%; line-height:1.5;";
            aiBubble.innerHTML = r.answer.replace(/\n/g, '<br>'); // Satır atlamalarını düzgün göster
            box.appendChild(aiBubble);
        } else {
            const errBubble = document.createElement('div');
            errBubble.style = "align-self: flex-start; background: var(--danger); color:white; padding:10px 15px; border-radius:15px 15px 15px 0; max-width:80%;";
            errBubble.textContent = "Hata: " + r.error;
            box.appendChild(errBubble);
        }
        box.scrollTop = box.scrollHeight;
    } catch (err) {
        box.removeChild(loadingBubble);
        const errBubble = document.createElement('div');
        errBubble.style = "align-self: flex-start; background: var(--danger); color:white; padding:10px 15px; border-radius:15px 15px 15px 0; max-width:80%;";
        errBubble.textContent = "Bağlantı Hatası: " + err.message;
        box.appendChild(errBubble);
        box.scrollTop = box.scrollHeight;
    }
}

// ============ PASSWORD STRENGTH METER ============
function updatePwStrength(pw) {
    const fill = document.getElementById('pwStrengthFill');
    const text = document.getElementById('pwStrengthText');
    if (!fill || !text) return;

    let score = 0;
    if (pw.length >= 4) score++;
    if (pw.length >= 8) score++;
    if (/[A-Z]/.test(pw)) score++;
    if (/[0-9]/.test(pw)) score++;
    if (/[^A-Za-z0-9]/.test(pw)) score++;

    const levels = [
        { pct: '0%', color: '#ef4444', label: 'Çok Zayıf' },
        { pct: '25%', color: '#ef4444', label: 'Zayıf' },
        { pct: '50%', color: '#f59e0b', label: 'Orta' },
        { pct: '75%', color: '#3b82f6', label: 'Güçlü' },
        { pct: '100%', color: '#10b981', label: 'Çok Güçlü' },
    ];
    const lvl = levels[Math.min(score, 4)];
    fill.style.width = pw.length === 0 ? '0%' : lvl.pct;
    fill.style.background = lvl.color;
    text.textContent = pw.length === 0 ? 'Şifre gücü: —' : `Şifre gücü: ${lvl.label}`;
    text.style.color = pw.length === 0 ? 'rgba(148,163,184,0.7)' : lvl.color;
}

// ============ USERNAME VALIDATION UI ============
function validateRegUsername(input) {
    const val = input.value;
    if (val.length > 0 && val.length < 3) {
        input.style.borderColor = 'rgba(239,68,68,0.7)';
    } else if (val.length >= 3 && val.length <= 30) {
        input.style.borderColor = 'rgba(16,185,129,0.7)';
    } else {
        input.style.borderColor = '';
    }
}

// ============ TOS MODAL ============
function openTosModal() {
    const m = document.getElementById('tosModal');
    if (m) { m.style.display = 'flex'; m.classList.add('active'); }
}

function closeTosModal() {
    const m = document.getElementById('tosModal');
    if (m) { m.style.display = 'none'; m.classList.remove('active'); }
}
function openTosModal() {
    const m = document.getElementById('tosModal');
    if (m) { m.style.display = 'flex'; m.classList.add('active'); }
}

function closeTosModal() {
    const m = document.getElementById('tosModal');
    if (m) { m.style.display = 'none'; m.classList.remove('active'); }
}

function openAboutModal() {
    const m = document.getElementById('aboutModal');
    if (m) { m.style.display = 'flex'; m.classList.add('active'); }
}

function closeAboutModal() {
    const m = document.getElementById('aboutModal');
    if (m) { m.style.display = 'none'; m.classList.remove('active'); }
}

// ============ LOGOUT ============
async function logout() {
    try {
        await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    } catch (e) { }
    showAuthScreen();
    switchAuthTab('login');
    document.getElementById('authError').textContent = '';
    notify('Çıkış yapıldı.', 'info');
}

// ============ INIT ON DOM READY ============
document.addEventListener('DOMContentLoaded', () => {
    // önce auth ekranını göster, sonra session kontrolü yap
    showAuthScreen();
    checkAuth();

    // AI Enter key mapping
    const aiInput = document.getElementById('aiChatInput');
    if (aiInput) {
        aiInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') sendAiMessage();
        });
    }
});



// Marka logosu render - path ise img, değilse text
const brandLogo = (logo, size = 24) => {
    if (!logo) return '';
    if (!window.myCars || !window.myCars.length) loadMyCars(); // Yarış arabası yükleme mantığı için eklendi (async olmadığı için awaitsiz)
    // Emojileri veya varsayılan ikonları Logo2.png ile değiştir
    if (logo === '🏎️' || logo === '<i class="fa-solid fa-car"></i>' || logo.includes('fa-car-side')) {
        return `<img src="/img/logo2.png" alt="logo" class="brand-logo-img" style="width:${size}px;height:${size}px;object-fit:contain;border-radius:50%">`;
    }
    if (logo.startsWith('/img/') || logo.startsWith('http')) {
        return `<img src="${logo}" alt="logo" class="brand-logo-img" style="width:${size}px;height:${size}px;object-fit:contain;border-radius:50%">`;
    }
    return logo;
};

// İşlem açıklamalarını Türkçeleştir
function translateTransactionDesc(desc) {
    if (!desc) return '';
    const dLower = desc.toLowerCase();
    const translations = {
        'loan_payment': 'ÖDEME',
        'income': 'GELİR',
        'expense': 'GİDER',
        'market_sell': 'Pazaryeri Satışı',
        'car_buy': 'Araç Alımı',
        'staff_salary': 'Personel Maaşları',
        'race_fee': 'Yarış Katılım Ücreti',
        'race_prize': 'Yarış Ödülü'
    };
    // Büyük/küçük harf duyarsız kontrol
    return translations[dLower] || desc;
}

// Inputlar için binlik ayraç ekleyici (typing handling)
function setupPriceInput(inputId) {
    const el = document.getElementById(inputId);
    if (!el) return;
    el.addEventListener('input', (e) => {
        let val = e.target.value.replace(/\D/g, '');
        if (val) {
            e.target.value = Number(val).toLocaleString('tr-TR');
        }
    });
}

function getRawValue(inputId) {
    const el = document.getElementById(inputId);
    if (!el) return 0;
    return parseInt(el.value.replace(/\D/g, '')) || 0;
}

function notify(msg, type = 'info') {
    const c = document.getElementById('notifications');
    const icons = {
        success: '<i class="fa-solid fa-circle-check"></i>',
        error: '<i class="fa-solid fa-circle-xmark"></i>',
        info: '<i class="fa-solid fa-circle-info"></i>',
        offer: '<i class="fa-solid fa-hand-holding-dollar"></i>',
        warning: '<i class="fa-solid fa-triangle-exclamation"></i>'
    };
    const el = document.createElement('div');
    el.className = `notification ${type}`;
    el.innerHTML = `<span class="notif-icon">${icons[type] || '<i class="fa-solid fa-circle-info"></i>'}</span>${msg}`;
    c.appendChild(el);
    setTimeout(() => {
        el.classList.add('slide-out');
        setTimeout(() => el.remove(), 300);
    }, 4500);
}

function showConfirm(message) {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.className = 'modal active';
        overlay.style.zIndex = '100000';
        overlay.style.display = 'flex';

        const content = document.createElement('div');
        content.className = 'modal-content';
        content.style.maxWidth = '350px';
        content.style.textAlign = 'center';
        content.style.padding = '30px 20px';

        content.innerHTML = `
            <div style="font-size: 48px; color: var(--warning); margin-bottom: 15px;">
                <i class="fa-solid fa-circle-question"></i>
            </div>
            <h3 style="margin-bottom: 15px; font-size: 18px;">Onay Gerekiyor</h3>
            <p style="color: var(--text-secondary); margin-bottom: 25px; font-size: 14px; line-height: 1.5;">${message}</p>
            <div style="display: flex; gap: 10px; justify-content: center;">
                <button class="btn btn-ghost" id="confirmCancelBtn" style="flex:1; padding: 10px;">İptal</button>
                <button class="btn btn-primary" id="confirmOkBtn" style="flex:1; padding: 10px;">Tamam</button>
            </div>
        `;

        overlay.appendChild(content);
        document.body.appendChild(overlay);

        const cleanup = () => {
            if (document.body.contains(overlay)) {
                document.body.removeChild(overlay);
            }
        };

        document.getElementById('confirmCancelBtn').onclick = () => {
            cleanup();
            resolve(false);
        };

        document.getElementById('confirmOkBtn').onclick = () => {
            cleanup();
            resolve(true);
        };
    });
}

async function api(path, opts) {
    try {
        const r = await fetch(API + path, {
            credentials: 'include',
            ...opts
        });
        const data = await r.json();
        if (data.needLogin) { showAuthScreen(); return { success: false }; }
        return data;
    } catch (e) { if (!isReconnecting) notify('Bağlantı hatası!', 'error'); return { success: false }; }
}
const get = path => api(path);
const post = (path, body) => api(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const del = path => api(path, { method: 'DELETE' });


// ============ NAVIGATION ============
let previousPage = 'home';
function navigateTo(page) {
    if (currentPage !== page && currentPage !== 'notifications') window.previousNavPage = currentPage;
    currentPage = page;
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const el = document.getElementById(page + 'Page');
    if (el) el.classList.add('active');
    document.querySelectorAll('.nav-btn, .bottom-nav-btn, .more-menu-item, .sidebar-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.page === page);
    });
    closeMoreMenu();
    const loaders = {
        home: loadHome, explore: loadCars, categories: loadBrands, mycars: loadMyCars,
        listings: loadListings, favorites: loadFavorites, bank: loadBank,
        profitchart: loadProfitChart, factory: loadFactory, custom: loadCustom, profile: loadProfile,
        illegal: loadIllegal, junkyard: loadJunkyard, races: loadRaces,
        management: loadManagement, upgrades: loadUpgrades,
        leaderboard: loadLeaderboard, achievements: loadAchievements,
        feedback: loadFeedbacks, notifications: loadNotifications,
        bilgibankasi: loadBilgiBankasi
    };
    if (loaders[page]) loaders[page]();
    if (typeof updatePlayerUI === 'function') updatePlayerUI();
}

function toggleNotificationsPage() {
    if (currentPage === 'notifications') {
        navigateTo(window.previousNavPage || 'home');
    } else {
        navigateTo('notifications');
    }
}

// More menu functions
function toggleMoreMenu(e) {
    if (e) e.stopPropagation();
    const menu = document.getElementById('moreMenu');
    const overlay = document.getElementById('moreMenuOverlay');

    if (menu) {
        menu.classList.toggle('active');
        if (overlay) overlay.classList.toggle('active');

        // Prevent body scroll when menu is active
        if (menu.classList.contains('active')) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
    }
}

function closeMoreMenu() {
    const menu = document.getElementById('moreMenu');
    const overlay = document.getElementById('moreMenuOverlay');

    if (menu) menu.classList.remove('active');
    if (overlay) overlay.classList.remove('active');

    document.body.style.overflow = '';
}

// Sidebar toggle (desktop)
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    sidebar.classList.toggle('collapsed');
    const icon = document.getElementById('sidebarToggleIcon');
    icon.innerHTML = sidebar.classList.contains('collapsed')
        ? '<i class="fa-solid fa-chevron-right"></i>'
        : '<i class="fa-solid fa-chevron-left"></i>';
}

// ============ THEME ============
function toggleTheme() {
    const html = document.documentElement;
    const t = html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    html.setAttribute('data-theme', t);
    document.getElementById('themeIcon').innerHTML = t === 'dark' ? '<i class="fa-solid fa-moon"></i>' : '<i class="fa-solid fa-sun"></i>';
    post('/api/player/theme', { theme: t });
}

// ============ PLAYER ============
async function loadPlayer() {
    const r = await get('/api/player/info');
    if (!r.success) return;
    playerData = r.data;
    updatePlayerUI();
    checkUnreadCount();
}

function updatePlayerUI() {
    const p = playerData;
    if (!p || !p.balance) return;
    document.getElementById('playerBalance').textContent = fmtPrice(p.balance);
    document.getElementById('playerLevel').textContent = `Lv ${p.level}`;
    document.getElementById('playerPrestige').textContent = fmt(p.prestige_score);
    const pct = Math.min(100, (p.xp / p.xp_needed) * 100);
    document.getElementById('xpBar').style.width = pct + '%';
    document.getElementById('xpText').textContent = `${fmt(p.xp)} / ${fmt(p.xp_needed)} XP`;
    document.getElementById('seizureBanner').style.display = p.is_seized ? 'block' : 'none';
    if (p.theme) {
        document.documentElement.setAttribute('data-theme', p.theme);
        document.getElementById('themeIcon').innerHTML = p.theme === 'dark' ? '<i class="fa-solid fa-moon"></i>' : '<i class="fa-solid fa-sun"></i>';
    }
    // Risk bar
    const risk = parseFloat(p.risk_level) || 0;
    const riskContainer = document.getElementById('riskBarContainer');

    // Yalnızca illegal sekmesinde göster
    if (risk > 0 && typeof currentPage !== 'undefined' && currentPage === 'illegal') {
        riskContainer.style.display = 'flex';
        document.getElementById('riskBar').style.width = risk + '%';
        document.getElementById('riskText').textContent = `%${Math.round(risk)}`;
        if (risk >= 80) document.getElementById('riskBar').style.background = 'linear-gradient(90deg, #ef4444, #dc2626)';
        else if (risk >= 50) document.getElementById('riskBar').style.background = 'linear-gradient(90deg, #f59e0b, #ef4444)';
        else document.getElementById('riskBar').style.background = 'linear-gradient(90deg, #fbbf24, #f59e0b)';
    } else {
        riskContainer.style.display = 'none';
    }

    // Avatar update
    if (p.avatar) {
        document.getElementById('topAvatarImg').src = p.avatar;
        const profileImg = document.getElementById('profileAvatarImg');
        if (profileImg) profileImg.src = p.avatar;

        // Highlight active avatar in grid
        document.querySelectorAll('.avatar-item').forEach(el => {
            const img = el.querySelector('img');
            if (img && img.getAttribute('src') === p.avatar) {
                el.classList.add('active');
            } else {
                el.classList.remove('active');
            }
        });
    }
}

function updateFromResponse(r) {
    if (r.player) { playerData = r.player; updatePlayerUI(); }
}

// ============ DAMAGE HELPERS ============
function dmgBadge(s) {
    const m = { 'Hasarsız': 'hasarsiz', 'Çizik': 'cizik', 'Boyalı': 'boyali', 'Değişen': 'degisen', 'Hasarlı': 'hasarli' };
    return `<span class="car-badge badge-${m[s] || 'hasarsiz'}">${s}</span>`;
}
function partClass(s) {
    return { 'Orijinal': 'orijinal', 'Çizik': 'cizik', 'Boyalı': 'boyali', 'Değişen': 'degisen', 'Hasarlı': 'hasarli' }[s] || '';
}
function prestigeClass(p) { return 'prestige-' + Math.min(10, Math.max(1, p || 1)); }

// ============ CAR CARD HTML ============
function carCardHTML(c, showActions = false, playerCar = false) {
    const favIcon = c.is_favorited ? '<i class="fa-solid fa-heart"></i>' : '<i class="fa-regular fa-heart"></i>';
    let actionsHTML = '';
    if (showActions && playerCar) {
        actionsHTML = `<div class="my-car-actions">
            <button class="btn btn-sm btn-primary" onclick="event.stopPropagation();openSellModal(${c.player_car_id})"><i class="fa-solid fa-file-invoice-dollar"></i> Sat</button>
            <button class="btn btn-sm btn-warning" onclick="event.stopPropagation();openServiceModal(${c.player_car_id})"><i class="fa-solid fa-screwdriver-wrench"></i> Servis</button>
            <button class="btn btn-sm btn-gold" onclick="event.stopPropagation();setPersonalCar(${c.player_car_id})"><i class="fa-solid fa-star"></i></button>
        </div>`;
    }
    return `<div class="car-card" onclick="${playerCar ? `openCarDetail(${c.car_id || c.id})` : `openCarDetail(${c.id})`}">
        <div class="car-card-image ${prestigeClass(c.prestige)}">
            <span>${brandLogo(c.logo_emoji, 48)}</span>
            ${dmgBadge(c.damage_status)}
            ${!playerCar ? `<span class="seller-badge"><i class="fa-solid fa-shop"></i> ${c.seller_type || 'Galeri'}</span>` : ''}
            ${c.is_personal ? '<span class="personal-badge"><i class="fa-solid fa-star"></i> Kişisel</span>' : ''}
            ${!playerCar ? `<button class="fav-btn ${c.is_favorited ? 'active' : ''}" onclick="event.stopPropagation();toggleFav(${c.id})">${favIcon}</button>` : ''}
        </div>
        <div class="car-card-body">
            <div class="car-card-title">${brandLogo(c.logo_emoji, 18)} ${c.brand_name} ${c.model_name}</div>
            <div class="car-card-details">
                <div class="car-detail-item"><span class="detail-icon"><i class="fa-solid fa-calendar-days"></i></span> ${c.year}</div>
                <div class="car-detail-item"><span class="detail-icon"><i class="fa-solid fa-road"></i></span> ${fmt(c.km)} km</div>
                <div class="car-detail-item"><span class="detail-icon"><i class="fa-solid fa-gas-pump"></i></span> ${c.fuel_type || '-'}</div>
                <div class="car-detail-item"><span class="detail-icon"><i class="fa-solid fa-palette"></i></span> ${c.color || '-'}</div>
            </div>
            <div class="car-card-footer">
                <span class="car-price">${fmtPrice(c.price)}</span>
                ${c.has_listing ? '<span class="listing-type type-normal">İlanda</span>' : ''}
            </div>
            ${actionsHTML}
        </div>
    </div>`;
}

// ============ DASHBOARD & TRENDS ============
async function loadHome(silent = false) {
    if (!silent) {
        // Optional pre-loading skeleton can be added here if necessary
    }
    const res = await get('/api/dashboard');
    if (!res.success) return;

    const { player, top3, trend, transactions } = res.data;
    playerData = player;
    updatePlayerUI();

    // Hero
    document.getElementById('heroUsername').textContent = player.username;

    // Stats
    document.getElementById('dashBalance').textContent = fmtPrice(player.balance);
    document.getElementById('dashProfit').textContent = fmtPrice(player.total_profit);
    document.getElementById('dashSales').textContent = player.total_sales;

    // Top 3 Leaderboard
    const top3List = document.getElementById('dashTop3');
    top3List.innerHTML = top3.map((p, i) => `
        <div class="mini-item">
            <div class="mini-info">
                <span class="mini-rank">${i + 1}</span>
                <span class="mini-name">${p.username}</span>
            </div>
            <span class="mini-val">${fmt(p.prestige_score)} Puan</span>
        </div>
    `).join('') || '<p class="text-muted">Henüz veri yok.</p>';

    // Trend
    const trendBox = document.getElementById('dashTrend');
    if (trend) {
        trendBox.innerHTML = `
            <strong>${trend.name}</strong>
            <p>${trend.description}</p>
        `;
    } else {
        trendBox.innerHTML = `
            <strong>Normal Piyasa</strong>
            <p>Piyasada her şey yolunda, fiyatlar stabil.</p>
        `;
    }

    // Transactions
    const transList = document.getElementById('dashTransactions');
    transList.innerHTML = transactions.map(t => {
        let desc = translateTransactionDesc(t.description);
        return `<div class="mini-item trans-item">
            <span class="trans-desc">${desc}</span>
            <span class="trans-amount ${t.type === 'income' || t.type === 'sell' ? 'text-success' : 'text-danger'}">
                ${t.type === 'income' || t.type === 'sell' ? '+' : '-'}${fmtPrice(t.amount)}
            </span>
        </div>`;
    }).join('') || '<p class="text-muted">İşlem geçmişi boş.</p>';

    // Timer setup (sadece bir kez başlatılır, senkronizasyon socket ile yapılır)
    if (!window.dayTimerStarted) {
        window.dayTimerStarted = true;
        setupDayTimer();
    }
}

let timeLeft = 30;
function setupDayTimer() {
    const duration = 30;

    if (window.dayTimerInterval) clearInterval(window.dayTimerInterval);

    const updateTimerUI = () => {
        const minutes = Math.floor(Math.max(0, timeLeft) / 60);
        const seconds = Math.max(0, timeLeft) % 60;
        const el = document.getElementById('nextDayTimer');
        if (el) el.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

        const progress = ((duration - Math.max(0, timeLeft)) / duration) * 100;
        const bar = document.getElementById('timerProgressBar');
        if (bar) bar.style.width = progress + '%';

        if (timeLeft > 0) timeLeft--;
    };

    updateTimerUI();
    window.dayTimerInterval = setInterval(updateTimerUI, 1000);
}

// Socket senkronizasyonu
// Socket senkronizasyonu
socket.on('day_reset', (data) => {
    // Giriş yapmadan bildirim gösterme
    const authScreen = document.getElementById('authScreen');
    if (authScreen && authScreen.classList.contains('active')) return;

    timeLeft = data.nextResetIn || 30;
    notify('Yeni bir gün başladı! <i class="fa-solid fa-sun-bright"></i> Teklifler güncellendi.', 'info');
    if (window.dayTimerInterval) {
        setupDayTimer();
    }
    // Only reload specific passive components or preserve scroll state
    if (currentPage === 'home') loadHome(true);
    if (currentPage === 'listings') loadListings(true);
    if (currentPage === 'explore') loadCars(carsPage, true);
});


// ============ EXPLORE ============
let carsPage = 1;
async function loadCars(page = 1, silent = false) {
    carsPage = page;
    const p = new URLSearchParams();
    const f = id => document.getElementById(id)?.value;
    if (f('filterBrand')) p.set('brand_id', f('filterBrand'));
    if (f('filterModel')) p.set('model_id', f('filterModel'));
    if (f('filterDamage')) p.set('damage_status', f('filterDamage'));
    if (f('filterSeller')) p.set('seller_type', f('filterSeller'));
    if (f('filterFuel')) p.set('fuel_type', f('filterFuel'));
    if (f('filterPriceMin')) p.set('price_min', getRawValue('filterPriceMin'));
    if (f('filterPriceMax')) p.set('price_max', getRawValue('filterPriceMax'));
    if (f('filterYearMin')) p.set('year_min', f('filterYearMin'));
    if (f('filterYearMax')) p.set('year_max', f('filterYearMax'));
    const sv = f('filterSort');
    if (sv) { const [s, o] = sv.split('-'); p.set('sort', s); p.set('order', o); }
    p.set('page', page); p.set('limit', 20);

    const grid = document.getElementById('carsGrid');
    if (!silent) grid.innerHTML = '<div class="loading"><div class="spinner"></div><span>Yükleniyor...</span></div>';

    const r = await get('/api/cars?' + p.toString());
    if (!r.success) { grid.innerHTML = '<div class="empty-state"><div class="empty-icon"><i class="fa-solid fa-ban"></i></div><div class="empty-text">Hata oluştu</div></div>'; return; }
    if (!r.data.length) { grid.innerHTML = '<div class="empty-state"><div class="empty-icon"><i class="fa-solid fa-magnifying-glass"></i></div><div class="empty-text">Araç bulunamadı</div><div class="empty-sub">Filtreleri değiştirmeyi deneyin</div></div>'; return; }

    grid.innerHTML = r.data.map(c => carCardHTML(c)).join('');
    renderPagination(r.pagination);
}

function renderPagination(pg) {
    if (!pg) return;
    const el = document.getElementById('pagination');
    let html = '';
    html += `<button class="page-btn" ${pg.page <= 1 ? 'disabled' : ''} onclick="loadCars(${pg.page - 1})">‹</button>`;
    for (let i = 1; i <= pg.totalPages; i++) {
        if (i > pg.page + 3 || i < pg.page - 3) continue;
        html += `<button class="page-btn ${i === pg.page ? 'active' : ''}" onclick="loadCars(${i})">${i}</button>`;
    }
    html += `<button class="page-btn" ${pg.page >= pg.totalPages ? 'disabled' : ''} onclick="loadCars(${pg.page + 1})">›</button>`;
    el.innerHTML = html;
}

// Brands/Models for filter
async function loadBrandsForFilter() {
    const r = await get('/api/brands');
    if (!r.success) return;
    const sel = document.getElementById('filterBrand');
    r.data.forEach(b => { const o = document.createElement('option'); o.value = b.id; o.textContent = `${b.name}`; sel.appendChild(o); });
}

document.getElementById('filterBrand')?.addEventListener('change', async function () {
    const ms = document.getElementById('filterModel');
    ms.innerHTML = '<option value="">Tüm Modeller</option>';
    ms.disabled = true;
    if (!this.value) return;
    const r = await get('/api/models?brand_id=' + this.value);
    if (r.success && r.data.length) { ms.disabled = false; r.data.forEach(m => { const o = document.createElement('option'); o.value = m.id; o.textContent = m.name; ms.appendChild(o); }); }
});

document.getElementById('filterApply')?.addEventListener('click', () => loadCars(1));
setupPriceInput('filterPriceMin');
setupPriceInput('filterPriceMax');
document.getElementById('filterClear')?.addEventListener('click', () => {
    document.querySelectorAll('.filter-select').forEach(s => s.selectedIndex = 0);
    document.querySelectorAll('.filter-input').forEach(i => i.value = '');
    document.getElementById('filterModel').disabled = true;
    loadCars(1);
});

// ============ FAVORITES ============
async function toggleFav(carId) {
    const r = await post(`/api/favorites/${carId}`);
    if (r.success) { notify(r.message || 'Favori güncellendi', 'success'); if (currentPage === 'explore') loadCars(carsPage); if (currentPage === 'favorites') loadFavorites(); }
}

async function loadFavorites() {
    const grid = document.getElementById('favoritesGrid');
    grid.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
    const r = await get('/api/favorites');
    if (!r.success || !r.data.length) { grid.innerHTML = '<div class="empty-state"><div class="empty-icon"><i class="fa-solid fa-heart"></i></div><div class="empty-text">Henüz favori yok</div><div class="empty-sub">Keşfet sayfasından araçları favorilere ekle</div></div>'; return; }
    grid.innerHTML = r.data.map(c => carCardHTML(c)).join('');
}

// ============ CATEGORIES ============
async function loadBrands() {
    const grid = document.getElementById('brandsGrid');
    grid.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
    document.getElementById('brandsSection').style.display = '';
    document.getElementById('modelsSection').style.display = 'none';
    document.getElementById('modelCarsSection').style.display = 'none';
    const r = await get('/api/brands');
    if (!r.success) return;
    grid.innerHTML = r.data.map(b => {
        const pc = b.prestige <= 3 ? 'low' : b.prestige <= 5 ? 'mid' : b.prestige <= 7 ? 'high' : 'ultra';
        return `<div class="brand-card" onclick="loadModels(${b.id},'${b.name}','${b.logo_emoji.replace(/'/g, "\\'")}')">
            <div class="brand-logo">${brandLogo(b.logo_emoji, 40)}</div>
            <div class="brand-name">${b.name}</div>
            <div class="brand-info">${b.country || ''}</div>
            <span class="brand-prestige prestige-${pc}"><i class="fa-solid fa-star"></i> ${b.prestige}/10</span>
        </div>`;
    }).join('');
}

async function loadModels(brandId, brandName, emoji) {
    document.getElementById('brandsSection').style.display = 'none';
    document.getElementById('modelsSection').style.display = '';
    document.getElementById('selectedBrandTitle').innerHTML = `${brandLogo(emoji, 24)} ${brandName} Modelleri`;
    const grid = document.getElementById('modelsGrid');
    grid.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
    const r = await get('/api/models?brand_id=' + brandId);
    if (!r.success) return;
    grid.innerHTML = r.data.map(m => {
        const tc = m.tier <= 1 ? '1' : m.tier <= 2 ? '2' : m.tier <= 3 ? '3' : '4';
        return `<div class="model-card" onclick="loadModelCars(${brandId},${m.id},'${brandName} ${m.name}')">
            <div class="model-name">${m.name}</div>
            <div class="model-info">${m.body_type || 'Sedan'} | ${fmtPrice(m.base_price)}</div>
            <span class="model-tier tier-${tc}">Tier ${m.tier}</span>
        </div>`;
    }).join('');
}

async function loadModelCars(brandId, modelId, title) {
    document.getElementById('modelsSection').style.display = 'none';
    document.getElementById('modelCarsSection').style.display = '';
    document.getElementById('selectedModelTitle').textContent = title;
    const grid = document.getElementById('modelCarsGrid');
    grid.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
    const r = await get(`/api/cars?brand_id=${brandId}&model_id=${modelId}`);
    if (!r.success || !r.data.length) { grid.innerHTML = '<div class="empty-state"><div class="empty-icon"><i class="fa-solid fa-car"></i></div><div class="empty-text">Bu modelde araç yok</div></div>'; return; }
    grid.innerHTML = r.data.map(c => carCardHTML(c)).join('');
}

document.getElementById('backToBrands')?.addEventListener('click', loadBrands);
document.getElementById('backToModels')?.addEventListener('click', () => { document.getElementById('modelCarsSection').style.display = 'none'; document.getElementById('modelsSection').style.display = ''; });

// ============ CAR DETAIL MODAL ============
async function openCarDetail(carId) {
    currentCarId = carId;
    const r = await get('/api/cars/' + carId);
    if (!r.success) return;
    const c = r.data;
    const mv = c.marketValue || {};
    const ins = c.inspection;

    const isMarket = c.owner_type !== 'player' && c.is_available === 1;
    const isSahibinden = c.seller_type === 'Sahibinden';
    const hasExpertise = !!ins;
    const showFullDetails = !isSahibinden || hasExpertise; // Galeri/Bayi aracıysa veya Expertizliyse detayları göster

    let partsHTML = '';
    if (showFullDetails && c.parts && c.parts.length) {
        partsHTML = `<div class="detail-section"><div class="detail-section-title"><i class="fa-solid fa-gears"></i> Parça Durumları</div>
            <div class="parts-grid">${c.parts.map(p => `<div class="part-item"><span>${p.part_name}</span><span class="part-status ${partClass(p.status)}">${p.status}</span></div>`).join('')}</div></div>`;
    }

    let mvHTML = '';
    if (showFullDetails && mv.marketValue) {
        const ac = mv.assessment === 'Uygun' ? 'good' : mv.assessment === 'Normal' ? 'neutral' : 'bad';
        mvHTML = `<div class="market-value-section"><div class="market-value-title"><i class="fa-solid fa-chart-line"></i> Piyasa Analizi</div>
            <div class="market-value-grid">
                <div class="mv-item"><div class="mv-label">Piyasa Değeri</div><div class="mv-value good">${fmtPrice(mv.marketValue)}</div></div>
                <div class="mv-item"><div class="mv-label">Önerilen Satış</div><div class="mv-value neutral">${fmtPrice(mv.suggestedPrice)}</div></div>
                <div class="mv-item"><div class="mv-label">İlan Fiyatı</div><div class="mv-value">${fmtPrice(c.price)}</div></div>
            </div>
            <span class="assessment-badge assessment-${ac}">${mv.assessment}</span>
        </div>`;
    }

    let insHTML = '';
    if (ins) {
        const sc = ins.score >= 70 ? 'good' : ins.score >= 50 ? 'ok' : 'bad';
        const issues = typeof ins.issues === 'string' ? JSON.parse(ins.issues) : (ins.issues || []);
        insHTML = `<div class="expertiz-section"><div class="detail-section-title"><i class="fa-solid fa-magnifying-glass-chart"></i> Expertiz Raporu</div>
            <div class="expertiz-score"><div class="score-circle score-${sc}">${ins.score}</div><div><div style="font-weight:700">${ins.verdict}</div><div style="font-size:11px;color:var(--text-muted)">Puan: ${ins.score}/100</div></div></div>
            ${issues.length ? `<ul class="expertiz-issues">${issues.map(i => `<li>${i}</li>`).join('')}</ul>` : ''}
        </div>`;
    }

    const warningHtml = isSahibinden ? `<div style="font-size:11px;color:var(--warning);margin-top:10px;text-align:center;grid-column:1/-1"><i class="fa-solid fa-triangle-exclamation"></i> Sahibinden araç alırken expertiz yaptırmayı ihmal etmeyin!</div>` : '';

    const actionsHTML = isMarket ? `<div class="detail-actions">
        <button class="btn btn-lg btn-success" onclick="buyCar(${c.id})"><i class="fa-solid fa-cart-shopping"></i> Satın Al (${fmtPrice(c.price)})</button>
        <button class="btn btn-lg btn-warning" onclick="openBargainModal(${c.id},${c.price},${mv.marketValue || c.price})"><i class="fa-solid fa-handshake"></i> Pazarlık Et</button>
        ${isSahibinden && !hasExpertise ?
            `<button class="btn btn-lg btn-premium" onclick="inspectCar(${c.id})"><i class="fa-solid fa-file-contract"></i> Expertiz Yaptır</button>` : ''}
        <button class="btn btn-lg btn-ghost" onclick="toggleFav(${c.id})"><i class="fa-solid fa-heart"></i> Favori</button>
        ${warningHtml}
    </div>` : '';

    const mhPct = c.motor_health || 0;
    const mhColor = mhPct >= 80 ? 'var(--success)' : mhPct >= 50 ? 'var(--warning)' : 'var(--danger)';
    const mhLabel = mhPct >= 80 ? 'Sağlıklı' : mhPct >= 50 ? 'Orta' : 'Kötü';
    const cleanPct = c.cleanliness || 0;
    const cleanColor = cleanPct >= 80 ? 'var(--success)' : cleanPct >= 50 ? 'var(--warning)' : 'var(--danger)';

    let specsHTML = '';
    if (showFullDetails) {
        specsHTML = `<div class="detail-specs-grid">
            <div class="detail-spec-item"><span class="spec-label">Beygir Gücü</span><span class="spec-value">${c.horsepower} HP</span></div>
            <div class="detail-spec-item"><span class="spec-label">Tork</span><span class="spec-value">${c.torque} Nm</span></div>
            <div class="detail-spec-item"><span class="spec-label">Max Hız</span><span class="spec-value">${c.top_speed} km/h</span></div>
            <div class="detail-spec-item"><span class="spec-label">Motor</span><span class="spec-value">${c.engine_size}L</span></div>
            <div class="detail-spec-item"><span class="spec-label">Motor Sağlığı</span><span class="spec-value" style="color:${mhColor}">%${mhPct} ${mhLabel}</span>
                <div class="motor-health-bar"><div class="motor-health-fill" style="width:${mhPct}%;background:${mhColor}"></div></div></div>
            <div class="detail-spec-item"><span class="spec-label">Temizlik</span><span class="spec-value" style="color:${cleanColor}">%${cleanPct}</span>
                <div class="motor-health-bar"><div class="motor-health-fill" style="width:${cleanPct}%;background:${cleanColor}"></div></div></div>
        </div>`;
    } else {
        specsHTML = `<div style="text-align:center; padding:15px; margin:10px 0; background:var(--bg-card); border-radius:12px; border:1px dashed var(--border);">
            <i class="fa-solid fa-lock" style="color:var(--text-muted); font-size:24px; margin-bottom:10px;"></i>
            <p style="color:var(--text-secondary); font-size:13px; margin:0;">Araç detayları ve kondisyon raporu expertiz yapılmadan gösterilemez.</p>
        </div>`;
    }

    const dmgColors = { 'Hasarsız': 'var(--success)', 'Çizik': 'var(--gold)', 'Boyalı': 'var(--warning)', 'Değişen': 'var(--danger)', 'Hasarlı': '#fca5a5', 'Pert': '#fca5a5' };
    const engColors = { 'Mükemmel': 'var(--success)', 'İyi': 'var(--accent)', 'Orta': 'var(--warning)', 'Kötü': 'var(--danger)', 'Ölü': '#fca5a5' };

    let durumSecHTML = '';
    if (showFullDetails) {
        durumSecHTML = `<div class="detail-section"><div class="detail-section-title"><i class="fa-solid fa-screwdriver-wrench"></i> Durum</div>
            <div class="detail-row"><span class="detail-label">Hasar</span><span class="detail-value" style="color:${dmgColors[c.damage_status] || 'inherit'}">${c.damage_status}</span></div>
            <div class="detail-row"><span class="detail-label">Motor Durumu</span><span class="detail-value" style="color:${engColors[c.engine_status] || 'inherit'}">${c.engine_status}</span></div>
            <div class="detail-row"><span class="detail-label">Motor Sağlığı</span><span class="detail-value" style="color:${mhColor}">%${mhPct}</span></div>
            <div class="detail-row"><span class="detail-label">Temizlik</span><span class="detail-value" style="color:${cleanColor}">%${cleanPct}</span></div>
            <div class="detail-row"><span class="detail-label">İç Mekan</span><span class="detail-value">${c.interior} (${c.interior_color})</span></div>
            <div class="detail-row"><span class="detail-label">Cam Filmi</span><span class="detail-value">${c.tint_level ? '%' + c.tint_level : 'Yok'}</span></div>
        </div>`;
    }

    const tierLabels = {
        'S': 'Süper Spor / Özel Üretim',
        'A': 'Lüks Sınıf',
        'B': 'Üst Orta Sınıf',
        'C': 'Orta Sınıf',
        'D': 'Standart Seri',
        'E': 'Ekonomi / Giriş'
    };
    const prodType = tierLabels[c.tier] || 'Standart Üretim';
    const scarcityMessage = c.scarcity_count <= 3 ?
        `<span style="color:var(--danger); font-weight:bold;"><i class="fa-solid fa-fire"></i> Çok Nadir! Piyasada sadece ${c.scarcity_count} adet var.</span>` :
        `<span style="color:var(--text-muted);"><i class="fa-solid fa-car"></i> Piyasada toplam ${c.scarcity_count} adet mevcut.</span>`;

    const scarcityHTML = `<div style="background:var(--bg-card); padding:10px 15px; border-radius:8px; border:1px solid var(--border); margin-bottom:15px; font-size:13px;">
        <div style="margin-bottom:5px;"><strong>Üretim Tipi:</strong> ${prodType} (Tier ${c.tier || '-'})</div>
        <div>${scarcityMessage}</div>
    </div>`;

    document.getElementById('modalContent').innerHTML = `
        <button class="modal-close" onclick="closeModal()">✕</button>
        <div class="detail-header"><span class="detail-logo">${brandLogo(c.logo_emoji, 40)}</span><div><div class="detail-title">${c.brand_name} ${c.model_name}</div><div class="detail-subtitle">${c.year} | ${fmt(c.km)} km | ${c.color} | ${c.body_type}</div></div></div>
        ${scarcityHTML}${specsHTML}${mvHTML}${insHTML}
        <div class="detail-grid">
            <div class="detail-section"><div class="detail-section-title"><i class="fa-solid fa-clipboard-list"></i> Genel Bilgiler</div>
                <div class="detail-row"><span class="detail-label">Yakıt</span><span class="detail-value">${c.fuel_type}</span></div>
                <div class="detail-row"><span class="detail-label">Vites</span><span class="detail-value">${c.transmission}</span></div>
                <div class="detail-row"><span class="detail-label">Motor</span><span class="detail-value">${c.engine_size}L / ${c.horsepower}HP</span></div>
                <div class="detail-row"><span class="detail-label">Kasa</span><span class="detail-value">${c.body_type}</span></div>
                <div class="detail-row"><span class="detail-label">Satıcı</span><span class="detail-value">${c.seller_type}</span></div>
                <div class="detail-row"><span class="detail-label">Renk</span><span class="detail-value">${c.color}</span></div>
                ${c.lansoman_color ? `<div class="detail-row"><span class="detail-label">Lansman Rengi</span><span class="detail-value" style="color:var(--gold)">${c.lansoman_color}</span></div>` : ''}
            </div>
            ${durumSecHTML}
        </div>
        ${c.description ? `<div class="detail-section" style="margin-bottom:16px"><div class="detail-section-title"><i class="fa-solid fa-comment-dots"></i> İlan Açıklaması</div><p style="font-size:13px;color:var(--text-secondary);line-height:1.6">${c.description}</p></div>` : ''}
        ${c.damage_details && showFullDetails ? `<div class="detail-section" style="margin-bottom:16px"><div class="detail-section-title"><i class="fa-solid fa-triangle-exclamation"></i> Hasar Detayları</div><p style="font-size:12px;color:var(--warning)">${c.damage_details}</p></div>` : ''}
        
        <div style="background:rgba(251, 191, 36, 0.1); border:1px solid var(--gold); border-radius:8px; padding:12px; margin-bottom:16px; text-align:center;">
            <i class="fa-solid fa-gem" style="color:var(--gold); font-size:18px; margin-bottom:8px;"></i>
            <h4 style="color:var(--gold); margin:0 0 4px 0;">Nadirlik Durumu</h4>
            <p style="font-size:13px; color:var(--text-primary); margin:0;">Bu araçtan piyasada sadece <strong>${c.scarcity_count || 1} adet</strong> bulunuyor!</p>
        </div>

        ${partsHTML}${actionsHTML}`;
    document.getElementById('carDetailModal').classList.add('active');
}

function closeModal(id = 'carDetailModal') {
    const targetId = (typeof id === 'string') ? id : 'carDetailModal';
    const m = document.getElementById(targetId);
    if (m) m.classList.remove('active');
}

// ============ BUY CAR ============
async function buyCar(carId) {
    if (!await showConfirm('Bu aracı satın almak istiyor musun?')) return;
    const r = await post('/api/market/buy/' + carId);
    if (r.success) { notify(r.message, 'success'); updateFromResponse(r); closeModal(); loadCars(carsPage); }
    else notify(r.error, 'error');
}

// ============ EXPERTIZ ============
async function inspectCar(carId, isFree = false) {
    const r = await post('/api/player/inspect/' + carId + (isFree ? '?free=true' : ''));
    if (r.success) { notify(r.message, 'success'); updateFromResponse(r); openCarDetail(carId); }
    else notify(r.error || r.message, 'error');
}

// ============ MY CARS ============
async function loadMyCars() {
    const grid = document.getElementById('myCarsGrid');
    grid.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
    const info = document.getElementById('galleryInfo');
    const p = playerData;
    info.innerHTML = `<div class="gallery-info-text"><h3>${p.has_gallery ? '<i class="fa-solid fa-building"></i> Galeriniz Açık' : '<i class="fa-solid fa-house-chimney"></i> Galeri Yok'}</h3><p>Araç: ${p.car_count || 0}/${p.max_car_slots} slot</p></div>
        ${p.has_gallery ? '' : (p.level >= 10 ? '<button class="btn btn-premium" onclick="buyGallery()"><i class="fa-solid fa-building"></i> Galeri Aç (500.000₺)</button>' : '')}
        ${p.has_factory_deal ? '' : (p.level >= 25 ? '<button class="btn btn-gold" onclick="buyFactoryDeal()"><i class="fa-solid fa-industry"></i> Fabrika Anlaşması (2.000.000₺)</button>' : '')}`;
    const r = await get('/api/player/cars');
    if (!r.success || !r.data.length) { grid.innerHTML = '<div class="empty-state"><div class="empty-icon"><i class="fa-solid fa-car"></i></div><div class="empty-text">Henüz aracınız yok</div><div class="empty-sub">Keşfet\'ten araç satın alın</div></div>'; return; }
    window.myCars = r.data;
    grid.innerHTML = r.data.map(c => carCardHTML(c, true, true)).join('');
}

async function setPersonalCar(pcId) {
    const r = await post('/api/player/personal-car/' + pcId);
    if (r.success) { notify(r.message, 'success'); loadMyCars(); loadPlayer(); }
    else notify(r.error, 'error');
}

async function buyGallery() {
    if (!await showConfirm('Galeri açmak 500.000₺. Devam?')) return;
    const r = await post('/api/player/buy-gallery');
    if (r.success) {
        notify(r.message, 'success');
        updateFromResponse(r);
        loadMyCars();
        if (activeTab === 'factory') loadFactory();
    }
    else notify(r.error, 'error');
}

async function buyFactoryDeal() {
    if (!await showConfirm('Fabrika anlaşması 2.000.000₺. Devam?')) return;
    const r = await post('/api/player/factory-deal');
    if (r.success) {
        notify(r.message, 'success');
        updateFromResponse(r);
        loadMyCars();
        if (activeTab === 'factory') loadFactory();
    }
    else notify(r.error, 'error');
}

// ============ SELL MODAL ============
let instantSellWatching = false;
async function openSellModal(pcId) {
    if (!window.myCars) { notify('Araçlar yüklenemedi', 'error'); return; }
    const carObj = window.myCars.find(c => c.player_car_id === pcId);
    if (!carObj) return;

    const mv = carObj.price;
    const appraisal = Math.round(mv * (1.1 + (carObj.engine_status === 'Mükemmel' ? 0.15 : 0.05)));
    const instantPrice = Math.round(carObj.buy_price * 1.03);
    const instantProfit = instantPrice - carObj.buy_price;

    // Günlük instant-sell bilgisini al
    let dailyUsed = 0, dailyLimit = 5;
    try {
        const info = await get('/api/market/instant-sell-info');
        if (info.success) { dailyUsed = info.data.used; dailyLimit = info.data.limit; }
    } catch (e) { }
    const remaining = dailyLimit - dailyUsed;

    document.getElementById('sellModalContent').innerHTML = `
        <button class="modal-close" onclick="closeSellModal()">✕</button>
        <h2 style="margin-bottom:16px"><i class="fa-solid fa-car-rear"></i> Araç Satışı</h2>
        
        <div class="sell-tabs">
            <button class="sell-tab active" onclick="switchSellTab('normal', this)"><i class="fa-solid fa-receipt"></i> İlan Ver</button>
            <button class="sell-tab" onclick="switchSellTab('instant', this)"><i class="fa-solid fa-bolt"></i> Anında Sat</button>
        </div>

        <div id="normalSellContent">
            <div style="background:var(--bg-card);padding:12px;border-radius:8px;margin-bottom:16px;font-size:13px">
                <div style="display:flex;justify-content:space-between;margin-bottom:4px">
                    <span>Alış Fiyatınız:</span>
                    <strong style="color:var(--text)">${fmtPrice(carObj.buy_price - (carObj.expenses || 0))}</strong>
                </div>
                <div style="display:flex;justify-content:space-between;margin-bottom:4px">
                    <span>Araca Yapılan Masraflar:</span>
                    <strong style="color:var(--error)">${fmtPrice(carObj.expenses || 0)}</strong>
                </div>
                <div style="display:flex;justify-content:space-between;margin-bottom:4px">
                    <span>Piyasa Değeri:</span>
                    <strong style="color:var(--accent)">${fmtPrice(mv)}</strong>
                </div>
                <div style="display:flex;justify-content:space-between">
                    <span>Önerilen Max Fiyat:</span>
                    <strong style="color:var(--success)">${fmtPrice(appraisal)}</strong>
                </div>
            </div>

            <div class="form-group">
                <label class="form-label">Satış Fiyatı (₺)</label>
                <input class="form-input" id="sellPrice" type="text" placeholder="Fiyat girin (Örn: 15.000)" 
                       oninput="updateSellIndicators(${carObj.buy_price}, ${appraisal})">
                <div id="sellIndicators" style="margin-top:8px;font-size:12px;display:flex;justify-content:space-between;align-items:center">
                    <span id="profitIndicator" style="font-weight:700">Beklenen Kâr: -</span>
                    <span id="appraisalWarning" style="color:var(--warning);display:none"><i class="fa-solid fa-triangle-exclamation"></i> Değerin çok üstü!</span>
                </div>
            </div>

            <div class="form-group" style="margin-top:12px">
                <label class="form-label"><i class="fa-solid fa-credit-card"></i> Taksit Seçeneği</label>
                <div class="installment-options" style="display:grid;grid-template-columns:repeat(5,1fr);gap:6px;margin-top:8px">
                    <button class="installment-btn active" data-months="0" onclick="selectInstallment(0, this, ${carObj.buy_price}, ${appraisal})" style="padding:10px 4px;border:2px solid var(--accent);background:var(--accent);color:white;border-radius:8px;cursor:pointer;text-align:center;font-size:12px;font-weight:700;font-family:inherit;transition:all 0.2s">
                        Peşin<br><small style="font-weight:400;opacity:0.8">%0</small>
                    </button>
                    <button class="installment-btn" data-months="3" onclick="selectInstallment(3, this, ${carObj.buy_price}, ${appraisal})" style="padding:10px 4px;border:2px solid var(--border);background:var(--bg-card);color:var(--text-primary);border-radius:8px;cursor:pointer;text-align:center;font-size:12px;font-weight:700;font-family:inherit;transition:all 0.2s">
                        3 Taksit<br><small style="font-weight:400;opacity:0.8">%5</small>
                    </button>
                    <button class="installment-btn" data-months="6" onclick="selectInstallment(6, this, ${carObj.buy_price}, ${appraisal})" style="padding:10px 4px;border:2px solid var(--border);background:var(--bg-card);color:var(--text-primary);border-radius:8px;cursor:pointer;text-align:center;font-size:12px;font-weight:700;font-family:inherit;transition:all 0.2s">
                        6 Taksit<br><small style="font-weight:400;opacity:0.8">%12</small>
                    </button>
                    <button class="installment-btn" data-months="9" onclick="selectInstallment(9, this, ${carObj.buy_price}, ${appraisal})" style="padding:10px 4px;border:2px solid var(--border);background:var(--bg-card);color:var(--text-primary);border-radius:8px;cursor:pointer;text-align:center;font-size:12px;font-weight:700;font-family:inherit;transition:all 0.2s">
                        9 Taksit<br><small style="font-weight:400;opacity:0.8">%20</small>
                    </button>
                    <button class="installment-btn" data-months="12" onclick="selectInstallment(12, this, ${carObj.buy_price}, ${appraisal})" style="padding:10px 4px;border:2px solid var(--border);background:var(--bg-card);color:var(--text-primary);border-radius:8px;cursor:pointer;text-align:center;font-size:12px;font-weight:700;font-family:inherit;transition:all 0.2s">
                        12 Taksit<br><small style="font-weight:400;opacity:0.8">%30</small>
                    </button>
                </div>
                <div id="installmentInfo" style="margin-top:10px;padding:10px;background:var(--bg-main);border-radius:8px;font-size:12px;display:none">
                    <div style="display:flex;justify-content:space-between;margin-bottom:4px">
                        <span>Faiz Oranı:</span><strong id="installmentRate">%0</strong>
                    </div>
                    <div style="display:flex;justify-content:space-between;margin-bottom:4px">
                        <span>Toplam Satış Tutarı:</span><strong id="installmentTotal" style="color:var(--success)">-</strong>
                    </div>
                    <div style="display:flex;justify-content:space-between">
                        <span>Aylık Taksit:</span><strong id="installmentMonthly" style="color:var(--accent)">-</strong>
                    </div>
                </div>
            </div>
            
            <p style="font-size:12px;color:var(--text-muted);margin:16px 0">Normal ilan sisteminde NPC'lerden teklif beklersiniz. Taksitli satışlarda faiz ile daha yüksek kâr elde edebilirsiniz.</p>
            <button class="btn btn-lg btn-success" style="width:100%" onclick="submitSell(${pcId})"><i class="fa-solid fa-paper-plane"></i> İlanı Yayınla</button>
        </div>

        <div id="instantSellContent" style="display:none">
            <div class="instant-sell-card">
                <div style="background:var(--bg-card);padding:16px;border-radius:10px;text-align:center">
                    <div style="font-size:13px;color:var(--text-muted);margin-bottom:8px">Anında Satış Fiyatı (%3 Kâr)</div>
                    <div style="font-size:28px;font-weight:800;color:var(--success)">${fmtPrice(instantPrice)}</div>
                    <div style="font-size:13px;color:var(--success);margin-top:4px">+${fmtPrice(instantProfit)} brüt kâr (Net: +${fmtPrice(instantProfit - Math.round(instantProfit * 0.05))})</div>
                    <div style="margin-top:12px;padding:8px;background:var(--bg-main);border-radius:8px;font-size:12px">
                        <span>Günlük Hak: </span>
                        <strong style="color:${remaining > 0 ? 'var(--accent)' : 'var(--danger)'}">${remaining} / ${dailyLimit}</strong>
                    </div>
                </div>
                <button class="btn btn-lg btn-primary" style="width:100%;margin-top:16px" 
                    ${remaining <= 0 ? 'disabled' : ''} 
                    onclick="submitInstantSell(${pcId})">
                    ${remaining > 0 ? '<i class="fa-solid fa-bolt"></i> Anında Sat' : '<i class="fa-solid fa-circle-xmark"></i> Günlük Limit Doldu'}
                </button>
            </div>
            <p style="font-size:11px; color:var(--text-muted); margin-top:10px">Galerimiz aracınızı anında nakit paraya satın alır. Günde en fazla ${dailyLimit} araç satılabilir.</p>
        </div>`;

    document.getElementById('sellModal').classList.add('active');
    setupPriceInput('sellPrice');
}

function switchSellTab(tab, btn) {
    document.querySelectorAll('.sell-tab').forEach(t => t.classList.remove('active'));
    if (btn) btn.classList.add('active');
    document.getElementById('normalSellContent').style.display = tab === 'normal' ? 'block' : 'none';
    document.getElementById('instantSellContent').style.display = tab === 'instant' ? 'block' : 'none';
}

async function submitInstantSell(pcId) {
    const r = await post('/api/market/instant-sell', { player_car_id: pcId });
    if (r.success) {
        notify(r.message, 'success');
        closeSellModal();
        loadMyCars();
        updateFromResponse(r);
    } else {
        notify(r.error, 'error');
    }
}

function updateSellIndicators(buyPrice, appraisal) {
    const price = getRawValue('sellPrice');
    const profitInd = document.getElementById('profitIndicator');
    const warning = document.getElementById('appraisalWarning');

    if (price > 0) {
        const rate = installmentRates[selectedInstallmentMonths] || 0;
        const totalWithInterest = selectedInstallmentMonths > 0 ? Math.round(price * (1 + rate)) : price;
        const profit = totalWithInterest - buyPrice;
        const tax = profit > 0 ? Math.round(profit * 0.15) : 0;
        const netProfit = profit - tax;
        const profitPercent = ((netProfit / buyPrice) * 100).toFixed(1);
        profitInd.innerHTML = `Beklenen Net Kâr: <span style="color:${netProfit >= 0 ? '#10b981' : '#ef4444'}">${fmtPrice(netProfit)} (%${profitPercent})</span> ${tax > 0 ? `<small style="color:var(--danger)">(-${fmtPrice(tax)} Devlet Vergisi)</small>` : ''}`;
        warning.style.display = price > appraisal ? 'block' : 'none';

        // Taksit bilgisini güncelle
        if (selectedInstallmentMonths > 0) {
            const infoEl = document.getElementById('installmentInfo');
            if (infoEl) {
                infoEl.style.display = 'block';
                document.getElementById('installmentTotal').textContent = fmtPrice(totalWithInterest);
                document.getElementById('installmentMonthly').textContent = fmtPrice(Math.round(totalWithInterest / selectedInstallmentMonths));
            }
        }
    } else {
        profitInd.innerText = 'Beklenen Kâr: -';
        warning.style.display = 'none';
    }
}

let selectedInstallmentMonths = 0;
const installmentRates = { 0: 0, 3: 0.05, 6: 0.12, 9: 0.20, 12: 0.30 };

function selectInstallment(months, btn, buyPrice, appraisal) {
    selectedInstallmentMonths = months;
    document.querySelectorAll('.installment-btn').forEach(b => {
        b.style.border = '2px solid var(--border)';
        b.style.background = 'var(--bg-card)';
        b.style.color = 'var(--text-primary)';
    });
    btn.style.border = '2px solid var(--accent)';
    btn.style.background = 'var(--accent)';
    btn.style.color = 'white';
    updateSellIndicators(buyPrice, appraisal);

    const infoEl = document.getElementById('installmentInfo');
    if (months === 0) {
        infoEl.style.display = 'none';
    } else {
        infoEl.style.display = 'block';
        const price = getRawValue('sellPrice') || 0;
        const rate = installmentRates[months];
        const total = Math.round(price * (1 + rate));
        const monthly = months > 0 ? Math.round(total / months) : 0;
        document.getElementById('installmentRate').textContent = `%${Math.round(rate * 100)}`;
        document.getElementById('installmentTotal').textContent = price > 0 ? fmtPrice(total) : '-';
        document.getElementById('installmentMonthly').textContent = price > 0 ? fmtPrice(monthly) : '-';
    }
}

function closeSellModal() { document.getElementById('sellModal').classList.remove('active'); selectedInstallmentMonths = 0; }

async function submitSell(pcId) {
    const price = getRawValue('sellPrice');
    if (!price || price <= 0) return notify('Geçerli bir fiyat girin!', 'error');

    const body = { player_car_id: pcId, listing_type: 'normal', asking_price: price, installment_months: selectedInstallmentMonths };
    const r = await post('/api/market/sell', body);
    if (r.success) { notify(r.message, 'success'); closeSellModal(); loadMyCars(); }
    else notify(r.error, 'error');
}

// ============ BARGAIN MODAL ============
let bargainCarId = 0, bargainOrigPrice = 0, bargainMV = 0;
function openBargainModal(carId, price, marketValue) {
    bargainCarId = carId; bargainOrigPrice = price; bargainMV = marketValue || price;
    document.getElementById('bargainModalContent').innerHTML = `
        <button class="modal-close" onclick="closeBargainModal()">✕</button>
        <h2 style="margin-bottom:16px"><i class="fa-solid fa-handshake"></i> Pazarlık</h2>
        <div style="display:flex;justify-content:space-between;font-size:13px;color:var(--text-muted);margin-bottom:10px">
            <span>İlan fiyatı: <strong>${fmtPrice(price)}</strong></span>
            <span>Piyasa: <strong>${fmtPrice(bargainMV)}</strong></span>
        </div>
        <div class="bargain-chat" id="bargainChat">
            <div class="chat-bubble chat-seller">Buyurun, bu araca mı ilgi duydunuz? Fiyatı ${fmtPrice(price)}.</div>
        </div>
        <div style="margin-bottom:10px; font-size:13px; display:flex; justify-content:space-between; align-items:center">
             <span>Sizin Teklifiniz:</span>
             <span id="probLabel" style="font-weight:bold; color:var(--text-muted)">Kabul Olasılığı: -</span>
        </div>
        <div style="display:flex;gap:8px;align-items:center">
            <input class="form-input" id="bargainOffer" type="text" placeholder="Teklifiniz (₺)" style="flex:1" oninput="updateProb()">
            <button class="btn btn-primary" onclick="sendBargain()"><i class="fa-solid fa-comments"></i> Teklif Ver</button>
        </div>`;
    document.getElementById('bargainModal').classList.add('active');
    setupPriceInput('bargainOffer');
    closeModal();
}

function updateProb() {
    const off = getRawValue('bargainOffer');
    const prob = calcProb(off, bargainOrigPrice, bargainMV);
    const label = document.getElementById('probLabel');
    label.textContent = `Kabul Olasılığı: %${prob}`;
    if (prob >= 80) label.style.color = 'var(--success)';
    else if (prob >= 40) label.style.color = 'var(--warning)';
    else label.style.color = 'var(--error)';
}

function calcProb(off, list, mv) {
    if (off >= list) return 100;
    if (off >= mv * 0.95) return 92;
    const ratio = off / mv;
    if (ratio < 0.65) return 0;
    let p = (ratio - 0.65) / 0.30 * 92;
    if (list > mv * 1.3) p += 5;
    return Math.round(Math.max(0, Math.min(95, p)));
}
function closeBargainModal() { document.getElementById('bargainModal').classList.remove('active'); }

async function sendBargain() {
    const offer = getRawValue('bargainOffer');
    if (!offer || offer <= 0) return;
    const chat = document.getElementById('bargainChat');
    chat.innerHTML += `<div class="chat-bubble chat-player">${fmtPrice(offer)} teklif ediyorum.</div>`;
    document.getElementById('bargainOffer').value = '';

    const r = await post('/api/market/bargain/' + bargainCarId, { offer_price: offer });
    if (!r.success) { notify(r.error, 'error'); return; }

    if (r.accepted) {
        chat.innerHTML += `<div class="chat-bubble chat-seller">${r.message}</div>`;
        chat.innerHTML += `<div class="chat-result chat-accepted"><i class="fa-solid fa-circle-check"></i> Anlaşma sağlandı! ${fmtPrice(r.finalPrice)} | Tasarruf: ${fmtPrice(r.savings)}</div>`;
        updateFromResponse(r);
        setTimeout(() => { closeBargainModal(); loadCars(carsPage); }, 2000);
    } else {
        chat.innerHTML += `<div class="chat-bubble chat-seller">${r.message.replace('<i class="fa-solid fa-comment"></i> "', '').replace('"', '')}</div>`;
        if (r.counterOffer) {
            document.getElementById('bargainOffer').value = r.counterOffer;
            document.getElementById('bargainOffer').placeholder = `Karşı teklif: ${fmtPrice(r.counterOffer)}`;
        }
    }
    chat.scrollTop = chat.scrollHeight;
}

// ============ SERVICE MODAL ============
async function openServiceModal(pcId) {
    const mc = document.getElementById('serviceModalContent');
    const scrollPos = mc.scrollTop;
    mc.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
    document.getElementById('serviceModal').classList.add('active');

    const r = await get('/api/player/cars');
    if (!r.success) return;
    const car = r.data.find(c => c.player_car_id === pcId);
    if (!car) { mc.innerHTML = '<p>Araç bulunamadı</p>'; return; }

    const partsR = await get('/api/cars/' + car.car_id);
    const parts = partsR.success ? (partsR.data.parts || []) : [];
    const colors = ['Siyah', 'Beyaz', 'Gri', 'Kırmızı', 'Mavi', 'Lacivert', 'Yeşil', 'Bordo', 'Sarı', 'Turuncu', 'Pembe', 'Mor', 'Kahverengi', 'Bej', 'Gümüş', 'Altın'];

    const damagedParts = parts.filter(p => p.status !== 'Orijinal');
    const mhPct = car.motor_health || 0;
    const mhColor = mhPct >= 80 ? 'var(--success)' : mhPct >= 50 ? 'var(--warning)' : 'var(--danger)';

    mc.innerHTML = `<button class="modal-close" onclick="closeServiceModal()">✕</button>
        <h2 style="margin-bottom:16px"><i class="fa-solid fa-screwdriver-wrench"></i> Servis - ${car.brand_name} ${car.model_name}</h2>
        <div style="display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap">
            <div class="detail-spec-item" style="flex:1;min-width:80px"><span class="spec-label">Motor Sağlığı</span><span class="spec-value" style="color:${mhColor}">%${mhPct}</span></div>
            <div class="detail-spec-item" style="flex:1;min-width:80px"><span class="spec-label">Temizlik</span><span class="spec-value">%${car.cleanliness || 0}</span></div>
            <div class="detail-spec-item" style="flex:1;min-width:80px"><span class="spec-label">Hasar</span><span class="spec-value">${car.damage_status}</span></div>
            <div class="detail-spec-item" style="flex:1;min-width:80px"><span class="spec-label">Araç Değeri</span><span class="spec-value" style="color:var(--gold)">${fmtPrice(car.price)}</span></div>
        </div>
        
        <div class="detail-section" style="margin-bottom:16px">
            <div class="detail-section-title"><i class="fa-solid fa-shop"></i> Tamirhane</div>
            <p style="font-size:11px;color:var(--text-muted);margin-bottom:10px">Tüm tamir işlemleri parçayı "%100" kaliteye ve "Değişen" statüsüne getirir.</p>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
            <div class="detail-section"><div class="detail-section-title"><i class="fa-solid fa-gears"></i> Parça Tamiri (${damagedParts.length} hasarlı)</div>
                ${damagedParts.length ? damagedParts.map(p => {
        let baseCost = car.price * 0.02;
        const sM = { 'Hasarlı': 2.0, 'Değişen': 1.5, 'Boyalı': 1.0, 'Çizik': 0.5 };
        baseCost *= (sM[p.status] || 1);
        const estCost = Math.max(Math.round(baseCost), 1000);

        return `<div style="margin-bottom:8px;padding:8px;background:var(--bg-input);border-radius:8px">
                        <div style="font-weight:600;font-size:12px;margin-bottom:4px">${p.part_name} <span class="part-status ${partClass(p.status)}">(${p.status})</span>
                            ${p.quality !== undefined && p.quality !== null ? `<span style="font-size:10px;color:var(--text-muted)"> Kalite: %${p.quality}</span>` : ''}</div>
                        <button class="btn btn-sm btn-success" onclick="repairPart(${pcId},${p.id})"><i class="fa-solid fa-wrench"></i> Tamir Et (~${fmtPrice(estCost)})</button>
                    </div>`
    }).join('') : '<p style="font-size:12px;color:var(--text-muted)">Tüm parçalar orijinal <i class="fa-solid fa-circle-check"></i></p>'}
            </div>
            <div>
                <div class="detail-section" style="margin-bottom:14px"><div class="detail-section-title"><i class="fa-solid fa-palette"></i> Boyama</div>
                    <select class="form-select" id="paintColor" style="width:100%;margin-bottom:8px">${colors.map(c => `<option>${c}</option>`).join('')}</select>
                    <p style="font-size:11px;color:var(--text-muted);margin-bottom:6px">Lansman rengine boyarsanız talep artar!</p>
                    <button class="btn btn-primary" onclick="paintCar(${pcId})"><i class="fa-solid fa-palette"></i> Boya (~${fmtPrice(Math.round(car.price * 0.015))})</button>
                </div>
                <div class="detail-section" style="margin-bottom:14px"><div class="detail-section-title"><i class="fa-solid fa-shower"></i> Yıkama</div>
                    <p style="font-size:12px;margin-bottom:8px">Temizlik: %${car.cleanliness || 0}</p>
                    <button class="btn btn-primary" onclick="washCar(${pcId})" ${(car.cleanliness || 0) >= 95 ? 'disabled' : ''}><i class="fa-solid fa-shower"></i> Yıka (~${fmtPrice(Math.round(car.price * 0.002 + 50))})</button>
                </div>
                ${mhPct < 80 ? `<div class="detail-section"><div class="detail-section-title"><i class="fa-solid fa-engine"></i> Motor Değişimi</div>
                    <p style="font-size:11px;color:var(--text-muted);margin-bottom:8px">Motorunu yenile, aracın değerini artır.</p>
                    <div style="display:flex;flex-direction:column;gap:6px">
                        <button class="btn btn-sm btn-ghost" onclick="engineSwap(${pcId},'basic')"><i class="fa-solid fa-hammer"></i> Basit (%65 sağlık) ~${fmtPrice(Math.round(car.price * 0.15))}</button>
                        <button class="btn btn-sm btn-warning" onclick="engineSwap(${pcId},'performance')"><i class="fa-solid fa-wrench"></i> Performans (%90) ~${fmtPrice(Math.round(car.price * 0.35))}</button>
                        <button class="btn btn-sm btn-success" onclick="engineSwap(${pcId},'authorized')"><i class="fa-solid fa-building-shield"></i> Yetkili (%100) ~${fmtPrice(Math.round(car.price * 0.6))}</button>
                    </div>
                </div>` : ''}
            </div>
        </div>`;
    mc.scrollTop = scrollPos;
}
function closeServiceModal() { document.getElementById('serviceModal').classList.remove('active'); }

function selectMechanic(type, pcId) {
    // Kaldırıldı
}

async function repairPart(pcId, partId) {
    const r = await post('/api/player/repair/' + pcId, { part_id: partId });
    if (r.success) {
        notify(r.message, 'success');
        updateFromResponse(r);
        openServiceModal(pcId);
        loadMyCars(true);
    }
    else notify(r.error, 'error');
}

async function paintCar(pcId) {
    const color = document.getElementById('paintColor').value;
    const r = await post('/api/player/paint/' + pcId, { color });
    if (r.success) {
        notify(r.message, 'success');
        updateFromResponse(r);
        openServiceModal(pcId);
        loadMyCars(true);
    }
    else notify(r.error, 'error');
}

async function washCar(pcId) {
    const r = await post('/api/player/wash/' + pcId);
    if (r.success) {
        notify(r.message, 'success');
        updateFromResponse(r);
        openServiceModal(pcId);
        loadMyCars(true);
    }
    else notify(r.error, 'error');
}

async function engineSwap(pcId, engineType) {
    const typeNames = { basic: 'Basit', performance: 'Performans', authorized: 'Yetkili Servis' };
    if (!await showConfirm(`${typeNames[engineType]} motor değişimi yapılsın mı?`)) return;
    const r = await post('/api/player/engine-swap/' + pcId, { engine_type: engineType });
    if (r.success) {
        notify(r.message, 'success');
        updateFromResponse(r);
        openServiceModal(pcId);
        loadMyCars(true);
    }
    else notify(r.error, 'error');
}

// ============ LISTINGS ============
async function loadListings() {
    const c = document.getElementById('listingsContainer');
    c.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
    const r = await get('/api/market/listings');
    if (!r.success || !r.data.length) { c.innerHTML = '<div class="empty-state"><div class="empty-icon"><i class="fa-solid fa-clipboard-list"></i></div><div class="empty-text">Aktif ilan yok</div><div class="empty-sub">Galerimden araç satışa koyun</div></div>'; return; }
    c.innerHTML = r.data.map(l => {
        let offersHTML = '';
        if (l.offers && l.offers.length) {
            offersHTML = `<div class="offers-section"><div class="offers-title"><i class="fa-solid fa-hand-holding-dollar"></i> Teklifler (${l.offers.length})</div>
                ${l.offers.map(o => {
                const diff = o.offer_price - l.buy_price;
                const perc = ((diff / l.buy_price) * 100).toFixed(1);
                const color = diff >= 0 ? 'var(--success)' : 'var(--error)';
                return `<div class="offer-item">
                        <div class="offer-info">
                            <span class="offer-avatar"><i class="fa-solid fa-circle-user"></i></span>
                            <div>
                                <div class="offer-name">${o.npc_name}</div>
                                <div class="offer-type ${o.npc_type}">${o.npc_type}</div>
                                ${o.message ? `<div class="offer-message">"${o.message}"</div>` : ''}
                            </div>
                        </div>
                        <div style="text-align:right">
                            <div class="offer-price">${fmtPrice(o.offer_price)}</div>
                            <div style="font-size:11px; font-weight:bold; color:${color}">${perc >= 0 ? '+' : ''}${perc}%</div>
                        </div>
                        <div class="offer-actions">
                            <button class="btn btn-sm btn-success" onclick="acceptOffer(${l.id},${o.id})"><i class="fa-solid fa-check"></i> Kabul</button>
                        </div>
                    </div>`;
            }).join('')}
            </div>`;
        }
        let installmentHTML = '';
        if (l.installment_months > 0) {
            const perInstallment = Math.round(l.asking_price / l.installment_months);
            const firstPayment = l.asking_price - (perInstallment * (l.installment_months - 1));
            installmentHTML = `
                <div class="listing-price-item"><div class="listing-price-label">İlk Ödeme</div><div class="listing-price-value" style="color:var(--warning)">${fmtPrice(firstPayment)}</div></div>
                <div class="listing-price-item"><div class="listing-price-label">Aylık Ödeme (${l.installment_months} Ay)</div><div class="listing-price-value" style="color:var(--accent)">${fmtPrice(perInstallment)}</div></div>
            `;
        }

        return `<div class="listing-card">
            <div class="listing-header">
                <div class="listing-title">${brandLogo(l.logo_emoji, 18)} ${l.brand_name} ${l.model_name} <span class="listing-type type-normal">${l.installment_months > 0 ? 'Taksitli' : 'Normal'}</span></div>
                <div><button class="btn btn-sm btn-danger" onclick="cancelListing(${l.id})"><i class="fa-solid fa-xmark"></i> İptal</button></div>
            </div>
            <div class="listing-prices">
                <div class="listing-price-item"><div class="listing-price-label">İstenen Fiyat</div><div class="listing-price-value" style="color:var(--success)">${fmtPrice(l.asking_price)}</div></div>
                ${installmentHTML}
                <div class="listing-price-item"><div class="listing-price-label">Piyasa Değeri</div><div class="listing-price-value">${fmtPrice(l.market_value)}</div></div>
                <div class="listing-price-item"><div class="listing-price-label">Alış Fiyatınız</div><div class="listing-price-value">${fmtPrice(l.buy_price)}</div></div>
            </div>
            ${offersHTML}
        </div>`;
    }).join('');
}

async function acceptOffer(listingId, offerId) {
    if (!await showConfirm('Bu teklifi kabul et?')) return;
    const r = await post(`/api/market/listings/${listingId}/accept/${offerId}`);
    if (r.success) { notify(r.message + ` (Kâr: ${fmtPrice(r.profit)})`, r.profit >= 0 ? 'success' : 'error'); updateFromResponse(r); loadListings(); }
    else notify(r.error, 'error');
}

async function cancelListing(id) {
    if (!await showConfirm('İlanı iptal et?')) return;
    const r = await del('/api/market/listings/' + id);
    if (r.success) { notify(r.message, 'success'); loadListings(); }
    else notify(r.error, 'error');
}



// ============ BANK ============
async function loadBank() {
    const c = document.getElementById('bankContent');
    c.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
    const r = await get('/api/player/loans');
    if (!r.success) return;
    const d = r.data;
    const loan = d.currentLoan;
    const hasLoan = loan.remaining > 0;
    const paidPct = hasLoan ? Math.round(((loan.amount - loan.remaining) / loan.amount) * 100) : 0;

    let incomingHTML = '';
    if (d.incomingInstallments && d.incomingInstallments.length > 0) {
        const totalIncoming = d.incomingInstallments.reduce((sum, item) => sum + parseFloat(item.remaining_revenue), 0);

        const listHTML = d.incomingInstallments.map(ins => {
            const paidPct = Math.round((ins.paid_months / ins.total_months) * 100);
            return `
            <div style="padding:16px; border-bottom:1px solid var(--border); display:flex; flex-direction:column; gap:10px;">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <div style="font-weight:700; font-size:15px; color:var(--text-primary);"><i class="fa-solid fa-car-side"></i> ${ins.car_name}</div>
                    <div style="color:var(--success); font-weight:800; font-size:15px;">Aylık: +${fmtPrice(ins.monthly_payment)}</div>
                </div>
                
                <div style="display:flex; justify-content:space-between; font-size:12px; color:var(--text-muted);">
                    <div><span>Toplam Tutar:</span> <strong style="color:var(--text-primary)">${fmtPrice(ins.total_revenue)}</strong></div>
                    <div><span>Kalan Alacak:</span> <strong style="color:var(--warning)">${fmtPrice(ins.remaining_revenue)}</strong></div>
                </div>

                <div style="margin-top:4px;">
                    <div style="display:flex; justify-content:space-between; font-size:11px; margin-bottom:4px;">
                        <span>Ödenen: ${ins.paid_months} Ay</span>
                        <span>Kalan: ${ins.remaining_months} Ay</span>
                    </div>
                    <div class="loan-progress"><div class="loan-progress-bar" style="width:${paidPct}%; background:var(--success)"></div></div>
                </div>
            </div>`;
        }).join('');

        incomingHTML = `
        <div class="bank-card" style="grid-column: 1 / -1; margin-top: 20px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
                <h3 style="margin:0;"><i class="fa-solid fa-money-check-dollar"></i> Taksitle Sattığım Araçlar</h3>
                <div style="font-size:13px; font-weight:600;">Toplam Bekleyen: <span style="color:var(--success)">${fmtPrice(totalIncoming)}</span></div>
            </div>
            <div style="background:var(--bg-input); border-radius:8px; border:1px solid var(--border); max-height:400px; overflow-y:auto;">
                ${listHTML}
            </div>
            <p style="text-align:center; font-size:11px; color:var(--text-muted); margin-top:12px;"><i class="fa-solid fa-circle-info"></i> Taksit ödemeleri her oyun gününde otomatik olarak kasanıza eklenir.</p>
        </div>`;
    }

    c.innerHTML = `<div class="bank-grid">
        <div class="bank-card"><h3><i class="fa-solid fa-building-columns"></i> Kredi Bilgileri</h3>
            <div class="bank-stat"><span class="bank-stat-label">Kredi Limiti</span><span class="bank-stat-value" style="color:var(--success)">${fmtPrice(d.loanLimit)}</span></div>
            <div class="bank-stat"><span class="bank-stat-label">Faiz Oranı</span><span class="bank-stat-value" style="color:var(--warning)">%${d.interestRate.toFixed(1)}</span></div>
            <div class="bank-stat"><span class="bank-stat-label">Seviye</span><span class="bank-stat-value">${d.level}</span></div>
            <div class="bank-stat"><span class="bank-stat-label">Durum</span><span class="bank-stat-value" style="color:${d.isSeized ? 'var(--danger)' : 'var(--success)'}">${d.isSeized ? '<i class="fa-solid fa-triangle-exclamation"></i> HACİZLİ' : '<i class="fa-solid fa-circle-check"></i> Normal'}</span></div>
            ${!hasLoan && !d.activeLoanRequest ? `<div class="loan-form">
                <input class="form-input" id="loanAmount" type="text" inputmode="numeric" placeholder="Kredi tutarı (₺)">
                <select class="form-select" id="loanMonths"><option value="3">3 Ay</option><option value="6">6 Ay</option><option value="12" selected>12 Ay</option><option value="18">18 Ay</option><option value="24">24 Ay</option></select>
                <textarea class="form-input" id="loanReason" placeholder="Kredi Amacı (Büyük krediler için zorunlu, örn: Galeri büyütme)" rows="2" style="width:100%; margin-top:8px; resize:vertical;"></textarea>
                <button class="btn btn-lg btn-success" style="margin-top:8px;" onclick="takeLoan()"><i class="fa-solid fa-money-bill-transfer"></i> Kredi Çek</button>
            </div>` : ''}
            ${d.activeLoanRequest ? `
                <div style="margin-top:20px; padding:15px; border-radius:8px; background:var(--bg-card); border:1px solid ${d.activeLoanRequest.status === 'counter_offer' ? 'var(--warning)' : 'var(--border)'}">
                    <h4 style="margin-top:0; color:${d.activeLoanRequest.status === 'counter_offer' ? 'var(--warning)' : 'var(--text-primary)'}">
                        ${d.activeLoanRequest.status === 'counter_offer' ? '<i class="fa-solid fa-handshake"></i> Bankadan Karşı Teklif' : '<i class="fa-solid fa-hourglass-half"></i> Kredi Talebi Beklemede'}
                    </h4>
                    <p style="font-size:13px; margin:10px 0;">Talep Edilen: <strong>${fmtPrice(d.activeLoanRequest.amount)}</strong> (${d.activeLoanRequest.months} Ay)</p>
                    ${d.activeLoanRequest.status === 'counter_offer' ? `
                        <div style="padding:10px; background:rgba(245, 158, 11, 0.1); border-left:4px solid var(--warning); margin-bottom:15px;">
                            <strong>Banka Teklifi: ${fmtPrice(d.activeLoanRequest.counter_amount)}</strong><br>
                            <span style="font-size:12px; color:var(--text-muted)">Mesaj: ${d.activeLoanRequest.admin_message || 'Banka bu tutarı uygun buldu.'}</span>
                        </div>
                        <div style="display:flex; gap:10px;">
                            <button class="btn btn-success" style="flex:1" onclick="respondToLoanCounter(${d.activeLoanRequest.id}, 'accept')"><i class="fa-solid fa-check"></i> Kabul Et</button>
                            <button class="btn btn-danger" style="flex:1" onclick="respondToLoanCounter(${d.activeLoanRequest.id}, 'reject')"><i class="fa-solid fa-xmark"></i> Reddet</button>
                        </div>
                    ` : `
                        <p style="font-size:12px; color:var(--text-muted)">Talebiniz merkez bankası tarafından inceleniyor. Lütfen bekleyin.</p>
                    `}
                </div>
            ` : ''}
        </div>
        <div class="bank-card"><h3><i class="fa-solid fa-file-invoice"></i> Mevcut Kredi</h3>
            ${hasLoan ? `
                <div class="bank-stat"><span class="bank-stat-label">Toplam Borç</span><span class="bank-stat-value">${fmtPrice(loan.amount)}</span></div>
                <div class="bank-stat"><span class="bank-stat-label">Kalan Borç</span><span class="bank-stat-value" style="color:var(--danger)">${fmtPrice(loan.remaining)}</span></div>
                <div class="bank-stat"><span class="bank-stat-label">Aylık Taksit</span><span class="bank-stat-value">${fmtPrice(loan.monthlyPayment)}</span></div>
                <div class="bank-stat"><span class="bank-stat-label">Kalan Ay</span><span class="bank-stat-value">${loan.monthsLeft}</span></div>
                <div class="bank-stat"><span class="bank-stat-label">Cezalar</span><span class="bank-stat-value" style="color:${loan.missedPayments > 0 ? 'var(--danger)' : 'var(--success)'}">${loan.missedPayments}/3</span></div>
                <div class="loan-progress"><div class="loan-progress-bar" style="width:${paidPct}%"></div></div>
                <p style="text-align:center;font-size:11px;color:var(--text-muted)">${paidPct}% ödendi</p>
                <button class="btn btn-lg btn-primary" style="width:100%;margin-top:14px" onclick="payLoan()"><i class="fa-solid fa-credit-card"></i> Taksit Öde (${fmtPrice(Math.min(loan.monthlyPayment, loan.remaining))})</button>
            ` : '<div class="empty-state"><div class="empty-icon"><i class="fa-solid fa-circle-check"></i></div><div class="empty-text">Aktif krediniz yok</div></div>'}
        </div>
    </div>
    ${incomingHTML}`;
    setupPriceInput('loanAmount');
}

async function takeLoan() {
    const amount = getRawValue('loanAmount');
    const months = parseInt(document.getElementById('loanMonths').value);
    const reason = document.getElementById('loanReason') ? document.getElementById('loanReason').value : '';
    if (!amount || amount <= 0) { notify('Tutar girin!', 'error'); return; }
    const r = await post('/api/player/loan', { amount, months, reason });
    if (r.success) { notify(r.message, 'success'); updateFromResponse(r); loadBank(); }
    else notify(r.error, 'error');
}

async function respondToLoanCounter(id, action) {
    if (!await showConfirm(action === 'accept' ? 'Teklifi kabul edip krediyi hesabınıza almak istiyor musunuz?' : 'Teklifi reddetmek istediğinize emin misiniz?')) return;
    const r = await post(`/api/player/loan-counter/${id}/action`, { action });
    if (r.success) { notify(r.message, 'success'); updateFromResponse(r); loadBank(); }
    else notify(r.error, 'error');
}

async function payLoan() {
    const r = await post('/api/player/pay-loan');
    if (r.success) { notify(r.message, 'success'); updateFromResponse(r); loadBank(); }
    else notify(r.error, 'error');
}

// ============ PROFIT CHART ============
async function loadProfitChart() {
    const c = document.getElementById('profitChartContent');
    c.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
    const r = await get('/api/player/profit-chart');
    if (!r.success) return;
    const d = r.data;

    const netColor = d.totals.net >= 0 ? 'var(--success)' : 'var(--danger)';
    c.innerHTML = `
        <div class="profit-summary">
            <div class="profit-summary-item"><div class="profit-summary-label">Toplam Gelir</div><div class="profit-summary-value" style="color:var(--success)">${fmtPrice(d.totals.income)}</div></div>
            <div class="profit-summary-item"><div class="profit-summary-label">Toplam Gider</div><div class="profit-summary-value" style="color:var(--danger)">${fmtPrice(d.totals.expense)}</div></div>
            <div class="profit-summary-item"><div class="profit-summary-label">Net Kâr/Zarar</div><div class="profit-summary-value" style="color:${netColor}">${d.totals.net >= 0 ? '+' : ''}${fmtPrice(d.totals.net)}</div></div>
        </div>
        <div class="chart-container"><canvas id="profitCanvas"></canvas></div>
        <h3 style="margin:16px 0 10px;font-size:14px"><i class="fa-solid fa-list-ul"></i> Son İşlemler</h3>
        <div class="profit-history-list">${d.history.map(h => {
        const isIncome = h.type === 'income';
        return `<div class="profit-history-item"><div><span style="margin-right:6px">${isIncome ? '<i class="fa-solid fa-arrow-trend-up"></i>' : '<i class="fa-solid fa-arrow-trend-down"></i>'}</span>${translateTransactionDesc(h.description)}</div><span style="font-weight:700;color:${isIncome ? 'var(--success)' : 'var(--danger)'}">${isIncome ? '+' : '-'}${fmtPrice(h.amount)}</span></div>`;
    }).join('')}</div>`;

    // Chart
    const labels = Object.keys(d.dailySummary).slice(-14);
    const incomes = labels.map(l => d.dailySummary[l].income);
    const expenses = labels.map(l => d.dailySummary[l].expense);

    if (profitChart) profitChart.destroy();
    const ctx = document.getElementById('profitCanvas');
    if (ctx) {
        profitChart = new Chart(ctx, {
            type: 'bar', data: {
                labels, datasets: [
                    { label: 'Gelir', data: incomes, backgroundColor: 'rgba(16,185,129,0.7)', borderRadius: 4 },
                    { label: 'Gider', data: expenses, backgroundColor: 'rgba(239,68,68,0.7)', borderRadius: 4 }
                ]
            }, options: {
                responsive: true, plugins: { legend: { labels: { color: 'var(--text-secondary)' } } },
                scales: { x: { ticks: { color: '#94a3b8' }, grid: { display: false } }, y: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(42,58,82,0.3)' } } }
            }
        });
    }
}

// ============ FACTORY ============
async function loadFactory() {
    const c = document.getElementById('factoryContent');
    if (!playerData.has_factory_deal) {
        c.innerHTML = `<div class="factory-locked"><div class="factory-locked-icon"><i class="fa-solid fa-lock"></i></div><h2>Fabrika Anlaşması Gerekli</h2><p>Seviye 25'te galeri sayfasından fabrika anlaşması yapabilirsiniz</p><p style="color:var(--text-muted);font-size:13px">Mevcut seviye: ${playerData.level}</p></div>`;
        return;
    }
    c.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
    const r = await get('/api/brands');
    if (!r.success) return;

    let html = '<div class="factory-brands">';
    for (const brand of r.data) {
        const mr = await get('/api/models?brand_id=' + brand.id);
        if (mr.success && mr.data.length) {
            html += `<div class="factory-brand-card"><div class="factory-brand-header"><span style="font-size:28px">${brandLogo(brand.logo_emoji, 28)}</span><div><div style="font-weight:700">${brand.name}</div><div style="font-size:11px;color:var(--text-muted)">${brand.country || ''}</div></div></div>
                ${mr.data.map(m => {
                const price = Math.round(m.base_price * 0.85);
                return `<div class="factory-model-item"><span class="factory-model-name">${m.name}</span><span class="factory-model-price">${fmtPrice(price)}</span><button class="btn btn-sm btn-success" onclick="openFactoryBuyModal(${m.id}, '${brand.name.replace(/'/g, "\\'")}', '${m.name.replace(/'/g, "\\'")}', ${price}, '${(brand.country || '').replace(/'/g, "\\'")}')">Satın Al</button></div>`;
            }).join('')}
            </div>`;
        }
    }
    html += '</div>';
    c.innerHTML = html;
}

function openFactoryBuyModal(modelId, brandName, modelName, basePrice, country) {
    const isTurkey = country.toLowerCase().includes('türkiye') || country.toLowerCase().includes('turkey');
    const shipping = isTurkey ? 0 : Math.round(basePrice * 0.05);
    const tax = Math.round(basePrice * 0.08);
    const totalCash = basePrice + shipping + tax;
    const currentYear = new Date().getFullYear();

    let html = `
        <button class="modal-close" onclick="closeFactoryBuyModal()">✕</button>
        <div class="modal-header">
            <div class="modal-title"><i class="fa-solid fa-industry"></i> Fabrika Siparişi</div>
            <div style="font-size:13px; color:var(--text-muted); margin-top:5px;">Sıfır kilometre özel sipariş teslimatı</div>
        </div>
        
        <div class="sell-car-info" style="margin-bottom: 20px;">
            <div style="font-weight:700; font-size:18px; color:var(--text-primary); margin-bottom: 5px;">${brandName} ${modelName}</div>
            <div style="font-size: 13px; color:var(--text-muted);">
                Fabrika İndirimli Araç: <span style="color:var(--text-primary); font-weight:600;">${fmtPrice(basePrice)}</span><br>
                Nakliye Gideri: <span style="color:var(--text-primary); font-weight:600;">${fmtPrice(shipping)}</span><br>
                ÖTV & KDV (İndirimli): <span style="color:var(--text-primary); font-weight:600;">${fmtPrice(tax)}</span>
            </div>
            <div style="font-size: 16px; font-weight:700; color:var(--gold); margin-top:10px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 10px;">
                Baz Nakit Fiyat: ${fmtPrice(totalCash)}
            </div>
        </div>

        <div class="form-group">
            <label class="form-label" style="font-weight:600;">Model Yılı</label>
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
                <button class="btn btn-outline active" id="fYearBtnCurrent" onclick="selectFactoryYear(${currentYear})">
                    ${currentYear} Yılı Seçimi<br>
                    <small style="opacity:0.8">+0₺ (Stok)</small>
                </button>
                <button class="btn btn-outline" id="fYearBtnNext" onclick="selectFactoryYear(${currentYear + 1})">
                    ${currentYear + 1} Model Farkı<br>
                    <small style="opacity:0.8">+%10 Zammı</small>
                </button>
            </div>
        </div>

        <div class="form-group" style="margin-top: 20px;">
            <label class="form-label" style="font-weight:600;">Ödeme Yöntemi</label>
            <select class="form-input" id="factoryInstallments" onchange="updateFactoryPrice()">
                <option value="0">Peşin Ödeme</option>
                <option value="3">3 Ay Vadeli (%10 Vade Farkı)</option>
                <option value="6">6 Ay Vadeli (%20 Vade Farkı)</option>
                <option value="9">9 Ay Vadeli (%30 Vade Farkı)</option>
                <option value="12">12 Ay Vadeli (%40 Vade Farkı)</option>
            </select>
        </div>

        <div style="margin-top: 25px; padding: 15px; background: rgba(0,0,0,0.3); border-radius: 8px;">
            <div class="flex-between" style="margin-bottom: 5px;">
                <span style="color:var(--text-muted);">Toplam Sipariş Tutarı:</span>
                <span id="factorySummaryPrice" style="font-weight:800; font-size:20px; color:var(--gold);">${fmtPrice(totalCash)}</span>
            </div>
            <div id="factoryInstallmentInfo" style="font-size:12px; color:var(--text-muted); text-align:right; display:none;">
                Aylık Taksit: <span id="factoryMonthlyPayment" style="color:var(--text-primary); font-weight:600;">0₺</span>
            </div>
        </div>

        <button class="btn btn-primary" style="width:100%; margin-top:20px; font-size:16px; padding:15px;" id="confirmFactoryBuyBtn" onclick="submitFactoryBuy(${modelId})">
            Siparişi Tamamla <i class="fa-solid fa-arrow-right"></i>
        </button>
    `;

    document.getElementById('factoryBuyModalContent').innerHTML = html;
    window._currentFactoryBasePrice = totalCash;
    window._currentFactoryYear = currentYear;
    document.getElementById('factoryBuyModal').classList.add('active');
}

function closeFactoryBuyModal() {
    document.getElementById('factoryBuyModal').classList.remove('active');
}

function selectFactoryYear(year) {
    window._currentFactoryYear = year;
    const currentYear = new Date().getFullYear();
    document.getElementById('fYearBtnCurrent').classList.toggle('active', year === currentYear);
    document.getElementById('fYearBtnNext').classList.toggle('active', year === currentYear + 1);
    updateFactoryPrice();
}

function updateFactoryPrice() {
    let price = window._currentFactoryBasePrice;
    const currentYear = new Date().getFullYear();
    if (window._currentFactoryYear > currentYear) price = Math.round(price * 1.10);

    const inst = parseInt(document.getElementById('factoryInstallments').value) || 0;
    if (inst === 3) price = Math.round(price * 1.10);
    else if (inst === 6) price = Math.round(price * 1.20);
    else if (inst === 9) price = Math.round(price * 1.30);
    else if (inst === 12) price = Math.round(price * 1.40);

    document.getElementById('factorySummaryPrice').textContent = fmtPrice(price);

    const info = document.getElementById('factoryInstallmentInfo');
    if (inst > 0) {
        info.style.display = 'block';
        document.getElementById('factoryMonthlyPayment').textContent = fmtPrice(Math.round(price / inst));
    } else {
        info.style.display = 'none';
    }
}

async function submitFactoryBuy(modelId) {
    const btn = document.getElementById('confirmFactoryBuyBtn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> İşleniyor...';

    const inst = parseInt(document.getElementById('factoryInstallments').value) || 0;

    const r = await post('/api/player/factory-buy', {
        model_id: modelId,
        year: window._currentFactoryYear,
        installments: inst
    });

    if (r.success) {
        notify(r.message, 'success');
        updateFromResponse(r);
        closeFactoryBuyModal();
        loadFactory();
        if (inst > 0) loadPlayer(); // To refresh top bar stats if balance or loan triggers
    } else {
        notify(r.error, 'error');
        btn.disabled = false;
        btn.innerHTML = 'Siparişi Tamamla <i class="fa-solid fa-arrow-right"></i>';
    }
}

// ============ CUSTOM BUILD ============
let selectedOptions = [];
async function loadCustom() {
    const c = document.getElementById('customContent');
    if (!playerData.can_custom_build) {
        c.innerHTML = `<div class="custom-locked"><div class="custom-locked-icon"><i class="fa-solid fa-lock"></i></div><h2>Seviye 40 Gerekli</h2><p>Özel araç oluşturmak için seviye 40 olmalısınız</p><p style="color:var(--text-muted);font-size:13px">Mevcut seviye: ${playerData.level}</p></div>`;
        return;
    }
    c.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
    selectedOptions = [];

    const [brandsR, optsR] = await Promise.all([get('/api/brands'), get('/api/player/custom-options')]);
    if (!brandsR.success || !optsR.success) return;

    const categories = {};
    optsR.data.forEach(o => { if (!categories[o.category]) categories[o.category] = []; categories[o.category].push(o); });

    let modelsSelect = '';
    for (const b of brandsR.data) {
        if (b.prestige < 7) continue; // PRESTIGE LIMIT

        const mr = await get('/api/models?brand_id=' + b.id);
        if (mr.success) mr.data.forEach(m => { modelsSelect += `<option value="${m.id}" data-price="${m.base_price}">${b.name} ${m.name} (${fmtPrice(m.base_price)})</option>`; });
    }

    c.innerHTML = `<div class="custom-builder">
        <div style="background:var(--bg-card); border-left:4px solid var(--gold); padding:10px 15px; border-radius:4px; margin-bottom:15px;">
            <i class="fa-solid fa-gem" style="color:var(--gold);"></i> <strong>Sıkı Piyasa Kuralları:</strong> Sadece <strong>Prestij Seviyesi 7 ve üzeri</strong> lüks markalar (Örn: Porsche, Ferrari, Bugatti vb.) fabrikadan özel sipariş verilebilir. Alt seviye araçlar desteklenmemektedir.
        </div>
        <div class="custom-options-list">
            <div class="custom-category"><div class="custom-category-title"><i class="fa-solid fa-car"></i> Model Seçimi</div>
                <select class="form-select" id="customModel" style="width:100%" onchange="updateCustomTotal()">${modelsSelect}</select></div>
            ${Object.entries(categories).map(([cat, opts]) => `<div class="custom-category"><div class="custom-category-title">${cat}</div>
                ${opts.map(o => `<div class="custom-option-item" data-id="${o.id}" data-mult="${o.price_multiplier}" onclick="toggleCustomOption(this,${o.id},${o.price_multiplier})">
                    <div><div class="custom-option-name">${o.name}</div><div class="custom-option-desc">${o.description || ''}</div></div>
                    <span class="custom-option-multiplier">x${o.price_multiplier}</span></div>`).join('')}
            </div>`).join('')}
        </div>
        <div class="custom-summary"><div class="custom-summary-title"><i class="fa-solid fa-palette"></i> Özet</div>
            <div id="customSelectedList"></div>
            <div class="custom-total" id="customTotal">0₺</div>
            <button class="btn btn-lg btn-gold" style="width:100%" onclick="submitCustomBuild()"><i class="fa-solid fa-trowel-bricks"></i> Oluştur</button>
        </div>
    </div>`;
    updateCustomTotal();
}

function toggleCustomOption(el, id, mult) {
    el.classList.toggle('selected');
    const idx = selectedOptions.findIndex(o => o.id === id);
    if (idx >= 0) selectedOptions.splice(idx, 1);
    else selectedOptions.push({ id, mult });
    updateCustomTotal();
}

function updateCustomTotal() {
    const sel = document.getElementById('customModel');
    if (!sel) return;
    const basePrice = parseFloat(sel.options[sel.selectedIndex]?.dataset?.price || 0);
    let mult = 1;
    selectedOptions.forEach(o => mult *= o.mult);
    const total = Math.round(basePrice * mult);
    const el = document.getElementById('customTotal');
    if (el) el.textContent = fmtPrice(total);
    const list = document.getElementById('customSelectedList');
    if (list) list.innerHTML = selectedOptions.length ? selectedOptions.map(() => '').join('') : '<p style="font-size:12px;color:var(--text-muted)">Opsiyonlar seçin</p>';
}

async function submitCustomBuild() {
    const sel = document.getElementById('customModel');
    const modelId = parseInt(sel.value);
    const r = await post('/api/player/custom-build', { model_id: modelId, options: selectedOptions.map(o => o.id) });
    if (r.success) { notify(r.message, 'success'); updateFromResponse(r); }
    else notify(r.error, 'error');
}

// ============ MANAGEMENT (STAFF) ============
async function loadManagement() {
    const c = document.getElementById('managementContent');
    c.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

    const r = await get('/api/management/staff');
    if (!r.success) return;

    const { staff, roles } = r.data;

    c.innerHTML = `
        <div class="management-grid">
            <div class="management-card">
                <h3><i class="fa-solid fa-users-gear"></i> Mevcut Personel (${staff.length}/5)</h3>
                <div class="staff-list">
                    ${staff.length ? staff.map(s => `
                        <div class="staff-item">
                            <div class="staff-info">
                                <div class="staff-role-icon">${s.role === 'sales' ? '<i class="fa-solid fa-handshake"></i>' : s.role === 'mechanic' ? '<i class="fa-solid fa-screwdriver-wrench"></i>' : '<i class="fa-solid fa-wand-magic-sparkles"></i>'}</div>
                                <div>
                                    <div class="staff-name">${s.name}</div>
                                    <div class="staff-role">${roles[s.role].name} (Seviye ${s.level})</div>
                                    <div class="staff-salary">Maaş: ${fmtPrice(s.salary)}</div>
                                </div>
                            </div>
                            <button class="btn btn-sm btn-danger" onclick="fireStaff(${s.id})">Kov</button>
                        </div>
                    `).join('') : '<div class="empty-state">Henüz çalışan yok</div>'}
                </div>
            </div>

            <div class="management-card">
                <h3><i class="fa-solid fa-briefcase"></i> İşe Alım</h3>
                <div class="hiring-list">
                    ${Object.entries(roles).map(([id, cfg]) => {
        const alreadyHired = staff.some(s => s.role === id);
        return `
                            <div class="hire-item ${alreadyHired ? 'hired' : ''}">
                                <div class="hire-info">
                                    <div class="hire-title">${cfg.name}</div>
                                    <div class="hire-desc">${cfg.description}</div>
                                    <div class="hire-cost">Bedel: ${fmtPrice(cfg.hireCost)} | Maaş: ${fmtPrice(cfg.baseSalary)}</div>
                                </div>
                                <button class="btn btn-primary" ${alreadyHired ? 'disabled' : ''} onclick="hireStaff('${id}')">
                                    ${alreadyHired ? '<i class="fa-solid fa-circle-check"></i> Alındı' : '<i class="fa-solid fa-user-plus"></i> Al'}
                                </button>
                            </div>
                        `;
    }).join('')}
                </div>
            </div>
        </div>
    `;
}

async function hireStaff(role) {
    const name = prompt('Personel ismi girin:', '');
    if (!name) return;
    const r = await post('/api/management/staff/hire', { role, name });
    if (r.success) { notify(r.message, 'success'); loadManagement(); loadPlayer(); }
    else notify(r.error, 'error');
}

async function fireStaff(id) {
    if (!await showConfirm('Bu personeli işten çıkarmak istediğinize emin misiniz?')) return;
    const r = await post('/api/management/staff/fire/' + id);
    if (r.success) { notify(r.message, 'success'); loadManagement(); loadPlayer(); }
    else notify(r.error, 'error');
}

// ============ UPGRADES ============
async function loadUpgrades() {
    const c = document.getElementById('upgradesContent');
    c.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

    const r = await get('/api/management/upgrades');
    if (!r.success) return;

    const { currentSlots, upgradeCost, balance } = r.data;

    // We enforce a hard limit of maybe 200 or simply let it scale
    const isMax = currentSlots >= 200;

    c.innerHTML = `
        <div class="upgrades-grid" style="display:flex; justify-content:center;">
            <div class="upgrade-card" style="max-width:400px; width:100%;">
                <div class="upgrade-icon"><i class="fa-solid fa-warehouse"></i></div>
                <div class="upgrade-info" style="text-align:center;">
                    <br>
                    <div class="upgrade-title">Araç Kapasitesini Arttır</div>
                    <div class="upgrade-desc">Mevcut Kapasite: <strong>${currentSlots} Araç</strong></div>
                    <div class="upgrade-desc" style="font-size:12px; margin-top:5px;">Her yükseltme garajınıza +1 yeni araç için yer açar.</div>
                    ${!isMax ? `
                        <div class="upgrade-cost" style="font-size:16px; margin: 15px 0;">Yükseltme Ücreti: <strong>${fmtPrice(upgradeCost)}</strong></div>
                        <button class="btn btn-gold" style="width:100%;" onclick="buyUpgrade()" ${balance < upgradeCost ? 'disabled' : ''}>
                            <i class="fa-solid fa-hammer"></i> Yükselt
                        </button>
                    ` : '<div class="upgrade-max" style="margin-top:15px;"><i class="fa-solid fa-circle-check"></i> Maksimum Kapasiteye (200) Ulaşıldı.</div>'}
                </div>
            </div>
        </div>
    `;
}

async function buyUpgrade() {
    const r = await post('/api/management/upgrades/buy');
    if (r.success) { notify(r.message, 'success'); loadUpgrades(); loadPlayer(); }
    else notify(r.error, 'error');
}

// ============ PROFILE ============
async function loadProfile() {
    const c = document.getElementById('profileContent');
    await loadPlayer();
    const p = playerData;
    const tr = await get('/api/player/transactions?limit=10');
    const transactions = tr.success ? tr.data : [];

    c.innerHTML = `<div class="profile-grid">
        <div class="profile-card"><h3><i class="fa-solid fa-user-gear"></i> Oyuncu Bilgileri</h3>
            <div class="profile-stat"><span class="profile-stat-label">İsim</span><span class="profile-stat-value">${p.name} <i class="fa-solid fa-pen" style="cursor:pointer; font-size:12px; margin-left:6px; color:var(--text-muted)" onclick="changeName('${p.name}')" title="İsmi Değiştir"></i></span></div>
            <div class="profile-stat"><span class="profile-stat-label">Bakiye</span><span class="profile-stat-value" style="color:var(--gold)">${fmtPrice(p.balance)}</span></div>
            <div class="profile-stat"><span class="profile-stat-label">Seviye</span><span class="profile-stat-value">${p.level}</span></div>
            <div class="profile-stat"><span class="profile-stat-label">XP</span><span class="profile-stat-value">${fmt(p.xp)}/${fmt(p.xp_needed)}</span></div>
            <div class="profile-stat"><span class="profile-stat-label">Prestij</span><span class="profile-stat-value"><i class="fa-solid fa-star"></i> ${fmt(p.prestige_score)}</span></div>
        </div>
        <div class="profile-card"><h3><i class="fa-solid fa-chart-simple"></i> İstatistikler</h3>
            <div class="profile-stat" style="flex-direction:column; align-items:flex-start; gap:8px;">
                <div style="display:flex; justify-content:space-between; width:100%;">
                    <span class="profile-stat-label">İtibar</span>
                    <span class="profile-stat-value" style="color:var(--accent)">%${p.reputation}</span>
                </div>
                <button class="btn btn-sm btn-ghost" style="width:100%; border:1px solid var(--border);" onclick="showBusinessReviews()"><i class="fa-solid fa-star-half-stroke"></i> İşletme Yorumlarını Gör</button>
            </div>
            <div class="profile-stat"><span class="profile-stat-label">Toplam Alış</span><span class="profile-stat-value">${p.total_buys}</span></div>
            <div class="profile-stat"><span class="profile-stat-label">Toplam Satış</span><span class="profile-stat-value">${p.total_sales}</span></div>
            <div class="profile-stat"><span class="profile-stat-label">Toplam Kâr</span><span class="profile-stat-value" style="color:var(--success)">${fmtPrice(p.total_profit)}</span></div>
            <div class="profile-stat"><span class="profile-stat-label">Araçlar</span><span class="profile-stat-value">${p.car_count || 0}/${p.max_car_slots}</span></div>
        </div>
        <div class="profile-card"><h3><i class="fa-solid fa-award"></i> Yetkinlikler</h3>
            <div class="profile-stat"><span class="profile-stat-label">Galeri</span><span class="profile-stat-value">${p.has_gallery ? '<i class="fa-solid fa-circle-check"></i> Açık' : '<i class="fa-solid fa-circle-xmark"></i> Kapalı'}</span></div>
            <div class="profile-stat"><span class="profile-stat-label">Kapasite</span><span class="profile-stat-value">${p.max_car_slots} Araç Slotu</span></div>
            <div class="profile-stat"><span class="profile-stat-label">Özel Üretim</span><span class="profile-stat-value">${p.can_custom_build ? '<i class="fa-solid fa-circle-check"></i> Açık' : '<i class="fa-solid fa-circle-xmark"></i> Kapalı'}</span></div>
            <div class="profile-stat"><span class="profile-stat-label">Kredi Durumu</span><span class="profile-stat-value">${p.is_seized ? '<i class="fa-solid fa-triangle-exclamation"></i> Hacizli' : p.loan_remaining > 0 ? '<i class="fa-solid fa-credit-card"></i> Aktif' : '<i class="fa-solid fa-circle-check"></i> Temiz'}</span></div>
        </div>
        <div class="profile-card"><h3><i class="fa-solid fa-receipt"></i> Son İşlemler</h3>
            ${transactions.length ? transactions.map(t => {
        const typeMap = { 'sell': 'SATIŞ', 'sell_installment': 'TAKSİTLİ SATIŞ', 'buy': 'ALIŞ', 'loan': 'KREDİ', 'admin': 'SİSTEM', 'installment': 'TAKSİT', 'expense': 'GİDER' };
        const tc = t.type === 'sell' ? 'sell' : t.type === 'loan' ? 'loan' : 'buy';
        return `<div class="transaction-item"><div><span class="transaction-type type-${tc}">${typeMap[t.type] || t.type.toUpperCase()}</span> ${t.description}</div><span style="font-weight:700">${fmtPrice(t.amount)}</span></div>`;
    }).join('') : '<div style="text-align:center; padding:10px; color:var(--text-muted); font-size:13px;">Henüz işlem yok</div>'}
        <button class="btn btn-ghost" style="width:100%;margin-top:8px" onclick="logout()"><i class="fa-solid fa-door-open"></i> Çıkış Yap</button>
        </div>
    </div>`;
}

async function changeName(currentName) {
    const { value: newName } = await Swal.fire({
        title: 'İsminizi Değiştirin',
        input: 'text',
        inputValue: currentName,
        inputLabel: 'Yeni İsminiz',
        inputPlaceholder: 'Profilde görünecek isminiz...',
        showCancelButton: true,
        confirmButtonColor: 'var(--accent)',
        cancelButtonColor: 'var(--danger)',
        confirmButtonText: 'Kaydet',
        cancelButtonText: 'İptal',
        inputValidator: (value) => {
            if (!value) return 'İsim boş bırakılamaz!';
            if (value.length > 50) return 'Maksimum 50 karakter kullanabilirsiniz.';
        }
    });

    if (newName && newName !== currentName) {
        try {
            const res = await fetch('/api/player/change-name', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newName })
            }).then(r => r.json());

            if (res.success) {
                notify(res.message, 'success');
                loadProfile(); // profili baştan çizer
            } else {
                notify(res.error || 'Hata oluştu!', 'error');
            }
        } catch (e) { console.error(e); }
    }
}

async function showBusinessReviews() {
    const p = playerData;
    let reviewCount = p.review_count || 0;

    document.getElementById('reviewsAvgText').textContent = `% ${p.reputation} `;
    document.getElementById('reviewsCountText').textContent = reviewCount.toLocaleString('tr-TR');

    const list = document.getElementById('reviewsList');
    list.innerHTML = '<div style="text-align:center; padding:20px; color:var(--text-muted);"><i class="fa-solid fa-spinner fa-spin"></i> Yorumlar Yükleniyor...</div>';
    document.getElementById('reviewsModal').style.display = 'flex';

    // Fetch real reviews from DB
    const res = await get('/api/player/business-reviews');
    let realReviews = [];
    if (res.success && res.data) {
        realReviews = res.data;
    }

    const names = ["Ahmet", "Mehmet", "Celal", "Ayşe", "Fatma", "Ali", "Burak", "Cem", "Deniz", "Efe", "Gamze", "Hakan", "İbrahim", "Kemal", "Leyla", "Murat", "Nuri", "Osman", "Pelin", "Rıza", "Selin", "Turan", "Umut", "Volkan", "Yunus", "Zeynep", "Caner", "Ozan", "Ceren", "Mert"];
    const surnames = ["A.", "B.", "C.", "D.", "E.", "F.", "G.", "H.", "K.", "L.", "M.", "N.", "O.", "P.", "R.", "S.", "T.", "U.", "V.", "Y.", "Z."];
    const posComments = [
        "Harika bir galeri, başından sonuna kadar çok ilgilendiler. Kesinlikle tavsiye ederim.",
        "Araçlar bebek gibi temiz ve bakımlı, dürüst satıcı zor bulunur ama burası öyle.",
        "Esnaflıkları 10 numara 5 yıldız. Piyasa koşullarına göre en mantıklı yer.",
        "Fiyatlar çok makul, üstelik pazarlıkta da insanı kırmıyorlar.",
        "İlgileri ve sürpriz indirimleri için çok teşekkürler, ayağınızı yerden kesiyorlar.",
        "Güleryüzlü hizmet, eksperde ne dedilerse o çıktı. Helal olsun.",
        "Kusursuz bir deneyimdi, hiçbir soruyu yanıtsız bırakmıyorlar.",
        "Kredi işlemlerini bile şipşak hallettik, çok kral insanlar cidden.",
        "Daha önce başka yerlerden kazık yemiştim, burası ilaç gibi geldi.",
        "İşlerini hakkıyla ve profesyonelce yapıyorlar, yeni aracımız hayırlı olsun."
    ];
    const negComments = [
        "Araçta söylenilmeyen lokal boya çıktı, eksperde şok oldum. Hiç memnun kalmadım.",
        "Fiyatları piyasanın üstünde tutmuşlar, üstüne bir de burunlarından kıl aldırmıyorlar.",
        "Satış sonrası ilgi sıfır, parayı alana kadar kralsın sonra yüzüne bile bakmıyorlar.",
        "Ekspertizde sürprizlerle karşılaştım, hasar kaydını gizlemeye çalışmışlar.",
        "Çalışanlar kaba ve laubali, kimseye önermiyorum burayı.",
        "Araç temiz denildi motor mekanik olarak bitik durumda çıktı, mahkemelik olduk.",
        "Vakit kaybı, buraya gideceğinize sokaktan geçen adamdan araba alın daha iyi.",
        "Kapıdan girdiğinizde sadece cüzdanınıza bakıyorlar, güven vermiyor.",
        "İlanlardaki araç fotolarıyla gerçeği birbirini tutmuyor, Photoshop ustaları."
    ];

    let html = '';
    const now = new Date();

    // 1. Render Real Reviews (Max 50)
    for (const rr of realReviews) {
        let diffMs = now - new Date(rr.created_at);
        let daysAgo = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        if (daysAgo <= 0) daysAgo = 'Bugün';
        else daysAgo = `${daysAgo} gün önce`;

        const starsHtml = Array(10).fill(0).map((_, idx) => `<i class="fa-solid fa-star" style="color:${idx < rr.rating ? 'var(--gold)' : 'var(--border)'}; font-size:10px;"></i>`).join('');

        html += `
            <div style="background:var(--bg-card-hover); padding:16px; border-radius:8px; border:1px solid var(--border);">
                <div style="display:flex; justify-content:space-between; margin-bottom:8px; align-items:center;">
                    <div style="font-weight:700; font-size:15px; color:var(--text-primary);"><i class="fa-solid fa-circle-user" style="color:var(--success); margin-right:6px;" title="Doğrulanmış Müşteri"></i> ${rr.reviewer_name}</div>
                    <div style="font-size:12px; color:var(--text-muted);">${daysAgo}</div>
                </div>
                <div style="margin-bottom:10px; display:flex; gap:2px; align-items:center;">
                    ${starsHtml} <span style="font-size:12px; margin-left:8px; font-weight:800; color:var(--text-primary);">${rr.rating}/10</span>
                </div>
                <div style="font-size:14px; color:var(--text-secondary); line-height:1.5;">
                    "${rr.comment}"
                </div>
            </div>
            `;
    }

    // 2. Pad with Simulated Reviews if needed
    const totalTarget = Math.min(50, reviewCount);
    const paddingNeeded = totalTarget - realReviews.length;

    if (paddingNeeded > 0) {
        const reputationFrac = p.reputation / 100;
        for (let i = 0; i < paddingNeeded; i++) {
            const isPositive = Math.random() < reputationFrac;
            const name = names[Math.floor(Math.random() * names.length)] + ' ' + surnames[Math.floor(Math.random() * surnames.length)];
            const rating = isPositive ? Math.floor(Math.random() * 3) + 8 : Math.floor(Math.random() * 5) + 1; // 8-10 or 1-5
            const comment = isPositive ? posComments[Math.floor(Math.random() * posComments.length)] : negComments[Math.floor(Math.random() * negComments.length)];
            const starsHtml = Array(10).fill(0).map((_, idx) => `<i class="fa-solid fa-star" style="color:${idx < rating ? 'var(--gold)' : 'var(--border)'}; font-size:10px;"></i>`).join('');
            const daysAgoSimulated = Math.floor(Math.random() * 60) + 1;

            html += `
                <div style="background:var(--bg-card-hover); padding:16px; border-radius:8px; border:1px solid var(--border); opacity: 0.85;">
                    <div style="display:flex; justify-content:space-between; margin-bottom:8px; align-items:center;">
                        <div style="font-weight:700; font-size:15px; color:var(--text-primary);"><i class="fa-solid fa-circle-user" style="color:var(--text-muted); margin-right:6px;"></i> ${name}</div>
                        <div style="font-size:12px; color:var(--text-muted);">${daysAgoSimulated} gün önce</div>
                    </div>
                    <div style="margin-bottom:10px; display:flex; gap:2px; align-items:center;">
                        ${starsHtml} <span style="font-size:12px; margin-left:8px; font-weight:800; color:var(--text-primary);">${rating}/10</span>
                    </div>
                    <div style="font-size:14px; color:var(--text-secondary); line-height:1.5;">
                        "${comment}"
                    </div>
                </div>
            `;
        }
    }

    if (totalTarget === 0 && realReviews.length === 0) {
        html = '<div style="text-align:center; padding:20px; color:var(--text-muted);">Henüz hiç yorum yapılmamış. İşletmeniz biraz daha müşteri kazanmalı!</div>';
    }

    list.innerHTML = html;
    document.getElementById('reviewsModal').style.display = 'flex';
}

function closeReviewsModal() {
    document.getElementById('reviewsModal').style.display = 'none';
}

async function resetGame() {
    if (!await showConfirm('Tüm ilerlemeniz silinecek! Emin misiniz?')) return;
    if (!await showConfirm('BU İŞLEM GERİ ALINAMAZ! Son kez emin misiniz?')) return;
    const r = await post('/api/player/reset');
    if (r.success) { notify('Oyun sıfırlandı!', 'success'); loadPlayer(); navigateTo('explore'); }
}

async function logout() {
    if (!await showConfirm('Çıkış yapmak istiyor musunuz?')) return;
    await post('/api/auth/logout');
    showAuthScreen();
    playerData = {};
}

// ============ AVATAR SEÇİMİ ============
async function selectAvatar(path) {
    const r = await post('/api/player/update-avatar', { avatar: path });
    if (r.success) {
        playerData.avatar = path;
        updatePlayerUI();
        notify('Avatar güncellendi! <i class="fa-solid fa-user"></i>', 'success');
    } else {
        notify(r.error, 'error');
    }
}

// ============ ILLEGAL GARAGE ============
let illegalSelectedCar = null;
async function loadIllegal(keepScroll = false) {
    const c = document.getElementById('illegalContent');
    const scrollPos = window.scrollY;
    if (!keepScroll) c.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
    const r = await get('/api/player/cars');
    if (!r.success || !r.data.length) {
        c.innerHTML = '<div class="empty-state"><div class="empty-icon"><i class="fa-solid fa-car"></i></div><div class="empty-text">Araç yok</div><div class="empty-sub">Önce araç satın alın</div></div>';
        return;
    }
    const cars = r.data;
    illegalSelectedCar = illegalSelectedCar || (cars[0] ? cars[0].player_car_id : null);

    // Modları backend'den al (doğru indeksler ve tüm kategoriler)
    const modsR2 = await get('/api/player/illegal-mods');
    if (!modsR2.success) {
        c.innerHTML = '<div class="empty-state"><div class="empty-icon"><i class="fa-solid fa-triangle-exclamation"></i></div><div class="empty-text">Modlar yüklenemedi</div></div>';
        return;
    }
    const allMods = modsR2.all || [];
    const groupedMods = modsR2.data || {};

    const categoryNames = {
        yazilim: '<i class="fa-solid fa-laptop-code"></i> Yazılım', egzoz: '<i class="fa-solid fa-wind"></i> Egzoz', suspansiyon: '<i class="fa-solid fa-arrows-up-down"></i> Süspansiyon',
        cam_filmi: '<i class="fa-solid fa-window-maximize"></i> Cam Filmi', serseri: '<i class="fa-solid fa-car-side"></i> Serseri Ayarı', km_dusurme: '<i class="fa-solid fa-gauge-simple-min"></i> KM Düşürme',
        nitro: '<i class="fa-solid fa-fire"></i> Nitro', modifiye: '<i class="fa-solid fa-palette"></i> Modifiye',
        batarya: '<i class="fa-solid fa-battery-full"></i> Batarya Geliştirmeleri', motor_ev: '<i class="fa-solid fa-bolt"></i> Elektrik Motoru',
        racing_tires: '<i class="fa-solid fa-truck-monster"></i> Yarış Tekerlekleri'
    };

    let modsHTML = '';
    const selectedCarObj = cars.find(c => c.player_car_id === illegalSelectedCar);
    const isElectric = selectedCarObj?.fuel_type === 'Elektrik';

    // Get applied mods for selected car FIRST so we can use it to lock UI
    let appliedHTML = '';
    let appliedModsList = [];
    if (illegalSelectedCar) {
        const modsR = await get('/api/player/illegal-mods/' + illegalSelectedCar);
        if (modsR.success && modsR.data.length) {
            appliedModsList = modsR.data;
            appliedHTML = `<div class="detail-section" style="margin-top:20px"><div class="detail-section-title"><i class="fa-solid fa-circle-check"></i> Uygulanan Modifikasyonlar</div>
                <div class="mod-applied-list">${appliedModsList.map(am => `<div class="mod-applied-item">
                    <span>${am.mod_name} <span class="mod-tier ${am.mod_tier}">${am.mod_tier}</span></span>
                    <span style="font-size:12px;color:var(--text-muted)">+${am.hp_bonus}HP +${am.torque_bonus}Nm +${am.speed_bonus}km/h | +${fmtPrice(am.price_bonus)} değer</span>
                </div>`).join('')}</div></div>`;
        }
    }

    const hasStage3 = appliedModsList.some(m => m.mod_type === 'yazilim' && m.mod_name.includes('Stage 3'));

    for (const [type, items] of Object.entries(groupedMods)) {
        const catName = categoryNames[type] || type;
        modsHTML += `<div class="mod-category"><div class="mod-category-title">${catName}</div><div class="mod-grid">
            ${items.map(m => {
            const idx = allMods.findIndex(am => am.name === m.name && am.type === m.type);
            const cost = selectedCarObj ? Math.round(selectedCarObj.price * m.costMult) : 0;

            // EV Compatibility Check
            const isIncompatible = (m.hasOwnProperty('isEV') && m.isEV !== isElectric);

            // Check if already applied or locked by Stage 3
            const alreadyHasThisMod = appliedModsList.some(am => am.mod_name === m.name);
            const isLockedYazilim = (type === 'yazilim' && hasStage3 && !alreadyHasThisMod);
            const isFullyDisabled = isIncompatible || alreadyHasThisMod || isLockedYazilim;

            const hpText = m.hpBonus ? `+${m.hpBonus} HP` : '';
            const torqueText = m.torqueBonus ? `+${m.torqueBonus} Nm` : '';
            const speedText = m.speedBonus ? `+${m.speedBonus} km/h` : '';
            const extraText = m.kmReduce ? (m.kmReduce === -1 ? 'KM sıfırla' : `-${(m.kmReduce).toLocaleString('tr-TR')} km`) : '';

            let overlayMsg = '';
            if (isIncompatible) overlayMsg = isElectric ? '<i class="fa-solid fa-plug-circle-xmark"></i> Sadece İçten Yanmalı' : '<i class="fa-solid fa-battery-slash"></i> Sadece Elektrikli';
            else if (alreadyHasThisMod) overlayMsg = '<i class="fa-solid fa-check"></i> Uygulandı';
            else if (isLockedYazilim) overlayMsg = '<i class="fa-solid fa-lock"></i> Kilitli (Stage 3 Var)';

            return `<div class="mod-card ${isFullyDisabled ? 'incompatible' : ''}" 
                         ${!isFullyDisabled ? `onclick="applyIllegalMod(${illegalSelectedCar},${idx})"` : ''}>
                <div class="mod-card-header">
                    <div>
                        <span class="mod-name">${m.name}</span> 
                        <span class="mod-tier ${m.tier}">${m.tier.charAt(0).toUpperCase() + m.tier.slice(1)}</span>
                    </div>
                    <div class="mod-price" style="color:var(--danger);font-weight:700">${fmtPrice(cost)}</div>
                </div>
                <div class="mod-stats">
                    ${hpText ? `<span class="mod-stat">HP: <span>${hpText}</span></span>` : ''}
                    ${torqueText ? `<span class="mod-stat">Tork: <span>${torqueText}</span></span>` : ''}
                    ${speedText ? `<span class="mod-stat">Hız: <span>${speedText}</span></span>` : ''}
                    ${extraText ? `<span class="mod-stat">Özel: <span>${extraText}</span></span>` : ''}
                    <span class="mod-stat risk">Risk: <span>%${m.riskPercent}</span></span>
                </div>
                ${overlayMsg ? `<div class="mod-incompatible-msg">${overlayMsg}</div>` : ''}
            </div>`;
        }).join('')}
        </div></div>`;
    }

    c.innerHTML = `
            <div class="illegal-car-selector">
                ${cars.map(car => `<button class="illegal-car-chip ${car.player_car_id === illegalSelectedCar ? 'active' : ''}"
                onclick="illegalSelectedCar=${car.player_car_id};loadIllegal(true)">
                ${brandLogo(car.logo_emoji, 18)} ${car.brand_name} ${car.model_name}
            </button>`).join('')
        }
        </div>
            ${modsHTML}${appliedHTML} `;

    if (keepScroll) window.scrollTo(0, scrollPos);
}

async function applyIllegalMod(pcId, modIdx) {
    if (!pcId) { notify('Önce bir araç seçin!', 'error'); return; }
    if (!await showConfirm('Bu modifikasyonu uygulamak istiyor musunuz? Risk seviyeniz artacak!')) return;
    const r = await post('/api/player/illegal-mod/' + pcId, { mod_index: modIdx });
    if (r.success) { notify(r.message, 'success'); updateFromResponse(r); loadIllegal(true); }
    else notify(r.error, 'error');
}

// ============ JUNKYARD ============
async function loadJunkyard() {
    const c = document.getElementById('junkyardContent');
    c.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
    const r = await get('/api/player/junkyard');
    if (!r.success || !r.data.length) {
        c.innerHTML = '<div class="empty-state"><div class="empty-icon"><i class="fa-solid fa-screwdriver-wrench"></i></div><div class="empty-text">Hurdalık boş</div><div class="empty-sub">Şu an hurdalıkta araç yok</div></div>';
        return;
    }
    c.innerHTML = `<div class="junkyard-grid">${r.data.map(car => {
        const mhPct = car.motor_health || 0;
        const mhColor = mhPct >= 50 ? 'var(--warning)' : 'var(--danger)';
        return `<div class="junkyard-card">
            <div class="junkyard-card-header">
                <div><div class="junkyard-car-name">${brandLogo(car.logo_emoji, 18)} ${car.brand_name} ${car.model_name}</div>
                    <div style="font-size:12px;color:var(--text-muted)">${car.year} | ${fmt(car.km)} km</div></div>
                <div class="junkyard-price">${fmtPrice(car.price)}</div>
            </div>
            <div class="junkyard-stats">
                <div class="junkyard-stat"><strong>Hasar:</strong> ${car.damage_status}</div>
                <div class="junkyard-stat"><strong>Motor:</strong> <span style="color:${mhColor}">%${mhPct}</span></div>
                <div class="junkyard-stat"><strong>Motor Durumu:</strong> ${car.engine_status}</div>
                <div class="junkyard-stat"><strong>Yakıt:</strong> ${car.fuel_type}</div>
            </div>
            ${car.description ? `<div class="junkyard-desc">"${car.description}"</div>` : ''}
            <div class="junkyard-actions">
                <button class="btn btn-success" onclick="buyJunkyard(${car.id})"><i class="fa-solid fa-screwdriver-wrench"></i> Satın Al (${fmtPrice(car.price)})</button>
                <button class="btn btn-ghost" onclick="openCarDetail(${car.id})"><i class="fa-solid fa-magnifying-glass"></i> Detay</button>
            </div>
        </div>`;
    }).join('')
        }</div>`;
}

async function buyJunkyard(carId) {
    if (!await showConfirm('Bu hurda aracı almak istiyor musunuz?')) return;
    const r = await post('/api/player/junkyard-buy/' + carId);
    if (r.success) { notify(r.message, 'success'); updateFromResponse(r); loadJunkyard(); }
    else notify(r.error, 'error');
}

// ============ LEADERBOARD ============
async function loadLeaderboard() {
    const c = document.getElementById('leaderboardContent');
    c.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
    const r = await get('/api/leaderboard');
    if (!r.success) { c.innerHTML = '<div class="empty-state"><div class="empty-icon"><i class="fa-solid fa-award"></i></div><div class="empty-text">Yüklenemedi</div></div>'; return; }

    const data = r.data;
    const myRank = r.myRank;

    c.innerHTML = `
            <div class="leaderboard-tabs">
            <button class="lb-tab active" onclick="switchLeaderboardTab('prestige', event)"><i class="fa-solid fa-star"></i> Prestij</button>
            <button class="lb-tab" onclick="switchLeaderboardTab('profit', event)"><i class="fa-solid fa-money-bill-wave"></i> Kâr</button>
            <button class="lb-tab" onclick="switchLeaderboardTab('level', event)"><i class="fa-solid fa-arrow-trend-up"></i> Seviye</button>
            <button class="lb-tab" onclick="switchLeaderboardTab('sales', event)"><i class="fa-solid fa-car-side"></i> Satış</button>
        </div>
            ${myRank ? `<div class="my-rank-card">
            <span class="my-rank-label">Senin Sıralamanın</span>
            <div class="my-rank-info">
                <span class="my-rank-pos">#${myRank.rank}</span>
                <span class="my-rank-name">${myRank.username}</span>
                <span class="my-rank-value"><i class="fa-solid fa-star"></i> ${fmt(myRank.prestige_score)}</span>
            </div>
        </div>` : ''
        }
        <div class="leaderboard-list" id="leaderboardList">
            ${renderLeaderboardList(data.prestige, 'prestige_score', '<i class="fa-solid fa-star"></i>')}
        </div>
        `;

    window.leaderboardData = data;
}

function switchLeaderboardTab(type, e) {
    document.querySelectorAll('.lb-tab').forEach(t => t.classList.remove('active'));
    e.target.classList.add('active');

    const data = window.leaderboardData;
    const configs = {
        prestige: { list: data.prestige, field: 'prestige_score', icon: '<i class="fa-solid fa-star"></i>' },
        profit: { list: data.profit, field: 'total_profit', icon: '<i class="fa-solid fa-money-bill-wave"></i>' },
        level: { list: data.level, field: 'level', icon: '<i class="fa-solid fa-arrow-trend-up"></i>' },
        sales: { list: data.sales, field: 'total_sales', icon: '<img src="/img/logo1.png" style="height: 16px; width: auto; vertical-align: middle;">' }
    };
    const cfg = configs[type];
    document.getElementById('leaderboardList').innerHTML = renderLeaderboardList(cfg.list, cfg.field, cfg.icon);
}

function renderLeaderboardList(list, field, icon) {
    if (!list || !list.length) return '<div class="empty-state"><div class="empty-text">Henüz veri yok</div></div>';

    return list.map((p, i) => {
        const rank = i + 1;
        const medal = rank === 1 ? '<i class="fa-solid fa-medal" style="color:#ffd700"></i>' : rank === 2 ? '<i class="fa-solid fa-medal" style="color:#c0c0c0"></i>' : rank === 3 ? '<i class="fa-solid fa-medal" style="color:#cd7f32"></i>' : `#${rank} `;
        const isTop3 = rank <= 3;
        const value = field === 'total_profit' ? fmtPrice(p[field]) : fmt(p[field]);

        return `<div class="lb-item ${isTop3 ? 'top-' + rank : ''}">
            <div class="lb-rank">${medal}</div>
            <div class="lb-info">
                <span class="lb-name">${p.username}</span>
                <span class="lb-level">Lv ${p.level}</span>
            </div>
            <div class="lb-value">${icon} ${value}</div>
        </div>`;
    }).join('');
}

// ============ ACHIEVEMENTS ============
async function loadAchievements(silent = false) {
    const c = document.getElementById('achievementsContent');
    if (!silent) c.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
    const r = await get('/api/player/achievements');
    if (!r.success) { c.innerHTML = '<div class="empty-state"><div class="empty-icon"><i class="fa-solid fa-award"></i></div><div class="empty-text">Yüklenemedi</div></div>'; return; }

    const { achievements, unlocked, stats } = r.data;
    const unlockedIds = unlocked.map(u => u.achievement_id);

    const categories = {};
    achievements.forEach(a => {
        if (!categories[a.category]) categories[a.category] = [];
        categories[a.category].push(a);
    });

    const categoryNames = {
        trading: '<i class="fa-solid fa-money-bill-wave"></i> Ticaret',
        collection: '<i class="fa-solid fa-car-side"></i> Koleksiyon',
        wealth: '<i class="fa-solid fa-gem"></i> Zenginlik',
        experience: '<i class="fa-solid fa-arrow-trend-up"></i> Deneyim',
        special: '<i class="fa-solid fa-star"></i> Özel'
    };

    c.innerHTML = `
            <div class="achievements-summary">
            <div class="ach-summary-item">
                <span class="ach-summary-value">${unlocked.length}/${achievements.length}</span>
                <span class="ach-summary-label">Başarım</span>
            </div>
            <div class="ach-summary-item">
                <span class="ach-summary-value">${fmtPrice(stats.totalRewards || 0)}</span>
                <span class="ach-summary-label">Toplam Ödül</span>
            </div>
            <div class="ach-summary-item">
                <span class="ach-summary-value">${stats.totalXP || 0}</span>
                <span class="ach-summary-label">Toplam XP</span>
            </div>
        </div>
            <div class="achievements-grid">
                ${Object.entries(categories).map(([cat, achs]) => `
                <div class="ach-category">
                    <div class="ach-category-title">${categoryNames[cat] || cat}</div>
                    <div class="ach-list">
                        ${achs.map(a => {
        const unlockedData = unlocked.find(u => u.achievement_id === a.id);
        const isUnlocked = !!unlockedData;
        const isClaimed = isUnlocked && unlockedData.is_claimed === 1;

        let actionHtml = '';
        if (isUnlocked && !isClaimed) {
            actionHtml = `<button class="btn btn-gold btn-sm" onclick="claimAchievement(${a.id})"><i class="fa-solid fa-hand-holding-dollar"></i> Topla</button>`;
        } else if (isClaimed) {
            actionHtml = `<div class="ach-status"><i class="fa-solid fa-circle-check" style="color:var(--success)"></i></div>`;
        } else {
            actionHtml = `<div class="ach-status"><i class="fa-solid fa-lock" style="color:var(--text-muted)"></i></div>`;
        }

        const iconMap = {
            'icon-first-sale': '<i class="fa-solid fa-handshake"></i>',
            'icon-beginner-seller': '<i class="fa-solid fa-cart-shopping"></i>',
            'icon-experienced-seller': '<i class="fa-solid fa-store"></i>',
            'icon-master-seller': '<i class="fa-solid fa-gem"></i>',
            'icon-legend-seller': '<i class="fa-solid fa-crown"></i>',
            'icon-first-buy': '<i class="fa-solid fa-tags"></i>',
            'icon-collector': '<i class="fa-solid fa-car-side"></i>',
            'icon-first-profit': '<i class="fa-solid fa-money-bill-trend-up"></i>',
            'icon-business': '<i class="fa-solid fa-briefcase"></i>',
            'icon-millionaire': '<i class="fa-solid fa-vault"></i>',
            'icon-multi-millionaire': '<i class="fa-solid fa-building-columns"></i>',
            'icon-rich': '<i class="fa-solid fa-wallet"></i>',
            'icon-very-rich': '<i class="fa-solid fa-sack-dollar"></i>',
            'icon-rookie': '<i class="fa-solid fa-user-graduate"></i>',
            'icon-experienced': '<i class="fa-solid fa-medal"></i>',
            'icon-expert': '<i class="fa-solid fa-award"></i>',
            'icon-master': '<i class="fa-solid fa-trophy"></i>',
            'icon-legend': '<i class="fa-solid fa-chess-king"></i>',
            'icon-prestige-start': '<i class="fa-solid fa-star-half-stroke"></i>',
            'icon-prestige-master': '<i class="fa-solid fa-star"></i>',
            'icon-mini-garage': '<i class="fa-solid fa-warehouse"></i>',
            'icon-big-garage': '<i class="fa-solid fa-house-chimney-window"></i>',
            'icon-mega-garage': '<i class="fa-solid fa-city"></i>',
            'icon-gallery-owner': '<i class="fa-solid fa-building"></i>',
            'icon-factory-partner': '<i class="fa-solid fa-industry"></i>'
        };
        const iconKey = (a.icon || '').trim();
        const displayIcon = iconMap[iconKey] || (iconKey.startsWith('icon-') ? '<i class="fa-solid fa-award"></i>' : iconKey) || '<i class="fa-solid fa-award"></i>';

        return `<div class="ach-item ${isUnlocked ? 'unlocked' : 'locked'} ${isClaimed ? 'claimed' : ''}">
                                <div class="ach-icon">${displayIcon}</div>
                                <div class="ach-content">
                                    <div class="ach-name">${a.name}</div>
                                    <div class="ach-desc">${a.description}</div>
                                    <div class="ach-reward"><i class="fa-solid fa-gift"></i> ${fmtPrice(a.reward_money)} | +${a.reward_xp} XP</div>
                                </div>
                                <div class="ach-action">${actionHtml}</div>
                            </div>`;
    }).join('')}
                    </div>
                </div>
            `).join('')}
            </div>
        `;
}

async function claimAchievement(id) {
    const r = await post(`/api/player/achievements/claim/${id}`);
    if (r.success) {
        notify(r.message, 'success');
        loadAchievements(true);
        loadPlayer();
    } else {
        notify(r.error, 'error');
    }
}

// ============ AUTH ============
// showAuthScreen, hideAuthScreen, handleLogin, handleRegister -> yukarıda tanımlı (DOMContentLoaded ile init)

// handleLogin ve handleRegister -> yukarıda tanımlı

// ============ SOCKET EVENTS ============
// day_reset listener consolidated at line 329

socket.on('offer_received', (data) => {
    notify(`< i class="fa-solid fa-box" ></i > Yeni bir teklif aldınız!(${data.brand} ${data.model})`, 'offer');
    if (currentPage === 'listings') loadListings();
});

socket.on('new_auction_bid', (bid) => {
    notify(`< i class="fa-solid fa-tag" ></i > ${bid.npc_name} ${fmtPrice(bid.bid_price)} teklif etti!`, 'offer');
    if (currentPage === 'listings') loadListings();
});

socket.on('personal_car_update', (data) => {
    if (data.playerId === playerData.id) {
        if (currentPage === 'home') loadHome();
    }
});

socket.on('prestige_update', (data) => {
    if (data.prestige_score !== undefined) document.getElementById('playerPrestige').textContent = fmt(data.prestige_score);
});

socket.on('market_update', (data) => {
    notify(data.message.replace('<i class="fa-solid fa-money-bill-wave"></i>', '<i class="fa-solid fa-money-bill-wave"></i>'), 'info');
    // Sayfa yenilenmesini (loadCars) kapattık ki kullanıcı keşfette aşağılardayken en başa atmasın.
});

socket.on('loan_update', (data) => {
    notify(data.message, data.type === 'seized' || data.type === 'missed' ? 'error' : 'success');
    loadPlayer();
    if (currentPage === 'bank') loadBank();
});

socket.on('risk_update', (data) => {
    if (data.risk_level !== undefined) {
        playerData.risk_level = data.risk_level;
        updatePlayerUI();
    }
});

socket.on('police_seizure', (data) => {
    notify(`POLİS! ${data.car_name} aracınıza el konuldu! Risk: % 100`, 'error');
    loadPlayer();
    if (currentPage === 'illegal') loadIllegal();
    if (currentPage === 'mycars') loadMyCars();
});

socket.on('player_update', () => { loadPlayer(); });

socket.on('new_offer', (offer) => {
    notify(`Yeni Teklif! ${offer.npc_name}: ${fmtPrice(offer.offer_price)} `, 'offer');
    if (currentPage === 'listings') loadListings();
});

// ============ ORGANİZATÖR YARIŞLARI ============
async function loadRaces() {
    if (!window.myCars || !window.myCars.length) await loadMyCars();
    const grid = document.getElementById('racesContent');
    if (!grid) return;
    grid.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

    try {
        const r = await get('/api/player/races');
        if (!r.success || !r.races || !r.races.length) {
            grid.innerHTML = '<div class="empty-state"><div class="empty-icon"><i class="fa-solid fa-flag-checkered"></i></div><div class="empty-text">Şu an aktif bir yarış yok</div><div class="empty-sub">Organizatör yeni yarış planladığında burada görünecek</div></div>';
            return;
        }

        grid.innerHTML = r.races.map(race => {
            const date = new Date(race.starts_at).toLocaleString('tr-TR');
            const perc = Math.min(100, Math.round((race.current_participants / race.max_participants) * 100));

            return `<div class="race-card">
                <div class="race-header">
                    <div class="race-title"><i class="fa-solid fa-flag-checkered"></i> ${race.name}</div>
                    <div class="race-time"><i class="fa-solid fa-clock"></i> Başlangıç: ${date}</div>
                </div>
                <div class="race-desc">${race.description || 'Bu yarışa katılıp yeteneklerinizi gösterin!'}</div>
                <div class="race-stats">
                    <div class="race-stat-item"><span>Giriş Ücreti:</span> <strong>${fmtPrice(race.entry_fee)}</strong></div>
                    <div class="race-stat-item"><span>Ödül Havuzu:</span> <strong style="color:var(--gold)">Kayıt oranına göre değişir</strong></div>
                    <div class="race-stat-item" style="grid-column:1/-1;"><span>Katılım: ${race.current_participants}/${race.max_participants}</span>
                        <div style="width:100%;height:6px;background:var(--border);border-radius:3px;margin-top:5px;overflow:hidden;">
                            <div style="width:${perc}%;height:100%;background:var(--accent);transition:0.3s;"></div>
                        </div>
                    </div>
                </div>
                <div class="race-actions" style="margin-top:15px;display:flex;gap:10px;">
                    <button class="btn btn-primary" style="flex:1" onclick="openJoinRaceModal(${race.id}, ${race.entry_fee})" ${perc >= 100 ? 'disabled' : ''}>${perc >= 100 ? 'Kontenjan Dolu' : '<i class="fa-solid fa-right-to-bracket"></i> Yarışa Katıl'}</button>
                </div>
            </div > `;
        }).join('');
    } catch (e) {
        grid.innerHTML = '<div class="empty-state">Hata oluştu (' + e.message + ')</div>';
    }
}

async function openJoinRaceModal(raceId, entryFee) {
    if (!window.myCars || window.myCars.length === 0) {
        notify('Yarışa katılmak için araç sahibi olmalısınız!', 'error');
        return;
    }

    document.getElementById('joinRaceId').value = raceId;
    document.getElementById('joinRaceFeeInfo').innerHTML = `Bu yarışın giriş ücreti: <strong style="color:var(--warning)">${fmtPrice(entryFee)}</strong>`;

    const select = document.getElementById('joinRaceCarSelect');
    select.innerHTML = '<option value="">-- Katılacağınız Aracı Seçin --</option>' +
        window.myCars.map(c => `<option value="${c.player_car_id}">${c.brand_name} ${c.model_name} (HP: ${c.horsepower}, Tork: ${c.torque})</option>`).join('');

    document.getElementById('joinRaceModal').classList.add('active');
}

function closeJoinRaceModal() {
    document.getElementById('joinRaceModal').classList.remove('active');
}

async function submitJoinRace() {
    const raceId = document.getElementById('joinRaceId').value;
    const carId = document.getElementById('joinRaceCarSelect').value;

    if (!raceId || !carId) {
        notify('Lütfen bir araç seçin!', 'warning');
        return;
    }

    const btn = document.getElementById('joinRaceBtn');
    btn.disabled = true;
    btn.innerHTML = 'Katılınıyor...';

    try {
        const r = await post('/api/player/race/join', { raceId: raceId, carId: carId });
        if (r.success) {
            notify(r.message, 'success');
            closeJoinRaceModal();
            loadRaces();
            updateFromResponse(r);
        } else {
            notify(r.error, 'error');
        }
    } catch (e) {
        notify('Bağlantı hatası: ' + e.message, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-flag-checkered"></i> Kaydı Tamamla';
    }
}

// ============ INIT ============
// Uygulama başlangıcı DOMContentLoaded ile yapılıyor (dosyanın üst kısmında)
// checkAuth() -> initGame() -> loadPlayer() + loadBrandsForFilter() + navigateTo('home')

// ============ TUTORIAL SYSTEM ============
const TUTORIAL_STEPS = [
    {
        icon: '<i class="fa-solid fa-hand-wave"></i>', title: 'Hoş Geldin Galericimiz!',
        desc: '50.000₺ sermayenle galeri imparatorluğunu kurmaya hazır mısın? Sana kısa bir tur atalım!',
        target: null, arrow: 'bottom'
    },
    {
        icon: '<i class="fa-solid fa-money-bill-wave"></i>', title: 'Bakiyen',
        desc: 'Bu senin bakiyen. Araç alıp satarak bakiyeni büyüt! Güzel kâr yaparak seviye atla.',
        target: '#balanceStat', arrow: 'top'
    },
    {
        icon: '<i class="fa-solid fa-magnifying-glass"></i>', title: 'Araç Keşfet',
        desc: 'Keşfet sayfasında piyasadaki tüm araçları görebilir, filtrele ve satın alabilirsin.',
        target: '[data-page="explore"]', arrow: 'right',
        sidebarTarget: true
    },
    {
        icon: '<i class="fa-solid fa-car"></i>', title: 'Galerin',
        desc: 'Satın aldığın araçlar burada görünür. Tamir, boyama, yıkama ve satışa koyma gibi işlemleri yapabilirsin.',
        target: '[data-page="mycars"]', arrow: 'right',
        sidebarTarget: true
    },
    {
        icon: '<i class="fa-solid fa-clipboard-list"></i>', title: 'İlanlarım',
        desc: 'Satışa koyduğun araçları buradan takip et. NPC alıcılardan teklif gelecek!',
        target: '[data-page="listings"]', arrow: 'right',
        sidebarTarget: true
    },
    {
        icon: '<i class="fa-solid fa-cake-candles"></i>', title: 'Hazırsın!',
        desc: 'Harika! Artık galerini yönetmeye başlayabilirsin. Bol kazançlar! <i class="fa-solid fa-rocket"></i>',
        target: null, arrow: 'bottom'
    }
];

let tutorialStep = 0;

function startTutorial() {
    tutorialStep = 0;
    const overlay = document.getElementById('tutorialOverlay');
    overlay.classList.add('active');
    renderTutorialStep();
}

function renderTutorialStep() {
    const step = TUTORIAL_STEPS[tutorialStep];
    const tooltip = document.getElementById('tutorialTooltip');
    const spotlight = document.getElementById('tutorialSpotlight');

    document.getElementById('tutorialIcon').textContent = step.icon;
    document.getElementById('tutorialTitle').textContent = step.title;
    document.getElementById('tutorialDesc').textContent = step.desc;

    // Progress dots
    const progress = document.getElementById('tutorialProgress');
    progress.innerHTML = TUTORIAL_STEPS.map((_, i) =>
        `<div class="tutorial-dot ${i === tutorialStep ? 'active' : (i < tutorialStep ? 'done' : '')}"></div>`
    ).join('');

    // Next button text
    const nextBtn = document.getElementById('tutorialNextBtn');
    nextBtn.innerHTML = tutorialStep === TUTORIAL_STEPS.length - 1 ? 'Başla! <i class="fa-solid fa-rocket"></i>' : 'İleri <i class="fa-solid fa-arrow-right"></i>';

    // Arrow direction class
    tooltip.className = 'tutorial-tooltip arrow-' + step.arrow;

    if (step.target) {
        // Find the target element
        let targetEl;
        if (step.sidebarTarget) {
            // On mobile, try bottom-nav; on desktop, try sidebar
            const isMobile = window.innerWidth <= 768;
            if (isMobile) {
                // Selector is likely [data-page="..."], so we match the button itself or its children
                targetEl = document.querySelector(`.bottom - nav - btn${step.target} `) ||
                    document.querySelector(`.bottom - nav ${step.target} `) ||
                    document.querySelector(`.more - menu - item${step.target} `) ||
                    document.querySelector(`.more - menu ${step.target} `);
            }
            if (!targetEl) {
                targetEl = document.querySelector(`.sidebar ${step.target} `) ||
                    document.querySelector(`.sidebar - btn${step.target} `);
            }
        } else {
            targetEl = document.querySelector(step.target);
        }

        if (targetEl) {
            const rect = targetEl.getBoundingClientRect();
            const pad = 8;
            spotlight.style.display = 'block';
            spotlight.style.left = (rect.left - pad) + 'px';
            spotlight.style.top = (rect.top - pad) + 'px';
            spotlight.style.width = (rect.width + pad * 2) + 'px';
            spotlight.style.height = (rect.height + pad * 2) + 'px';

            // Position tooltip near the target
            const tooltipW = 320;
            let tLeft, tTop;
            if (step.arrow === 'top') {
                tLeft = Math.max(12, rect.left + rect.width / 2 - tooltipW / 2);
                tTop = rect.bottom + 16;
            } else if (step.arrow === 'right') {
                tLeft = rect.right + 16;
                tTop = rect.top;
            } else if (step.arrow === 'left') {
                tLeft = rect.left - tooltipW - 16;
                tTop = rect.top;
            } else {
                tLeft = Math.max(12, window.innerWidth / 2 - tooltipW / 2);
                tTop = rect.top - 200;
            }
            // Keep in viewport
            tLeft = Math.max(12, Math.min(tLeft, window.innerWidth - tooltipW - 12));
            tTop = Math.max(12, Math.min(tTop, window.innerHeight - 250));
            tooltip.style.left = tLeft + 'px';
            tooltip.style.top = tTop + 'px';
        } else {
            spotlight.style.display = 'none';
            centerTooltip(tooltip);
        }
    } else {
        spotlight.style.display = 'none';
        centerTooltip(tooltip);
    }
}

function centerTooltip(tooltip) {
    tooltip.style.left = '50%';
    tooltip.style.top = '50%';
    tooltip.style.transform = 'translate(-50%, -50%)';
    setTimeout(() => { tooltip.style.transform = 'translate(-50%, -50%)'; }, 10);
}

function nextTutorialStep() {
    tutorialStep++;
    if (tutorialStep >= TUTORIAL_STEPS.length) {
        endTutorial();
        return;
    }
    renderTutorialStep();
}

function endTutorial() {
    localStorage.setItem('tutorial_completed', '1');
    const overlay = document.getElementById('tutorialOverlay');
    overlay.classList.remove('active');
}

// ============ NOTIFICATION SYSTEM ============

async function loadNotifications() {
    try {
        const r = await get('/api/feedback/notifications');
        if (!r.success) return;
        const list = document.getElementById('notifList');
        if (r.data.length === 0) {
            list.innerHTML = '<div class="notif-empty">Bildirim yok <i class="fa-solid fa-bell-slash"></i></div>';
            return;
        }
        list.innerHTML = r.data.map(n => `
            <div class="notif-item ${n.is_read ? '' : 'unread'} ${n.details ? 'has-details' : ''}" style="cursor:pointer; transition:all 0.3s;" onclick="toggleNotif(${n.id}, this, ${n.details ? 'true' : 'false'})">
                <div class="notif-icon" style="margin-top:2px;">${n.type === 'feedback_reply' ? '<i class="fa-solid fa-comments"></i>' : n.type === 'broadcast' ? '<i class="fa-solid fa-bullhorn"></i>' : '<i class="fa-solid fa-circle-info"></i>'}</div>
                <div class="notif-body" style="width:100%;">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <div class="notif-title">${n.title || 'Bildirim'}</div>
                        ${n.details ? '<i class="fa-solid fa-chevron-down notif-chevron" style="font-size:12px; color:var(--text-muted); transition:transform 0.3s;"></i>' : ''}
                    </div>
                    <div class="notif-msg">${n.message}</div>
                    <div class="notif-time">${timeAgo(n.created_at)}</div>
                    ${n.details ? `<div class="notif-details" style="display:none; margin-top:10px; padding:12px; background:rgba(0,0,0,0.1); border-radius:8px; border-left:3px solid var(--accent); font-size:13px; line-height:1.6; color:var(--text-secondary);">${n.details.replace(/\\n/g, '<br>')}</div>` : ''}
                </div>
            </div>
            `).join('');
    } catch (e) {
        console.error('Bildirim yükleme hatası', e);
    }
}

function toggleNotif(id, el, hasDetails) {
    if (el.classList.contains('unread')) {
        markNotifRead(id, el);
    }

    if (hasDetails) {
        const detailsEl = el.querySelector('.notif-details');
        const chevron = el.querySelector('.notif-chevron');
        if (detailsEl) {
            if (detailsEl.style.display === 'none') {
                detailsEl.style.display = 'block';
                el.style.background = 'var(--bg-card-hover)';
                if (chevron) chevron.style.transform = 'rotate(180deg)';
            } else {
                detailsEl.style.display = 'none';
                el.style.background = '';
                if (chevron) chevron.style.transform = 'rotate(0deg)';
            }
        }
    }
}

async function checkUnreadCount() {
    try {
        const r = await get('/api/feedback/notifications/unread-count');
        if (!r.success) return;
        const badge = document.getElementById('notifBadge');
        if (r.count > 0) {
            badge.textContent = r.count > 99 ? '99+' : r.count;
            badge.style.display = 'flex';
        } else {
            badge.style.display = 'none';
        }
    } catch (e) { }
}

async function markNotifRead(id, el) {
    try {
        await put(`/api/feedback/notifications/${id}/read`);
        if (el) el.classList.remove('unread');
        checkUnreadCount();
    } catch (e) {
        console.error('Bildirim okuma hatası', e);
    }
}

async function markAllNotifsRead() {
    try {
        await put('/api/feedback/notifications/read-all');
        document.querySelectorAll('.notif-item.unread').forEach(el => el.classList.remove('unread'));
        checkUnreadCount();
        notify('Tüm bildirimler okundu', 'success');
    } catch (e) { }
}

function timeAgo(dateStr) {
    const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
    if (diff < 60) return 'Az önce';
    if (diff < 3600) return `${Math.floor(diff / 60)} dk önce`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} saat önce`;
    return `${Math.floor(diff / 86400)} gün önce`;
}

// Periyodik bildirim kontrolü
setInterval(checkUnreadCount, 30000);

// ============ FEEDBACK SYSTEM ============
async function submitFeedback() {
    const type = document.getElementById('feedbackType').value;
    const subject = document.getElementById('feedbackSubject').value;
    const message = document.getElementById('feedbackMessage').value;

    if (!message || message.trim().length < 5) {
        return notify('Mesaj en az 5 karakter olmalı!', 'error');
    }

    const r = await post('/api/feedback', { type, subject, message });
    if (r.success) {
        notify(r.message, 'success');
        document.getElementById('feedbackSubject').value = '';
        document.getElementById('feedbackMessage').value = '';
        loadFeedbacks();
    } else {
        notify(r.error, 'error');
    }
}

async function loadFeedbacks() {
    try {
        const r = await get('/api/feedback');
        if (!r.success) return;
        const list = document.getElementById('feedbackList');
        if (r.data.length === 0) {
            list.innerHTML = '<div class="notif-empty">Henüz geri bildirim göndermediniz.</div>';
            return;
        }
        const typeLabels = { bug: '<i class="fa-solid fa-bug"></i> Hata', suggestion: '<i class="fa-solid fa-lightbulb"></i> Öneri', complaint: '<i class="fa-solid fa-face-angry"></i> Şikayet', other: '<i class="fa-solid fa-thumbtack"></i> Diğer' };
        const statusLabels = { open: '<i class="fa-solid fa-hourglass-start"></i> Bekliyor', in_progress: '<i class="fa-solid fa-arrows-rotate"></i> İnceleniyor', resolved: '<i class="fa-solid fa-check"></i> Çözüldü', closed: '<i class="fa-solid fa-lock"></i> Kapatıldı' };
        list.innerHTML = r.data.map(f => `
            <div class="feedback-item">
                <div class="feedback-item-header">
                    <span class="feedback-type">${typeLabels[f.type] || f.type}</span>
                    <span class="feedback-status">${statusLabels[f.status] || f.status}</span>
                </div>
                <div class="feedback-subject">${f.subject || 'Konu belirtilmedi'}</div>
                <div class="feedback-msg">${f.message}</div>
                ${f.admin_reply ? `
                    <div class="feedback-reply">
                        <strong><i class="fa-solid fa-shield-halved"></i> Admin Yanıtı:</strong>
                        <p>${f.admin_reply}</p>
                    </div>
                ` : ''}
                <div class="feedback-date">${new Date(f.created_at).toLocaleDateString('tr-TR')}</div>
            </div>
        `).join('');
    } catch (e) { }
}

// put helper (if missing)
async function put(url, data) {
    const r = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: data ? JSON.stringify(data) : undefined });
    return r.json();
}

// ============ BILGI BANKASI (KNOWLEDGE BASE) ============
const KNOWLEDGE_BASE_ARTICLES = [
    {
        title: "Otomobil Galerisi Nasıl Yönetilir?",
        icon: "fa-solid fa-building",
        content: `
            <p>OtoGaleri Tycoon TR'de başarılı olmak için sadece düşükten alıp yüksekten satmak yetmez. İyi bir galerici piyasayı okur, doğru zamanda doğru araca yatırım yapar.</p>
            <ul>
                <li><strong>Hasarlı Araçlar Fırsattır:</strong> Pert veya ağır hasarlı araçları Hurdalık'tan ucuza alıp onararak büyük kârlar elde edebilirsiniz. Ancak onarım masraflarını iyi hesaplayın.</li>
                <li><strong>Expertiz Şart:</strong> Tanımadığınız veya NPC'lerden aldığınız her araca mutlaka expertiz yaptırın. Gizli hasarlar sonradan başınızı çok ağrıtabilir.</li>
                <li><strong>Müşteri Tiplerini Tanıyın:</strong> Pazarlıkçı müşteriler fiyat kırmaya çalışırken, Cömert müşteriler aracın değerinin üstünde bile teklif verebilir.</li>
            </ul>
        `
    },
    {
        title: "Kredi Sistemi ve Haciz Tehlikesi",
        icon: "fa-solid fa-building-columns",
        content: `
            <p>Banka kredileri hızlı büyümek için iyi bir araçtır, ancak aynı zamanda en büyük düşmanınız olabilir.</p>
            <ul>
                <li><strong>Faiz İşler:</strong> Her gün (oyun içi gün) kredi borcunuza faiz işler. Sürekli borçlanmak kâr marjınızı eritir.</li>
                <li><strong>Haciz:</strong> Eğer kredi taksitlerinizi 3 gün üst üste ödeyemezseniz banka en değerli <strong>rastgele bir aracınıza el koyar</strong>. Bu geri döndürülemez bir işlemdir.</li>
                <li><strong>Erken Ödeme:</strong> Borcunuzu erken kapatmak sizi faiz yükünden kurtarır.</li>
            </ul>
        `
    },
    {
        title: "İllegal Garaj ve Risk Yönetimi",
        icon: "fa-solid fa-user-secret",
        content: `
            <p>Seviye 3'te açılan İllegal Garaj, büyük riskler barındıran büyük fırsatlar sunar.</p>
            <ul>
                <li><strong>Modifikasyonlar:</strong> Yazılım, yarış tekerlekleri, egzoz sistemleri aracınızın performansını (HP/Tork) artırırken değerini de yükseltir.</li>
                <li><strong>Risk Seviyesi:</strong> Yaptığınız her illegal işlem riskinizi artırır. Risk %100'e ulaşırsa, polis garajınıza baskın yapar ve tüm modifiyeli/illegal araçlarınıza el konulur.</li>
                <li><strong>Rüşvet (Yakında):</strong> Riski düşürmek için çeşitli yollara başvurmanız gerekecek. Şimdilik sınırlarınızı bilin.</li>
            </ul>
        `
    },
    {
        title: "Piyasa Trendleri Nasıl Çalışır?",
        icon: "fa-solid fa-chart-line",
        content: `
            <p>Oyun dünyasında otomobil piyasası statik değildir. Rastgele gelişen olaylar belirli araç türlerini veya genel fiyatları etkiler. İşte mevcut trendler:</p>
            <ul>
                <li><strong>Ekonomik Büyüme:</strong> Piyasa canlanır. Bütün araç fiyatlarında <b>%15</b> artış yaşanır.</li>
                <li><strong>Piyasa Durgunluğu:</strong> Alım gücü düşer. Bütün piyasa <b>%10</b> değer kaybeder.</li>
                <li><strong>Akaryakıt Krizi:</strong> Yakıt fiyatları uçar, elektrikli araçlara talep artar. <i>Benzinli</i> araçların değeri <b>%15</b> düşer.</li>
                <li><strong>ÖTV İndirimi:</strong> Hükümet sürpriz bir kararla vergi indirdiği için ikinci elde fiyatlar aniden <b>%5</b> geriler.</li>
                <li><strong>Döviz Artışı:</strong> Dolar/Euro fırlar. Piyasaya anında <b>%25</b> zam yansır. Alım yapmak için en kötü zamandır.</li>
                <li><strong>Bahar Kampanyası:</strong> Yaza hazırlık! Sadece <i>Cabrio</i> türündeki spor otomobillerin fiyatlarında <b>%5</b> değer artışı olur.</li>
                <li><strong>Çip Krizi:</strong> Sıfır araç bulunmaz! İkinci el otomobillere olan dev hücumla birlikte tüm araçlar <b>%30</b> pahalanır. En şiddetli krizdir.</li>
                <li><strong>Lüks Araç Vergisi:</strong> Lüks segmentteki vergi artar, piyasa kilitlenir. <i>Lüks</i> model araçlar <b>%20</b> ucuzlar. Fırsat alımı için uygundur.</li>
                <li><strong>İkinci El Fırsatı:</strong> Sıfır araç kotaları dolduğu için her türdeki ikinci el taşıt <b>%10</b> değer kazanır.</li>
                <li><strong>SUV Çılgınlığı:</strong> Herkes yerden yüksek taşıt istiyor! Yalnızca <i>SUV</i> modellerde <b>%20</b> artış yaşanır.</li>
                <li><strong>Elektrik Gelişimi:</strong> Şarj istasyonları tüm ülkeye yayıldı. <i>Elektrik</i> ile çalışan araçlar <b>%15</b> değerlenir.</li>
            </ul>
            <p><em style="color:var(--text-sec); font-size: 13px;">İpucu: Karlılığınızı maksimize etmek için Sağ üst köşedeki "Bildirim" akışını veya Trend ikonlarını yakından takip edin. Ucuza toplayıp fiyat tavan yaptığında satmak kasanızı uçurur!</em></p>
        `
    },
    {
        title: "Organizatör Yarışları",
        icon: "fa-solid fa-flag-checkered",
        content: `
            <p>Garajınızdaki güçlü araçları sergilemek ve para kazanmak için yarışlara katılabilirsiniz.</p>
            <ul>
                <li><strong>Kazanma Şansı:</strong> Aracınızın HP (Beygir), Tork gücü ve Yarış Tekerlekleri olup olmaması kazanma ihtimalinizi doğrudan etkiler.</li>
                <li><strong>Kaza ve Hasar Riski:</strong> Yarışlar tehlikelidir. Aracınız %2.5 ihtimalle pert olabilir veya %17.5 ihtimalle ağır hasar alabilir. Katılacağınız aracı seçerken bu riskleri göz önünde bulundurun.</li>
            </ul>
        `
    }
];

function loadBilgiBankasi() {
    const container = document.getElementById('bilgibankasiContent');
    let html = '<div class="kb-articles">';

    KNOWLEDGE_BASE_ARTICLES.forEach((article, index) => {
        html += `
            <div class="kb-card">
                <div class="kb-header" onclick="document.getElementById('kb-content-${index}').classList.toggle('active')">
                    <h3><i class="${article.icon}"></i> ${article.title}</h3>
                    <i class="fa-solid fa-chevron-down kb-toggle-icon"></i>
                </div>
                <div class="kb-body" id="kb-content-${index}">
                    ${article.content}
                </div>
            </div>
        `;
    });

    html += '</div>';

    // Add custom styles for KB if not present
    if (!document.getElementById('kb-styles')) {
        const style = document.createElement('style');
        style.id = 'kb-styles';
        style.innerHTML = `
            .kb-articles { display: flex; flex-direction: column; gap: 15px; }
            .kb-card { background: var(--bg-card); border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
            .kb-header { padding: 15px 20px; display: flex; justify-content: space-between; align-items: center; cursor: pointer; transition: background 0.2s; }
            .kb-header:hover { background: var(--bg-hover); }
            .kb-header h3 { margin: 0; font-size: 16px; color: var(--text-primary); }
            .kb-header i:not(.kb-toggle-icon) { color: var(--accent); margin-right: 10px; }
            .kb-body { padding: 0 20px; max-height: 0; overflow: hidden; transition: all 0.3s ease-out; opacity: 0; background: var(--bg-input); }
            .kb-body.active { padding: 20px; max-height: 1000px; opacity: 1; border-top: 1px solid var(--border); }
            .kb-body p { margin-top: 0; margin-bottom: 10px; line-height: 1.6; color: var(--text-secondary); }
            .kb-body ul { padding-left: 20px; margin-bottom: 0; }
            .kb-body li { margin-bottom: 8px; color: var(--text-secondary); line-height: 1.5; }
            .kb-body li strong { color: var(--text-primary); }
        `;
        document.head.appendChild(style);
    }

    container.innerHTML = html;
}

// Güvenli başlatma
document.addEventListener('DOMContentLoaded', () => {
    if (typeof checkAuth === 'function') {
        checkAuth();
    }
});
