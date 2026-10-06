import { names } from './names.js';

/**
 * Модели электроники: планшеты, ноутбуки, умные часы, камеры и дроны.
 *
 * Модель — линейка или название («MacBook Air», «ThinkPad T», «Galaxy Tab
 * S9», «Watch GT 4», «EOS 5D Mark IV»), а не комплектация: процессор,
 * память, диск, диагональ, цвет и состояние остаются характеристиками
 * объявления. Там, где модели — это коды (телевизоры, стиральные машины,
 * электроинструмент), справочника нет, и модель пишется текстом.
 */

export const TABLET_MODELS: Readonly<Record<string, readonly string[]>> = {
  apple: names(
    `iPad | iPad 2 | iPad Air | iPad mini | iPad Pro 9.7 | iPad Pro 10.5 | iPad Pro 11 | iPad Pro 12.9 | iPad Pro 13 | iPad Air 11 | iPad Air 13`,
  ),
  samsung: names(
    `Galaxy Tab S11 Ultra | Galaxy Tab S11 | Galaxy Tab S10 Ultra | Galaxy Tab S10 | Galaxy Tab S10 Plus | Galaxy Tab S10 FE | Galaxy Tab S9 Ultra | Galaxy Tab S9 Plus | Galaxy Tab S9 FE Plus | Galaxy Tab S9 FE | Galaxy Tab S9 | Galaxy Tab S8 Ultra | Galaxy Tab S8 Plus | Galaxy Tab S8 | Galaxy Tab S7 FE | Galaxy Tab S7 Plus | Galaxy Tab S7 | Galaxy Tab S6 Lite | Galaxy Tab S6 | Galaxy Tab S5e | Galaxy Tab S4 | Galaxy Tab S3 | Galaxy Tab S2 | Galaxy Tab S | Galaxy Tab A9 Plus | Galaxy Tab A9 | Galaxy Tab A8 | Galaxy Tab A7 Lite | Galaxy Tab A7 | Galaxy Tab A | Galaxy Tab Active | Galaxy Tab E | Galaxy Tab 4 | Galaxy Tab 3 | Galaxy Tab 2 | Galaxy Note 10.1`,
  ),
  huawei: names(
    `MatePad Pro 13.2 | MatePad Pro 12.6 | MatePad Pro 11 | MatePad Pro 10.8 | MatePad 11.5 | MatePad 11 | MatePad Air | MatePad SE | MatePad T10s | MatePad T10 | MatePad | MediaPad M6 | MediaPad M5 Lite | MediaPad M5 | MediaPad M3 | MediaPad T5 | MediaPad T3 | MediaPad T1 | MediaPad`,
  ),
  xiaomi: names(
    `Xiaomi Pad 8 Pro | Xiaomi Pad 8 | Xiaomi Pad 7 Pro | Xiaomi Pad 7 | Xiaomi Pad 6S Pro | Xiaomi Pad 6 Max | Xiaomi Pad 6 Pro | Xiaomi Pad 6 | Xiaomi Pad 5 Pro | Xiaomi Pad 5 | Mi Pad 4 Plus | Mi Pad 4 | Mi Pad 3 | Mi Pad 2 | Mi Pad`,
  ),
  redmi: names(`Redmi Pad Pro | Redmi Pad SE | Redmi Pad`),
  honor: names(`Pad X9 | Pad X8 Pro | Pad X8 | Pad 9 | Pad 8 | Pad V8 Pro | MagicPad 2`),
  lenovo: names(
    `Tab P12 Pro | Tab P12 | Tab P11 Pro | Tab P11 Plus | Tab P11 | Tab M11 | Tab M10 Plus | Tab M10 HD | Tab M10 | Tab M9 | Tab M8 | Tab E10 | Tab E8 | Tab E7 | Tab 4 | Tab 3 | Tab 2 | Yoga Tab 13 | Yoga Tab 11 | Yoga Smart Tab | Legion Y700 | Tab K11 | Tab B10 | Tab P10 | Tab P8`,
  ),
  realme: names(`Pad 2 | Pad Mini | Pad X | Pad`),
  oneplus: names(`Pad 2 | Pad Go | Pad`),
  oppo: names(`Pad 3 | Pad Air | Pad Neo | Pad`),
  google: names(`Pixel Tablet | Nexus 7 | Nexus 9 | Nexus 10`),
  microsoft: names(
    `Surface Pro 11 | Surface Pro 10 | Surface Pro 9 | Surface Pro 8 | Surface Pro 7 Plus | Surface Pro 7 | Surface Pro 6 | Surface Pro 5 | Surface Pro 4 | Surface Pro 3 | Surface Go 4 | Surface Go 3 | Surface Go 2 | Surface Go | Surface RT | Surface 2 | Surface Duo`,
  ),
  amazon: names(`Fire HD 10 | Fire HD 8 Plus | Fire HD 8 | Fire Max 11 | Fire 7 | Fire Kids`),
  asus: names(
    `ZenPad 10 | ZenPad 8 | ZenPad S 8.0 | ZenPad 3S 10 | Transformer Pad | Transformer Book | Memo Pad | Zenbook Duo | ROG Flow Z13`,
  ),
  acer: names(`Iconia Tab | Iconia One | Iconia Talk | Chromebook Tab`),
};

