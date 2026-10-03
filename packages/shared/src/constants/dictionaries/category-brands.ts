import { brandsOf } from './names.js';

/**
 * Списки брендов по категориям. Один общий список на телевизоры, аудио,
 * технику и фото был бы неверным: у шин, бензопил и лодочных моторов свои
 * производители, и «Michelin» в списке холодильников — шум. Поэтому у каждой
 * категории свой список; модель там, где каталог практичен, лежит рядом
 * (`electronics-models.ts`, `moto-models.ts`, `truck-models.ts`), а там, где
 * нет (коды телевизоров и стиральных машин, электроинструмент), вводится
 * текстом — рядом с выбранным брендом.
 *
 * Значение бренда хранится в объявлениях: оно не меняется, а новые бренды
 * только добавляются. Пункт «Другой бренд» есть всегда.
 */

export const TABLET_BRANDS = brandsOf(
  `Apple | Samsung | Huawei | Xiaomi | Honor | Lenovo | Realme | OnePlus | OPPO | Google | Microsoft | Amazon | ASUS | Acer | Nokia | Sony | TCL | Teclast | Blackview | Doogee | Alldocube | Chuwi | Digma | Irbis | Prestigio | DEXP | BQ | Redmi | POCO | Vivo | Tecno | Infinix | ZTE | Alcatel`,
);

export const TV_BRANDS = brandsOf(
  `Samsung | LG | Sony | Philips | Panasonic | Sharp | Toshiba | Hisense | TCL | Xiaomi | Haier | Hyundai | BBK | Supra | DEXP | StarWind | yandex:Яндекс | Kivi | Skyworth | Polarline | Telefunken | Akai | Blaupunkt | Grundig | Thomson | JVC | Loewe | Bang & Olufsen | Vestel | Tesla | Mystery | Harper | Leff | Aceline | Novex | Hitachi | Sanyo | Funai | Daewoo | Rolsen | Doffler | Realme | Huawei | Honor | Changhong | Konka`,
);

export const AUDIO_BRANDS = brandsOf(
  `Sony | JBL | Bose | Sennheiser | Marshall | Harman Kardon | Beats | AKG | Audio-Technica | Yamaha | Denon | Marantz | Pioneer | Onkyo | Technics | Apple | Samsung | Xiaomi | Huawei | Honor | Anker | Soundcore | Edifier | Razer | HyperX | SteelSeries | Logitech | Jabra | Bowers & Wilkins | KEF | Klipsch | Polk Audio | Focal | Kenwood | Alpine | JVC | Panasonic | Philips | LG | Sonos | Shure | Rode | Behringer | Focusrite | Hertz | Rockford Fosgate | JL Audio | Pride | Kicx | DL Audio | Ground Zero | yandex:Яндекс | 1More | Nothing | OnePlus | Realme | QCY | Nakamichi | TEAC | Cambridge Audio | NAD | Rega | Tannoy | Wharfedale | DALI | Monitor Audio | Q Acoustics | Canton | Magnat | Jamo | ELAC | Genelec | Roland | Korg | Mackie | Pioneer DJ | Numark | Sven | Defender | Creative | Plantronics | Skullcandy | Fiio | Shanling | Beyerdynamic | Audeze | HiFiMan | Grado | Moondrop | Baseus | Ugreen | Haylou`,
);

export const APPLIANCE_BRANDS = brandsOf(
  `Bosch | Siemens | Samsung | LG | Beko | Indesit | Hotpoint-Ariston | Ariston | Candy | Hoover | Electrolux | AEG | Zanussi | Gorenje | Miele | Whirlpool | Hansa | Smeg | Liebherr | atlant:Атлант | biryusa:Бирюса | Haier | Hisense | Midea | Sharp | Panasonic | Toshiba | Neff | Küppersbusch | Asko | Vestel | Tefal | Philips | Redmond | Polaris | Vitek | Scarlett | Braun | Moulinex | De'Longhi | Krups | Saeco | Jura | Nespresso | Kitfort | Xiaomi | Roborock | Dreame | iRobot | Kärcher | Thomas | Bork | Zelmer | Dyson | Daikin | Mitsubishi Electric | Mitsubishi Heavy | Fujitsu | Gree | Ballu | Kentatsu | Lessar | Royal Clima | Hyundai | Aeronik | General Climate | Stinol | pozis:Позис | nord:Nord | minsk:Минск | saratov:Саратов | sibir:Сибирь | Vestfrost | Kaiser | Körting | Weissgauff | Maunfeld | Hiberg | Teka | Franke | Elikor | Krona | Cata | Zigmund & Shtain | Lex | Tesla | Supra | Maxwell | Vitesse | Bomann | Clatronic | Severin | Rowenta | Kenwood | Oursson | Gaggia | Melitta | Ecovacs | Tineco | Shark | Vorwerk | Frigidaire | Maytag | KitchenAid | Gaggenau | Fisher & Paykel | Arçelik | Grundig | Blomberg | Brandt | De Dietrich`,
);

