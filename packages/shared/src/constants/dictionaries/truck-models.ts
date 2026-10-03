import { OTHER_BRAND } from './car-brands.js';
import type { DictionaryBrand } from './electronics-brands.js';
import { names } from './names.js';

/**
 * Грузовики, автобусы, прицепы и лёгкий коммерческий транспорт: марка →
 * модель. Тип (тягач, фургон, самосвал, автобус) — отдельная характеристика
 * `truckType`. Модель — индекс или название серии («5320», «Actros», «HD78»,
 * «FH»), без комплектаций и колёсных формул.
 *
 * Прицепы и полуприцепы: у них только марка (модельные ряды десятков
 * заводов слишком широки), модель — текстом.
 */

export const TRUCK_BRANDS: readonly DictionaryBrand[] = [
  { value: 'kamaz', label: 'КамАЗ' },
  { value: 'gaz', label: 'ГАЗ' },
  { value: 'maz', label: 'МАЗ' },
  { value: 'ural', label: 'Урал' },
  { value: 'zil', label: 'ЗИЛ' },
  { value: 'kraz', label: 'КрАЗ' },
  { value: 'uaz', label: 'УАЗ' },
  { value: 'lada', label: 'LADA (ВАЗ)' },
  { value: 'hyundai', label: 'Hyundai' },
  { value: 'isuzu', label: 'Isuzu' },
  { value: 'mercedes', label: 'Mercedes-Benz' },
  { value: 'man', label: 'MAN' },
  { value: 'scania', label: 'Scania' },
  { value: 'volvo', label: 'Volvo' },
  { value: 'daf', label: 'DAF' },
  { value: 'iveco', label: 'Iveco' },
  { value: 'renault', label: 'Renault' },
  { value: 'ford', label: 'Ford' },
  { value: 'fiat', label: 'Fiat' },
  { value: 'peugeot', label: 'Peugeot' },
  { value: 'citroen', label: 'Citroën' },
  { value: 'volkswagen', label: 'Volkswagen' },
  { value: 'toyota', label: 'Toyota' },
  { value: 'mitsubishi', label: 'Mitsubishi' },
  { value: 'hino', label: 'Hino' },
  { value: 'foton', label: 'Foton' },
  { value: 'faw', label: 'FAW' },
  { value: 'shacman', label: 'Shacman' },
  { value: 'howo', label: 'HOWO' },
  { value: 'sitrak', label: 'Sitrak' },
  { value: 'dongfeng', label: 'Dongfeng' },
  { value: 'jac', label: 'JAC' },
  { value: 'baw', label: 'BAW' },
  { value: 'sollers', label: 'Sollers' },
  { value: 'paz', label: 'ПАЗ' },
  { value: 'nefaz', label: 'НефАЗ' },
  { value: 'liaz', label: 'ЛиАЗ' },
  { value: 'nissan', label: 'Nissan' },
  { value: 'mazda', label: 'Mazda' },
  { value: 'kia', label: 'KIA' },
  { value: 'tatra', label: 'Tatra' },
  { value: 'ud_trucks', label: 'UD Trucks' },
  { value: 'kenworth', label: 'Kenworth' },
  { value: 'peterbilt', label: 'Peterbilt' },
  { value: 'freightliner', label: 'Freightliner' },
  { value: 'international', label: 'International' },
  { value: 'mack', label: 'Mack' },
  { value: 'western_star', label: 'Western Star' },
  { value: 'sinotruk', label: 'Sinotruk' },
  { value: 'beiben', label: 'Beiben' },
  { value: 'jmc', label: 'JMC' },
  { value: 'tonar', label: 'Тонар' },
  { value: 'schmitz_cargobull', label: 'Schmitz Cargobull' },
  { value: 'krone', label: 'Krone' },
  { value: 'kogel', label: 'Kögel' },
  { value: 'wielton', label: 'Wielton' },
  { value: 'fliegl', label: 'Fliegl' },
  { value: 'lamberet', label: 'Lamberet' },
  { value: 'grunwald', label: 'Grunwald' },
  { value: 'narko', label: 'Narko' },
  { value: 'goldhofer', label: 'Goldhofer' },
  { value: 'tirsan', label: 'Tirsan' },
  { value: OTHER_BRAND, label: 'Другая марка' },
];

