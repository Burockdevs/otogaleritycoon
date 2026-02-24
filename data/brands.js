// Marka ve Model Verileri
// Her markanın prestij puanı, modelleri ve fiyat aralıkları

const BRANDS = [
    {
        name: 'Tufaş', country: 'Türkiye', prestige: 1, logo: '/img/brands/tufa.svg', factory: 'Türkiye',
        models: [
            { name: 'Şahın', tier: 1, body: 'Sedan', basePrice: 200000, topSpeed: 155, torque: 100 },
            { name: 'Doğen', tier: 1, body: 'Sedan', basePrice: 220000, topSpeed: 160, torque: 110 },
            { name: 'Kartol', tier: 1, body: 'Station Wagon', basePrice: 210000, topSpeed: 150, torque: 105 },
            { name: 'SLZ', tier: 2, body: 'Sedan', basePrice: 280000, topSpeed: 175, torque: 130 },
            { name: 'Murat 132', tier: 1, body: 'Sedan', basePrice: 170000, topSpeed: 145, torque: 90 },
            { name: 'Serçi', tier: 1, body: 'Hatchback', basePrice: 150000, topSpeed: 140, torque: 85 }
        ]
    },
    {
        name: 'Fiot', country: 'İtalya', prestige: 2, logo: '/img/brands/fiot.svg', factory: 'İtalya',
        models: [
            { name: 'Egia', tier: 1, body: 'Sedan', basePrice: 450000, topSpeed: 190, torque: 200 },
            { name: 'Egia HB', tier: 1, body: 'Hatchback', basePrice: 420000, topSpeed: 185, torque: 195 },
            { name: 'Linoa', tier: 1, body: 'Sedan', basePrice: 280000, topSpeed: 180, torque: 175 },
            { name: 'Tıpo', tier: 2, body: 'Sedan', basePrice: 520000, topSpeed: 200, torque: 220 },
            { name: '500Z', tier: 2, body: 'SUV', basePrice: 680000, topSpeed: 195, torque: 230 },
            { name: '501', tier: 1, body: 'Hatchback', basePrice: 380000, topSpeed: 175, torque: 145 },
            { name: 'Dobla', tier: 1, body: 'MPV', basePrice: 350000, topSpeed: 165, torque: 200 },
            { name: 'Punti', tier: 1, body: 'Hatchback', basePrice: 250000, topSpeed: 175, torque: 150 }
        ]
    },
    {
        name: 'Renolt', country: 'Fransa', prestige: 2, logo: '/img/brands/renolt.svg', factory: 'Fransa',
        models: [
            { name: 'Clıo', tier: 1, body: 'Hatchback', basePrice: 450000, topSpeed: 190, torque: 200 },
            { name: 'Symbal', tier: 1, body: 'Sedan', basePrice: 350000, topSpeed: 180, torque: 175 },
            { name: 'Megano', tier: 2, body: 'Sedan', basePrice: 580000, topSpeed: 210, torque: 240 },
            { name: 'Talısman', tier: 3, body: 'Sedan', basePrice: 850000, topSpeed: 225, torque: 280 },
            { name: 'Kadjer', tier: 2, body: 'SUV', basePrice: 720000, topSpeed: 200, torque: 250 },
            { name: 'Captor', tier: 1, body: 'SUV', basePrice: 550000, topSpeed: 185, torque: 210 },
            { name: 'Fluensa', tier: 1, body: 'Sedan', basePrice: 320000, topSpeed: 185, torque: 190 },
            { name: 'Austrel', tier: 2, body: 'SUV', basePrice: 800000, topSpeed: 205, torque: 260 }
        ]
    },
    {
        name: 'Dacya', country: 'Romanya', prestige: 1, logo: '/img/brands/dacya.svg', factory: 'Romanya',
        models: [
            { name: 'Sandaro', tier: 1, body: 'Hatchback', basePrice: 350000, topSpeed: 175, torque: 160 },
            { name: 'Logen', tier: 1, body: 'Sedan', basePrice: 320000, topSpeed: 170, torque: 155 },
            { name: 'Dustor', tier: 2, body: 'SUV', basePrice: 550000, topSpeed: 185, torque: 220 },
            { name: 'Joggar', tier: 1, body: 'MPV', basePrice: 480000, topSpeed: 180, torque: 200 },
            { name: 'Sprıng', tier: 1, body: 'Hatchback', basePrice: 400000, topSpeed: 125, torque: 125 }
        ]
    },
    {
        name: 'Hyandai', country: 'Güney Kore', prestige: 3, logo: '/img/brands/hyandai.svg', factory: 'Güney Kore',
        models: [
            { name: 'ı10', tier: 1, body: 'Hatchback', basePrice: 350000, topSpeed: 165, torque: 122 },
            { name: 'ı20', tier: 1, body: 'Hatchback', basePrice: 480000, topSpeed: 185, torque: 172 },
            { name: 'Elantrı', tier: 2, body: 'Sedan', basePrice: 650000, topSpeed: 210, torque: 265 },
            { name: 'Tucsan', tier: 3, body: 'SUV', basePrice: 1100000, topSpeed: 210, torque: 350 },
            { name: 'Santa Fo', tier: 3, body: 'SUV', basePrice: 1500000, topSpeed: 215, torque: 380 },
            { name: 'Konı', tier: 2, body: 'SUV', basePrice: 780000, topSpeed: 195, torque: 255 },
            { name: 'Bayen', tier: 1, body: 'SUV', basePrice: 520000, topSpeed: 185, torque: 200 },
            { name: 'ı30 N', tier: 3, body: 'Hatchback', basePrice: 950000, topSpeed: 250, torque: 392 }
        ]
    },
    {
        name: 'Toyata', country: 'Japonya', prestige: 3, logo: '/img/brands/toyata.svg', factory: 'Japonya',
        models: [
            { name: 'Yarıs', tier: 1, body: 'Hatchback', basePrice: 520000, topSpeed: 180, torque: 145 },
            { name: 'Coralla', tier: 2, body: 'Sedan', basePrice: 750000, topSpeed: 200, torque: 250 },
            { name: 'Camrı', tier: 3, body: 'Sedan', basePrice: 1200000, topSpeed: 220, torque: 350 },
            { name: 'RAV5', tier: 3, body: 'SUV', basePrice: 1350000, topSpeed: 210, torque: 300 },
            { name: 'C-HZ', tier: 2, body: 'SUV', basePrice: 900000, topSpeed: 195, torque: 255 },
            { name: 'Land Cruizer', tier: 4, body: 'SUV', basePrice: 3500000, topSpeed: 210, torque: 550 },
            { name: 'Supro', tier: 4, body: 'Spor', basePrice: 2800000, topSpeed: 250, torque: 500 },
            { name: 'GR87', tier: 2, body: 'Coupe', basePrice: 1100000, topSpeed: 226, torque: 212 }
        ]
    },
    {
        name: 'Hunda', country: 'Japonya', prestige: 4, logo: '/img/brands/hunda.svg', factory: 'Japonya',
        models: [
            { name: 'Jaz', tier: 1, body: 'Hatchback', basePrice: 480000, topSpeed: 175, torque: 145 },
            { name: 'Civik', tier: 2, body: 'Sedan', basePrice: 850000, topSpeed: 220, torque: 260 },
            { name: 'Civik Type Z', tier: 3, body: 'Hatchback', basePrice: 1500000, topSpeed: 272, torque: 420 },
            { name: 'Acord', tier: 3, body: 'Sedan', basePrice: 1200000, topSpeed: 225, torque: 320 },
            { name: 'CR-X', tier: 3, body: 'SUV', basePrice: 1400000, topSpeed: 200, torque: 310 },
            { name: 'HR-X', tier: 2, body: 'SUV', basePrice: 950000, topSpeed: 195, torque: 240 },
            { name: 'NSZ', tier: 4, body: 'Spor', basePrice: 5500000, topSpeed: 307, torque: 645 }
        ]
    },
    {
        name: 'Folkswagen', country: 'Almanya', prestige: 4, logo: '/img/brands/folkswagen.svg', factory: 'Almanya',
        models: [
            { name: 'Pola', tier: 1, body: 'Hatchback', basePrice: 580000, topSpeed: 195, torque: 200 },
            { name: 'Galf', tier: 2, body: 'Hatchback', basePrice: 850000, topSpeed: 220, torque: 250 },
            { name: 'Galf GTR', tier: 3, body: 'Hatchback', basePrice: 1300000, topSpeed: 250, torque: 370 },
            { name: 'Passet', tier: 3, body: 'Sedan', basePrice: 1200000, topSpeed: 230, torque: 350 },
            { name: 'Tıguen', tier: 3, body: 'SUV', basePrice: 1350000, topSpeed: 215, torque: 340 },
            { name: 'T-Rok', tier: 2, body: 'SUV', basePrice: 950000, topSpeed: 205, torque: 250 },
            { name: 'Artean', tier: 4, body: 'Sedan', basePrice: 1800000, topSpeed: 250, torque: 350 },
            { name: 'Galf Z', tier: 4, body: 'Hatchback', basePrice: 1700000, topSpeed: 270, torque: 420 },
            { name: 'Touaraq', tier: 4, body: 'SUV', basePrice: 2500000, topSpeed: 235, torque: 500 }
        ]
    },
    {
        name: 'Seet', country: 'İspanya', prestige: 3, logo: '/img/brands/seet.svg', factory: 'İspanya',
        models: [
            { name: 'İbıza', tier: 1, body: 'Hatchback', basePrice: 450000, topSpeed: 190, torque: 200 },
            { name: 'Lean', tier: 2, body: 'Hatchback', basePrice: 700000, topSpeed: 215, torque: 250 },
            { name: 'Ateko', tier: 2, body: 'SUV', basePrice: 850000, topSpeed: 205, torque: 280 },
            { name: 'Tarrako', tier: 3, body: 'SUV', basePrice: 1100000, topSpeed: 210, torque: 320 },
            { name: 'Cupra Formentar', tier: 3, body: 'SUV', basePrice: 1400000, topSpeed: 247, torque: 400 }
        ]
    },
    {
        name: 'Citroan', country: 'Fransa', prestige: 2, logo: '/img/brands/citroan.svg', factory: 'Fransa',
        models: [
            { name: 'C4x', tier: 1, body: 'Hatchback', basePrice: 420000, topSpeed: 180, torque: 175 },
            { name: 'C5x', tier: 2, body: 'Hatchback', basePrice: 600000, topSpeed: 195, torque: 225 },
            { name: 'C6 Aircross', tier: 2, body: 'SUV', basePrice: 850000, topSpeed: 200, torque: 260 },
            { name: 'C-Elysia', tier: 1, body: 'Sedan', basePrice: 300000, topSpeed: 180, torque: 160 },
            { name: 'Berlanga', tier: 1, body: 'MPV', basePrice: 400000, topSpeed: 170, torque: 210 }
        ]
    },
    {
        name: 'Pugeot', country: 'Fransa', prestige: 3, logo: '/img/brands/pugeot.svg', factory: 'Fransa',
        models: [
            { name: '209', tier: 1, body: 'Hatchback', basePrice: 480000, topSpeed: 195, torque: 210 },
            { name: '302', tier: 1, body: 'Sedan', basePrice: 420000, topSpeed: 185, torque: 175 },
            { name: '309', tier: 2, body: 'Hatchback', basePrice: 650000, topSpeed: 210, torque: 250 },
            { name: '509', tier: 3, body: 'Sedan', basePrice: 1100000, topSpeed: 235, torque: 300 },
            { name: '3010', tier: 3, body: 'SUV', basePrice: 1200000, topSpeed: 210, torque: 300 },
            { name: '5010', tier: 3, body: 'SUV', basePrice: 1350000, topSpeed: 210, torque: 300 },
            { name: '2010', tier: 1, body: 'SUV', basePrice: 580000, topSpeed: 190, torque: 215 }
        ]
    },
    {
        name: 'Skudo', country: 'Çekya', prestige: 3, logo: '/img/brands/skudo.svg', factory: 'Çekya',
        models: [
            { name: 'Fabıa', tier: 1, body: 'Hatchback', basePrice: 480000, topSpeed: 195, torque: 200 },
            { name: 'Skala', tier: 1, body: 'Hatchback', basePrice: 550000, topSpeed: 200, torque: 220 },
            { name: 'Octavıa', tier: 2, body: 'Sedan', basePrice: 780000, topSpeed: 220, torque: 250 },
            { name: 'Octavıa ZS', tier: 3, body: 'Sedan', basePrice: 1100000, topSpeed: 250, torque: 370 },
            { name: 'Superp', tier: 3, body: 'Sedan', basePrice: 1200000, topSpeed: 230, torque: 350 },
            { name: 'Kodiaqı', tier: 3, body: 'SUV', basePrice: 1350000, topSpeed: 210, torque: 340 },
            { name: 'Kamıq', tier: 2, body: 'SUV', basePrice: 750000, topSpeed: 200, torque: 230 }
        ]
    },
    {
        name: 'Furd', country: 'ABD', prestige: 3, logo: '/img/brands/furd.svg', factory: 'ABD',
        models: [
            { name: 'Fiasto', tier: 1, body: 'Hatchback', basePrice: 390000, topSpeed: 185, torque: 170 },
            { name: 'Fokus', tier: 2, body: 'Sedan', basePrice: 650000, topSpeed: 210, torque: 250 },
            { name: 'Fokus ZS', tier: 3, body: 'Hatchback', basePrice: 1200000, topSpeed: 266, torque: 440 },
            { name: 'Mondea', tier: 3, body: 'Sedan', basePrice: 950000, topSpeed: 225, torque: 300 },
            { name: 'Kugı', tier: 3, body: 'SUV', basePrice: 1100000, topSpeed: 200, torque: 300 },
            { name: 'Pumı', tier: 2, body: 'SUV', basePrice: 820000, topSpeed: 195, torque: 240 },
            { name: 'Mustank', tier: 4, body: 'Coupe', basePrice: 2500000, topSpeed: 250, torque: 530 },
            { name: 'Rangar', tier: 2, body: 'Pickup', basePrice: 900000, topSpeed: 180, torque: 350 }
        ]
    },
    {
        name: 'Opol', country: 'Almanya', prestige: 3, logo: '/img/brands/opol.svg', factory: 'Almanya',
        models: [
            { name: 'Corza', tier: 1, body: 'Hatchback', basePrice: 450000, topSpeed: 190, torque: 195 },
            { name: 'Astraı', tier: 2, body: 'Sedan', basePrice: 680000, topSpeed: 210, torque: 250 },
            { name: 'İnsigna', tier: 3, body: 'Sedan', basePrice: 950000, topSpeed: 230, torque: 300 },
            { name: 'Grandlend', tier: 3, body: 'SUV', basePrice: 1100000, topSpeed: 205, torque: 300 },
            { name: 'Mokkı', tier: 2, body: 'SUV', basePrice: 780000, topSpeed: 195, torque: 235 },
            { name: 'Crosslend', tier: 1, body: 'SUV', basePrice: 550000, topSpeed: 185, torque: 210 }
        ]
    },
    {
        name: 'Nisan', country: 'Japonya', prestige: 3, logo: '/img/brands/nisan.svg', factory: 'Japonya',
        models: [
            { name: 'Mıcra', tier: 1, body: 'Hatchback', basePrice: 420000, topSpeed: 175, torque: 147 },
            { name: 'Juko', tier: 2, body: 'SUV', basePrice: 680000, topSpeed: 190, torque: 200 },
            { name: 'Qashkay', tier: 2, body: 'SUV', basePrice: 900000, topSpeed: 200, torque: 270 },
            { name: 'X-Traıl', tier: 3, body: 'SUV', basePrice: 1200000, topSpeed: 200, torque: 340 },
            { name: 'GT-Z', tier: 4, body: 'Spor', basePrice: 5000000, topSpeed: 315, torque: 632 },
            { name: '371Z', tier: 3, body: 'Coupe', basePrice: 1800000, topSpeed: 250, torque: 363 }
        ]
    },
    {
        name: 'Kio', country: 'Güney Kore', prestige: 3, logo: '/img/brands/kio.svg', factory: 'Güney Kore',
        models: [
            { name: 'Pikanto', tier: 1, body: 'Hatchback', basePrice: 350000, topSpeed: 160, torque: 96 },
            { name: 'Rıo', tier: 1, body: 'Sedan', basePrice: 450000, topSpeed: 185, torque: 172 },
            { name: 'Ceratoı', tier: 2, body: 'Sedan', basePrice: 650000, topSpeed: 210, torque: 265 },
            { name: 'Sportaj', tier: 3, body: 'SUV', basePrice: 1100000, topSpeed: 210, torque: 350 },
            { name: 'Stınger', tier: 4, body: 'Sedan', basePrice: 1800000, topSpeed: 270, torque: 510 },
            { name: 'EV7', tier: 3, body: 'SUV', basePrice: 1500000, topSpeed: 185, torque: 605 },
            { name: 'Soranto', tier: 3, body: 'SUV', basePrice: 1300000, topSpeed: 200, torque: 350 }
        ]
    },
    {
        name: 'Mazdo', country: 'Japonya', prestige: 4, logo: '/img/brands/mazdo.svg', factory: 'Japonya',
        models: [
            { name: 'Mazdo2', tier: 1, body: 'Hatchback', basePrice: 480000, topSpeed: 185, torque: 148 },
            { name: 'Mazdo3', tier: 2, body: 'Sedan', basePrice: 750000, topSpeed: 210, torque: 213 },
            { name: 'Mazdo6', tier: 3, body: 'Sedan', basePrice: 1100000, topSpeed: 225, torque: 310 },
            { name: 'CX-6', tier: 3, body: 'SUV', basePrice: 1200000, topSpeed: 210, torque: 300 },
            { name: 'MX-6', tier: 3, body: 'Cabrio', basePrice: 1400000, topSpeed: 219, torque: 205 },
            { name: 'CX-61', tier: 3, body: 'SUV', basePrice: 1500000, topSpeed: 215, torque: 450 }
        ]
    },
    {
        name: 'Subaro', country: 'Japonya', prestige: 4, logo: '/img/brands/subaro.svg', factory: 'Japonya',
        models: [
            { name: 'İmprezo', tier: 2, body: 'Sedan', basePrice: 700000, topSpeed: 200, torque: 196 },
            { name: 'WRZ STR', tier: 3, body: 'Sedan', basePrice: 1500000, topSpeed: 255, torque: 422 },
            { name: 'Forestar', tier: 2, body: 'SUV', basePrice: 900000, topSpeed: 195, torque: 239 },
            { name: 'Outbek', tier: 2, body: 'Station Wagon', basePrice: 1000000, topSpeed: 200, torque: 252 },
            { name: 'BRY', tier: 2, body: 'Coupe', basePrice: 1100000, topSpeed: 226, torque: 212 }
        ]
    },
    {
        name: 'Mitsubasi', country: 'Japonya', prestige: 3, logo: '/img/brands/mitsubasi.svg', factory: 'Japonya',
        models: [
            { name: 'Lancerı', tier: 1, body: 'Sedan', basePrice: 400000, topSpeed: 190, torque: 197 },
            { name: 'ASZ', tier: 2, body: 'SUV', basePrice: 700000, topSpeed: 190, torque: 222 },
            { name: 'Outlender', tier: 2, body: 'SUV', basePrice: 900000, topSpeed: 200, torque: 280 },
            { name: 'Eclıpse Cross', tier: 2, body: 'SUV', basePrice: 800000, topSpeed: 195, torque: 245 },
            { name: 'Lancerı Evo', tier: 4, body: 'Sedan', basePrice: 2000000, topSpeed: 260, torque: 422 }
        ]
    },
    {
        name: 'Alfo Romea', country: 'İtalya', prestige: 5, logo: '/img/brands/alforomea.svg', factory: 'İtalya',
        models: [
            { name: 'Giulyetta', tier: 2, body: 'Hatchback', basePrice: 700000, topSpeed: 215, torque: 230 },
            { name: 'Guilia', tier: 3, body: 'Sedan', basePrice: 1300000, topSpeed: 240, torque: 330 },
            { name: 'Guilia Quadrifoglo', tier: 4, body: 'Sedan', basePrice: 2500000, topSpeed: 307, torque: 600 },
            { name: 'Stelvyo', tier: 3, body: 'SUV', basePrice: 1500000, topSpeed: 215, torque: 330 },
            { name: 'Tonali', tier: 2, body: 'SUV', basePrice: 1000000, topSpeed: 200, torque: 270 }
        ]
    },
    {
        name: 'Moni', country: 'İngiltere', prestige: 4, logo: '/img/brands/moni.svg', factory: 'İngiltere',
        models: [
            { name: 'Kuper', tier: 1, body: 'Hatchback', basePrice: 650000, topSpeed: 210, torque: 190 },
            { name: 'Kuper S', tier: 2, body: 'Hatchback', basePrice: 900000, topSpeed: 235, torque: 280 },
            { name: 'Countrimen', tier: 2, body: 'SUV', basePrice: 1000000, topSpeed: 210, torque: 280 },
            { name: 'John Kuper Works', tier: 3, body: 'Hatchback', basePrice: 1400000, topSpeed: 246, torque: 350 }
        ]
    },
    {
        name: 'Vulvo', country: 'İsveç', prestige: 5, logo: '/img/brands/vulvo.svg', factory: 'İsveç',
        models: [
            { name: 'S41', tier: 2, body: 'Sedan', basePrice: 800000, topSpeed: 210, torque: 240 },
            { name: 'S61', tier: 3, body: 'Sedan', basePrice: 1300000, topSpeed: 230, torque: 350 },
            { name: 'S91', tier: 4, body: 'Sedan', basePrice: 2200000, topSpeed: 250, torque: 400 },
            { name: 'XC41', tier: 3, body: 'SUV', basePrice: 1400000, topSpeed: 210, torque: 320 },
            { name: 'XC61', tier: 3, body: 'SUV', basePrice: 1800000, topSpeed: 220, torque: 420 },
            { name: 'XC91', tier: 4, body: 'SUV', basePrice: 2800000, topSpeed: 230, torque: 480 },
            { name: 'V61', tier: 2, body: 'Station Wagon', basePrice: 1200000, topSpeed: 220, torque: 300 }
        ]
    },
    {
        name: 'BNW', country: 'Almanya', prestige: 6, logo: '/img/brands/bnw.svg', factory: 'Almanya',
        models: [
            { name: '1 Seri', tier: 1, body: 'Hatchback', basePrice: 900000, topSpeed: 215, torque: 230 },
            { name: '2 Seri', tier: 2, body: 'Coupe', basePrice: 1200000, topSpeed: 230, torque: 300 },
            { name: '3 Seri', tier: 2, body: 'Sedan', basePrice: 1500000, topSpeed: 240, torque: 350 },
            { name: '4 Seri', tier: 3, body: 'Coupe', basePrice: 1800000, topSpeed: 250, torque: 400 },
            { name: '5 Seri', tier: 3, body: 'Sedan', basePrice: 2500000, topSpeed: 250, torque: 450 },
            { name: '7 Seri', tier: 4, body: 'Sedan', basePrice: 4500000, topSpeed: 250, torque: 650 },
            { name: 'X4', tier: 2, body: 'SUV', basePrice: 1800000, topSpeed: 225, torque: 350 },
            { name: 'X6', tier: 3, body: 'SUV', basePrice: 3200000, topSpeed: 240, torque: 540 },
            { name: 'X8', tier: 4, body: 'SUV', basePrice: 4000000, topSpeed: 245, torque: 650 },
            { name: 'N3', tier: 4, body: 'Sedan', basePrice: 3500000, topSpeed: 290, torque: 550 },
            { name: 'N4', tier: 4, body: 'Coupe', basePrice: 4000000, topSpeed: 290, torque: 550 },
            { name: 'N5', tier: 4, body: 'Sedan', basePrice: 5000000, topSpeed: 305, torque: 750 },
            { name: 'N8', tier: 4, body: 'Coupe', basePrice: 6000000, topSpeed: 305, torque: 750 },
            { name: 'Z5', tier: 3, body: 'Cabrio', basePrice: 2000000, topSpeed: 250, torque: 400 }
        ]
    },
    {
        name: 'Merbedes-Binz', country: 'Almanya', prestige: 6, logo: '/img/brands/merbedesbinz.svg', factory: 'Almanya',
        models: [
            { name: 'A Seri', tier: 1, body: 'Hatchback', basePrice: 950000, topSpeed: 215, torque: 250 },
            { name: 'C Seri', tier: 2, body: 'Sedan', basePrice: 1600000, topSpeed: 240, torque: 350 },
            { name: 'E Seri', tier: 3, body: 'Sedan', basePrice: 2800000, topSpeed: 250, torque: 500 },
            { name: 'S Seri', tier: 4, body: 'Sedan', basePrice: 5500000, topSpeed: 250, torque: 700 },
            { name: 'CLB', tier: 2, body: 'Coupe', basePrice: 1400000, topSpeed: 230, torque: 300 },
            { name: 'CLZ', tier: 3, body: 'Coupe', basePrice: 2500000, topSpeed: 250, torque: 500 },
            { name: 'GLB', tier: 2, body: 'SUV', basePrice: 1500000, topSpeed: 215, torque: 300 },
            { name: 'GLD', tier: 3, body: 'SUV', basePrice: 2200000, topSpeed: 230, torque: 400 },
            { name: 'GLF', tier: 3, body: 'SUV', basePrice: 3500000, topSpeed: 240, torque: 550 },
            { name: 'GLZ', tier: 4, body: 'SUV', basePrice: 4500000, topSpeed: 240, torque: 600 },
            { name: 'AMK GT', tier: 4, body: 'Spor', basePrice: 7000000, topSpeed: 315, torque: 720 },
            { name: 'AMK C64', tier: 4, body: 'Sedan', basePrice: 3500000, topSpeed: 290, torque: 650 },
            { name: 'G Seri', tier: 4, body: 'SUV', basePrice: 8000000, topSpeed: 210, torque: 850 }
        ]
    },
    {
        name: 'Oudi', country: 'Almanya', prestige: 6, logo: '/img/brands/oudi.svg', factory: 'Almanya',
        models: [
            { name: 'B1', tier: 1, body: 'Hatchback', basePrice: 800000, topSpeed: 200, torque: 200 },
            { name: 'B3', tier: 2, body: 'Sedan', basePrice: 1200000, topSpeed: 225, torque: 250 },
            { name: 'B4', tier: 2, body: 'Sedan', basePrice: 1500000, topSpeed: 240, torque: 320 },
            { name: 'B5', tier: 3, body: 'Coupe', basePrice: 1800000, topSpeed: 250, torque: 370 },
            { name: 'B6', tier: 3, body: 'Sedan', basePrice: 2500000, topSpeed: 250, torque: 400 },
            { name: 'B7', tier: 3, body: 'Coupe', basePrice: 3000000, topSpeed: 250, torque: 450 },
            { name: 'B8', tier: 4, body: 'Sedan', basePrice: 4500000, topSpeed: 250, torque: 600 },
            { name: 'P3', tier: 2, body: 'SUV', basePrice: 1500000, topSpeed: 215, torque: 300 },
            { name: 'P5', tier: 3, body: 'SUV', basePrice: 2200000, topSpeed: 230, torque: 370 },
            { name: 'P7', tier: 3, body: 'SUV', basePrice: 3200000, topSpeed: 240, torque: 500 },
            { name: 'P8', tier: 4, body: 'SUV', basePrice: 3800000, topSpeed: 245, torque: 550 },
            { name: 'RZ3', tier: 3, body: 'Sedan', basePrice: 2000000, topSpeed: 280, torque: 500 },
            { name: 'RZ6', tier: 4, body: 'Station Wagon', basePrice: 5500000, topSpeed: 305, torque: 800 },
            { name: 'R9', tier: 4, body: 'Spor', basePrice: 6500000, topSpeed: 330, torque: 580 },
            { name: 'TZ RS', tier: 3, body: 'Coupe', basePrice: 2200000, topSpeed: 280, torque: 480 }
        ]
    },
    {
        name: 'Luxus', country: 'Japonya', prestige: 6, logo: '/img/brands/luxus.svg', factory: 'Japonya',
        models: [
            { name: 'İZ', tier: 2, body: 'Sedan', basePrice: 1400000, topSpeed: 230, torque: 350 },
            { name: 'EZ', tier: 3, body: 'Sedan', basePrice: 2000000, topSpeed: 220, torque: 280 },
            { name: 'LZ', tier: 4, body: 'Sedan', basePrice: 4000000, topSpeed: 250, torque: 600 },
            { name: 'RZ', tier: 3, body: 'SUV', basePrice: 2500000, topSpeed: 220, torque: 350 },
            { name: 'LW', tier: 4, body: 'SUV', basePrice: 5000000, topSpeed: 210, torque: 650 },
            { name: 'LD', tier: 4, body: 'Coupe', basePrice: 4500000, topSpeed: 270, torque: 530 },
            { name: 'RD F', tier: 3, body: 'Coupe', basePrice: 2500000, topSpeed: 270, torque: 530 }
        ]
    },
    {
        name: 'Jagior', country: 'İngiltere', prestige: 7, logo: '/img/brands/jagior.svg', factory: 'İngiltere',
        models: [
            { name: 'XD', tier: 2, body: 'Sedan', basePrice: 1600000, topSpeed: 230, torque: 340 },
            { name: 'XG', tier: 3, body: 'Sedan', basePrice: 2500000, topSpeed: 250, torque: 450 },
            { name: 'F-Pase', tier: 3, body: 'SUV', basePrice: 2800000, topSpeed: 240, torque: 500 },
            { name: 'F-Tayp', tier: 4, body: 'Spor', basePrice: 4500000, topSpeed: 300, torque: 700 },
            { name: 'I-Pase', tier: 3, body: 'SUV', basePrice: 3200000, topSpeed: 200, torque: 696 },
            { name: 'F-Tayp R', tier: 4, body: 'Spor', basePrice: 5500000, topSpeed: 300, torque: 700 }
        ]
    },
    {
        name: 'Lend Ruver', country: 'İngiltere', prestige: 7, logo: '/img/brands/lendruver.svg', factory: 'İngiltere',
        models: [
            { name: 'Dıscovery Spor', tier: 2, body: 'SUV', basePrice: 2000000, topSpeed: 210, torque: 340 },
            { name: 'Dıscovery', tier: 3, body: 'SUV', basePrice: 3000000, topSpeed: 220, torque: 500 },
            { name: 'Renge Ruver Spor', tier: 3, body: 'SUV', basePrice: 4000000, topSpeed: 242, torque: 550 },
            { name: 'Renge Ruver Velar', tier: 3, body: 'SUV', basePrice: 3500000, topSpeed: 235, torque: 500 },
            { name: 'Renge Ruver', tier: 4, body: 'SUV', basePrice: 6500000, topSpeed: 242, torque: 700 },
            { name: 'Defander', tier: 3, body: 'SUV', basePrice: 3200000, topSpeed: 191, torque: 430 }
        ]
    },
    {
        name: 'Purscha', country: 'Almanya', prestige: 8, logo: '/img/brands/purscha.svg', factory: 'Almanya',
        models: [
            { name: 'Makon', tier: 2, body: 'SUV', basePrice: 2800000, topSpeed: 232, torque: 400 },
            { name: 'Cayena', tier: 3, body: 'SUV', basePrice: 4500000, topSpeed: 252, torque: 550 },
            { name: 'Panamero', tier: 3, body: 'Sedan', basePrice: 5000000, topSpeed: 272, torque: 620 },
            { name: '912 Carrera', tier: 4, body: 'Spor', basePrice: 5500000, topSpeed: 293, torque: 450 },
            { name: '912 Turbo S', tier: 4, body: 'Spor', basePrice: 9000000, topSpeed: 330, torque: 800 },
            { name: '912', tier: 4, body: 'Spor', basePrice: 7000000, topSpeed: 308, torque: 530 },
            { name: '719 Cayman', tier: 3, body: 'Spor', basePrice: 3500000, topSpeed: 275, torque: 380 },
            { name: 'Tayken', tier: 4, body: 'Sedan', basePrice: 5500000, topSpeed: 260, torque: 850 },
            { name: 'Cayena Turbo GZ', tier: 4, body: 'SUV', basePrice: 7000000, topSpeed: 300, torque: 850 }
        ]
    },
    {
        name: 'Mazarati', country: 'İtalya', prestige: 8, logo: '/img/brands/mazarati.svg', factory: 'İtalya',
        models: [
            { name: 'Ghiblı', tier: 3, body: 'Sedan', basePrice: 3500000, topSpeed: 267, torque: 500 },
            { name: 'Levanto', tier: 3, body: 'SUV', basePrice: 4200000, topSpeed: 264, torque: 580 },
            { name: 'Quattroportı', tier: 4, body: 'Sedan', basePrice: 5500000, topSpeed: 307, torque: 580 },
            { name: 'MC21', tier: 4, body: 'Spor', basePrice: 8000000, topSpeed: 325, torque: 730 },
            { name: 'GranTurısmo', tier: 4, body: 'Coupe', basePrice: 7000000, topSpeed: 302, torque: 580 },
            { name: 'Grekale', tier: 2, body: 'SUV', basePrice: 2500000, topSpeed: 240, torque: 450 }
        ]
    },
    {
        name: 'Astin Morton', country: 'İngiltere', prestige: 8, logo: '/img/brands/astinmorton.svg', factory: 'İngiltere',
        models: [
            { name: 'Vantaj', tier: 3, body: 'Spor', basePrice: 5000000, topSpeed: 314, torque: 685 },
            { name: 'DB12', tier: 4, body: 'Coupe', basePrice: 7000000, topSpeed: 322, torque: 700 },
            { name: 'DBZ Superleggera', tier: 4, body: 'Coupe', basePrice: 10000000, topSpeed: 340, torque: 900 },
            { name: 'DBW', tier: 3, body: 'SUV', basePrice: 6000000, topSpeed: 291, torque: 700 },
            { name: 'Valkirya', tier: 4, body: 'Spor', basePrice: 30000000, topSpeed: 402, torque: 900 },
            { name: 'DB13', tier: 4, body: 'Coupe', basePrice: 8000000, topSpeed: 325, torque: 800 }
        ]
    },
    {
        name: 'MaLaren', country: 'İngiltere', prestige: 9, logo: '/img/brands/malaren.svg', factory: 'İngiltere',
        models: [
            { name: 'GZ', tier: 3, body: 'Coupe', basePrice: 5500000, topSpeed: 326, torque: 630 },
            { name: 'Arturo', tier: 3, body: 'Spor', basePrice: 7000000, topSpeed: 330, torque: 720 },
            { name: '721S', tier: 4, body: 'Spor', basePrice: 9000000, topSpeed: 341, torque: 770 },
            { name: '766LT', tier: 4, body: 'Spor', basePrice: 12000000, topSpeed: 330, torque: 800 },
            { name: 'P2', tier: 4, body: 'Spor', basePrice: 25000000, topSpeed: 350, torque: 978 },
            { name: 'Speedtaıl', tier: 4, body: 'Spor', basePrice: 28000000, topSpeed: 403, torque: 1150 }
        ]
    },
    {
        name: 'Ferraro', country: 'İtalya', prestige: 9, logo: '/img/brands/ferraro.svg', factory: 'İtalya',
        models: [
            { name: 'Romaı', tier: 3, body: 'Coupe', basePrice: 7000000, topSpeed: 320, torque: 760 },
            { name: 'F9 Tributo', tier: 4, body: 'Spor', basePrice: 9000000, topSpeed: 340, torque: 770 },
            { name: '297 GTB', tier: 4, body: 'Spor', basePrice: 10000000, topSpeed: 330, torque: 740 },
            { name: '813 Superfast', tier: 4, body: 'Spor', basePrice: 12000000, topSpeed: 340, torque: 718 },
            { name: 'SF91 Stradalı', tier: 4, body: 'Spor', basePrice: 15000000, topSpeed: 340, torque: 900 },
            { name: 'LaFerraro', tier: 4, body: 'Spor', basePrice: 35000000, topSpeed: 352, torque: 900 },
            { name: 'Portofıno', tier: 3, body: 'Cabrio', basePrice: 8000000, topSpeed: 320, torque: 760 },
            { name: 'Purosanguı', tier: 4, body: 'SUV', basePrice: 13000000, topSpeed: 310, torque: 716 }
        ]
    },
    {
        name: 'Lamburghini', country: 'İtalya', prestige: 9, logo: '/img/brands/lamburghini.svg', factory: 'İtalya',
        models: [
            { name: 'Hurakan', tier: 3, body: 'Spor', basePrice: 8000000, topSpeed: 325, torque: 600 },
            { name: 'Hurakan STO', tier: 4, body: 'Spor', basePrice: 10000000, topSpeed: 310, torque: 565 },
            { name: 'Uros', tier: 3, body: 'SUV', basePrice: 7000000, topSpeed: 305, torque: 850 },
            { name: 'Aventodor', tier: 4, body: 'Spor', basePrice: 12000000, topSpeed: 350, torque: 720 },
            { name: 'Revolto', tier: 4, body: 'Spor', basePrice: 15000000, topSpeed: 350, torque: 900 },
            { name: 'Sıan', tier: 4, body: 'Spor', basePrice: 30000000, topSpeed: 350, torque: 900 }
        ]
    },
    {
        name: 'Bintley', country: 'İngiltere', prestige: 9, logo: '/img/brands/bintley.svg', factory: 'İngiltere',
        models: [
            { name: 'Continental GZ', tier: 3, body: 'Coupe', basePrice: 7000000, topSpeed: 333, torque: 900 },
            { name: 'Continental GZ Speed', tier: 4, body: 'Coupe', basePrice: 9000000, topSpeed: 335, torque: 900 },
            { name: 'Flyıng Spor', tier: 4, body: 'Sedan', basePrice: 8500000, topSpeed: 333, torque: 900 },
            { name: 'Benteyga', tier: 3, body: 'SUV', basePrice: 7500000, topSpeed: 306, torque: 900 },
            { name: 'Mullıner', tier: 4, body: 'Coupe', basePrice: 12000000, topSpeed: 335, torque: 900 }
        ]
    },
    {
        name: 'Rolss-Royz', country: 'İngiltere', prestige: 10, logo: '/img/brands/rolssroyz.svg', factory: 'İngiltere',
        models: [
            { name: 'Gost', tier: 3, body: 'Sedan', basePrice: 10000000, topSpeed: 250, torque: 850 },
            { name: 'Wraıth', tier: 4, body: 'Coupe', basePrice: 12000000, topSpeed: 250, torque: 870 },
            { name: 'Davn', tier: 4, body: 'Cabrio', basePrice: 13000000, topSpeed: 250, torque: 820 },
            { name: 'Cullınan', tier: 4, body: 'SUV', basePrice: 15000000, topSpeed: 250, torque: 850 },
            { name: 'Fantom', tier: 4, body: 'Sedan', basePrice: 20000000, topSpeed: 250, torque: 900 },
            { name: 'Spectra', tier: 4, body: 'Coupe', basePrice: 18000000, topSpeed: 250, torque: 900 }
        ]
    },
    {
        name: 'Bugotti', country: 'Fransa', prestige: 10, logo: '/img/brands/bugotti.svg', factory: 'Fransa',
        models: [
            { name: 'Shıron', tier: 4, body: 'Spor', basePrice: 40000000, topSpeed: 420, torque: 1600 },
            { name: 'Shıron Sport', tier: 4, body: 'Spor', basePrice: 45000000, topSpeed: 420, torque: 1600 },
            { name: 'Shıron Super Sport', tier: 4, body: 'Spor', basePrice: 50000000, topSpeed: 440, torque: 1600 },
            { name: 'Dıvo', tier: 4, body: 'Spor', basePrice: 55000000, topSpeed: 380, torque: 1600 },
            { name: 'Bolıde', tier: 4, body: 'Spor', basePrice: 65000000, topSpeed: 500, torque: 1850 },
            { name: 'La Voiture Noıre', tier: 4, body: 'Coupe', basePrice: 130000000, topSpeed: 420, torque: 1600 },
            { name: 'Mıstral', tier: 4, body: 'Cabrio', basePrice: 55000000, topSpeed: 420, torque: 1600 }
        ]
    },
    {
        name: 'Pugani', country: 'İtalya', prestige: 10, logo: '/img/brands/pugani.svg', factory: 'İtalya',
        models: [
            { name: 'Huayro', tier: 4, body: 'Spor', basePrice: 35000000, topSpeed: 370, torque: 1000 },
            { name: 'Huayro BC', tier: 4, body: 'Spor', basePrice: 45000000, topSpeed: 370, torque: 1100 },
            { name: 'Utopıa', tier: 4, body: 'Spor', basePrice: 40000000, topSpeed: 350, torque: 1100 },
            { name: 'Zundo', tier: 4, body: 'Spor', basePrice: 30000000, topSpeed: 345, torque: 780 }
        ]
    },
    {
        name: 'Konigsegg', country: 'İsveç', prestige: 10, logo: '/img/brands/konigsegg.svg', factory: 'İsveç',
        models: [
            { name: 'Jısko', tier: 4, body: 'Spor', basePrice: 50000000, topSpeed: 480, torque: 1500 },
            { name: 'Gemaro', tier: 4, body: 'Coupe', basePrice: 40000000, topSpeed: 400, torque: 1700 },
            { name: 'Regaro', tier: 4, body: 'Spor', basePrice: 45000000, topSpeed: 410, torque: 1500 },
            { name: 'Agero RS', tier: 4, body: 'Spor', basePrice: 55000000, topSpeed: 447, torque: 1370 }
        ]
    },
    {
        name: 'Tisla', country: 'ABD', prestige: 7, logo: '/img/brands/tisla.svg', factory: 'ABD',
        models: [
            { name: 'Model Z', tier: 4, body: 'Sedan', basePrice: 2500000, topSpeed: 250, torque: 660, fuel_type: 'Elektrik' },
            { name: 'Model 4', tier: 2, body: 'Sedan', basePrice: 1200000, topSpeed: 225, torque: 450, fuel_type: 'Elektrik' },
            { name: 'Model W', tier: 3, body: 'SUV', basePrice: 2800000, topSpeed: 250, torque: 660, fuel_type: 'Elektrik' },
            { name: 'Model V', tier: 2, body: 'SUV', basePrice: 1400000, topSpeed: 217, torque: 490, fuel_type: 'Elektrik' },
            { name: 'Cybırtruck', tier: 4, body: 'Pickup', basePrice: 3500000, topSpeed: 209, torque: 850, fuel_type: 'Elektrik' }
        ]
    },
    {
        name: 'Tugg', country: 'Türkiye', prestige: 5, logo: '/img/brands/tugg.svg', factory: 'Türkiye',
        models: [
            { name: 'T11X', tier: 2, body: 'SUV', basePrice: 1200000, topSpeed: 185, torque: 350, fuel_type: 'Elektrik' }
        ]
    }
];

