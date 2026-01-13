import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
} from "@whiskeysockets/baileys";
import pino from "pino";
import QRCode from "qrcode";
import fs from "node:fs";
import os from "node:os";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// WhatsApp connection state
let sock = null;
let qrCode = null;
let connectionStatus = "disconnected"; // disconnected, connecting, connected
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 3;
let isConnecting = false;

// Use app data folder for auth in production (when packaged in asar), local folder in development
function getAuthDir() {
  // Check if we're running from inside an asar archive (packaged Electron app)
  const isPackaged = __dirname.includes("app.asar");
  
  if (isPackaged) {
    // Use user's app data folder for writable storage
    const appDataPath = process.env.APPDATA || 
      (process.platform === "darwin" 
        ? path.join(os.homedir(), "Library", "Application Support")
        : path.join(os.homedir(), ".config"));
    return path.join(appDataPath, "whatsapp-number-checker", "auth_info");
  }
  
  // Development: use local folder
  return path.join(__dirname, "auth_info");
}

const AUTH_DIR = getAuthDir();
console.log("Auth directory:", AUTH_DIR);

// Logger
const logger = pino({ level: "silent" });

// Country code to country name mapping
const COUNTRY_NAMES = {
  "1": "United States/Canada",
  "7": "Russia/Kazakhstan",
  "20": "Egypt",
  "27": "South Africa",
  "30": "Greece",
  "31": "Netherlands",
  "32": "Belgium",
  "33": "France",
  "34": "Spain",
  "36": "Hungary",
  "39": "Italy",
  "40": "Romania",
  "41": "Switzerland",
  "43": "Austria",
  "44": "United Kingdom",
  "45": "Denmark",
  "46": "Sweden",
  "47": "Norway",
  "48": "Poland",
  "49": "Germany",
  "51": "Peru",
  "52": "Mexico",
  "53": "Cuba",
  "54": "Argentina",
  "55": "Brazil",
  "56": "Chile",
  "57": "Colombia",
  "58": "Venezuela",
  "60": "Malaysia",
  "61": "Australia",
  "62": "Indonesia",
  "63": "Philippines",
  "64": "New Zealand",
  "65": "Singapore",
  "66": "Thailand",
  "81": "Japan",
  "82": "South Korea",
  "84": "Vietnam",
  "86": "China",
  "90": "Turkey",
  "91": "India",
  "92": "Pakistan",
  "93": "Afghanistan",
  "94": "Sri Lanka",
  "95": "Myanmar",
  "98": "Iran",
  "212": "Morocco",
  "213": "Algeria",
  "216": "Tunisia",
  "218": "Libya",
  "220": "Gambia",
  "221": "Senegal",
  "222": "Mauritania",
  "223": "Mali",
  "224": "Guinea",
  "225": "Ivory Coast",
  "226": "Burkina Faso",
  "227": "Niger",
  "228": "Togo",
  "229": "Benin",
  "230": "Mauritius",
  "231": "Liberia",
  "232": "Sierra Leone",
  "233": "Ghana",
  "234": "Nigeria",
  "235": "Chad",
  "236": "Central African Republic",
  "237": "Cameroon",
  "238": "Cape Verde",
  "239": "São Tomé and Príncipe",
  "240": "Equatorial Guinea",
  "241": "Gabon",
  "242": "Republic of the Congo",
  "243": "Democratic Republic of the Congo",
  "244": "Angola",
  "245": "Guinea-Bissau",
  "246": "British Indian Ocean Territory",
  "248": "Seychelles",
  "249": "Sudan",
  "250": "Rwanda",
  "251": "Ethiopia",
  "252": "Somalia",
  "253": "Djibouti",
  "254": "Kenya",
  "255": "Tanzania",
  "256": "Uganda",
  "257": "Burundi",
  "258": "Mozambique",
  "260": "Zambia",
  "261": "Madagascar",
  "262": "Réunion/Mayotte",
  "263": "Zimbabwe",
  "264": "Namibia",
  "265": "Malawi",
  "266": "Lesotho",
  "267": "Botswana",
  "268": "Eswatini",
  "269": "Comoros",
  "290": "Saint Helena",
  "291": "Eritrea",
  "297": "Aruba",
  "298": "Faroe Islands",
  "299": "Greenland",
  "350": "Gibraltar",
  "351": "Portugal",
  "352": "Luxembourg",
  "353": "Ireland",
  "354": "Iceland",
  "355": "Albania",
  "356": "Malta",
  "357": "Cyprus",
  "358": "Finland",
  "359": "Bulgaria",
  "370": "Lithuania",
  "371": "Latvia",
  "372": "Estonia",
  "373": "Moldova",
  "374": "Armenia",
  "375": "Belarus",
  "376": "Andorra",
  "377": "Monaco",
  "378": "San Marino",
  "380": "Ukraine",
  "381": "Serbia",
  "382": "Montenegro",
  "383": "Kosovo",
  "385": "Croatia",
  "386": "Slovenia",
  "387": "Bosnia and Herzegovina",
  "389": "North Macedonia",
  "420": "Czech Republic",
  "421": "Slovakia",
  "423": "Liechtenstein",
  "500": "Falkland Islands",
  "501": "Belize",
  "502": "Guatemala",
  "503": "El Salvador",
  "504": "Honduras",
  "505": "Nicaragua",
  "506": "Costa Rica",
  "507": "Panama",
  "508": "Saint Pierre and Miquelon",
  "509": "Haiti",
  "590": "Guadeloupe",
  "591": "Bolivia",
  "592": "Guyana",
  "593": "Ecuador",
  "594": "French Guiana",
  "595": "Paraguay",
  "596": "Martinique",
  "597": "Suriname",
  "598": "Uruguay",
  "599": "Caribbean Netherlands",
  "670": "East Timor",
  "672": "Australian External Territories",
  "673": "Brunei",
  "674": "Nauru",
  "675": "Papua New Guinea",
  "676": "Tonga",
  "677": "Solomon Islands",
  "678": "Vanuatu",
  "679": "Fiji",
  "680": "Palau",
  "681": "Wallis and Futuna",
  "682": "Cook Islands",
  "683": "Niue",
  "684": "American Samoa",
  "685": "Samoa",
  "686": "Kiribati",
  "687": "New Caledonia",
  "688": "Tuvalu",
  "689": "French Polynesia",
  "690": "Tokelau",
  "691": "Micronesia",
  "692": "Marshall Islands",
  "850": "North Korea",
  "852": "Hong Kong",
  "853": "Macau",
  "855": "Cambodia",
  "856": "Laos",
  "880": "Bangladesh",
  "886": "Taiwan",
  "960": "Maldives",
  "961": "Lebanon",
  "962": "Jordan",
  "963": "Syria",
  "964": "Iraq",
  "965": "Kuwait",
  "966": "Saudi Arabia",
  "967": "Yemen",
  "968": "Oman",
  "970": "Palestine",
  "971": "United Arab Emirates",
  "972": "Israel",
  "973": "Bahrain",
  "974": "Qatar",
  "975": "Bhutan",
  "976": "Mongolia",
  "977": "Nepal",
  "992": "Tajikistan",
  "993": "Turkmenistan",
  "994": "Azerbaijan",
  "995": "Georgia",
  "996": "Kyrgyzstan",
  "998": "Uzbekistan",
};