export const PHOTO_BRANDS = brandsOf(
  `Canon | Nikon | Sony | Fujifilm | Panasonic | Olympus | OM System | Leica | Pentax | Ricoh | Sigma | Hasselblad | Kodak | Samsung | Casio | GoPro | DJI | Insta360 | Xiaomi | Yi | SJCAM | AKASO | Garmin | Blackmagic | Tamron | Tokina | Zeiss | Samyang | Yongnuo | Godox | Profoto | Nanlite | Aputure | Manfrotto | Gitzo | Benro | Joby | Polaroid | zenit:Зенит | zorki:Зоркий | fed:ФЭД | helios:Гелиос | kiev:Киев | smena:Смена | salyut:Салют | Minolta | Konica | Contax | Yashica | Mamiya | Rollei | Voigtländer | Viltrox | 7Artisans | TTArtisans | Laowa | Meike | Lowepro | Peak Design | Zhiyun | Moza | Hohem | Autel | Parrot | Yuneec | Hubsan | Syma | Holy Stone | Potensic | Hikvision | Dahua | Ezviz | Imou | Reolink`,
);

export const WATCH_BRANDS = brandsOf(
  `Apple | Samsung | Huawei | Xiaomi | Honor | Amazfit | Garmin | Fitbit | Google | Polar | Suunto | Coros | Redmi | POCO | Realme | OnePlus | OPPO | Mobvoi | Withings | Haylou | Mibro | Kieslect | IMILAB | Zepp | Fossil | Nothing | CMF | Casio | Kospet | Colmi | Elari | Geozon | Vivo | Tecno | Infinix | Itel | Lenovo | ZTE | Sony | Motorola | LG | Pebble`,
);

export const TIRE_BRANDS = brandsOf(
  `Michelin | Bridgestone | Continental | Nokian | Pirelli | Goodyear | Yokohama | Dunlop | Hankook | Kumho | Toyo | cordiant:Cordiant | kama:Кама | viatti:Viatti | belshina:Белшина | Maxxis | Nexen | Falken | Firestone | BFGoodrich | General Tire | Cooper | Gislaved | Barum | Matador | Sava | Kleber | Fulda | Uniroyal | Semperit | Vredestein | Nitto | Kenda | Federal | Giti | GT Radial | Triangle | Linglong | Sailun | Westlake | Goodride | Hifly | Aplus | Zeetex | Tracmax | Rotalla | Landsail | Habilead | Evergreen | Starmaxx | Tigar | Premiorri | Tunga | Rosava | Lassa | Petlas | Marshal | Sumitomo | Dayton | Aeolus | Doublestar | Roadstone | Delinte | Kapsen | Compasal | Ilink | Mirage | Tracmax`,
);

export const TOOL_BRANDS = brandsOf(
  `Bosch | Makita | DeWalt | Hilti | Metabo | Milwaukee | Stihl | Husqvarna | HiKOKI | Hitachi | Ryobi | Black+Decker | Einhell | interskol:Интерскол | zubr:Зубр | enkor:Энкор | kalibr:Калибр | diold:Диолд | Hammer | parma:Парма | Sturm | Patriot | Champion | Huter | Wester | resanta:Ресанта | Fubag | Echo | Gardena | Kärcher | Stiga | Al-Ko | Worx | Skil | AEG | Festool | Fein | Stanley | Dremel | Total | Hyundai | Brait | Elitech | vikhr:Вихрь | soyuz:Союз | Bort | Dexter | Matrix | Gross | Würth | Rubi | Knipex | Wera | Wiha | Bahco | Irwin | Kraftool | Stayer | Sparky | energomash:Энергомаш | ermak:Ермак | Fiskars | Greenworks | Ego | Oleo-Mac | Efco | McCulloch | Partner | Viking | MTD | Briggs & Stratton | Honda | Yamaha | Daewoo | Kipor | Geko | Kemppi | Lincoln Electric | ESAB | Telwin | Svarog | Aurora | Foxweld | Quattro Elementi | Calibre | Redverg | Defort | Ingco | Deko | Dnipro-M | Stern | Bulat | Rebir | Prorab | Zitrek | Arsenal | Mannesmann | Rothenberger | Ridgid | Ega | Wortex`,
);