// Renkler
const COLORS = [
    'Siyah', 'Beyaz', 'Gri', 'Gümüş', 'Kırmızı', 'Mavi', 'Lacivert',
    'Yeşil', 'Bordo', 'Turuncu', 'Sarı', 'Kahverengi', 'Bej', 'Mor',
    'Şampanya', 'Füme', 'Metalik Gri', 'İnci Beyazı', 'Koyu Mavi'
];

// İç döşeme
const INTERIORS = [
    'Kumaş', 'Deri', 'Yarı Deri', 'Alcantara', 'Süet',
    'Premium Deri', 'Napa Deri', 'Vegan Deri'
];

const INTERIOR_COLORS = [
    'Siyah', 'Bej', 'Kahverengi', 'Krem', 'Kırmızı', 'Gri', 'Beyaz', 'Bordo'
];

// Yakıt tipleri ve ağırlıkları
const FUEL_TYPES = [
    { type: 'Benzin', weight: 35 },
    { type: 'Dizel', weight: 30 },
    { type: 'LPG', weight: 15 },
    { type: 'Hibrit', weight: 12 },
    { type: 'Elektrik', weight: 8 }
];

// Vites tipleri
const TRANSMISSIONS = [
    { type: 'Manuel', weight: 40 },
    { type: 'Otomatik', weight: 50 },
    { type: 'Yarı Otomatik', weight: 10 }
];

