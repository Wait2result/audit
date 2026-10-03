import { OTHER_BRAND } from './car-brands.js';
import type { DictionaryBrand } from './electronics-brands.js';
import { names } from './names.js';

/**
 * Мототехника: мотоциклы, скутеры и мопеды, квадроциклы, снегоходы,
 * питбайки. Марка → модель, как у легковых; «тип» (спорт, эндуро, скутер,
 * квадроцикл, снегоход) остаётся отдельной характеристикой `motoType`.
 *
 * Модель — название серии («CB400 Super Four», «YZF-R6», «MT-07», «Ninja 400»),
 * без года, поколения и мелких вариантов (ABS, SE, Special). Один и тот же
 * бренд встречается и в легковых (Honda, BMW, Suzuki), но модели у него
 * здесь свои.
 */

export const MOTO_BRANDS: readonly DictionaryBrand[] = [
  { value: 'honda', label: 'Honda' },
  { value: 'yamaha', label: 'Yamaha' },
  { value: 'kawasaki', label: 'Kawasaki' },
  { value: 'suzuki', label: 'Suzuki' },
  { value: 'bmw', label: 'BMW' },
  { value: 'ktm', label: 'KTM' },
  { value: 'ducati', label: 'Ducati' },
  { value: 'harley_davidson', label: 'Harley-Davidson' },
  { value: 'triumph', label: 'Triumph' },
  { value: 'aprilia', label: 'Aprilia' },
  { value: 'husqvarna', label: 'Husqvarna' },
  { value: 'royal_enfield', label: 'Royal Enfield' },
  { value: 'benelli', label: 'Benelli' },
  { value: 'cfmoto', label: 'CFMOTO' },
  { value: 'voge', label: 'Voge' },
  { value: 'zontes', label: 'Zontes' },
  { value: 'bajaj', label: 'Bajaj' },
  { value: 'racer', label: 'Racer' },
  { value: 'motoland', label: 'Motoland' },
  { value: 'stels', label: 'Stels' },
  { value: 'irbis', label: 'Irbis' },
  { value: 'kayo', label: 'KAYO' },
  { value: 'bse', label: 'BSE' },
  { value: 'avantis', label: 'Avantis' },
  { value: 'ural', label: 'Урал' },
  { value: 'izh', label: 'ИЖ' },
  { value: 'minsk', label: 'Минск' },
  { value: 'dnepr', label: 'Днепр' },
  { value: 'vespa', label: 'Vespa' },
  { value: 'sym', label: 'SYM' },
  { value: 'kymco', label: 'Kymco' },
  { value: 'piaggio', label: 'Piaggio' },
  { value: 'gilera', label: 'Gilera' },
  { value: 'moto_guzzi', label: 'Moto Guzzi' },
  { value: 'mv_agusta', label: 'MV Agusta' },
  { value: 'indian', label: 'Indian' },
  { value: 'buell', label: 'Buell' },
  { value: 'victory', label: 'Victory' },
  { value: 'cagiva', label: 'Cagiva' },
  { value: 'bimota', label: 'Bimota' },
  { value: 'beta', label: 'Beta' },
  { value: 'gasgas', label: 'GasGas' },
  { value: 'sherco', label: 'Sherco' },
  { value: 'peugeot', label: 'Peugeot' },
  { value: 'derbi', label: 'Derbi' },
  { value: 'hyosung', label: 'Hyosung' },
  { value: 'daelim', label: 'Daelim' },
  { value: 'keeway', label: 'Keeway' },
  { value: 'qjmotor', label: 'QJMotor' },
  { value: 'loncin', label: 'Loncin' },
  { value: 'lifan', label: 'Lifan' },
  { value: 'zongshen', label: 'Zongshen' },
  { value: 'shineray', label: 'Shineray' },
  { value: 'hero', label: 'Hero' },
  { value: 'tvs', label: 'TVS' },
  { value: 'jawa', label: 'Jawa' },
  { value: 'cz', label: 'ČZ' },
  { value: 'baltmotors', label: 'Baltmotors' },
  { value: 'regulmoto', label: 'Regulmoto' },
  { value: 'polaris', label: 'Polaris' },
  { value: 'can_am', label: 'Can-Am' },
  { value: 'arctic_cat', label: 'Arctic Cat' },
  { value: 'ski_doo', label: 'Ski-Doo' },
  { value: 'lynx', label: 'Lynx' },
  { value: 'segway', label: 'Segway' },
  { value: 'hisun', label: 'Hisun' },
  { value: 'linhai', label: 'Linhai' },
  { value: 'tgb', label: 'TGB' },
  { value: 'rusmeh', label: 'Русская механика' },
  { value: OTHER_BRAND, label: 'Другая марка' },
];