/**
 * Ноутбуки: модельные линейки. Размер экрана, процессор, память и видеокарта —
 * отдельные поля, поэтому «MacBook Pro 14» и «MacBook Pro 16» здесь одна модель.
 */
export const LAPTOP_MODELS: Readonly<Record<string, readonly string[]>> = {
  apple: names(`MacBook Air | MacBook Pro | MacBook`),
  asus: names(
    `ZenBook | ZenBook Flip | ZenBook Duo | ZenBook Pro | ZenBook S | VivoBook | VivoBook Pro | VivoBook Go | VivoBook S | VivoBook Flip | ExpertBook | ROG Strix | ROG Strix Scar | ROG Zephyrus G14 | ROG Zephyrus G15 | ROG Zephyrus G16 | ROG Zephyrus M16 | ROG Zephyrus Duo | ROG Flow X13 | ROG Flow X16 | ROG Flow Z13 | ROG Ally | TUF Gaming F15 | TUF Gaming F17 | TUF Gaming A15 | TUF Gaming A17 | TUF Dash F15 | ProArt Studiobook | ProArt | Chromebook | Transformer Book | Eee PC`,
  ),
  acer: names(
    `Aspire 1 | Aspire 3 | Aspire 5 | Aspire 7 | Aspire E | Aspire V | Aspire V Nitro | Aspire One | Swift 1 | Swift 3 | Swift 5 | Swift Go | Swift X | Spin | Nitro 5 | Nitro V | Predator Helios | Predator Helios Neo | Predator Triton | TravelMate | Extensa | Chromebook | Switch | Enduro | Ferrari`,
  ),
  lenovo: names(
    `ThinkPad T | ThinkPad X | ThinkPad E | ThinkPad L | ThinkPad P | ThinkPad W | ThinkPad X1 Carbon | ThinkPad X1 Yoga | ThinkPad X1 Extreme | ThinkPad X1 Nano | ThinkPad Yoga | ThinkPad Edge | ThinkPad Helix | ThinkBook | IdeaPad | IdeaPad Gaming | IdeaPad Flex | IdeaPad Slim | IdeaPad S | Yoga | Yoga Slim | Yoga Pro | Yoga Book | Legion | Legion Slim | Legion Pro | LOQ | Lenovo V | Lenovo B | Lenovo G | Lenovo S | Lenovo Z | Lenovo U | Flex | Chromebook`,
  ),
  hp: names(
    `Pavilion | Pavilion Gaming | Pavilion x360 | Envy | Envy x360 | Spectre x360 | Spectre | EliteBook | EliteBook x360 | Elite Dragonfly | ProBook | ZBook | ZBook Fury | ZBook Studio | ZBook Power | Omen | Omen Transcend | Victus | Stream | Chromebook | HP 250 | HP 255 | HP 15s | HP 14s | HP 17 | HP 15 | HP 14 | Compaq Presario | Folio | Envy Rove`,
  ),
  dell: names(
    `XPS 13 | XPS 14 | XPS 15 | XPS 16 | XPS 17 | Inspiron | Latitude | Vostro | Precision | Alienware m15 | Alienware m16 | Alienware m17 | Alienware x14 | Alienware x15 | Alienware x16 | Alienware x17 | Alienware Area-51m | Dell G15 | Dell G16 | Dell G3 | Dell G5 | Dell G7 | Chromebook | Studio`,
  ),
  msi: names(
    `Modern | Prestige | Summit | Creator | Stealth | Raider | Titan | Vector | Katana | Sword | Cyborg | Thin | Pulse | Bravo | Delta | Alpha | Crosshair | GF | GL | GP | GS | GT | GE | WS | WF`,
  ),
  huawei: names(
    `MateBook D | MateBook 13 | MateBook 14 | MateBook 14s | MateBook 16 | MateBook 16s | MateBook X | MateBook X Pro | MateBook E | MateBook B | MateBook GT 14 | MateBook Pro`,
  ),
  honor: names(`MagicBook X | MagicBook Pro | MagicBook Art | MagicBook`),
  samsung: names(
    `Galaxy Book | Galaxy Book Pro | Galaxy Book Pro 360 | Galaxy Book Flex | Galaxy Book Ion | Galaxy Book S | Galaxy Book2 | Galaxy Book3 | Galaxy Book4 | Galaxy Book5 | Galaxy Chromebook | Notebook 9 | Notebook 7 | Notebook 5 | Notebook 3 | Notebook Odyssey | Notebook Flash`,
  ),
  xiaomi: names(
    `Mi Notebook Pro | Mi Notebook Air | Mi Notebook | RedmiBook 14 | RedmiBook 15 | RedmiBook Pro | Redmi G | Xiaomi Book | Xiaomi Book Air | Xiaomi Book Pro | Xiaomi Book S | Mi Gaming`,
  ),
  microsoft: names(`Surface Laptop | Surface Laptop Go | Surface Laptop Studio | Surface Book`),
  gigabyte: names(
    `Aorus 5 | Aorus 7 | Aorus 15 | Aorus 17 | Aero 14 | Aero 15 | Aero 16 | G5 | G6 | G7 | A5 | A7`,
  ),
  razer: names(
    `Blade 14 | Blade 15 | Blade 16 | Blade 17 | Blade 18 | Blade Stealth | Blade Pro | Blade Advanced`,
  ),
  lg: names(
    `Gram 13 | Gram 14 | Gram 15 | Gram 16 | Gram 17 | Gram SuperSlim | Gram 2-in-1 | UltraGear | UltraPC`,
  ),
  toshiba: names(`Satellite | Satellite Pro | Portégé | Tecra | Qosmio | Kirabook | Dynabook`),
  sony: names(
    `Vaio S | Vaio Z | Vaio E | Vaio F | Vaio Y | Vaio T | Vaio P | Vaio Duo | Vaio Fit | Vaio Pro | Vaio SX | Vaio Flip`,
  ),
  fujitsu: names(
    `Lifebook A | Lifebook E | Lifebook S | Lifebook U | Lifebook T | Lifebook P | Celsius | Stylistic`,
  ),
  chuwi: names(`HeroBook | GemiBook | CoreBook | LarkBook | AeroBook | MiniBook | UBook`),
  infinix: names(
    `INBook X1 | INBook X2 | INBook X3 | INBook Y1 | INBook Y2 | INBook Y3 | Zerobook`,
  ),
  panasonic: names(`Toughbook | Let's note`),
};

