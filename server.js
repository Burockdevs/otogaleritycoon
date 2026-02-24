const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const session = require('express-session');
const cors = require('cors');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { testConnection } = require('./db/connection');
const { setIO, startAllLoops } = require('./services/gameLoop');

const app = express();
// Sayfa yüklenme hızını artırmak için GZIP sıkıştırması
const compression = require('compression');
app.use(compression());

const server = http.createServer(app);

// PM2/Nginx/Cloudflare arkasında gerçek IP'leri alabilmek için kritik (Rate Limit hatalarını önler)
app.set('trust proxy', 1);

const DOMAIN = process.env.DOMAIN || 'https://otogaleritycoon.com.tr';
const PORT = process.env.PORT || 3000;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// ============ SOCKET.IO (Cloudflare uyumlu) ============
const io = new Server(server, {
    cors: {
        origin: true, // Dinamik olarak tüm origin'lere izin ver
        credentials: true
    },
    // Cloudflare WebSocket proxy desteği
    transports: ['websocket', 'polling'],
    allowEIO3: true
});

// ============ GÜVENLİK: Helmet (HTTP Security Headers) ============
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://www.googletagmanager.com", "https://cdn.jsdelivr.net"],
            scriptSrcAttr: ["'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
            imgSrc: ["'self'", "data:", "https:", "blob:"],
            connectSrc: ["'self'", "wss:", "ws:", "https://cdn.jsdelivr.net"],
            frameSrc: ["'self'"],
            objectSrc: ["'none'"],
            upgradeInsecureRequests: IS_PRODUCTION ? [] : null
        }
    },
    crossOriginResourcePolicy: { policy: "cross-origin" } // Logo/resim paylaşımı
}));

// ============ GÜVENLİK: CORS ============
app.use(cors({
    origin: true, // Request origin'ini otomatik kabul et (tarayıcı CORS hatalarını önler)
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// ============ GÜVENLİK: Request Body Limitleri ============
app.use(express.json({ limit: '256kb' }));
app.use(express.urlencoded({ extended: false, limit: '256kb' }));

// ============ GÜVENLİK: Genel Rate Limiter (DDoS Koruması) ============
const generalLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 800,
    standardHeaders: true,
    legacyHeaders: false,
    validate: { default: false }, // IPv6 validation uyarısını sustur (trust proxy aktif)
    message: { success: false, error: 'Çok fazla istek gönderdiniz. Lütfen bekleyin.' }
});
app.use('/api/', generalLimiter);

// ============ GÜVENLİK: Login Brute-Force Koruması ============
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 50,
    standardHeaders: true,
    legacyHeaders: false,
    validate: { default: false },
    message: { success: false, error: 'Çok fazla giriş denemesi! 15 dakika bekleyin.' }
});
app.use('/api/auth/login', loginLimiter);

// ============ GÜVENLİK: Kayıt Spam Koruması ============
const registerLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    validate: { default: false },
    message: { success: false, error: 'Çok fazla kayıt denemesi yaptınız. Lütfen 1 saat sonra tekrar deneyin.' }
});
app.use('/api/auth/register', registerLimiter);

// AI için rate limiter (dakikada 5)
const aiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 15,
    standardHeaders: true,
    legacyHeaders: false,
    validate: { default: false },
    message: { success: false, error: 'Yapay Zeka sistemi çok yoğun. Lütfen 1 dakika bekleyip tekrar deneyin.' }
});
app.use('/api/ai/ask', aiLimiter);

// ============ GÜVENLİK: Ek HTTP Güvenlik Başlıkları ============
app.use((req, res, next) => {
    // Cloudflare'den gelen gerçek IP'yi trust et
    if (req.headers['cf-connecting-ip']) {
        req.realIP = req.headers['cf-connecting-ip'];
    }
    // Ek güvenlik başlıkları (helmet'in üstüne)
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader('X-Robots-Tag', 'index, follow');
    next();
});

// ============ GÜVENLİK: Input Sanitization (XSS Koruması) ============
const sanitizeInput = (obj) => {
    if (typeof obj === 'string') {
        return obj.replace(/[<>]/g, '').replace(/javascript:/gi, '').replace(/on\w+=/gi, '').trim();
    }
    if (typeof obj === 'object' && obj !== null) {
        for (const key in obj) {
            obj[key] = sanitizeInput(obj[key]);
        }
    }
    return obj;
};

app.use((req, res, next) => {
    if (req.body && typeof req.body === 'object') {
        req.body = sanitizeInput(req.body);
    }
    if (req.query && typeof req.query === 'object') {
        req.query = sanitizeInput(req.query);
    }
    next();
});

// ============ SESSION ============
const MySQLStore = require('express-mysql-session')(session);
const { pool } = require('./db/connection');