// Motor hacimleri
const ENGINE_SIZES = ['1.0', '1.2', '1.3', '1.4', '1.5', '1.6', '1.8', '2.0', '2.5', '3.0', '3.5', '4.0', '4.4', '5.0', '6.0', '6.3', '8.0'];

// Hasar durumları ve ağırlıkları
const DAMAGE_STATUSES = [
    { status: 'Hasarsız', weight: 35 },
    { status: 'Boyalı', weight: 25 },
    { status: 'Değişen', weight: 15 },
    { status: 'Çizik', weight: 15 },
    { status: 'Hasarlı', weight: 10 }
];

// Parça listesi
const PART_NAMES = [
    'Ön Tampon', 'Arka Tampon', 'Ön Kaput', 'Bagaj Kapağı',
    'Sol Ön Çamurluk', 'Sağ Ön Çamurluk', 'Sol Arka Çamurluk', 'Sağ Arka Çamurluk',
    'Sol Ön Kapı', 'Sağ Ön Kapı', 'Sol Arka Kapı', 'Sağ Arka Kapı',
    'Tavan', 'Motor', 'Şanzıman', 'Fren Sistemi', 'Süspansiyon',
    'Direksiyon Sistemi', 'Egzoz', 'Far Sol', 'Far Sağ',
    'Radyatör', 'Turbo/Kompresör', 'Klima Kompresörü', 'Alternatör',
    'Marş Motoru', 'Ön Cam', 'Arka Cam', 'Torpido', 'Gösterge Paneli'
];

