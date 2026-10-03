import { names } from './names.js';

/**
 * Спецтехника и сельхозтехника: модели основных заводов. Это названия серий
 * («320», «PC200», «3CX», «Т-150К», «Acros»), а не комплектации и не года:
 * буквенный суффикс поколения («320D», «PC200-8») опущен — поколение и год
 * выпуска остаются отдельными характеристиками. Бренды без списка (Lonking,
 * Liugong, SDLG, подъёмники, погрузчики …) — модель вводится текстом.
 */
export const SPECIAL_MODELS: Readonly<Record<string, readonly string[]>> = {
  caterpillar: names(
    `301.8 | 302.7 | 303.5 | 305 | 307 | 308 | 311 | 312 | 313 | 315 | 316 | 318 | 320 | 323 | 325 | 329 | 330 | 336 | 340 | 349 | 352 | 374 | 390 | 902 | 906 | 908 | 910 | 914 | 918 | 920 | 924 | 928 | 930 | 938 | 950 | 962 | 966 | 972 | 980 | 982 | 988 | 416 | 422 | 424 | 428 | 432 | 434 | 444 | D3 | D4 | D5 | D6 | D7 | D8 | D9 | D10 | D11 | 120 | 12 | 140 | 14 | 160 | 16 | 24 | 226 | 232 | 236 | 242 | 246 | 249 | 252 | 256 | 262 | 272 | 279 | 289 | 299 | 770 | 772 | 773 | 775 | 777 | 785 | 789 | 793`,
  ),
  komatsu: names(
    `PC30 | PC35 | PC40 | PC45 | PC50 | PC55 | PC60 | PC70 | PC78 | PC88 | PC110 | PC130 | PC138 | PC160 | PC180 | PC200 | PC210 | PC220 | PC228 | PC240 | PC270 | PC290 | PC300 | PC340 | PC350 | PC400 | PC450 | PC490 | PC600 | PC800 | PC1250 | WA70 | WA80 | WA100 | WA150 | WA180 | WA200 | WA250 | WA270 | WA320 | WA380 | WA430 | WA470 | WA500 | WA600 | D20 | D31 | D37 | D39 | D41 | D51 | D61 | D65 | D85 | D155 | D275 | D375 | GD355 | GD555 | GD655 | GD705 | HD325 | HD405 | HD465 | HD605 | HD785 | WB93 | WB97`,
  ),
  hitachi: names(
    `ZX17 | ZX30 | ZX35 | ZX40 | ZX48 | ZX50 | ZX55 | ZX60 | ZX70 | ZX75 | ZX80 | ZX85 | ZX110 | ZX120 | ZX130 | ZX135 | ZX140 | ZX160 | ZX180 | ZX200 | ZX210 | ZX225 | ZX240 | ZX250 | ZX280 | ZX300 | ZX330 | ZX350 | ZX370 | ZX400 | ZX450 | ZX470 | ZX490 | ZX520 | ZX650 | ZX690 | EX100 | EX120 | EX200 | EX220 | EX300 | EX400 | EX1200 | ZW50 | ZW70 | ZW80 | ZW100 | ZW120 | ZW140 | ZW180 | ZW220 | ZW250 | ZW310 | ZW370`,
  ),
  volvo_ce: names(
    `EC15 | EC17 | EC20 | EC25 | EC27 | EC35 | EC55 | EC60 | EC75 | EC80 | EC120 | EC135 | EC140 | EC160 | EC180 | EC200 | EC210 | EC220 | EC240 | EC250 | EC290 | EC300 | EC330 | EC350 | EC360 | EC380 | EC460 | EC480 | EC700 | EC950 | L20 | L25 | L30 | L35 | L45 | L50 | L60 | L70 | L90 | L110 | L120 | L150 | L180 | L220 | L250 | L350 | A25 | A30 | A35 | A40 | A45 | A60 | G930 | G940 | G960 | G970 | G990 | BL60 | BL61 | BL70 | BL71`,
  ),
  jcb: names(
    `1CX | 2CX | 3CX | 4CX | 5CX | 3DX | 4DX | JS130 | JS145 | JS160 | JS180 | JS200 | JS210 | JS220 | JS240 | JS260 | JS290 | JS330 | JS370 | JS460 | 8008 | 8014 | 8018 | 8025 | 8030 | 8032 | 8035 | 8040 | 8045 | 8050 | 8052 | 8056 | 8060 | 8085 | 520-40 | 525-60 | 527-58 | 530-70 | 531-70 | 535-95 | 540-140 | 541-70 | 550-80 | 560-80 | 410 | 411 | 413 | 414 | 416 | 417 | 419 | 420 | 426 | 427 | 428 | 430 | 435 | 436 | 437 | 456 | 457 | 466 | 467 | Fastrac | Teletruk | Hydradig | Loadall | Midi CX | Mini CX`,
  ),
  hyundai: names(
    `R17Z | R25Z | R30Z | R35Z | R55 | R60 | R80 | R110 | R140 | R160 | R180 | R200 | R210 | R220 | R250 | R290 | R305 | R320 | R340 | R360 | R380 | R450 | R480 | R520 | HL730 | HL740 | HL750 | HL757 | HL760 | HL770 | HL780 | HL790 | HL960 | HL965 | HX140L | HX160L | HX210L | HX220L | HX300L | HX330L | HX380L | HX520L | HW140 | HW160 | HW210 | HW240 | HW300 | HW350`,
  ),
  doosan: names(
    `DX55 | DX60 | DX63 | DX80 | DX85 | DX100 | DX120 | DX140 | DX160 | DX180 | DX190 | DX225 | DX235 | DX255 | DX300 | DX340 | DX350 | DX380 | DX420 | DX480 | DX530 | DX700 | DX800 | DL200 | DL220 | DL250 | DL300 | DL350 | DL420 | DL450 | DL550 | DA30 | DA35 | DA40 | DA45 | S130 | S140 | S180 | S210 | S225 | S255 | S290 | S340 | S420`,
  ),
  develon: names(
    `DX55 | DX60 | DX63 | DX80 | DX85 | DX100 | DX120 | DX140 | DX160 | DX180 | DX190 | DX225 | DX235 | DX255 | DX300 | DX340 | DX350 | DX380 | DX420 | DX480 | DX530 | DX700 | DX800 | DL200 | DL220 | DL250 | DL300 | DL350 | DL420 | DL450 | DL550`,
  ),
  liebherr: names(
    `R900 Compact | R914 | R916 | R918 | R920 | R924 | R926 | R934 | R936 | R944 | R946 | R950 | R954 | R956 | R964 | R966 | R974 | R976 | R984 | R986 | R9150 | R9200 | R9250 | R9350 | R9400 | A900 | A910 | A914 | A916 | A918 | A920 | A924 | A934 | A944 | A954 | A964 | A974 | L506 | L508 | L509 | L514 | L524 | L526 | L538 | L542 | L550 | L556 | L566 | L574 | L580 | L586 | PR 716 | PR 726 | PR 736 | PR 746 | PR 756 | PR 766 | LTM 1030 | LTM 1050 | LTM 1060 | LTM 1070 | LTM 1090 | LTM 1100 | LTM 1130 | LTM 1160 | LTM 1200 | LTM 1230 | LTM 1300 | LTM 1400 | LTM 1500 | LTM 11200 | LTR 1100 | LTR 1220 | LR 1300 | LR 1600 | LR 11350 | MK 80 | MK 110 | MK 140 | 71 EC | 81 K | 63 K | 85 EC | 125 EC | 130 EC | 180 EC | 280 EC | 357 HC | 550 HC`,
  ),
  bobcat: names(
    `S70 | S100 | S130 | S150 | S160 | S170 | S175 | S185 | S205 | S220 | S250 | S300 | S330 | S450 | S510 | S530 | S550 | S570 | S590 | S595 | S630 | S650 | S740 | S750 | S770 | S850 | T110 | T140 | T180 | T190 | T200 | T250 | T300 | T320 | T450 | T550 | T590 | T595 | T630 | T650 | T740 | T750 | T770 | T870 | E08 | E10 | E16 | E17 | E19 | E20 | E25 | E26 | E27 | E32 | E34 | E35 | E42 | E45 | E50 | E55 | E60 | E80 | E85 | E88 | E90 | E100 | E145 | TL26.60 | TL30.60 | TL34.65 | TL38.70 | TL43.80 | MT52 | MT85 | 453 | 463 | 553 | 643 | 743 | 753 | 763 | 773 | 853 | 863 | 873 | 883`,
  ),
  manitou: names(
    `MLT 625 | MLT 630 | MLT 633 | MLT 635 | MLT 731 | MLT 735 | MLT 741 | MLT 840 | MLT 845 | MLT 1040 | MLT 1135 | MLT 1330 | MT 625 | MT 732 | MT 1030 | MT 1035 | MT 1135 | MT 1440 | MT 1740 | MT 1840 | MRT 1440 | MRT 1640 | MRT 1840 | MRT 2150 | MRT 2540 | MRT 2550 | MRT 3050 | MRT 3060 | MHT 790 | MHT 10120 | MHT 10180 | MHT 10225 | MC 18 | MC 20 | MC 25 | MC 30 | MC 40 | MC 50 | MC 60 | MI 25 | MI 30 | MI 40 | M 26 | M 30`,
  ),
  kubota: names(
    `KX008 | KX012 | KX016 | KX018 | KX019 | KX021 | KX027 | KX033 | KX035 | KX040 | KX057 | KX060 | KX080 | KX101 | KX121 | KX161 | KX163 | KX183 | U10 | U15 | U17 | U20 | U25 | U27 | U30 | U35 | U36 | U48 | U55 | SVL65 | SVL75 | SVL95 | SSV65 | SSV75 | R310 | R520 | R630 | B2410 | B6000 | L3200 | L3800 | L4200 | M4700 | M5700 | M6060 | M7040 | M8540 | M9540 | M105 | M108 | M126X | M135X | M9960 | BX1500 | BX2200 | BX2350 | ZD21 | ZD25 | ZD28 | GR2120 | GR2100 | RTV 500 | RTV 900 | RTV X900 | RTV X1100 | RTV X1140 | RTV X1180`,
  ),
  john_deere: names(
    `3E | 3R | 4M | 4R | 5E | 5G | 5M | 5R | 6M | 6R | 6RC | 6RX | 7J | 7R | 7RX | 8R | 8RT | 8RX | 9R | 9RT | 9RX | X7 | W540 | W550 | W650 | W660 | T660 | T670 | S660 | S670 | S680 | S690 | S760 | S770 | S780 | S790 | X9 | 9500 | 9600 | 9660 STS | 9670 STS | 9680 STS | 9760 STS | 9770 STS | 9780 STS | 9860 STS | 9870 STS | 9880 STS | 160G | 210G | 250G | 290G | 380G | 470G | 670G | 310L | 410L | 710L | 644K | 724K | 824K | 844K | 904K | 944K | 544K | 524K | 444K | 344K | 244K | 310SL | 410G | 310G | 315G | 325G | 331G | 333G | 35G | 50G | 60G | 75G | 85G | 135G | 145G | 345G | 350G | Gator | RSX | XUV`,
  ),
  new_holland: names(
    `T4.75 | T4.85 | T4.95 | T4.100 | T5.95 | T5.105 | T5.115 | T5.120 | T6.140 | T6.145 | T6.155 | T6.160 | T6.165 | T6.175 | T6.180 | T7.190 | T7.210 | T7.230 | T7.250 | T7.260 | T7.270 | T7.290 | T7.315 | T7.325 | T8.320 | T8.350 | T8.380 | T8.410 | T8.435 | T8.470 | T9.560 | T9.600 | T9.645 | T9.700 | TD5.100 | TD5.110 | TM120 | TM130 | TM140 | TM150 | TM155 | TM165 | TM175 | TM190 | TS100 | TS110 | TS115 | TS125 | TS130 | TS135 | TS6.110 | TS6.120 | TS6.125 | TS6.140 | TS6.150 | TN60 | TN70 | TN75 | TN80 | TN85 | TN90 | TN95 | TL80 | TL90 | TL100 | CX5.80 | CX5.90 | CX6.80 | CX6.90 | CX7.80 | CX7.90 | CX8.70 | CX8.80 | CX8.90 | CX8.100 | CR8.80 | CR8.90 | CR9.80 | CR9.90 | CR10.90 | CSX7060 | TC5070 | BigBaler | L216 | L218 | L220 | L225 | L230 | W110 | W130 | W170 | W190 | E135 | E175 | E215 | E245 | E265 | E305 | E385 | E485 | B90 | B95 | B110 | B115`,
  ),
  case: names(
    `580 | 590 | 695 | 770 | 821 | 1021 | 1121 | 1221 | 1650 | 1850 | 2050 | 650 | 750 | 850 | 1150 | CX36B | CX55B | CX57C | CX75C | CX80C | CX130 | CX160 | CX180 | CX210 | CX240 | CX250 | CX300 | CX350 | CX370 | CX470 | CX490 | CX800 | TR270 | TR310 | TV380 | SR130 | SR175 | SR210 | SR250 | SV185 | SV250 | SV300 | TV450 | 590SN | 580N | 580SN | 695SN`,
  ),
  case_ih: names(
    `Magnum 180 | Magnum 200 | Magnum 220 | Magnum 235 | Magnum 250 | Magnum 260 | Magnum 280 | Magnum 290 | Magnum 310 | Magnum 340 | Magnum 370 | Magnum 380 | Magnum 400 | Magnum 435 | Magnum 460 | Magnum 490 | Magnum 500 | Magnum 535 | Puma 125 | Puma 130 | Puma 140 | Puma 145 | Puma 150 | Puma 155 | Puma 160 | Puma 165 | Puma 170 | Puma 185 | Puma 195 | Puma 200 | Puma 210 | Puma 220 | Puma 230 | Puma 240 | Puma 260 | Maxxum 110 | Maxxum 115 | Maxxum 120 | Maxxum 125 | Maxxum 130 | Maxxum 135 | Maxxum 140 | Maxxum 145 | Maxxum 150 | Optum 250 | Optum 270 | Optum 300 | Quadtrac 450 | Quadtrac 500 | Quadtrac 540 | Quadtrac 580 | Quadtrac 620 | Steiger 370 | Steiger 420 | Steiger 470 | Steiger 500 | Steiger 540 | Steiger 580 | Steiger 620 | Farmall 55 | Farmall 60 | Farmall 65 | Farmall 75 | Farmall 80 | Farmall 90 | Farmall 95 | Farmall 100 | Farmall 105 | Farmall 110 | Farmall 115 | Farmall 120 | Farmall 130 | Farmall 140 | Axial-Flow 2188 | Axial-Flow 2388 | Axial-Flow 2577 | Axial-Flow 2588 | Axial-Flow 5088 | Axial-Flow 5130 | Axial-Flow 5140 | Axial-Flow 6130 | Axial-Flow 6140 | Axial-Flow 7130 | Axial-Flow 7140 | Axial-Flow 7150 | Axial-Flow 7230 | Axial-Flow 7240 | Axial-Flow 7250 | Axial-Flow 8120 | Axial-Flow 8230 | Axial-Flow 8240 | Axial-Flow 9120 | Axial-Flow 9230 | Axial-Flow 9240`,
  ),
  terex: names(
    `TA25 | TA27 | TA30 | TA35 | TA40 | TA250 | TA300 | TA400 | TX760 | TX870 | TX970 | TX1000 | TC16 | TC20 | TC35 | TC48 | TC50 | TC75 | TC125 | TC225 | TC300 | TC350 | TL80 | TL120 | TL160 | TL210 | TL260 | TL340 | TR35 | TR45 | TR60 | TR70 | TR100 | TW110 | TW170`,
  ),
  sany: names(
    `SY16 | SY18 | SY26 | SY35 | SY55 | SY60 | SY65 | SY75 | SY80 | SY95 | SY135 | SY155 | SY165 | SY205 | SY215 | SY225 | SY235 | SY245 | SY265 | SY285 | SY305 | SY365 | SY385 | SY485 | SY500 | SY550 | SY750 | SY870 | SW305 | SW405 | SW500 | SYL956H | SYL958H | STC250 | STC300 | STC500 | STC750 | STC800 | STC1000`,
  ),
  xcmg: names(
    `XE15 | XE17 | XE20 | XE27 | XE35 | XE55 | XE60 | XE75 | XE80 | XE135 | XE150 | XE200 | XE210 | XE215 | XE230 | XE260 | XE300 | XE335 | XE370 | XE380 | XE470 | XE490 | XE500 | XE700 | XE950 | XE1200 | LW160 | LW180 | LW200 | LW300 | LW500 | LW550 | LW600 | ZL50G | GR180 | GR215 | GR230 | GR260 | GR300 | XCT25 | XCT50 | XCT75 | XCT80 | XCT100 | XCT130 | QY25K | QY30K | QY35K | QY50KA | QY70K | QY100K`,
  ),
  zoomlion: names(
    `ZE60 | ZE75 | ZE85 | ZE135 | ZE150 | ZE210 | ZE215 | ZE230 | ZE260 | ZE330 | ZE360 | ZE480 | ZE550 | ZL30 | ZL50 | ZL60 | ZL80 | ZTC250 | ZTC350 | ZTC500 | ZTC800`,
  ),
  kobelco: names(
    `SK17SR | SK20SR | SK27SR | SK30SR | SK35SR | SK45SR | SK55SRX | SK60SR | SK75SR | SK85 | SK130 | SK140 | SK170 | SK180 | SK200 | SK210 | SK220 | SK225 | SK230 | SK235 | SK260 | SK270 | SK290 | SK300 | SK330 | SK350 | SK380 | SK400 | SK480 | SK500 | SK850 | ED150 | ED190 | ED160`,
  ),
  sumitomo: names(
    `SH75 | SH80 | SH100 | SH120 | SH125 | SH135 | SH145 | SH160 | SH170 | SH200 | SH210 | SH220 | SH240 | SH250 | SH300 | SH330 | SH350 | SH450 | SH550 | SH800`,
  ),
  takeuchi: names(
    `TB016 | TB020 | TB23R | TB28 | TB108 | TB114 | TB125 | TB135 | TB138 | TB153 | TB175 | TB180 | TB210 | TB215R | TB216 | TB225 | TB230 | TB235 | TB240 | TB250 | TB260 | TB280 | TB290 | TB1160 | TL8 | TL10 | TL12 | TL240 | TL250 | TW60 | TW80`,
  ),
  yanmar: names(
    `ViO10 | ViO17 | ViO20 | ViO25 | ViO27 | ViO30 | ViO35 | ViO38 | ViO40 | ViO45 | ViO50 | ViO55 | ViO57 | ViO70 | ViO80 | ViO82 | SV08 | SV15 | SV16 | SV17 | SV18 | SV20 | SV22 | SV26 | SV30 | SV40 | SV60 | SV100 | B6 | B7 | B8 | B12 | B15 | B17 | B19 | B22 | B27 | B37 | B45 | B50`,
  ),
  wacker_neuson: names(
    `EZ17 | EZ26 | EZ36 | EZ38 | EZ50 | EZ53 | EZ80 | ET16 | ET18 | ET20 | ET24 | ET35 | ET42 | ET65 | EW65 | EW100 | EW150 | WL20 | WL25 | WL28 | WL32 | WL34 | WL36 | WL37 | WL52 | WL60 | WL70 | WL75 | DW60 | DW90 | SW16 | SW21 | SW28 | 1003 | 2003 | 3003 | 4003 | 5003 | 6003 | 8003 | 9503`,
  ),
  merlo: names(
    `P25.6 | P27.6 | P28.7 | P30.7 | P32.6 | P35.7 | P38.10 | P40.7 | P41.7 | P50.18 | R25.6 | R30.16 | R35.10 | R38.12 | R40.25 | R50.35 | R60.30 | TF30.7 | TF33.7 | TF35.7 | TF38.7 | TF42.7 | MF30.7 | MF34.7 | MF40.7`,
  ),
  fendt: names(
    `200 Vario | 300 Vario | 500 Vario | 700 Vario | 800 Vario | 900 Vario | 1000 Vario | Favorit | Farmer | Xylon | Katana | Ideal | Rotana | Cargo | Tigo | Squadra | Former | Slicer | Oberta`,
  ),
  claas: names(
    `Axion | Arion | Xerion | Atles | Ares | Celtis | Nectis | Lexion | Dominator | Mega | Jaguar | Avero | Tucano | Scorpion | Targo | Disco | Liner | Volto | Rollant | Quadrant | Cargos | Crop Tiger`,
  ),
  massey_ferguson: names(
    `MF 135 | MF 165 | MF 188 | MF 235 | MF 240 | MF 255 | MF 265 | MF 275 | MF 285 | MF 290 | MF 299 | MF 5400 | MF 5600 | MF 5700 | MF 6400 | MF 6600 | MF 7400 | MF 7600 | MF 8600 | MF 8700 | MF 8S | MF 9S | Activa | Beta | Delta | Centora | Ideal | Dyna | Quadrant`,
  ),
  deutz_fahr: names(
    `Agrotron | Agrofarm | Agroplus | Agrokid | Agrolux | Agrostar | Agroclimber | Agrovector | 5G | 5D | 6C | 6G | 7 Series | 8 Series | 9 Series | TTV | Warrior | Topliner | C9000 | C7000 | C6000 | C5000 | Powerliner | D 40 | D 50 | D 60 | D 70 | D 80 | D 90 | D 100 | D 120 | D 130 | D 160 | DX`,
  ),

  belarus: names(
    `50 | 52 | 80 | 80.1 | 82 | 82.1 | 89 | 92 | 100 | 102 | 142 | 320 | 422 | 622 | 820 | 892 | 920 | 921 | 922 | 952 | 1021 | 1025 | 1221 | 1222 | 1523 | 1525 | 1620 | 1822 | 2022 | 2103 | 2122 | 3022 | 3522`,
  ),
  khtz: names(`Т-16 | Т-25 | Т-40 | Т-150 | Т-150К | 17221 | 17021 | 3512 | 2511 | 242К | 244К`),
  kirovets: names(
    `К-700 | К-700А | К-701 | К-702 | К-703 | К-704 | К-705 | К-710 | К-715 | К-717 | К-731 | К-735 | К-744 | К-744Р | К-525 | К-526 | К-9000`,
  ),
  rostselmash: names(
    `Acros | Torum | Vector | Нива | Дон-1500 | Дон-680 | Дон-680М | СК-5 | СК-5М | RSM 142 | RSM 161 | RSM 181 | RSM 2375 | RSM 2400 | RSM 2500 | RSM 3000 | RSM 3500`,
  ),
  amkodor: names(`320 | 321 | 331 | 332 | 333 | 342 | 352 | 702 | 703`),
  yumz: names(`ЮМЗ-6 | ЮМЗ-6Л | ЮМЗ-6КЛ`),
  ttz: names(`ТТЗ-80 | ТТЗ-82 | ТТЗ-1520`),
};