export const WATCH_MODELS: Readonly<Record<string, readonly string[]>> = {
  apple: names(
    `Apple Watch Ultra 2 | Apple Watch Ultra | Apple Watch Series 10 | Apple Watch Series 9 | Apple Watch Series 8 | Apple Watch Series 7 | Apple Watch Series 6 | Apple Watch Series 5 | Apple Watch Series 4 | Apple Watch Series 3 | Apple Watch Series 2 | Apple Watch Series 1 | Apple Watch SE`,
  ),
  samsung: names(
    `Galaxy Watch Ultra | Galaxy Watch 7 | Galaxy Watch 6 Classic | Galaxy Watch 6 | Galaxy Watch 5 Pro | Galaxy Watch 5 | Galaxy Watch 4 Classic | Galaxy Watch 4 | Galaxy Watch 3 | Galaxy Watch Active 2 | Galaxy Watch Active | Galaxy Watch | Gear S3 | Gear S2 | Gear S | Gear Sport | Gear Fit2 Pro | Gear Fit2 | Gear Fit | Galaxy Fit3 | Galaxy Fit2 | Galaxy Fit`,
  ),
  huawei: names(
    `Watch GT 5 Pro | Watch GT 5 | Watch GT 4 | Watch GT 3 Pro | Watch GT 3 | Watch GT 2 Pro | Watch GT 2e | Watch GT 2 | Watch GT Runner | Watch GT Cyber | Watch 4 Pro | Watch 4 | Watch 3 Pro | Watch 3 | Watch Fit 3 | Watch Fit 2 | Watch Fit | Watch D | Watch Ultimate | Band 9 | Band 8 | Band 7 | Band 6 | Band 4 Pro | Band 3 Pro`,
  ),
  xiaomi: names(
    `Watch S4 | Watch S3 | Watch S1 Pro | Watch S1 Active | Watch S1 | Watch 2 Pro | Watch 2 | Watch Color 2 | Mi Watch | Mi Watch Lite | Smart Band 9 | Smart Band 8 Pro | Smart Band 8 | Smart Band 7 Pro | Smart Band 7 | Mi Band 6 | Mi Band 5 | Mi Band 4 | Mi Band 3 | Mi Band 2`,
  ),
  redmi: names(
    `Redmi Watch 5 | Redmi Watch 4 | Redmi Watch 3 | Redmi Watch 2 | Redmi Smart Band 2`,
  ),
  honor: names(
    `Watch GS 3 | Watch GS 4 | Watch GS Pro | Watch 4 Pro | Band 9 | Band 7 | Band 6 | Band 5 | Magic Watch 2`,
  ),
  amazfit: names(
    `GTR 4 | GTR 3 Pro | GTR 3 | GTR 2 | GTR 2e | GTR | GTS 4 | GTS 4 Mini | GTS 3 | GTS 2 Mini | GTS 2 | GTS | Bip 5 | Bip 3 Pro | Bip 3 | Bip U Pro | Bip U | Bip S | Bip | T-Rex 3 | T-Rex 2 | T-Rex Pro | T-Rex | Active | Active Edge | Balance | Cheetah | Cheetah Pro | Falcon | Band 7 | Band 5 | Verge Lite | Verge | Pace | Stratos | Neo`,
  ),
  garmin: names(
    `Fenix 8 | Fenix 7 | Fenix 7X | Fenix 7S | Fenix 6 | Fenix 6X | Fenix 6S | Fenix 5 | Fenix 5X | Fenix 5S | Fenix 3 | Forerunner 970 | Forerunner 965 | Forerunner 955 | Forerunner 945 | Forerunner 935 | Forerunner 570 | Forerunner 265 | Forerunner 255 | Forerunner 245 | Forerunner 235 | Forerunner 165 | Forerunner 55 | Forerunner 45 | Forerunner 35 | Forerunner 30 | Venu 3 | Venu 2 Plus | Venu 2 | Venu | Venu Sq 2 | Venu Sq | Vivoactive 5 | Vivoactive 4 | Vivoactive 3 | Vivosmart 5 | Vivosmart 4 | Vivosmart 3 | Vivomove HR | Vivomove Sport | Vivomove 3 | Instinct 3 | Instinct 2 | Instinct | Lily 2 | Lily | Epix Pro | Epix | Enduro 3 | Enduro 2 | Enduro | Tactix 7 | Tactix Delta | MARQ | Descent Mk3 | Descent Mk2 | Quatix 7 | Quatix 6 | Approach S70 | Approach S62 | Approach S60 | Approach S42 | Approach S12 | Swim 2`,
  ),
  fitbit: names(
    `Versa 4 | Versa 3 | Versa 2 | Versa Lite | Versa | Sense 2 | Sense | Charge 6 | Charge 5 | Charge 4 | Charge 3 | Charge 2 | Inspire 3 | Inspire 2 | Inspire HR | Ionic | Luxe | Alta HR | Alta | Blaze | Flex 2 | Surge`,
  ),
  google: names(`Pixel Watch 3 | Pixel Watch 2 | Pixel Watch`),
  polar: names(
    `Vantage V3 | Vantage V2 | Vantage V | Vantage M2 | Vantage M | Grit X2 Pro | Grit X Pro | Grit X | Pacer Pro | Pacer | Ignite 3 | Ignite 2 | Ignite | Unite`,
  ),
  suunto: names(
    `9 Peak Pro | 9 Peak | 9 | 7 | 5 Peak | 5 | 3 | Race | Vertical | Ambit 3 | Core | Traverse | Spartan`,
  ),
  coros: names(
    `Pace 3 | Pace 2 | Apex 2 Pro | Apex 2 | Apex Pro | Apex | Vertix 2 | Vertix | Dura`,
  ),
};