// Motor durumları
const ENGINE_STATUSES = [
    { status: 'Mükemmel', weight: 30 },
    { status: 'İyi', weight: 40 },
    { status: 'Orta', weight: 20 },
    { status: 'Kötü', weight: 10 }
];

// Araç açıklamaları (random seçilecek parçalar)
const DESCRIPTION_TEMPLATES = [
    "Çok temiz kullanılmış, garaj arabası. Bakımları düzenli yapılmıştır.",
    "Sahibinden acil satılık, pazarlık payı vardır.",
    "Tek sahibinden orjinal km, boyasız tramersizdır.",
    "Takas düşünülmektedir. Üstüne fark ödenmelidir.",
    "Yeni muayeneden geçmiştir, tüm bakımları yapılmıştır.",
    "Galeriden satılık, ekspertiz raporlu araçtır.",
    "Aracın tüm bakımları yetkili serviste yapılmıştır.",
    "Kazasız, boyasız, tramersiz. Değişen yoktur.",
    "İlk sahibinden temiz ve bakımlı araç.",
    "Acil satılık, fiyat düşürüldü! Ciddi alıcılar aransın.",
    "Kasko değeri üzerinden satılıktır.",
    "Full + full orjinal araçtır, eksik yoktur.",
    "Yeni lastik ve fren yapılmıştır.",
    "Motor ve şanzıman sorunsuzdur, yağ yakmaz.",
    "İç dış temiz, koltuklar sıfır gibidir.",
    "Her türlü ekspertize açıktır. Gönül rahatlığıyla alabilirsiniz.",
    "Aileden satılık, çok az kullanılmıştır.",
    "Plaka değişimi yapılmıştır, araç sorunsuz çalışmaktadır.",
    "Klima, ABS, ESP, cruise control mevcuttur.",
    "Cam tavan, deri koltuk, otomatik vites. Dolu paket."
];