export const TRUCK_MODELS: Readonly<Record<string, readonly string[]>> = {
  kamaz: names(
    `4308 | 4310 | 43114 | 43118 | 43253 | 43502 | 4326 | 4350 | 44108 | 5320 | 53212 | 53215 | 5410 | 54115 | 5460 | 5490 | 54901 | 5511 | 55111 | 6460 | 6520 | 65115 | 65116 | 65117 | 6522 | 6540 | 65201 | 65222 | 65225 | 6560 | 6580 | 65801 | 65951 | Компас | 43105 | 43106 | 43115 | 43255 | 4410 | 5325 | 53205 | 53208 | 53228 | 53229 | 5350 | 54112 | 6350 | 63501 | 65111 | 65224 | 65226 | 45141`,
  ),
  maz: names(
    `500 | 503 | 504 | 509 | 516 | 533702 | 543205 | 4370 | 4371 | 5334 | 5335 | 5336 | 5337 | 5432 | 5433 | 5434 | 5440 | 5516 | 5549 | 5551 | 6303 | 6312 | 6317 | 6422 | 6430 | 6501 | 6516 | 103 | 105 | 107 | 203 | 206 | 251 | 256 | Зубрёнок | Купава`,
  ),
  ural: names(
    `375 | 377 | 4320 | 43206 | 4420 | 44202 | 5323 | 5557 | 55571 | 6370 | 63685 | 6563 | Next | М`,
  ),
  zil: names(
    `130 | 131 | 133 | 157 | 164 | 4331 | 4333 | 4334 | 4314 | 4421 | 5301 Бычок | ММЗ-554 | ММЗ-555`,
  ),
  gaz: names(
    `51 | 52 | 53 | 63 | 66 | 3307 | 3308 Садко | 3309 | 33104 Валдай | Газон Next | Валдай Next | Садко Next | Газель | Газель Next | Газель Бизнес | Газель NN | Соболь | Соболь NN | Соболь Бизнес | 2705 | 3221 | 3302 | 33023 | 3234 | 4301`,
  ),
  kraz: names(
    `250 | 255 | 256 | 257 | 258 | 260 | 5233 | 6322 | 64431 | 6437 | 6446 | 65053 | 65055 | 6510 | 7140`,
  ),
  uaz: names(`3303 | 3741 | 3909 | 39094 | 39099 | 2206 | 3962 | 330365 | 330394 | Профи | Cargo`),
  hyundai: names(
    `Porter | Porter II | H100 | Mighty | Mighty II | HD65 | HD72 | HD78 | HD120 | HD160 | HD170 | HD250 | HD260 | HD270 | HD320 | HD370 | County | Mega Truck | Trago | Xcient | Universe | Aero Town | Aero City | Aero Express | Aero Queen | Chorus | Gold | Super Truck`,
  ),
  isuzu: names(
    `Elf | Forward | Giga | NPR | NQR | NMR | NLR | NKR | NHR | FRR | FSR | FTR | FVR | FVZ | CYZ | CXZ | EXR | Journey | Erga | Gala`,
  ),
  mercedes: names(
    `Actros | Atego | Axor | Arocs | Antos | Econic | Unimog | Zetros | Vario | LK | SK | NG | MK | Sprinter | Vito | Citaro | Tourismo | Travego | Conecto | Intouro | Integro | MB 100 | T2`,
  ),
  man: names(
    `TGA | TGS | TGX | TGL | TGM | TGE | F2000 | F90 | F8 | L2000 | M2000 | G90 | Lion's City | Lion's Coach | Lion's Regio | Lion's Intercity | NG | SD | SL`,
  ),
  scania: names(
    `P-Series | G-Series | R-Series | S-Series | L-Series | T-Series | 4-Series | 3-Series | 2-Series | 143 | 144 | 124 | 114 | 113 | 112 | 93 | 92 | Touring | Interlink | Citywide | OmniLink | OmniExpress | OmniCity`,
  ),
  volvo: names(
    `FH | FH16 | FM | FMX | FL | FE | VNL | VNR | VHD | VN | F10 | F12 | F16 | F7 | F88 | F89 | 9700 | 9900 | 7700 | 7900 | 8700 | 8900 | B7R | B9R`,
  ),
  daf: names(
    `XF | XF95 | XF105 | XF106 | XG | XG Plus | XD | XB | CF | CF65 | CF75 | CF85 | LF | LF45 | LF55 | 95 | 85 | 75 | 65 | 55 | 45 | 2800 | 3300 | 3600`,
  ),
  iveco: names(
    `Stralis | Trakker | Eurocargo | EuroTech | EuroStar | EuroTrakker | TurboStar | TurboTech | Daily | S-Way | T-Way | X-Way | Massif | Magirus | Crossway | Evadys | Urbanway | Arway | Domino`,
  ),
  renault: names(
    `Magnum | Premium | Midlum | Kerax | Midliner | Mascott | Maxity | Master | T | C | K | D | D Wide | Trafic | Major | G | R | B | Manager | Messenger`,
  ),
  ford: names(
    `Cargo | Transit | Transit Custom | F-250 | F-350 | F-450 | F-550 | F-650 | F-750 | LTL-9000 | L-8000 | Ranger | Courier | D-Series`,
  ),
  fiat: names(`Ducato | Scudo | Talento | Doblo Cargo | Fiorino | Strada | 238 | 242 | 616`),
  peugeot: names(`Boxer | Partner | Expert | Bipper | Manager | J5 | J7 | J9`),
  citroen: names(`Jumper | Jumpy | Berlingo | Nemo | Relay | C25 | C35 | HY`),
  volkswagen: names(`Crafter | LT | Transporter | Caddy | Amarok | Taro`),
  toyota: names(
    `Dyna | ToyoAce | Hiace | Town Ace | Lite Ace | Coaster | RegiusAce | Hilux | Stout | Quick Delivery | Land Cruiser 70 | Dutro`,
  ),
  mitsubishi: names(
    `Canter | Fighter | Super Great | Rosa | Aero Star | Aero Midi | Aero Queen | Aero Ace | Minicab | L200 | Delica Truck`,
  ),
  hino: names(
    `300 | 500 | 700 | Ranger | Profia | Dutro | Rainbow | Liesse | Selega | Melpha | Poncho | 195 | 238 | 268 | 338 | 358 | FC | FD | FG | GH | SH | FS | FM | FL`,
  ),
  nissan: names(
    `Atlas | Diesel | Condor | Civilian | Caravan | Cabstar | Cabstar E | NT400 | NT500 | Vanette | Homy | Clipper | NV350 | NV400 | UD`,
  ),
  mazda: names(`Titan | Bongo | Bongo Brawny | Bongo Friendee | E2000 | E2200 | Proceed | BT-50`),
  kia: names(
    `Bongo | Bongo III | Besta | Pregio | K2500 | K2700 | K3000 | K4000 | Granbird | Combi | Cosmos`,
  ),
  tatra: names(`T148 | T815 | T816 | T813 | Phoenix | Force | Jamal | T810 | T138`),
  ud_trucks: names(`Condor | Quon | Quester | Kazet | Croner | PK | PW | CK | CW | CG | CD `),
  foton: names(
    `Auman | Auman GTL | Auman TX | Auman EST | Auman ETX | Ollin | Aumark | Aumark S | Tunland | View | Gratour | Toano | Sauvana | BJ1043 | BJ1049 | BJ1069 | BJ1093 | BJ1099 | BJ1139 | BJ1165 | BJ1203`,
  ),
  faw: names(`J5 | J6 | J6P | J7 | Tiger V | CA1041 | CA1020 | CA3252 | CA4250`),
  shacman: names(
    `X3000 | X5000 | X6000 | F2000 | F3000 | F5000 | H3000 | M3000 | L3000 | SX3255 | SX3256 | SX3258 | SX3318 | SX4258 | SX4256 | SX1250`,
  ),
  howo: names(`A7 | T5G | T7H | T7 | ZZ3257 | ZZ3327 | ZZ4257 | ZZ1257`),
  sitrak: names(`C7H | G7S | T7H`),
  dongfeng: names(
    `Captain | Captain-C | Captain-T | KC | KL | KR | Duolika | Kingrun | Kinland | C120 | C230 | EQ1030 | EQ1041 | EQ1080 | EQ1090 | EQ1120 | EQ3250 | EQ4250 | DFL1250 | DFL3251 | DFL4251 | DFH4180 | DFH4251 | DFH3251`,
  ),
  jac: names(
    `N25 | N35 | N56 | N75 | N80 | N120 | N200 | N350 | X200 | X250 | X300 | X350 | K7 | K5 | Gallop | Haoka | HFC1020 | HFC1040 | HFC1061 | HFC1083 | HFC1160 | HFC3251`,
  ),
  baw: names(`Fenix | Tonik`),
  sollers: names(`Atlant | Argo | ST6 | SP | BK | Next`),
  paz: names(
    `652 | 672 | 3201 | 3205 | 3206 | 3237 | 4234 | 4230 | 32053 | 32054 | 32057 | Вектор | Вектор Next | Вектор С | Аврора`,
  ),
  nefaz: names(`5299 | 5297 | 4208 | 4209 | 5207`),
  liaz: names(`5256 | 5292 | 5293 | 6212 | 6213 | 677 | 4292 | 429260`),
  kenworth: names(
    `T680 | T880 | T800 | T660 | T600 | T370 | T270 | W900 | W990 | K100 | C500 | W900L | T700 | T2000 | Aerodyne`,
  ),
  peterbilt: names(
    `389 | 379 | 567 | 579 | 520 | 337 | 348 | 359 | 357 | 330 | 320 | 365 | 367 | 386`,
  ),
  freightliner: names(
    `Cascadia | Coronado | Columbia | Century | Classic | FLD | M2 106 | M2 112 | Argosy | Sprinter | Business Class`,
  ),
  international: names(
    `ProStar | LoneStar | 9400i | 9200i | 9900i | 8600 | 7600 | 4300 | 4400 | 4700 | 4900 | 5900i | TranStar | WorkStar | HX | HV | MV | CV | LT`,
  ),
  mack: names(
    `Anthem | Pinnacle | Granite | Titan | LR | MD | TerraPro | Vision | CHU | CX | Superliner | R-Model | RD | DM`,
  ),
};