/** Камеры, объективы-«линейки» не ведутся: объектив — текстом. Дроны и экшн-камеры — здесь же. */
export const PHOTO_MODELS: Readonly<Record<string, readonly string[]>> = {
  canon: names(
    `EOS R1 | EOS R3 | EOS R5 C | EOS R5 | EOS R6 Mark II | EOS R6 | EOS R7 | EOS R8 | EOS R10 | EOS R50 | EOS R100 | EOS RP | EOS R | EOS 1D X Mark III | EOS 1D X Mark II | EOS 1D X | EOS 5D Mark IV | EOS 5D Mark III | EOS 5D Mark II | EOS 5D | EOS 5DS R | EOS 5DS | EOS 6D Mark II | EOS 6D | EOS 7D Mark II | EOS 7D | EOS 90D | EOS 80D | EOS 77D | EOS 70D | EOS 60D | EOS 50D | EOS 40D | EOS 30D | EOS 20D | EOS 10D | EOS 850D | EOS 800D | EOS 750D | EOS 700D | EOS 650D | EOS 600D | EOS 550D | EOS 500D | EOS 450D | EOS 400D | EOS 350D | EOS 300D | EOS 250D | EOS 200D | EOS 2000D | EOS 1500D | EOS 1300D | EOS 1200D | EOS 1100D | EOS 1000D | EOS M50 Mark II | EOS M50 | EOS M200 | EOS M100 | EOS M10 | EOS M6 Mark II | EOS M6 | EOS M5 | EOS M3 | EOS M2 | EOS M | PowerShot G7 X Mark III | PowerShot G7 X Mark II | PowerShot G7 X | PowerShot G9 X Mark II | PowerShot G9 X | PowerShot G5 X Mark II | PowerShot G5 X | PowerShot G1 X Mark III | PowerShot G1 X Mark II | PowerShot SX740 HS | PowerShot SX70 HS | PowerShot SX60 HS | PowerShot SX530 HS | PowerShot SX430 IS | PowerShot SX420 IS | PowerShot SX620 HS | PowerShot ELPH | IXUS | Cinema EOS C70 | Cinema EOS C300 | Cinema EOS C200 | XA55 | XF605 | EOS 100D | EOS 760D | EOS 4000D | EOS 60Da | EOS 20Da | EOS R5 Mark II | EOS R6 Mark III | EOS R50 V | EOS 1D C | EOS 1D Mark IV | EOS 1D Mark III | EOS 1D Mark II | EOS 1Ds Mark III | EOS 1Ds Mark II | EOS D60 | EOS D30 | EOS 1N | EOS 3`,
  ),
  nikon: names(
    `D6 | D5 | D4s | D4 | D3s | D3x | D3 | D850 | D810 | D800E | D800 | D780 | D750 | D700 | D610 | D600 | D500 | D300s | D300 | D200 | D100 | D90 | D80 | D70 | D7500 | D7200 | D7100 | D7000 | D5600 | D5500 | D5300 | D5200 | D5100 | D5000 | D3500 | D3400 | D3300 | D3200 | D3100 | D3000 | Z f | Z fc | Z30 | Z50 | Z50 II | Z5 | Z6 III | Z6 II | Z6 | Z7 II | Z7 | Z8 | Z9 | Coolpix P1000 | Coolpix P950 | Coolpix P900 | Coolpix P610 | Coolpix B500 | Coolpix A1000 | Coolpix W300 | Coolpix S9900 | Coolpix S7000 | Coolpix A | Nikon 1 J5 | Nikon 1 V3 | Df`,
  ),
  sony: names(
    `a1 II | a1 | a9 III | a9 II | a9 | a7 V | a7 IV | a7 III | a7 II | a7 | a7C II | a7C R | a7C | a7R V | a7R IV | a7R III | a7R II | a7R | a7S III | a7S II | a7S | a6700 | a6600 | a6500 | a6400 | a6300 | a6100 | a6000 | a5100 | a5000 | a3500 | a3000 | ZV-E10 II | ZV-E10 | ZV-E1 | ZV-1 II | ZV-1 | FX3 | FX30 | FX6 | FX9 | NEX-7 | NEX-6 | NEX-5 | NEX-3 | A99 II | A99 | A77 II | A77 | A68 | A65 | A58 | A57 | A55 | A37 | A35 | A33 | A900 | A850 | A700 | A580 | A560 | A550 | A500 | A390 | A350 | A330 | A300 | A230 | A200 | A100 | RX100 VII | RX100 VI | RX100 V | RX100 IV | RX100 III | RX100 II | RX100 | RX10 IV | RX10 III | RX10 II | RX10 | RX1R II | RX1 | RX0 II | RX0 | HX400V | HX350 | HX99 | HDR-CX405 | FDR-AX700 | FDR-AX53 | PXW-Z190`,
  ),
  fujifilm: names(
    `X-T5 | X-T4 | X-T3 | X-T2 | X-T1 | X-T30 II | X-T30 | X-T20 | X-T10 | X-H2S | X-H2 | X-H1 | X-Pro3 | X-Pro2 | X-Pro1 | X-E4 | X-E3 | X-E2S | X-E2 | X-E1 | X-S20 | X-S10 | X-M5 | X-M1 | X100VI | X100V | X100F | X100T | X100S | X100 | X70 | X30 | X20 | X10 | GFX100 II | GFX100S | GFX100 | GFX50S II | GFX50S | GFX50R | Instax Mini 12 | Instax Mini 11 | Instax Mini 9 | Instax Mini 8 | Instax Mini 70 | Instax Mini 90 | Instax Wide 300 | Instax Square SQ1 | Instax Square SQ6 | Instax Square SQ20 | Instax Mini Evo | Instax Link`,
  ),
  panasonic: names(
    `Lumix S5 II | Lumix S5 | Lumix S1 | Lumix S1R | Lumix S1H | Lumix GH7 | Lumix GH6 | Lumix GH5 II | Lumix GH5S | Lumix GH5 | Lumix GH4 | Lumix GH3 | Lumix G9 II | Lumix G9 | Lumix G100 | Lumix G95 | Lumix G90 | Lumix G85 | Lumix G80 | Lumix G7 | Lumix G6 | Lumix G5 | Lumix GX9 | Lumix GX85 | Lumix GX80 | Lumix GX8 | Lumix GX7 | Lumix LX100 II | Lumix LX100 | Lumix LX15 | Lumix LX10 | Lumix TZ200 | Lumix TZ100 | Lumix FZ1000 | Lumix FZ300 | Lumix FZ200 | Lumix FZ82 | Lumix GM1 | Lumix GF`,
  ),
  olympus: names(
    `OM-D E-M1 Mark III | OM-D E-M1 Mark II | OM-D E-M1 | OM-D E-M5 Mark III | OM-D E-M5 Mark II | OM-D E-M5 | OM-D E-M10 Mark IV | OM-D E-M10 Mark III | OM-D E-M10 Mark II | OM-D E-M10 | PEN E-P7 | PEN E-PL10 | PEN E-PL9 | PEN E-PL8 | PEN E-PL7 | PEN E-P5 | PEN E-P3 | Tough TG-6 | Tough TG-5 | Tough TG-4 | Tough TG-3 | Stylus 1 | E-30 | E-520 | E-510 | E-420 | E-410 | E-3 | E-1`,
  ),
  om_system: names(`OM-1 Mark II | OM-1 | OM-3 | OM-5 | OM-5 Mark II`),
  leica: names(
    `M11 | M10 | M9 | M8 | M240 | M-E | M6 | M7 | M3 | M2 | Q3 | Q2 | Q | SL3 | SL2 | SL | CL | TL2 | T | X | D-Lux | V-Lux | Sofort | IIIf`,
  ),
  pentax: names(
    `K-1 II | K-1 | K-3 III | K-3 II | K-3 | K-5 II | K-5 | K-70 | K-S2 | K-S1 | K-50 | K-30 | K-500 | K-r | K-x | K-7 | K-m | K100D | 645Z | 645D`,
  ),
  ricoh: names(`GR III | GR IIIx | GR II | GR | Theta`),
  gopro: names(
    `HERO 13 Black | HERO 12 Black | HERO 11 Black Mini | HERO 11 Black | HERO 10 Black | HERO 9 Black | HERO 8 Black | HERO 7 Black | HERO 7 Silver | HERO 7 White | HERO 6 Black | HERO 5 Black | HERO 5 Session | HERO 4 Black | HERO 4 Silver | HERO 4 Session | HERO 3 Plus | HERO 3 | HERO 2 | HERO | Max | Fusion | Session`,
  ),
  dji: names(
    `Osmo Action 5 Pro | Osmo Action 4 | Osmo Action 3 | Osmo Action | Osmo Pocket 3 | Osmo Pocket 2 | Osmo Pocket | Osmo Mobile 6 | Osmo Mobile SE | Osmo Mobile 3 | Mavic 3 Pro | Mavic 3 Classic | Mavic 3 | Mavic 2 Pro | Mavic 2 Zoom | Mavic Pro | Mavic Air 2 | Air 2S | Air 3S | Air 3 | Mavic Mini | Mini 5 Pro | Mini 4 Pro | Mini 3 Pro | Mini 3 | Mini 2 SE | Mini 2 | Mini SE | Phantom 4 Pro | Phantom 4 Advanced | Phantom 4 | Phantom 3 | Phantom 2 | Phantom | Inspire 3 | Inspire 2 | Inspire 1 | FPV | Avata 2 | Avata | Neo | Flip | Matrice 30 | Matrice 300 RTK | Matrice 350 RTK | Matrice 600 | Matrice 100 | Agras T40 | Agras T30 | Agras T20 | Agras T10 | Agras T50 | Agras T25 | Spark | Tello | RoboMaster S1 | RoboMaster EP | Ronin-S | Ronin-SC | RS 3 | RS 4`,
  ),
  insta360: names(
    `X4 | X3 | X2 | ONE X2 | ONE X | ONE RS | ONE R | ONE | Ace Pro 2 | Ace Pro | Ace | GO 3S | GO 3 | GO 2 | GO | Nano S | Air`,
  ),
};