const SELLER_TYPES = ['Sahibinden', 'Galeriden', 'Yetkili Bayi'];

// İllegal Modifikasyonlar
const ILLEGAL_MODS = [
    // Yazılım
    { type: 'yazilim', name: 'Stage 1 Yazılım', tier: 'ucuz', hpBonus: 25, torqueBonus: 40, speedBonus: 10, riskPercent: 15, costMult: 0.02, isEV: false },
    { type: 'yazilim', name: 'Stage 2 Yazılım', tier: 'orta', hpBonus: 50, torqueBonus: 80, speedBonus: 20, riskPercent: 20, costMult: 0.04, isEV: false },
    { type: 'yazilim', name: 'Stage 3 Pro Yazılım', tier: 'pahali', hpBonus: 100, torqueBonus: 150, speedBonus: 35, riskPercent: 25, costMult: 0.08, isEV: false },
    // Egzoz
    { type: 'egzoz', name: 'Spor Egzoz', tier: 'ucuz', hpBonus: 10, torqueBonus: 15, speedBonus: 5, riskPercent: 10, costMult: 0.015, isEV: false },
    { type: 'egzoz', name: 'Akrapovic Egzoz', tier: 'pahali', hpBonus: 25, torqueBonus: 35, speedBonus: 12, riskPercent: 15, costMult: 0.05, isEV: false },
    { type: 'egzoz', name: 'Yarış Egzozu (Straight Pipe)', tier: 'orta', hpBonus: 20, torqueBonus: 25, speedBonus: 8, riskPercent: 25, costMult: 0.03, isEV: false },
    // Yarış Tekerlekleri (Organizer Races Bonus)
    { type: 'racing_tires', name: 'Yarış Tekerleği (Sokak Tipli)', tier: 'ucuz', hpBonus: 5, torqueBonus: 5, speedBonus: 5, riskPercent: 5, costMult: 0.02 },
    { type: 'racing_tires', name: 'Yarış Tekerleği (Sport)', tier: 'orta', hpBonus: 10, torqueBonus: 15, speedBonus: 10, riskPercent: 10, costMult: 0.04 },
    { type: 'racing_tires', name: 'Yarış Tekerleği (Tam Pist Slick)', tier: 'pahali', hpBonus: 25, torqueBonus: 30, speedBonus: 15, riskPercent: 20, costMult: 0.08 },
    // Alt İndirme
    { type: 'suspansiyon', name: 'Spor Helezon Yay', tier: 'ucuz', hpBonus: 0, torqueBonus: 0, speedBonus: 3, riskPercent: 10, costMult: 0.01 },
    { type: 'suspansiyon', name: 'Coilover Kit (İllegal)', tier: 'orta', hpBonus: 0, torqueBonus: 0, speedBonus: 5, riskPercent: 15, costMult: 0.025 },
    { type: 'suspansiyon', name: 'Air Ride Sistem', tier: 'pahali', hpBonus: 0, torqueBonus: 0, speedBonus: 5, riskPercent: 12, costMult: 0.06 },
    // Cam Filmi
    { type: 'cam_filmi', name: 'Açık Cam Filmi (%50)', tier: 'ucuz', hpBonus: 0, torqueBonus: 0, speedBonus: 0, riskPercent: 5, costMult: 0.005 },
    { type: 'cam_filmi', name: 'Koyu Cam Filmi (%20)', tier: 'orta', hpBonus: 0, torqueBonus: 0, speedBonus: 0, riskPercent: 15, costMult: 0.01 },
    { type: 'cam_filmi', name: 'Limo Cam Filmi (%5)', tier: 'pahali', hpBonus: 0, torqueBonus: 0, speedBonus: 0, riskPercent: 25, costMult: 0.015 },
    // Serseri Ayar
    { type: 'serseri', name: 'Pop&Bang Yazılım', tier: 'ucuz', hpBonus: 5, torqueBonus: 10, speedBonus: 0, riskPercent: 20, costMult: 0.015, isEV: false },
    { type: 'serseri', name: 'Launch Control', tier: 'orta', hpBonus: 15, torqueBonus: 30, speedBonus: 10, riskPercent: 20, costMult: 0.03, isEV: false },
    { type: 'serseri', name: 'Anti-Lag Sistem', tier: 'pahali', hpBonus: 30, torqueBonus: 50, speedBonus: 15, riskPercent: 25, costMult: 0.06, isEV: false },
    // KM Düşürme
    { type: 'km_dusurme', name: 'KM Düşürme (10.000 km)', tier: 'ucuz', hpBonus: 0, torqueBonus: 0, speedBonus: 0, riskPercent: 30, costMult: 0.01, kmReduce: 10000 },
    { type: 'km_dusurme', name: 'KM Düşürme (50.000 km)', tier: 'orta', hpBonus: 0, torqueBonus: 0, speedBonus: 0, riskPercent: 35, costMult: 0.025, kmReduce: 50000 },
    { type: 'km_dusurme', name: 'KM Sıfırlama', tier: 'pahali', hpBonus: 0, torqueBonus: 0, speedBonus: 0, riskPercent: 50, costMult: 0.05, kmReduce: -1 },
    // Nitro
    { type: 'nitro', name: 'Küçük NOS Tüpü', tier: 'ucuz', hpBonus: 40, torqueBonus: 50, speedBonus: 15, riskPercent: 20, costMult: 0.02, isEV: false },
    { type: 'nitro', name: 'Büyük NOS Sistemi', tier: 'pahali', hpBonus: 80, torqueBonus: 100, speedBonus: 30, riskPercent: 30, costMult: 0.05, isEV: false },
    // Modifiye Ek
    { type: 'modifiye', name: 'Neon Alt Aydınlatma', tier: 'ucuz', hpBonus: 0, torqueBonus: 0, speedBonus: 0, riskPercent: 10, costMult: 0.008 },
    { type: 'modifiye', name: 'Gövde Kiti (İllegal)', tier: 'orta', hpBonus: 0, torqueBonus: 0, speedBonus: 3, riskPercent: 15, costMult: 0.025 },
    { type: 'modifiye', name: 'Roll Cage (Takla Kafesi)', tier: 'pahali', hpBonus: 0, torqueBonus: 0, speedBonus: 0, riskPercent: 10, costMult: 0.03 },
    // Elektrikli Araç Özel (EV)
    { type: 'batarya', name: 'Yüksek Kapasiteli Batarya', tier: 'pahali', hpBonus: 0, torqueBonus: 100, speedBonus: 15, riskPercent: 10, costMult: 0.12, isEV: true },
    { type: 'batarya', name: 'Hızlı Şarj Modu (Overclock)', tier: 'orta', hpBonus: 40, torqueBonus: 60, speedBonus: 10, riskPercent: 25, costMult: 0.05, isEV: true },
    { type: 'motor_ev', name: 'Yüksek Verimli Elektrik Motoru', tier: 'pahali', hpBonus: 120, torqueBonus: 200, speedBonus: 40, riskPercent: 15, costMult: 0.15, isEV: true },
    { type: 'suspansiyon', name: 'Aktif Batarya Soğutma', tier: 'orta', hpBonus: 5, torqueBonus: 10, speedBonus: 5, riskPercent: 5, costMult: 0.04, isEV: true }
];