const sessionStore = new MySQLStore({
    clearExpired: true,
    checkExpirationInterval: 900000,
    expiration: 86400000 * 7, // 7 days
    createDatabaseTable: true
}, pool);

const sessionMiddleware = session({
    secret: process.env.SESSION_SECRET || 'galeri_simulator_secret_key_2026_ultra_secure',
    resave: false,
    saveUninitialized: false,
    store: sessionStore,
    name: 'ogt_session',
    cookie: {
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 gün
        httpOnly: true,
        sameSite: 'lax',
        secure: false, // Nginx/Cloudflare SSL forwarding tam ayarlanmamışsa true yapmak login'i bozar
        domain: undefined // Tüm IP ve domainlerde çalışması için
    }
});

app.use(sessionMiddleware);
io.engine.use(sessionMiddleware);

// ============ Cloudflare Trust Proxy ============
if (IS_PRODUCTION) {
    app.set('trust proxy', 1); // Cloudflare proxy'sini güven
}

// robots.txt & sitemap.xml - correct MIME types
app.get('/robots.txt', (req, res) => res.sendFile(path.join(__dirname, 'public/robots.txt'), { headers: { 'Content-Type': 'text/plain' } }));
app.get('/sitemap.xml', (req, res) => res.sendFile(path.join(__dirname, 'public/sitemap.xml'), { headers: { 'Content-Type': 'application/xml' } }));

// ============ BAKIM MODU MIDDLEWARE ============
global.isMaintenanceMode = false;
app.use((req, res, next) => {
    if (global.isMaintenanceMode) {
        // Admin paneli, auth ve statik dosyalara (css/img) izin ver
        if (req.path.startsWith('/admin') || req.path.startsWith('/api/admin') || req.path.startsWith('/api/auth') || req.path.startsWith('/img') || req.path.startsWith('/css') || req.path.startsWith('/js/admin.js')) {
            return next();
        }

        if (!req.path.startsWith('/api/')) {
            return res.status(503).send(`
            <!DOCTYPE html><html><head><meta charset="utf-8"><title>Bakım Modu - OtoGaleri Tycoon TR</title>
            <style>body{background:#0f172a;color:#e2e8f0;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center;}h1{color:#f59e0b;font-size:3rem;margin-bottom:10px;}p{font-size:1.2rem;color:#94a3b8;}</style>
            </head><body><div><h1>🛠️ Sistem Bakımda</h1><p>Şu anda OtoGaleri Tycoon TR yapım aşamasındadır veya bakıma alınmıştır.<br>Lütfen daha sonra tekrar deneyin.</p></div></body></html>
            `);
        } else {
            return res.status(503).json({ success: false, error: 'Sistem şu anda bakım modundadır.' });
        }
    }
    next();
});

app.use(express.static(path.join(__dirname, 'public'), {
    // Static dosyalar için cache (Cloudflare ile uyumlu)
    maxAge: IS_PRODUCTION ? '1d' : 0,
    etag: true
}));

// playerId middleware - session'dan al
app.use((req, res, next) => {
    if (req.session && req.session.playerId) {
        req.playerId = req.session.playerId;
    }
    next();
});

// Auth durumu kontrolü middleware
function requireAuth(req, res, next) {
    if (!req.session || !req.session.playerId) {
        return res.status(401).json({ success: false, error: 'Giriş yapmalısınız!', needLogin: true });
    }
    next();
}

// Routes
const authRouter = require('./routes/auth');
const carsRouter = require('./routes/cars');
const marketRouter = require('./routes/market');
const playerRouter = require('./routes/player');
const leaderboardRouter = require('./routes/leaderboard');
const managementRouter = require('./routes/management');
const dashboardRouter = require('./routes/dashboard');
const feedbackRouter = require('./routes/feedback');
const adminRouter = require('./routes/admin');

app.use('/api/auth', authRouter);
app.use('/api', requireAuth, carsRouter);
app.use('/api/market', requireAuth, marketRouter);
app.use('/api/player', requireAuth, playerRouter);
app.use('/api/leaderboard', requireAuth, leaderboardRouter);
app.use('/api/management', requireAuth, managementRouter);
app.use('/api/dashboard', requireAuth, dashboardRouter);
app.use('/api/feedback', requireAuth, feedbackRouter);
app.use('/api/admin', adminRouter);

// Admin panel sayfası
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public/admin.html')));


app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public/admin.html')));

// ============ GÜVENLİK: 404 Handler (bilgi sızdırmayı engelle) ============
app.use('/api/*', (req, res) => {
    res.status(404).json({ success: false, error: 'Endpoint bulunamadı.' });
});

app.use('*', (req, res) => {
    res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
});