export const BIKE_BRANDS = brandsOf(
  `Trek | Giant | Specialized | Cube | Merida | Stels | Forward | Format | Cannondale | Scott | GT | Author | Stark | Welt | Kellys | Orbea | Bianchi | Cervélo | Canyon | Focus | Ghost | Bulls | Haibike | Cross | Atom | Norco | Santa Cruz | Pivot | Yeti | Kona | Marin | Fuji | Felt | Raleigh | Schwinn | Mongoose | Diamondback | Electra | Brompton | Dahon | Tern | Strida | Silverback | Polygon | desna:Десна | aist:Аист | Ardis | Stinger | Navigator | Altair | Novatrack | Top Gear | Black Aqua | Jaguar | Cronus | Outleap | Shulz | Tech Team | Mikado | Pioneer | Larsen | Sitis | Vento | Kross | Romet | Unibike | Apollo | Argon 18 | BMC | Colnago | Pinarello | Ridley | Wilier | Look | Lapierre | Mondraker | Rocky Mountain | Commencal | Bergamont | Winora | Stevens | Gazelle | Batavus | Decathlon | B'twin | Rockrider | Triban | Riverside | Xiaomi | Ninebot | Kugoo | Segway | Inokim | Kaabo | Dualtron | Minimotors | Hiper | Digma | Eltreco | Volten | Kingsong | Gotway | Inmotion | Begode`,
);

export const WATER_BRANDS = brandsOf(
  `Yamaha | Mercury | Tohatsu | Suzuki | Honda | Evinrude | Johnson | Parsun | Hidea | HDX | Sea-Doo | Kawasaki | Bayliner | Sea Ray | Quicksilver | Linder | Stingray | Yamarin | Finnmaster | Silver | Bella | Brig | Zodiac | Gala | Solar | rivera:Ривьера | Wyatboat | barents:Баренц | prog:Прогресс | kazanka:Казанка | krym:Крым | ob:Обь | oka:Ока | neptun:Нептун | nerka:Нерка | bester:Бестер | Stormline | Ant | Flinc | Smarine | Orca | Admiral | Bombard | Mariner | Nissan Marine | Selva | Torqeedo | Minn Kota | Haswing | Suzumar | Sharmax | Tracker | Lund | Crestliner | Princecraft | Four Winns | Chaparral | Cobalt | Regal | Boston Whaler | Grady-White | Sunseeker | Princess | Fairline | Azimut | Ferretti | Jeanneau | Beneteau | Bavaria | Hanse | Dufour | Lagoon | Fountaine Pajot`,
);

export const SPECIAL_BRANDS = brandsOf(
  `Caterpillar | Komatsu | Hitachi | volvo_ce:Volvo CE | JCB | Hyundai | Doosan | Develon | Liebherr | Bobcat | Manitou | Kubota | John Deere | New Holland | Case | Case IH | Terex | Sany | XCMG | Zoomlion | Liugong | SDLG | Lonking | Kobelco | Sumitomo | Takeuchi | Yanmar | Wacker Neuson | Merlo | Dynapac | Bomag | Hamm | Ammann | Fiat-Hitachi | Fendt | Claas | Massey Ferguson | Deutz-Fahr | Valtra | belarus:Беларус (МТЗ) | khtz:ХТЗ | kirovets:Кировец | rostselmash:Ростсельмаш | Versatile | Challenger | AGCO | Kioti | Mahindra | Lovol | YTO | Zetor | Same | Landini | Steyr | Amazone | Lemken | Kuhn | Krone | Horsch | Väderstad | Gaspardo | Pöttinger | Bell | Hidromek | Sennebogen | Palfinger | ivanovets:Ивановец | galichanin:Галичанин | chzpt:ЧЗПТ | amkodor:Амкодор | chetra:Четра | dst_ural:ДСТ-Урал | yumz:ЮМЗ | ttz:ТТЗ | atz:АТЗ | Shantui | Dressta | Fiat Allis | Furukawa | Kato | Tadano | Grove | Manitowoc | Link-Belt | Genie | JLG | Skyjack | Haulotte | Snorkel | Toyota | Linde | Jungheinrich | Still | Hyster | Yale | Crown | Clark | Mitsubishi | Nissan | Heli | Hangcha | Komatsu Forklift | Paladin | Rexroth | Putzmeister | Schwing | Cifa | Liebherr Mixer | Stetter | Bauer | Soilmec | Casagrande | Wirtgen | Vögele | Kleemann | Sakai | Ingersoll Rand | Atlas Copco | Hamm`,
);