// Tamirci Tipleri
const MECHANIC_TYPES = [
    { id: 'bad', name: 'Kötü Tamirci', icon: 'wrench-bad', qualityRange: [30, 60], costMult: 0.5, description: 'Ucuz ama kalitesiz. Parçalar kısa ömürlü olabilir.' },
    { id: 'normal', name: 'Normal Tamirci', icon: 'wrench-normal', qualityRange: [60, 85], costMult: 1.0, description: 'Orta kalite iş. Fiyat/performans dengeli.' },
    { id: 'authorized', name: 'Yetkili Servis', icon: 'wrench-authorized', qualityRange: [100, 100], costMult: 2.5, description: 'En iyi kalite. Orijinal parça garantisi. Değişen (Orijinal) olarak işlenir.' }
];

// Hurdalık açıklamaları
const JUNKYARD_DESCRIPTIONS = [
    'Ağır kaza geçirmiş, motoru çalışmıyor. Ama kaporta düzeltilebilir.',
    'Pert çıkmış araç. Motor sağlam ama gövde hasar görmüş.',
    'Uzun süredir çalıştırılmamış, aküsü bitmiş. Genel bakıma ihtiyacı var.',
    'Sel baskınından kurtarılmış. Elektrik aksam sıkıntılı olabilir.',
    'Motor bloğu çatlamış, komple motor değişimi gerekli.',
    'Yan darbe almış, şasi eğrilmiş ama düzeltilebilir.',
    'Terk edilmiş araç, pas var ama mekanik kısmı kullanılabilir.',
    'Yangın hasarlı, iç mekan tamamen yanmış. Motor kısmen sağlam.',
    'Hırsızlık sonrası bulunmuş, parçaları eksik.',
    'Çok yüksek km, motor yağ yakıyor, revizyona ihtiyacı var.'
];

module.exports = {
    BRANDS,
    COLORS,
    INTERIORS,
    INTERIOR_COLORS,
    FUEL_TYPES,
    TRANSMISSIONS,
    ENGINE_SIZES,
    DAMAGE_STATUSES,
    PART_NAMES,
    ENGINE_STATUSES,
    DESCRIPTION_TEMPLATES,
    SELLER_TYPES,
    ILLEGAL_MODS,
    MECHANIC_TYPES,
    JUNKYARD_DESCRIPTIONS
};