// ============ GÜVENLİK: Global Error Handler ============
app.use((err, req, res, next) => {
    console.error('Server Error:', err.message);
    res.status(500).json({
        success: false,
        error: IS_PRODUCTION ? 'Sunucu hatası oluştu.' : err.message
    });
});

// Socket.IO
setIO(io);

io.on('connection', (socket) => {
    const req = socket.request;
    const playerId = req.session ? req.session.playerId : null;

    if (playerId) {
        socket.join(`player_${playerId}`);
        console.log(`🔌 Oyuncu bağlandı: ${playerId} (Socket ID: ${socket.id})`);
    } else {
        console.log('🔌 Ziyaretçi bağlandı:', socket.id);
    }

    socket.on('disconnect', () => {
        console.log('🔌 Kullanıcı ayrıldı:', socket.id);
    });
});

// Start
async function start() {
    const connected = await testConnection();
    if (!connected) {
        console.log('\n========================================');
        console.log('❌ MySQL bağlantısı başarısız!');
        console.log('========================================');
        console.log('\n📋 Kurulum adımları:');
        console.log('1. XAMPP Control Panel\'den MySQL\'i başlatın');
        console.log('2. phpMyAdmin (http://localhost/phpmyadmin) açın');
        console.log('3. "galeri_simulator" adında veritabanı oluşturun');
        console.log('4. db/schema.sql dosyasını import edin');
        console.log('5. Terminalde: node db/seed.js');
        console.log('6. Terminalde: npm start');
        console.log('========================================\n');
        process.exit(1);
    }

    // Load initial system settings (Maintenance Mode & Bank Interest Modifier)
    try {
        const { pool } = require('./db/connection');
        const [settings] = await pool.query("SELECT setting_key, setting_value FROM system_settings WHERE setting_key IN ('maintenance_mode', 'bank_interest_modifier')");

        let hasMaintenanceMode = false;
        let hasBankInterestModifier = false;

        settings.forEach(setting => {
            if (setting.setting_key === 'maintenance_mode') {
                global.isMaintenanceMode = setting.setting_value === 'true';
                hasMaintenanceMode = true;
            } else if (setting.setting_key === 'bank_interest_modifier') {
                global.bankInterestModifier = parseFloat(setting.setting_value) || 0;
                hasBankInterestModifier = true;
            }
        });

        if (!hasMaintenanceMode) {
            await pool.query("INSERT INTO system_settings (setting_key, setting_value) VALUES ('maintenance_mode', 'false')");
            global.isMaintenanceMode = false;
        }
        if (!hasBankInterestModifier) {
            await pool.query("INSERT INTO system_settings (setting_key, setting_value) VALUES ('bank_interest_modifier', '0')");
            global.bankInterestModifier = 0;
        }

    } catch (err) {
        console.error('Sistem ayarları yüklenemedi:', err);
    }

    // AUTO SETUP: Check if DB is completely empty. If so, populate it.
    try {
        const { pool } = require('./db/connection');
        const [brandCheck] = await pool.query('SELECT COUNT(*) as c FROM brands');
        if (brandCheck[0].c === 0) {
            console.log('📦 Veritabanı boş tespit edildi. Tohumlama (Seed) başlatılıyor...');
            const { seedDatabase } = require('./db/seed');
            await seedDatabase();
        }
    } catch (e) {
        if (e.code === 'ER_NO_SUCH_TABLE') {
            try {
                console.log('📦 Tablolar bulunamadı (İlk Kurulum). Şema otomatik yükleniyor...');
                const fs = require('fs');
                const path = require('path');
                const { pool } = require('./db/connection');
                const schemaSql = fs.readFileSync(path.join(__dirname, 'db', 'schema.sql'), 'utf8');
                await pool.query(schemaSql);
                console.log('✅ Şema başarıyla içe aktarıldı. Veriler yükleniyor...');
                const { seedDatabase } = require('./db/seed');
                await seedDatabase();
            } catch (setupErr) {
                console.error('❌ Otomatik kurulum hatası:', setupErr);
            }
        } else {
            console.error('Seed kontrolü sırasında hata:', e);
        }
    }

    // Game loop'ları başlat
    startAllLoops();

    server.listen(PORT, () => {
        console.log('\n========================================');
        console.log(`OtoGaleri Tycoon TR`);
        console.log(`🌐 http://localhost:${PORT}`);
        console.log(`🛡️  Güvenlik: Helmet + Rate Limit + XSS Koruması`);
        console.log(`☁️  Cloudflare: ${IS_PRODUCTION ? 'Aktif' : 'Geliştirme modu'}`);
        console.log(`🛠️  Bakım Modu: ${global.isMaintenanceMode ? 'Aktif' : 'Kapalı'}`);
        console.log('========================================\n');
    });
}

start();