// Country-specific phone number validation rules
// Format: { countryCode: { minLength: X, maxLength: Y, description: "..." } }
const COUNTRY_RULES = {
  "1": { minLength: 10, maxLength: 10, description: "US/Canada (10 digits)" },
  "7": { minLength: 10, maxLength: 10, description: "Russia/Kazakhstan (10 digits)" },
  "20": { minLength: 9, maxLength: 10, description: "Egypt (9-10 digits)" },
  "27": { minLength: 9, maxLength: 9, description: "South Africa (9 digits)" },
  "30": { minLength: 10, maxLength: 10, description: "Greece (10 digits)" },
  "31": { minLength: 9, maxLength: 9, description: "Netherlands (9 digits)" },
  "32": { minLength: 9, maxLength: 9, description: "Belgium (9 digits)" },
  "33": { minLength: 9, maxLength: 9, description: "France (9 digits)" },
  "34": { minLength: 9, maxLength: 9, description: "Spain (9 digits)" },
  "36": { minLength: 8, maxLength: 9, description: "Hungary (8-9 digits)" },
  "39": { minLength: 9, maxLength: 11, description: "Italy (9-11 digits)" },
  "40": { minLength: 9, maxLength: 9, description: "Romania (9 digits)" },
  "41": { minLength: 9, maxLength: 9, description: "Switzerland (9 digits)" },
  "43": { minLength: 10, maxLength: 13, description: "Austria (10-13 digits)" },
  "44": { minLength: 10, maxLength: 10, description: "United Kingdom (10 digits)" },
  "45": { minLength: 8, maxLength: 8, description: "Denmark (8 digits)" },
  "46": { minLength: 9, maxLength: 9, description: "Sweden (9 digits)" },
  "47": { minLength: 8, maxLength: 8, description: "Norway (8 digits)" },
  "48": { minLength: 9, maxLength: 9, description: "Poland (9 digits)" },
  "49": { minLength: 10, maxLength: 12, description: "Germany (10-12 digits)" },
  "51": { minLength: 9, maxLength: 9, description: "Peru (9 digits)" },
  "52": { minLength: 10, maxLength: 10, description: "Mexico (10 digits)" },
  "53": { minLength: 8, maxLength: 8, description: "Cuba (8 digits)" },
  "54": { minLength: 10, maxLength: 12, description: "Argentina (10-12 digits)" },
  "55": { minLength: 10, maxLength: 11, description: "Brazil (10-11 digits)" },
  "56": { minLength: 9, maxLength: 9, description: "Chile (9 digits)" },
  "57": { minLength: 10, maxLength: 10, description: "Colombia (10 digits)" },
  "58": { minLength: 10, maxLength: 10, description: "Venezuela (10 digits)" },
  "60": { minLength: 9, maxLength: 10, description: "Malaysia (9-10 digits)" },
  "61": { minLength: 9, maxLength: 9, description: "Australia (9 digits)" },
  "62": { minLength: 9, maxLength: 11, description: "Indonesia (9-11 digits)" },
  "63": { minLength: 10, maxLength: 10, description: "Philippines (10 digits)" },
  "64": { minLength: 8, maxLength: 9, description: "New Zealand (8-9 digits)" },
  "65": { minLength: 8, maxLength: 8, description: "Singapore (8 digits)" },
  "66": { minLength: 9, maxLength: 9, description: "Thailand (9 digits)" },
  "81": { minLength: 10, maxLength: 10, description: "Japan (10 digits)" },
  "82": { minLength: 9, maxLength: 10, description: "South Korea (9-10 digits)" },
  "84": { minLength: 9, maxLength: 10, description: "Vietnam (9-10 digits)" },
  "86": { minLength: 11, maxLength: 11, description: "China (11 digits)" },
  "90": { minLength: 10, maxLength: 10, description: "Turkey (10 digits)" },
  "91": { minLength: 10, maxLength: 10, description: "India (10 digits)" },
  "92": { minLength: 10, maxLength: 10, description: "Pakistan (10 digits)" },
  "93": { minLength: 9, maxLength: 9, description: "Afghanistan (9 digits)" },
  "94": { minLength: 9, maxLength: 9, description: "Sri Lanka (9 digits)" },
  "95": { minLength: 8, maxLength: 10, description: "Myanmar (8-10 digits)" },
  "98": { minLength: 10, maxLength: 10, description: "Iran (10 digits)" },
  "212": { minLength: 9, maxLength: 9, description: "Morocco (9 digits)" },
  "213": { minLength: 9, maxLength: 9, description: "Algeria (9 digits)" },
  "216": { minLength: 8, maxLength: 8, description: "Tunisia (8 digits)" },
  "218": { minLength: 9, maxLength: 9, description: "Libya (9 digits)" },
  "220": { minLength: 7, maxLength: 7, description: "Gambia (7 digits)" },
  "221": { minLength: 9, maxLength: 9, description: "Senegal (9 digits)" },
  "222": { minLength: 8, maxLength: 8, description: "Mauritania (8 digits)" },
  "223": { minLength: 8, maxLength: 8, description: "Mali (8 digits)" },
  "224": { minLength: 9, maxLength: 9, description: "Guinea (9 digits)" },
  "225": { minLength: 10, maxLength: 10, description: "Ivory Coast (10 digits)" },
  "226": { minLength: 8, maxLength: 8, description: "Burkina Faso (8 digits)" },
  "227": { minLength: 8, maxLength: 8, description: "Niger (8 digits)" },
  "228": { minLength: 8, maxLength: 8, description: "Togo (8 digits)" },
  "229": { minLength: 8, maxLength: 8, description: "Benin (8 digits)" },
  "230": { minLength: 7, maxLength: 7, description: "Mauritius (7 digits)" },
  "231": { minLength: 7, maxLength: 8, description: "Liberia (7-8 digits)" },
  "232": { minLength: 8, maxLength: 8, description: "Sierra Leone (8 digits)" },
  "233": { minLength: 9, maxLength: 9, description: "Ghana (9 digits)" },
  "234": { minLength: 10, maxLength: 10, description: "Nigeria (10 digits)" },
  "235": { minLength: 8, maxLength: 8, description: "Chad (8 digits)" },
  "236": { minLength: 8, maxLength: 8, description: "Central African Republic (8 digits)" },
  "237": { minLength: 9, maxLength: 9, description: "Cameroon (9 digits)" },
  "238": { minLength: 7, maxLength: 7, description: "Cape Verde (7 digits)" },
  "239": { minLength: 7, maxLength: 7, description: "São Tomé and Príncipe (7 digits)" },
  "240": { minLength: 9, maxLength: 9, description: "Equatorial Guinea (9 digits)" },
  "241": { minLength: 7, maxLength: 8, description: "Gabon (7-8 digits)" },
  "242": { minLength: 9, maxLength: 9, description: "Republic of the Congo (9 digits)" },
  "243": { minLength: 9, maxLength: 9, description: "Democratic Republic of the Congo (9 digits)" },
  "244": { minLength: 9, maxLength: 9, description: "Angola (9 digits)" },
  "245": { minLength: 7, maxLength: 7, description: "Guinea-Bissau (7 digits)" },
  "246": { minLength: 7, maxLength: 7, description: "British Indian Ocean Territory (7 digits)" },
  "248": { minLength: 7, maxLength: 7, description: "Seychelles (7 digits)" },
  "249": { minLength: 9, maxLength: 9, description: "Sudan (9 digits)" },
  "250": { minLength: 9, maxLength: 9, description: "Rwanda (9 digits)" },
  "251": { minLength: 9, maxLength: 9, description: "Ethiopia (9 digits)" },
  "252": { minLength: 8, maxLength: 9, description: "Somalia (8-9 digits)" },
  "253": { minLength: 8, maxLength: 8, description: "Djibouti (8 digits)" },
  "254": { minLength: 9, maxLength: 9, description: "Kenya (9 digits)" },
  "255": { minLength: 9, maxLength: 9, description: "Tanzania (9 digits)" },
  "256": { minLength: 9, maxLength: 9, description: "Uganda (9 digits)" },
  "257": { minLength: 8, maxLength: 8, description: "Burundi (8 digits)" },
  "258": { minLength: 9, maxLength: 9, description: "Mozambique (9 digits)" },
  "260": { minLength: 9, maxLength: 9, description: "Zambia (9 digits)" },
  "261": { minLength: 9, maxLength: 9, description: "Madagascar (9 digits)" },
  "262": { minLength: 9, maxLength: 9, description: "Réunion/Mayotte (9 digits)" },
  "263": { minLength: 9, maxLength: 9, description: "Zimbabwe (9 digits)" },
  "264": { minLength: 9, maxLength: 9, description: "Namibia (9 digits)" },
  "265": { minLength: 9, maxLength: 9, description: "Malawi (9 digits)" },
  "266": { minLength: 8, maxLength: 8, description: "Lesotho (8 digits)" },
  "267": { minLength: 8, maxLength: 8, description: "Botswana (8 digits)" },
  "268": { minLength: 8, maxLength: 8, description: "Eswatini (8 digits)" },
  "269": { minLength: 7, maxLength: 7, description: "Comoros (7 digits)" },
  "290": { minLength: 4, maxLength: 4, description: "Saint Helena (4 digits)" },
  "291": { minLength: 7, maxLength: 7, description: "Eritrea (7 digits)" },
  "297": { minLength: 7, maxLength: 7, description: "Aruba (7 digits)" },
  "298": { minLength: 6, maxLength: 6, description: "Faroe Islands (6 digits)" },
  "299": { minLength: 6, maxLength: 6, description: "Greenland (6 digits)" },
  "350": { minLength: 8, maxLength: 8, description: "Gibraltar (8 digits)" },
  "351": { minLength: 9, maxLength: 9, description: "Portugal (9 digits)" },
  "352": { minLength: 9, maxLength: 9, description: "Luxembourg (9 digits)" },
  "353": { minLength: 9, maxLength: 9, description: "Ireland (9 digits)" },
  "354": { minLength: 7, maxLength: 7, description: "Iceland (7 digits)" },
  "355": { minLength: 9, maxLength: 9, description: "Albania (9 digits)" },
  "356": { minLength: 8, maxLength: 8, description: "Malta (8 digits)" },
  "357": { minLength: 8, maxLength: 8, description: "Cyprus (8 digits)" },
  "358": { minLength: 6, maxLength: 10, description: "Finland (6-10 digits)" },
  "359": { minLength: 8, maxLength: 9, description: "Bulgaria (8-9 digits)" },
  "370": { minLength: 8, maxLength: 8, description: "Lithuania (8 digits)" },
  "371": { minLength: 8, maxLength: 8, description: "Latvia (8 digits)" },
  "372": { minLength: 7, maxLength: 8, description: "Estonia (7-8 digits)" },
  "373": { minLength: 8, maxLength: 8, description: "Moldova (8 digits)" },
  "374": { minLength: 8, maxLength: 8, description: "Armenia (8 digits)" },
  "375": { minLength: 9, maxLength: 9, description: "Belarus (9 digits)" },
  "376": { minLength: 6, maxLength: 6, description: "Andorra (6 digits)" },
  "377": { minLength: 8, maxLength: 8, description: "Monaco (8 digits)" },
  "378": { minLength: 6, maxLength: 10, description: "San Marino (6-10 digits)" },
  "380": { minLength: 9, maxLength: 9, description: "Ukraine (9 digits)" },
  "381": { minLength: 8, maxLength: 9, description: "Serbia (8-9 digits)" },
  "382": { minLength: 8, maxLength: 8, description: "Montenegro (8 digits)" },
  "383": { minLength: 8, maxLength: 8, description: "Kosovo (8 digits)" },
  "385": { minLength: 8, maxLength: 9, description: "Croatia (8-9 digits)" },
  "386": { minLength: 8, maxLength: 8, description: "Slovenia (8 digits)" },
  "387": { minLength: 8, maxLength: 8, description: "Bosnia and Herzegovina (8 digits)" },
  "389": { minLength: 8, maxLength: 8, description: "North Macedonia (8 digits)" },
  "420": { minLength: 9, maxLength: 9, description: "Czech Republic (9 digits)" },
  "421": { minLength: 9, maxLength: 9, description: "Slovakia (9 digits)" },
  "423": { minLength: 7, maxLength: 7, description: "Liechtenstein (7 digits)" },
  "500": { minLength: 5, maxLength: 5, description: "Falkland Islands (5 digits)" },
  "501": { minLength: 7, maxLength: 7, description: "Belize (7 digits)" },
  "502": { minLength: 8, maxLength: 8, description: "Guatemala (8 digits)" },
  "503": { minLength: 8, maxLength: 8, description: "El Salvador (8 digits)" },
  "504": { minLength: 8, maxLength: 8, description: "Honduras (8 digits)" },
  "505": { minLength: 8, maxLength: 8, description: "Nicaragua (8 digits)" },
  "506": { minLength: 8, maxLength: 8, description: "Costa Rica (8 digits)" },
  "507": { minLength: 8, maxLength: 8, description: "Panama (8 digits)" },
  "508": { minLength: 6, maxLength: 6, description: "Saint Pierre and Miquelon (6 digits)" },
  "509": { minLength: 8, maxLength: 8, description: "Haiti (8 digits)" },
  "590": { minLength: 9, maxLength: 9, description: "Guadeloupe (9 digits)" },
  "591": { minLength: 8, maxLength: 8, description: "Bolivia (8 digits)" },
  "592": { minLength: 7, maxLength: 7, description: "Guyana (7 digits)" },
  "593": { minLength: 9, maxLength: 9, description: "Ecuador (9 digits)" },
  "594": { minLength: 9, maxLength: 9, description: "French Guiana (9 digits)" },
  "595": { minLength: 9, maxLength: 9, description: "Paraguay (9 digits)" },
  "596": { minLength: 9, maxLength: 9, description: "Martinique (9 digits)" },
  "597": { minLength: 7, maxLength: 7, description: "Suriname (7 digits)" },
  "598": { minLength: 8, maxLength: 8, description: "Uruguay (8 digits)" },
  "599": { minLength: 7, maxLength: 7, description: "Caribbean Netherlands (7 digits)" },
  "670": { minLength: 8, maxLength: 8, description: "East Timor (8 digits)" },
  "672": { minLength: 4, maxLength: 4, description: "Australian External Territories (4 digits)" },
  "673": { minLength: 7, maxLength: 7, description: "Brunei (7 digits)" },
  "674": { minLength: 7, maxLength: 7, description: "Nauru (7 digits)" },
  "675": { minLength: 7, maxLength: 8, description: "Papua New Guinea (7-8 digits)" },
  "676": { minLength: 5, maxLength: 7, description: "Tonga (5-7 digits)" },
  "677": { minLength: 5, maxLength: 7, description: "Solomon Islands (5-7 digits)" },
  "678": { minLength: 5, maxLength: 7, description: "Vanuatu (5-7 digits)" },
  "679": { minLength: 7, maxLength: 7, description: "Fiji (7 digits)" },
  "680": { minLength: 7, maxLength: 7, description: "Palau (7 digits)" },
  "681": { minLength: 6, maxLength: 6, description: "Wallis and Futuna (6 digits)" },
  "682": { minLength: 5, maxLength: 5, description: "Cook Islands (5 digits)" },
  "683": { minLength: 4, maxLength: 4, description: "Niue (4 digits)" },
  "684": { minLength: 7, maxLength: 7, description: "American Samoa (7 digits)" },
  "685": { minLength: 5, maxLength: 7, description: "Samoa (5-7 digits)" },
  "686": { minLength: 5, maxLength: 8, description: "Kiribati (5-8 digits)" },
  "687": { minLength: 6, maxLength: 6, description: "New Caledonia (6 digits)" },
  "688": { minLength: 5, maxLength: 6, description: "Tuvalu (5-6 digits)" },
  "689": { minLength: 6, maxLength: 6, description: "French Polynesia (6 digits)" },
  "690": { minLength: 4, maxLength: 4, description: "Tokelau (4 digits)" },
  "691": { minLength: 7, maxLength: 7, description: "Micronesia (7 digits)" },
  "692": { minLength: 7, maxLength: 7, description: "Marshall Islands (7 digits)" },
  "850": { minLength: 8, maxLength: 10, description: "North Korea (8-10 digits)" },
  "852": { minLength: 8, maxLength: 8, description: "Hong Kong (8 digits)" },
  "853": { minLength: 8, maxLength: 8, description: "Macau (8 digits)" },
  "855": { minLength: 8, maxLength: 9, description: "Cambodia (8-9 digits)" },
  "856": { minLength: 8, maxLength: 10, description: "Laos (8-10 digits)" },
  "880": { minLength: 10, maxLength: 10, description: "Bangladesh (10 digits)" },
  "886": { minLength: 9, maxLength: 9, description: "Taiwan (9 digits)" },
  "960": { minLength: 7, maxLength: 7, description: "Maldives (7 digits)" },
  "961": { minLength: 7, maxLength: 8, description: "Lebanon (7-8 digits)" },
  "962": { minLength: 9, maxLength: 9, description: "Jordan (9 digits)" },
  "963": { minLength: 9, maxLength: 9, description: "Syria (9 digits)" },
  "964": { minLength: 9, maxLength: 10, description: "Iraq (9-10 digits)" },
  "965": { minLength: 8, maxLength: 8, description: "Kuwait (8 digits)" },
  "966": { minLength: 9, maxLength: 9, description: "Saudi Arabia (9 digits)" },
  "967": { minLength: 9, maxLength: 9, description: "Yemen (9 digits)" },
  "968": { minLength: 8, maxLength: 8, description: "Oman (8 digits)" },
  "970": { minLength: 9, maxLength: 9, description: "Palestine (9 digits)" },
  "971": { minLength: 9, maxLength: 9, description: "United Arab Emirates (9 digits)" },
  "972": { minLength: 9, maxLength: 9, description: "Israel (9 digits)" },
  "973": { minLength: 8, maxLength: 8, description: "Bahrain (8 digits)" },
  "974": { minLength: 8, maxLength: 8, description: "Qatar (8 digits)" },
  "975": { minLength: 8, maxLength: 8, description: "Bhutan (8 digits)" },
  "976": { minLength: 8, maxLength: 8, description: "Mongolia (8 digits)" },
  "977": { minLength: 10, maxLength: 10, description: "Nepal (10 digits)" },
  "992": { minLength: 9, maxLength: 9, description: "Tajikistan (9 digits)" },
  "993": { minLength: 8, maxLength: 8, description: "Turkmenistan (8 digits)" },
  "994": { minLength: 9, maxLength: 9, description: "Azerbaijan (9 digits)" },
  "995": { minLength: 9, maxLength: 9, description: "Georgia (9 digits)" },
  "996": { minLength: 9, maxLength: 9, description: "Kyrgyzstan (9 digits)" },
  "998": { minLength: 9, maxLength: 9, description: "Uzbekistan (9 digits)" },
};

