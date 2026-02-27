# Ubuntu Server Setup Guide - OtoGaleri Tycoon

Bu kılavuz, projenin Ubuntu tabanlı bir sunucuda (VPS/VDS) sıfırdan kurulumu ve yayına alınması için gerekli adımları içerir.

## 1. Sunucu Hazırlığı
Sunucunuza SSH ile bağlandıktan sonra paket listesini güncelleyin:
```bash
sudo apt update && sudo apt upgrade -y
```

## 2. Node.js Kurulumu (v18+ Önerilir)
```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs
```

## 3. MySQL Server Kurulumu ve Yapılandırma
```bash
sudo apt install mysql-server -y
sudo mysql_secure_installation
```
Veritabanını ve kullanıcıyı oluşturun:
```sql
sudo mysql
CREATE DATABASE galeritycoon CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'galeriuser'@'localhost' IDENTIFIED BY 'GucluSifre123!';
GRANT ALL PRIVILEGES ON galeritycoon.* TO 'galeriuser'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

## 4. Proje Kurulumu
Proje dosyalarını sunucuya çekin veya yükleyin:
```bash
cd /var/www
git clone https://github.com/KULLANICI_ADI/galeritycoon.git
cd galeritycoon
npm install
```

## 5. Ortam Değişkenleri (.env)
`.env` dosyasını oluşturun ve veritabanı bilgilerinizi girin:
```bash
nano .env
```
İçerik örneği:
```env
DB_HOST=localhost
DB_USER=galeriuser
DB_PASS=GucluSifre123!
DB_NAME=galeritycoon
SESSION_SECRET=senin_gizli_anahtarin
PORT=3000
ADMIN_PASSWORD=v2e@yh3PGrp7NhN
```

## 6. Veritabanı Şeması
`setup.sql` veya mevcut tabloları içe aktarın:
```bash
mysql -u galeriuser -p galeritycoon < database.sql
```

## 7. PM2 ile Uygulamayı Başlatma
Uygulamanın sunucu kapansa bile çalışmaya devam etmesi için PM2 kullanın:
```bash
sudo npm install -g pm2
pm2 start server.js --name "galeritycoon"
pm2 save
pm2 startup
```

## 8. Nginx (Reverse Proxy) Yapılandırması (Önerilir)
SSL (HTTPS) ve performans için Nginx kullanılması önerilir:
```bash
sudo apt install nginx -y
sudo nano /etc/nginx/sites-available/galeritycoon
```
Nginx config örneği:
```nginx
server {
    listen 80;
    server_name senin_alan_adin.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```
Aktif edin:
```bash
sudo ln -s /etc/nginx/sites-available/galeritycoon /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

## 9. SSL Kurulumu (Certbot)
```bash
sudo apt install certbot python3-certbot-nginx -y
sudo certbot --nginx -d senin_alan_adin.com
```

---
Tebrikler! Projeniz başarıyla kuruldu.