/** Модели по маркам (ключ — значение марки). */
export const MOTO_MODELS: Readonly<Record<string, readonly string[]>> = {
  honda: names(`
    CB125R | CB250R | CB300R | CB400 Super Four | CB500F | CB500X | CB600F Hornet | CB650R | CB750 | CB900F Hornet | CB1000R | CB1100 | CB1300 Super Four | CBF600 | CBF1000 | CBR125R | CBR250R | CBR300R | CBR400RR | CBR500R | CBR600F | CBR600RR | CBR650R | CBR900RR | CBR929RR | CBR954RR | CBR1000RR | CBR1100XX Super Blackbird | CBX750 | X-ADV |
    Africa Twin | Transalp | Varadero | NC700X | NC750X | NC750S | NT700V Deauville | ST1100 Pan European | ST1300 Pan European | VFR400 | VFR750 | VFR800 | VFR1200F | VTR250 | VTR1000F Firestorm | RVF400 | NSR250R | NSR50 | Hornet 250 | Dominator | XR250 | XR400 | XR600 | XR650L | XL250 | XL600V Transalp | XL1000V Varadero | CRF50F | CRF110F | CRF125F | CRF150R | CRF250L | CRF250R | CRF250X | CRF300L | CRF450L | CRF450R | CRF450X | CR85R | CR125R | CR250R | CR500R |
    Rebel | Shadow | Steed | Magna | VT250 Spada | VTX1300 | VTX1800 | Valkyrie | Fury | Gold Wing | CTX700 | CTX1300 | Super Cub | Cub | Cross Cub | CT125 Hunter Cub | Dax | Monkey | Gorilla | Ape | Grom | MSX125 | Z50 |
    PCX | SH125i | SH150i | SH300i | SH Mode | Forza | Silver Wing | Integra | Vision | Dio | Tact | Today | Lead | Giorno | Zoomer | Ruckus | Jazz | Helix | Spacy | Elite | Activa | Beat | Vario | Scoopy | Biz | Joker | Stream | Gyro X | Gyro Canopy |
    TRX250 Recon | TRX300 Fourtrax | TRX350 Rancher | TRX400 Foreman | TRX420 Rancher | TRX450R | TRX500 Foreman | TRX680 Rincon | TRX90 | Pioneer 500 | Pioneer 700 | Pioneer 1000 | Talon 1000 | Big Red
  `),
  yamaha: names(`
    YZF-R1 | YZF-R3 | YZF-R6 | YZF-R7 | YZF-R25 | YZF-R125 | YZF-R15 | YZF600R Thundercat | YZF750R | YZF1000R Thunderace | FZ1 | FZ6 | FZ8 | FZ16 | FZ-S | FZ25 | FZR250 | FZR400 | FZR600 | FZR750 | FZR1000 | FZS600 Fazer | FJR1300 | FJ1100 | FJ1200 | XJ6 | XJ600 Diversion | XJ900 Diversion | XJ400 | XJ750 | XJ1100 | XJR400 | XJR1200 | XJR1300 | XSR125 | XSR155 | XSR700 | XSR900 | XS650 | MT-01 | MT-03 | MT-07 | MT-09 | MT-10 | MT-125 | MT-15 | MT-25 | Tracer 700 | Tracer 900 | Niken | VMAX | BT1100 Bulldog | TDM850 | TDM900 | TRX850 | GTS1000 | SRX400 | SRX600 | SR400 | SR500 | SRV250 | TZR250 | RD250 | RD350 | RZ250 | RZ350 | RZ500 |
    Tenere 700 | Super Tenere | XT660R | XT660Z Tenere | XT660X | XT600 | XT500 | XT400 | XT350 | XT250 | XT225 | XT125R | WR125R | WR250R | WR250X | WR250F | WR400F | WR426F | WR450F | WR200 | TT250R | TT350 | TT600 | TTR50 | TTR90 | TTR110 | TTR125 | TTR230 | TTR250 | DT125 | DT50 | DT200 | DT230 | DT250 | TW125 | TW200 | TW225 | Serow 225 | Serow 250 | YZ65 | YZ85 | YZ125 | YZ250 | YZ250F | YZ250FX | YZ450F | YZ450FX | PW50 | PW80 | IT125 | IT175 | IT250 |
    Drag Star 250 | Drag Star 400 | Drag Star 650 | Drag Star 1100 | Midnight Star | Virago XV125 | Virago XV250 | Virago XV400 | Virago XV535 | Virago XV750 | Virago XV1100 | Road Star | Royal Star | Star Venture | Stryker | Bolt | Raider | Wild Star | Roadliner | Stratoliner | Dragstar Classic | Maxim | YBR125 | YBR250 |
    XMAX | TMAX | NMAX | Aerox | Neo's | Majesty | Cygnus | Jog | Axis | BWs | Zuma | C3 | Vino | Vity | Gear | Grand Majesty | Tricity | D'elight | Fazzio | Fascino | Ray ZR | Mio | Nouvo | Mate | Jupiter | Vega | Sirius | Exciter | Lexam | Mint | Passol | Champ | Zest | Giggle | Riva | Salient |
    Grizzly 350 | Grizzly 450 | Grizzly 550 | Grizzly 600 | Grizzly 660 | Grizzly 700 | Kodiak 400 | Kodiak 450 | Kodiak 700 | Big Bear 350 | Big Bear 400 | Bruin 250 | Bruin 350 | Wolverine 350 | Wolverine 450 | Wolverine X2 | Wolverine X4 | Wolverine RMAX | Raptor 50 | Raptor 90 | Raptor 250 | Raptor 350 | Raptor 660 | Raptor 700 | YFZ450 | YFZ450R | Banshee | Blaster | Warrior 350 | Timberwolf | Rhino 450 | Rhino 660 | Rhino 700 | Viking | YXZ1000R |
    VK540 | VK Professional | Venture | Nytro | Apex | Phazer | Vector | Viper | RS Venture | RS Vector | Bravo | Excel III | Enticer | ET410 | SRViper | Mountain Max | Sidewinder | SX Viper
  `),
  kawasaki: names(`
    Ninja 250R | Ninja 300 | Ninja 400 | Ninja 500R | Ninja 650 | Ninja 1000 | Ninja 1000SX | Ninja ZX-4R | Ninja ZX-6R | Ninja ZX-7R | Ninja ZX-9R | Ninja ZX-10R | Ninja ZX-12R | Ninja ZX-14R | Ninja ZX-25R | Ninja H2 | Ninja H2 SX | Ninja H2R | ZXR400 | ZXR750 | ZZR250 | ZZR400 | ZZR600 | ZZR1100 | ZZR1200 | ZZR1400 | GPZ400 | GPZ500S | GPZ600R | GPZ750 | GPZ900R | GPZ1000RX | GPZ1100 | GPX250R | GPX400R | GPX600R | GPX750R |
    Z125 | Z250 | Z300 | Z400 | Z650 | Z650RS | Z750 | Z800 | Z900 | Z900RS | Z1000 | Z1000SX | Z H2 | Zephyr 400 | Zephyr 550 | Zephyr 750 | Zephyr 1100 | ZRX400 | ZRX1100 | ZRX1200 | ZR-7 | ER-5 | ER-6n | ER-6f | W650 | W800 | W175 | Estrella | Eliminator | KR-1 |
    Versys 250 | Versys 300 | Versys 650 | Versys 1000 | Versys-X 300 | KLE250 | KLE400 | KLE500 | KLE650 | KLR250 | KLR600 | KLR650 | KLX110 | KLX125 | KLX140 | KLX150 | KLX230 | KLX250 | KLX300 | KLX450R | KLX650 | KDX125 | KDX200 | KDX220 | KDX250 | KX65 | KX85 | KX100 | KX125 | KX250 | KX250F | KX450 | KX450F | KX500 | D-Tracker | Super Sherpa | KSR110 | KMX125 |
    Vulcan S | Vulcan 400 | Vulcan 500 | Vulcan 650 | Vulcan 750 | Vulcan 800 | Vulcan 900 | Vulcan 1500 | Vulcan 1600 | Vulcan 1700 | Vulcan 2000 | Concours | Voyager | Mean Streak |
    Brute Force 300 | Brute Force 650 | Brute Force 750 | Prairie 300 | Prairie 360 | Prairie 400 | Prairie 650 | Prairie 700 | Bayou 220 | Bayou 250 | Bayou 300 | Bayou 400 | Mojave 250 | Lakota 300 | KFX 50 | KFX 80 | KFX 90 | KFX 400 | KFX 450R | KFX 700 | KLT 110 | KLT 185 | KLT 200 | KLT 250 | Teryx | Teryx KRX 1000 | Mule
  `),
  suzuki: names(`
    GSX-R125 | GSX-R250 | GSX-R400 | GSX-R600 | GSX-R750 | GSX-R1000 | GSX-R1100 | GSX-S125 | GSX-S750 | GSX-S950 | GSX-S1000 | GSX-S1000GT | GSX-8R | GSX-8S | GSX-8T | GSX1300R Hayabusa | GSX1400 | GSX1100F | GSX750F | GSX600F | GSX400 | GSX250 | Katana | GS500 | GS500F | GS650 | GS750 | GS1000 | GSF250 Bandit | GSF400 Bandit | GSF600 Bandit | GSF650 Bandit | GSF1200 Bandit | GSF1250 Bandit | GSR400 | GSR600 | GSR750 | Inazuma | Gladius | SV650 | SV1000 | TL1000R | TL1000S | RF400 | RF600 | RF900 | RG250 Gamma | RGV250 Gamma | B-King | GN125 | GN250 | GN400 | GZ125 | GZ250 Marauder | Marauder | VanVan 125 | VanVan 200 | Volty | TU250 | ST250 | Grasstracker |
    Burgman 125 | Burgman 200 | Burgman 250 | Burgman 400 | Burgman 650 | Skywave | Address 50 | Address 110 | Address 125 | Address V50 | Address V100 | Address V125 | Let's | Sepia | Hi | Zillion | Gixxer 150 | Gixxer 250 | Access 125 | Avenis 125 | Intruder 125 | Intruder 400 | Intruder 800 | Intruder 1400 | Intruder 1800 | Boulevard C50 | Boulevard C90 | Boulevard M50 | Boulevard M90 | Boulevard M109R | Boulevard S40 | Boulevard S50 | Savage | Madura | Cavalcade | Desperado |
    V-Strom 250 | V-Strom 650 | V-Strom 800 | V-Strom 800DE | V-Strom 1000 | V-Strom 1050 | DR125 | DR200 | DR250 | DR350 | DR400 | DR600 | DR650 | DR-Z70 | DR-Z110 | DR-Z125 | DR-Z250 | DR-Z400 | Djebel | RM65 | RM85 | RM100 | RM125 | RM250 | RM-Z250 | RM-Z450 | RMX250 | RMX450Z | TS125 | TS185 | TS200 | TS250 | PE175 | PE250 | PE400 | XF650 Freewind |
    LT-A400 Eiger | LT-A450X KingQuad | LT-A500X KingQuad | LT-A700X KingQuad | LT-A750X KingQuad | LT-F250 Ozark | LT-F300 | LT-F400 Eiger | LT-F500 Vinson | LT-F160 | LT-R450 | LT-Z50 | LT-Z90 | LT-Z250 | LT-Z400 | LT230 | LT250R | Quadsport | Quadracer | Quadrunner | Vinson | Eiger | KingQuad
  `),
  bmw: names(`
    R1250GS | R1250GS Adventure | R1300GS | R1200GS | R1200GS Adventure | R1150GS | R1150GS Adventure | R1100GS | R850GS | R80GS | R100GS | R1250R | R1250RS | R1250RT | R1300R | R1300RS | R1300RT | R1200R | R1200RS | R1200RT | R1200S | R1200ST | R1200C | R1150R | R1150RS | R1150RT | R1100R | R1100RS | R1100RT | R1100S | R850R | R850RT | R100 | R100RS | R100RT | R100S | R80 | R80RT | R65 | R nineT | R18 | R12 | R12 nineT | S1000R | S1000RR | S1000XR | M1000R | M1000RR | M1000XR | K1 | K75 | K100 | K1100LT | K1100RS | K1200GT | K1200LT | K1200R | K1200RS | K1200S | K1300GT | K1300R | K1300S | K1600B | K1600GT | K1600GTL | F650 | F650GS | F650CS | F650ST | F700GS | F750GS | F800GS | F800GS Adventure | F800GT | F800R | F800S | F800ST | F850GS | F850GS Adventure | F900GS | F900R | F900XR | G310GS | G310R | G650GS | G650X | C1 | C400GT | C400X | C600 Sport | C650GT | C650 Sport | CE 02 | CE 04 | HP2 Enduro | HP2 Megamoto | HP2 Sport | HP4 
  `),
  ktm: names(`
    125 Duke | 200 Duke | 250 Duke | 390 Duke | 690 Duke | 790 Duke | 890 Duke | 990 Duke | 1290 Super Duke R | 1290 Super Duke GT | 1390 Super Duke R | 390 Adventure | 790 Adventure | 890 Adventure | 990 Adventure | 1050 Adventure | 1090 Adventure | 1190 Adventure | 1290 Super Adventure | 950 Adventure | 640 Adventure | 690 SMC | 690 SMC R | 690 Enduro | 690 Enduro R | 640 Duke | 640 LC4 | 620 Duke | 950 Supermoto | 990 Supermoto | 990 SMR | 990 SMT | 1190 RC8 | RC 125 | RC 200 | RC 390 | Freeride 250 F | Freeride 250 R | Freeride 350 | Freeride E-XC | X-Bow |
    50 SX | 65 SX | 85 SX | 105 SX | 125 SX | 150 SX | 250 SX | 250 SX-F | 350 SX-F | 450 SX-F | 125 EXC | 150 EXC | 200 EXC | 250 EXC | 250 EXC-F | 300 EXC | 300 EXC TPI | 350 EXC-F | 400 EXC | 450 EXC | 450 EXC-F | 500 EXC | 500 EXC-F | 530 EXC | 125 XC-W | 150 XC-W | 250 XC-W | 300 XC-W | 250 XCF-W | 350 XCF-W | 450 XCF-W | 450 Rally | 450 SMR | 525 EXC | 525 SX
  `),
  ducati: names(`
    Monster | Monster 400 | Monster 600 | Monster 620 | Monster 695 | Monster 696 | Monster 796 | Monster 821 | Monster 900 | Monster 937 | Monster 1100 | Monster 1200 | Monster S4 | Monster S4R | Panigale V2 | Panigale V4 | Panigale 899 | Panigale 959 | Panigale 1199 | Panigale 1299 | 848 | 1098 | 1198 | 749 | 999 | 996 | 916 | 888 | 851 | 750 SS | 900 SS | 750 F1 | Paso | SuperSport | Streetfighter | Streetfighter V2 | Streetfighter V4 | Multistrada 620 | Multistrada 950 | Multistrada 1000 DS | Multistrada 1100 | Multistrada 1200 | Multistrada 1260 | Multistrada V2 | Multistrada V4 | Hypermotard | Hypermotard 796 | Hypermotard 821 | Hypermotard 939 | Hypermotard 950 | Hypermotard 1100 | Hyperstrada | Scrambler | Scrambler Icon | Scrambler Classic | Scrambler Full Throttle | Scrambler Urban Enduro | Scrambler Desert Sled | Scrambler Café Racer | Scrambler 800 | Scrambler 1100 | Scrambler Sixty2 | Diavel | XDiavel | DesertX | Desmosedici | GT 1000 | Sport 1000 | Sport Classic | Paul Smart 1000 | MH900e | ST2 | ST3 | ST4 | Elefant 900 | Indiana | Cucciolo
  `),
  harley_davidson: names(`
    Sportster 883 | Sportster 1200 | Sportster S | Nightster | Iron 883 | Forty-Eight | Seventy-Two | SuperLow | Roadster | Street 500 | Street 750 | Street Rod | Dyna Super Glide | Dyna Street Bob | Dyna Low Rider | Dyna Fat Bob | Dyna Wide Glide | Softail Deluxe | Softail Fat Boy | Softail Heritage Classic | Softail Slim | Softail Breakout | Softail Standard | Softail Springer | Softail Deuce | Softail Night Train | Softail Cross Bones | Fat Bob | Fat Boy | Heritage Classic | Breakout | Street Bob | Low Rider | Low Rider S | Sport Glide | Road King | Road Glide | Street Glide | Electra Glide | Ultra Limited | Tri Glide | Freewheeler | CVO Road Glide | CVO Street Glide | CVO Limited | V-Rod | Night Rod | Pan America | LiveWire | Super Glide | Wide Glide | FXR
  `),
  triumph: names(`
    Bonneville | Bonneville T100 | Bonneville T120 | Bonneville Bobber | Bonneville Speedmaster | Bonneville America | Scrambler | Scrambler 900 | Scrambler 1200 | Thruxton | Thruxton R | Street Twin | Street Cup | Street Scrambler | Speed Twin | Speed Twin 900 | Speed Twin 1200 | Speed Triple | Speed Triple RS | Speed Triple 1200 RS | Street Triple | Street Triple R | Street Triple RS | Trident 660 | Trident 900 | Tiger 800 | Tiger 900 | Tiger 1050 | Tiger 1200 | Tiger 850 Sport | Tiger Sport 660 | Tiger Explorer | Tiger 955i | Daytona 600 | Daytona 650 | Daytona 675 | Daytona 750 | Daytona 955i | Sprint ST | Sprint RS | Sprint GT | Rocket III | Rocket 3 | Rocket X | Thunderbird | Thunderbird Storm | Thunderbird LT | Adventurer | Legend | Trophy | TT600 | T595 | T509 | Speedmaster | Speed 400 | Scrambler 400 X | Speed T4 | Scrambler 400 XC
  `),
  aprilia: names(`
    RSV4 | RSV Mille | RSV1000 | RS 125 | RS 250 | RS 660 | RS4 125 | Tuono V4 | Tuono 1000 | Tuono 660 | Shiver 750 | Shiver 900 | Dorsoduro 750 | Dorsoduro 900 | Dorsoduro 1200 | Caponord 1000 | Caponord 1200 | Pegaso 650 | Tuareg 660 | SXV 450 | SXV 550 | RXV 450 | RXV 550 | MX 125 | RX 125 | SX 125 | Mana 850 | Atlantic 125 | Atlantic 200 | Atlantic 300 | Atlantic 500 | Scarabeo 50 | Scarabeo 100 | Scarabeo 125 | Scarabeo 200 | Scarabeo 300 | Scarabeo 500 | SR 50 | SR 125 | SR GT 200 | SR Max 300 | SportCity One | SportCity Cube | Leonardo 125 | Leonardo 150 | Leonardo 250 | Leonardo 300 | Sonic 50 | Gulliver 50 | Habana | Amico | Area 51 | Extrema | Red Rose | Climber | Chesterfield | Classic 125
  `),
  husqvarna: names(`
    TE 125 | TE 150 | TE 250 | TE 300 | TE 310 | TE 450 | TE 510 | TE 570 | TE 610 | FE 250 | FE 350 | FE 450 | FE 501 | TC 85 | TC 125 | TC 250 | FC 250 | FC 350 | FC 450 | TX 125 | TX 300 | FX 350 | FX 450 | WR 125 | WR 250 | WR 300 | CR 125 | SM 125 | SM 450 R | SM 510 R | SM 610 | TC 50 | TC 65 | Svartpilen 125 | Svartpilen 200 | Svartpilen 250 | Svartpilen 401 | Svartpilen 701 | Vitpilen 125 | Vitpilen 250 | Vitpilen 401 | Vitpilen 701 | Norden 901 | Nuda 900 | Nuda 900 R | Nuda 1200 | Strada 650 | TR 650 Terra | SMS 125 | SMS 4 | SMR 450 | SMR 510 | Hakkapeliitta
  `),
  royal_enfield: names(`
    Bullet 350 | Bullet 500 | Classic 350 | Classic 500 | Classic 650 | Thunderbird 350 | Thunderbird 500 | Meteor 350 | Hunter 350 | Himalayan | Scram 411 | Interceptor 650 | Continental GT 650 | Continental GT 535 | Super Meteor 650 | Shotgun 650 | Bear 650 | Guerrilla 450 | Electra | Machismo
  `),
  benelli: names(`
    TNT 125 | TNT 135 | TNT 15 | TNT 25 | TNT 300 | TNT 600 | TNT 899 | TNT 1130 | TRK 251 | TRK 502 | TRK 502 X | TRK 702 | TRK 702 X | TRK 800 | Leoncino 250 | Leoncino 500 | Leoncino 800 | Leoncino Trail | 302 R | 502 C | 752 S | BN 125 | BN 251 | BN 302 | BN 600 | Imperiale 400 | Imperiale 530 | Tornado 900 | Zafferano 250 | Velvet 250 | Velvet 400 | Pepe 50
  `),
  cfmoto: names(`
    150NK | 250NK | 250SR | 300NK | 300SR | 400NK | 400GT | 450SR | 450MT | 650NK | 650MT | 650GT | 700CL-X | 800MT | 800NK | 1250TR-G | Papio | CForce 400 | CForce 450 | CForce 520 | CForce 550 | CForce 600 | CForce 625 | CForce 800 | CForce 850 | CForce 1000 | UForce 600 | UForce 800 | UForce 1000 | ZForce 500 | ZForce 800 | ZForce 950 | ZForce 1000 | Terralander 800
  `),
  voge: names(`
    300R | 300AC | 300DS | 300 Rally | 500R | 500AC | 500DS | 500DSX | 525R | 525DSX | 525ACX | 650DS | 650DSX | 900DSX | Valico 525 DSX | SR4 | SR4 Max | Sialla 500 D
  `),
  zontes: names(`
    125 U | 125 G1 | 155 U | 250 S | 310 R | 310 T | 310 V | 310 X | 350 D | 350 E | 350 T | 703 F
  `),
  bajaj: names(`
    Pulsar 125 | Pulsar 150 | Pulsar 180 | Pulsar 200 | Pulsar 220 | Pulsar NS125 | Pulsar NS160 | Pulsar NS200 | Pulsar N160 | Pulsar N250 | Pulsar RS200 | Pulsar F250 | Avenger 150 | Avenger 160 | Avenger 180 | Avenger 220 | Avenger Street 160 | Dominar 250 | Dominar 400 | Discover 100 | Discover 110 | Discover 125 | Discover 150 | Platina 100 | Platina 110 | CT100 | CT110 | Boxer 150 | V12 | V15 | Chetak
  `),
  stels: names(`
    Guepard | Leopard | Hammer | Viking | ATV 300B | ATV 500 GT | Flex 250 | Dingo
  `),
  irbis: names(`
    TTR 125 | TTR 140 | TTR 250 | XR250 | Garpia
  `),
  kayo: names(`
    K1 | K2 | K6 | T2 | T4 | T6
  `),
  ural: names(`
    М-72 | М-61 | М-62 | М-63 | М-67 | ИМЗ-8.103 | Gear-Up | Patrol | Ranger | Tourist | Sahara | Wolf | Retro | cT | sT | Solo ST
  `),
  izh: names(`
    Планета | Планета-2 | Планета-3 | Планета-4 | Планета-5 | Планета-Спорт | Юпитер | Юпитер-2 | Юпитер-3 | Юпитер-4 | Юпитер-5 | ИЖ-49 | ИЖ-56 | ИЖ-350
  `),
  minsk: names(`
    Минск 125 | Минск 250 | Минск D4 125
  `),
  dnepr: names(`
    МТ-9 | МТ-10 | МТ-11 | МТ-12 | МТ-16 | К-650 | К-750
  `),
  vespa: names(`
    Primavera | Sprint | GTS | GTV | LX | S | ET2 | ET4 | PX | PK | 946 | Sei Giorni | Elettrica | 50 Special
  `),
  sym: names(`
    Symphony | Jet 4 | Jet 14 | Joyride | Fiddle | Orbit | Mio | Cruisym | Maxsym | Citycom | Crox | Husky | Allo | Mask | Fighter | Wolf
  `),
  kymco: names(`
    Agility | Agility City | Like | People | People S | People GT | Downtown | Xciting | Super 8 | Spacer | Grand Dink | Movie | Filly | Vitality | Dink | Yager | Venox | Zing | K-Pipe | Quannon | MXU 300 | MXU 500 | MXU 700 | UXV 500 | UXV 700
  `),
  piaggio: names(`
    Liberty | Zip | Typhoon | Fly | Beverly | MP3 | X7 | X8 | X9 | X10 | X-Evo | Medley | Carnaby | NRG | Free | Sfera | Hexagon | Skipper | Ciao | Si | Boxer | Bravo | Grillo
  `),
  gilera: names(`
    Runner | Nexus | DNA | Stalker | Typhoon | Fuoco | GP 800 | Citta | Eaglet | Easy Moving | Ice | SP01 | Saturno | Coguar | Nordwest
  `),
  moto_guzzi: names(`
    V7 | V9 | V85 TT | V85 | California | Griso | Stelvio | Norge | Breva | Bellagio | Nevada | Stone | Audace | Eldorado | MGX-21 | Le Mans | V11 | V10 Centauro | Sport 1100 | Daytona | Quota | Mille GT | Targa | Falcone | Centauro | 1000 SP | T3 | Cafe Classic
  `),
  mv_agusta: names(`
    F4 | F3 | Brutale | Dragster | Rush | Turismo Veloce | Stradale | Superveloce | Enduro Veloce | F4 RR | Brutale 800 | Brutale 1000 | Brutale 1090 | F3 675 | F3 800 | Rivale | Lucky Explorer
  `),
  indian: names(`
    Scout | Scout Bobber | Scout Rogue | Chief | Chief Classic | Chief Dark Horse | Chief Vintage | Chieftain | Roadmaster | Springfield | Challenger | FTR 1200 | FTR | Pursuit | Four | Chief Bobber | Sport Chief | Super Chief | 101 Scout
  `),
  buell: names(`
    Blast | Firebolt XB9R | Firebolt XB12R | Lightning XB9S | Lightning XB12S | Ulysses XB12X | Ulysses XB12XT | Cyclone M2 | Thunderbolt S1 | Lightning S1 | Tomahawk | 1125R | 1125CR | RR1000 | RR1200
  `),
  victory: names(`
    Vegas | Kingpin | Hammer | Judge | Cross Country | Cross Roads | Vision | Gunner | High-Ball | Octane | Magnum | Boardwalk | Jackpot | Arlen Ness | Empulse
  `),
  cagiva: names(`
    Mito | Raptor | V-Raptor | Navigator | Gran Canyon | Elefant | Canyon | Planet | River | Freccia | Supercity | W16 | Blues
  `),
  bimota: names(`
    DB5 | DB6 | DB7 | DB8 | YB11 | YB6 | SB6 | SB8R | Tesi | Tesi 3D | Mantra | KB1 | V Due | Delirio | BB1 | Impeto | HB1
  `),
  beta: names(`
    RR 125 | RR 200 | RR 250 | RR 300 | RR 350 | RR 390 | RR 430 | RR 480 | Alp 4.0 | Evo 80 | Evo 125 | Evo 200 | Evo 250 | Evo 300 | Rev 3 | Xtrainer 250 | Xtrainer 300
  `),
  gasgas: names(`
    EC 125 | EC 200 | EC 250 | EC 300 | EC 250 F | EC 350 F | EC 450 F | MC 50 | MC 65 | MC 85 | MC 125 | MC 250 | MC 250 F | MC 350 F | MC 450 F | EX 250 | EX 300 | EX 250 F | EX 350 F | EX 450 F | ES 700 | TXT Pro 250 | TXT Pro 280 | TXT Pro 300 | Pampera | Halley | Contact | Trial | TXT | Wild HP | Rookie | Cross 110
  `),
  sherco: names(`
    SE 125 | SE 250 | SE 300 | SEF 250 | SEF 300 | SEF 450 | SC 250 | SC 300 | ST 250 | ST 300
  `),
  peugeot: names(`
    Django | Speedfight | Kisbee | Vivacity | Tweet | Ludix | Buxy | Trekker | Looxor | Elystar | Satelis | Metropolis | Citystar | Jet Force | Elyseo | Squab | Zenith | XPS | XR6
  `),
  derbi: names(`
    Senda | GPR | Variant | Boulevard | Atlantis | Rambla | Mulhacen | Terra | Cross City | Antarctica | GP1 | Predator | DRD
  `),
  hyosung: names(`
    GT250R | GT650R | GT125R | GT250 | GT650 | GV250 | GV650 | GV700 | GD250N | ST7 | RT125D | RX125 | Aquila 250 | Aquila 650 | Aquila Pro | Comet 250 | Comet 650 | Karion 125 | Rapier
  `),
  daelim: names(`
    Daystar | VS | VT | Roadwin | Besbi | Cordi | S1 125 | S2 125 | S3 125 | S3 250 | Citi | Citi Ace | Otello
  `),
  keeway: names(`
    Superlight 125 | Superlight 200 | Cruiser 125 | RKV 125 | RKV 200 | RKS 125 | TX 125 | TX 200 | Cityblade | Hurricane | Matrix | Focus | Outlook | Vieste | K-Light 125 | K-Light 202 | K-Light 250 | V302C
  `),
  qjmotor: names(`
    SRK 400 | SRK 600 | SRK 800 | SRV 550 | SRT 550 | SRT 800 | SRB 400
  `),
  loncin: names(`
    LX250GS | LX300GS | LX650 | DS250
  `),
  lifan: names(`
    KP200 | KPR200 | KPT200
  `),
  hero: names(`
    Splendor | Passion | Glamour | HF Deluxe | Karizma | Xtreme | Hunk | Maestro | Pleasure | Destini | Xpulse
  `),
  tvs: names(`
    Apache RTR 160 | Apache RTR 180 | Apache RTR 200 | Apache RR 310 | Jupiter | Ntorq | Star City | Sport | Victor | Raider | Ronin | Scooty | Wego | Radeon | Phoenix
  `),
  jawa: names(`
    350 | 634 | 638 | 640 | 353 | 354 | 355 | 559 | 42 | Perak
  `),
  polaris: names(`
    Sportsman 90 | Sportsman 110 | Sportsman 450 | Sportsman 500 | Sportsman 570 | Sportsman 800 | Sportsman 850 | Sportsman 1000 | Scrambler 500 | Scrambler 850 | Scrambler 1000 | RZR 170 | RZR 570 | RZR 800 | RZR 900 | RZR 1000 | RZR XP 1000 | RZR Turbo | Ranger 500 | Ranger 570 | Ranger 800 | Ranger 900 | Ranger 1000 | Ranger XP | General | Ace 150 | Ace 325 | Ace 570 | Outlaw 50 | Outlaw 110 | Outlaw 525 | Predator 50 | Predator 90 | Predator 500 | Magnum 325 | Magnum 500 | Trail Boss | Slingshot | Indy | RMK | Switchback | Assault | Rush | Titan | Voyageur | Widetrak | Pro-RMK | Axys
  `),
  can_am: names(`
    Outlander 400 | Outlander 450 | Outlander 500 | Outlander 570 | Outlander 650 | Outlander 800 | Outlander 850 | Outlander 1000 | Renegade 500 | Renegade 570 | Renegade 800 | Renegade 850 | Renegade 1000 | Maverick X3 | Maverick Sport | Maverick Trail | Maverick R | Defender | Commander | Traxter | DS 70 | DS 90 | DS 250 | Ryker | Spyder F3 | Spyder RT | Spyder RS | Spyder ST
  `),
  arctic_cat: names(`
    ZR 6000 | ZR 8000 | M 6000 | M 8000 | Riot | XF 7000 | XF 9000 | Bearcat 570 | Bearcat 7000 | Norseman | Pantera | Panther | Prowler | Wildcat | Alterra 300 | Alterra 450 | Alterra 500 | Alterra 570 | Alterra 700 | Alterra 600 | Alterra 800 | Thundercat | Cheetah | Jag | Sabercat | Firecat | T660 Touring | Havoc
  `),
  ski_doo: names(`
    Summit | Freeride | Renegade | MXZ | Grand Touring | Expedition | Skandic | Tundra | Backcountry | Legend | GSX | GTX | Mach Z | Formula | Elan | Citation | Safari | Everest
  `),
  lynx: names(`
    49 Ranger | Xtrim | Rave RE | Boondocker | Commander | Adventure | Brutal | Shredder | Yeti | Ranger | Rave | Xterrain
  `),
  rusmeh: names(`
    Буран | Тайга | Тайга Варяг | Тайга Патруль | Рысь
  `),
};