/**
 * Detects country code from phone number and returns country name
 * @param {string} number - Cleaned phone number (digits only)
 * @returns {string} Country name or "Unknown"
 */
function detectCountry(number) {
  if (!number || number.length < 7) {
    return "Unknown";
  }

  // Try to detect country code (1-3 digits)
  // Check from longest to shortest to avoid false matches
  const sortedCodes = Object.keys(COUNTRY_NAMES).sort((a, b) => b.length - a.length);
  
  for (const countryCode of sortedCodes) {
    if (number.startsWith(countryCode)) {
      return COUNTRY_NAMES[countryCode];
    }
  }

  return "Unknown";
}

/**
 * Validates a phone number based on country-specific rules
 * @param {string} number - Cleaned phone number (digits only)
 * @returns {{ valid: boolean, error?: string, countryCode?: string, localNumber?: string, country?: string }}
 */
function validatePhoneNumber(number) {
  if (!number || number.length < 7) {
    const country = detectCountry(number);
    return { valid: false, error: "Number too short (minimum 7 digits)", country };
  }

  const country = detectCountry(number);

  // Try to detect country code (1-3 digits)
  // Check for common country codes from longest to shortest
  const sortedCodes = Object.keys(COUNTRY_RULES).sort((a, b) => b.length - a.length);
  
  for (const countryCode of sortedCodes) {
    if (number.startsWith(countryCode)) {
      const localNumber = number.substring(countryCode.length);
      const rule = COUNTRY_RULES[countryCode];
      
      if (localNumber.length < rule.minLength) {
        return {
          valid: false,
          error: `${rule.description}: requires ${rule.minLength} digits, found ${localNumber.length}`,
          countryCode,
          localNumber,
          country,
        };
      }
      
      if (localNumber.length > rule.maxLength) {
        return {
          valid: false,
          error: `${rule.description}: maximum ${rule.maxLength} digits, found ${localNumber.length}`,
          countryCode,
          localNumber,
          country,
        };
      }
      
      // Valid number for this country
      return {
        valid: true,
        countryCode,
        localNumber,
        country,
      };
    }
  }

  // If no country code matches, apply general validation
  // Allow numbers between 7-15 digits (E.164 standard)
  if (number.length > 15) {
    return { valid: false, error: "Number too long (maximum 15 digits)", country };
  }

  // For unknown countries, just check minimum length
  return { valid: true, country };
}

function clearAuthFolder() {
  try {
    if (fs.existsSync(AUTH_DIR)) {
      fs.rmSync(AUTH_DIR, { recursive: true, force: true });
    }
  } catch (err) {
    // Non-fatal. If we can't clear, Baileys may keep failing to auth; caller will see it.
    console.error("Failed to clear auth_info:", err);
  }
}

async function teardownSocket() {
  try {
    if (!sock) return;
    try {
      // Best-effort close; can throw if already closed.
      sock.end?.();
    } catch {
      // ignore
    }
    try {
      // Remove listeners so a stale socket can't mutate globals.
      sock.ev.removeAllListeners();
    } catch {
      // ignore
    }
  } finally {
    sock = null;
  }
}

// Initialize WhatsApp connection
async function connectToWhatsApp() {
  try {
    if (isConnecting) return;
    isConnecting = true;

    // Ensure we don't have a stale socket hanging around (e.g. after loggedOut)
    await teardownSocket();

    // Fetch latest version to avoid 405 errors
    const { version, isLatest } = await fetchLatestBaileysVersion();
    console.log(
      `Using WA version: ${version.join(".")}, isLatest: ${isLatest}`
    );

    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

    connectionStatus = "connecting";
    qrCode = null;

    sock = makeWASocket({
      version,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, logger),
      },
      logger,
      browser: ["WhatsApp Checker", "Chrome", "120.0.0"],
      syncFullHistory: false,
      generateHighQualityLinkPreview: false,
      markOnlineOnConnect: false,
    });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        // Generate QR code as data URL
        try {
          qrCode = await QRCode.toDataURL(qr);
          connectionStatus = "connecting";
          reconnectAttempts = 0; // Reset on new QR
          console.log("📱 Scan the QR code with your WhatsApp to connect");
        } catch (err) {
          console.error("Failed to generate QR:", err);
        }
      }

      if (connection === "close") {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const shouldReconnect =
          statusCode !== DisconnectReason.loggedOut &&
          reconnectAttempts < MAX_RECONNECT_ATTEMPTS;

        console.log(
          `Connection closed (code: ${statusCode}). Reconnecting: ${shouldReconnect}`
        );
        connectionStatus = "disconnected";
        qrCode = null;
        await teardownSocket();
        isConnecting = false;

        if (shouldReconnect) {
          reconnectAttempts++;
          const delay = Math.min(reconnectAttempts * 2000, 10000); // Progressive delay
          console.log(
            `Reconnect attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS} in ${
              delay / 1000
            }s...`
          );
          setTimeout(connectToWhatsApp, delay);
        } else if (statusCode === DisconnectReason.loggedOut) {
          console.log(
            "Logged out. Please click Connect again to get a new QR code."
          );
          // Force a clean re-auth next time.
          clearAuthFolder();
          reconnectAttempts = 0;
        }
      } else if (connection === "open") {
        console.log("✅ Connected to WhatsApp!");
        connectionStatus = "connected";
        qrCode = null;
        reconnectAttempts = 0;
        isConnecting = false;
      }
    });
  } catch (error) {
    console.error("Connection error:", error);
    connectionStatus = "disconnected";
    qrCode = null;
    await teardownSocket();
  } finally {
    isConnecting = false;
  }
}

// API: Get connection status
app.get("/api/status", (req, res) => {
  res.json({
    status: connectionStatus,
    qrCode: qrCode,
    connected: connectionStatus === "connected",
  });
});

// API: Connect/Reconnect to WhatsApp
app.post("/api/connect", async (req, res) => {
  try {
    if (connectionStatus === "connected") {
      return res.json({ success: true, message: "Already connected" });
    }

    if (isConnecting || connectionStatus === "connecting") {
      return res.json({ success: true, message: "Already connecting..." });
    }

    await connectToWhatsApp();
    res.json({ success: true, message: "Connecting... Please scan QR code" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API: Disconnect from WhatsApp
app.post("/api/disconnect", async (req, res) => {
  try {
    if (sock) {
      await sock.logout();
      await teardownSocket();
    }
    connectionStatus = "disconnected";
    qrCode = null;
    res.json({ success: true, message: "Disconnected" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API: Verify phone numbers
app.post("/api/verify", async (req, res) => {
  try {
    const { phoneNumbers } = req.body;

    if (
      !phoneNumbers ||
      !Array.isArray(phoneNumbers) ||
      phoneNumbers.length === 0
    ) {
      return res.status(400).json({
        error: "Please provide an array of phone numbers",
      });
    }

    if (connectionStatus !== "connected" || !sock) {
      return res.status(400).json({
        error: "WhatsApp is not connected. Please scan the QR code first.",
      });
    }

    // Clean phone numbers (remove + and spaces)
    const cleanedNumbers = phoneNumbers
      .map((num) => num.trim().replace(/[^\d]/g, ""))
      .filter((num) => num.length >= 7);

    if (cleanedNumbers.length === 0) {
      return res.status(400).json({
        error: "No valid phone numbers provided",
      });
    }

    // Validate and check numbers on WhatsApp
    const results = [];

    for (const number of cleanedNumbers) {
      // Detect country first
      const country = detectCountry(number);
      
      // Validate phone number format
      const validation = validatePhoneNumber(number);
      
      if (!validation.valid) {
        results.push({
          phone: `+${number}`,
          exists: false,
          error: validation.error || "Invalid phone number format",
          country: validation.country || country,
        });
        continue; // Skip WhatsApp check for invalid numbers
      }

      try {
        // Format for WhatsApp: number@s.whatsapp.net
        const jid = `${number}@s.whatsapp.net`;
        const [result] = await sock.onWhatsApp(jid);

        results.push({
          phone: `+${number}`,
          exists: !!result?.exists,
          jid: result?.jid || null,
          country: validation.country || country,
        });
      } catch (error) {
        results.push({
          phone: `+${number}`,
          exists: false,
          error: error.message,
          country: country,
        });
      }
    }

    res.json({
      success: true,
      total: results.length,
      valid: results.filter((r) => r.exists).length,
      invalid: results.filter((r) => !r.exists).length,
      results,
    });
  } catch (error) {
    console.error("Verification error:", error);
    res.status(500).json({
      error: error.message || "An error occurred during verification",
    });
  }
});

// Serve the frontend
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`🚀 WhatsApp Number Checker running at http://localhost:${PORT}`);
  console.log('📱 Click "Connect WhatsApp" in the app to start');
});
