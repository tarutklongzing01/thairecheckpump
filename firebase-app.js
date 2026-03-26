import { firebaseConfig, appSettings } from "./firebase-config.js?v=20260326-3";
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-app.js";
import { getAnalytics, isSupported as isAnalyticsSupported } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-analytics.js";
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";
import { getDownloadURL, getStorage, ref, uploadBytes } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-storage.js";

const FALLBACK_STORAGE_KEY = "thairecheckpump-fallback-reports";
const DEFAULT_GOOGLE_SHEET_REFRESH_MS = 30000;
const DEFAULT_FUEL_PRICES_ENDPOINT = "./fuel-prices.json";
const DEFAULT_ADMIN_USAGE_ENDPOINT = "/api/vercel-usage";
const DEFAULT_PUMPRADAR_PROXY_ENDPOINT = "/api/pumpradar-province";
const PUMPRADAR_PROXY_ENDPOINT_STORAGE_KEY = "thairecheckpump-pumpradar-proxy-endpoint";
const DEFAULT_ADMIN_USAGE_REFRESH_MS = 300000;

const FUELS = [
  { id: "diesel", label: "ดีเซล" },
  { id: "gas91", label: "แก๊สโซฮอล์ 91" },
  { id: "gas95", label: "แก๊สโซฮอล์ 95" },
  { id: "e20", label: "E20" },
  { id: "e85", label: "E85" },
  { id: "lpg", label: "LPG" },
];

const BRANDS = ["ปตท.", "บางจาก", "PT", "Shell", "Esso", "ซัสโก้", "Caltex"];

const FUEL_LABELS = Object.fromEntries(FUELS.map((fuel) => [fuel.id, fuel.label]));
const FUEL_PRICE_ID_ALIASES = {
  diesel: "diesel",
  b7: "diesel",
  diesel_b7: "diesel",
  gas91: "gas91",
  gasohol91: "gas91",
  gas95: "gas95",
  gasohol95: "gas95",
  e20: "e20",
  e85: "e85",
  lpg: "lpg",
};

const FUEL_PRICE_BRAND_ID_ALIASES = {
  ptt: "ptt",
  bangchak: "bcp",
  bcp: "bcp",
  shell: "shell",
  caltex: "caltex",
  irpc: "irpc",
  pt: "pt",
  susco: "susco",
  pure: "pure",
  suscodealers: "suscodealers",
  esso: "esso",
};

const FUEL_PRICE_BRAND_PRIORITY = ["ptt", "bcp", "pt", "shell", "caltex", "susco", "esso", "irpc", "pure", "suscodealers"];
const FUEL_PRICE_BRAND_LABELS = {
  ptt: BRANDS[0],
  bcp: BRANDS[1],
  pt: BRANDS[2],
  shell: BRANDS[3],
  esso: BRANDS[4],
  susco: BRANDS[5],
  caltex: BRANDS[6],
  irpc: "IRPC",
  pure: "Pure",
  suscodealers: "SUSCO Dealers",
};
const STATION_BRAND_TO_FUEL_PRICE_BRAND = {
  [BRANDS[0]]: "ptt",
  [BRANDS[1]]: "bcp",
  [BRANDS[2]]: "pt",
  [BRANDS[3]]: "shell",
  [BRANDS[4]]: "esso",
  [BRANDS[5]]: "susco",
  [BRANDS[6]]: "caltex",
};

const STATUS_META = {
  high: { label: "พร้อมจ่าย", tone: "tone-ok", score: 1 },
  medium: { label: "เหลือน้อย", tone: "tone-warn", score: 0.66 },
  low: { label: "ใกล้หมด", tone: "tone-alert", score: 0.33 },
  empty: { label: "หมด", tone: "tone-empty", score: 0 },
  unknown: { label: "ยังไม่มีข้อมูล", tone: "tone-muted", score: -1 },
};

const BRAND_COLORS = {
  "ปตท.": "#ff7b32",
  บางจาก: "#6ede74",
  PT: "#0fc2c0",
  Shell: "#ffd166",
  Esso: "#ff5d5d",
  ซัสโก้: "#9ecae1",
  Caltex: "#6aa8ff",
};

BRANDS.push("อื่นๆ");
BRAND_COLORS["อื่นๆ"] = "#94a3b8";

const BRAND_LABEL_MAP = {
  PTT: "ปตท.",
  "ปตท.": "ปตท.",
  BANGCHAK: "บางจาก",
  บางจาก: "บางจาก",
  PT: "PT",
  SHELL: "Shell",
  ESSO: "Esso",
  SUSCO: "ซัสโก้",
  CALTEX: "Caltex",
  OTHER: "อื่นๆ",
  "อื่นๆ": "อื่นๆ",
};

const PUMPRADAR_STATUS_MAP = {
  available: "high",
  limited: "medium",
  out: "empty",
  unknown: "unknown",
};

const PUMPRADAR_FUEL_MAP = {
  diesel: ["diesel"],
  gas91: ["benzineG91", "benzine91"],
  gas95: ["benzineG95", "benzine95"],
  e20: ["benzineE20", "e20"],
  e85: ["benzineE85", "e85"],
  lpg: ["lpg"],
};

const PUMPRADAR_PROVINCES = [
  { slug: "amnat-charoen", label: "อำนาจเจริญ" },
  { slug: "ang-thong", label: "อ่างทอง" },
  { slug: "bangkok", label: "กรุงเทพมหานคร" },
  { slug: "bueng-kan", label: "บึงกาฬ" },
  { slug: "buriram", label: "บุรีรัมย์" },
  { slug: "chachoengsao", label: "ฉะเชิงเทรา" },
  { slug: "chai-nat", label: "ชัยนาท" },
  { slug: "chaiyaphum", label: "ชัยภูมิ" },
  { slug: "chanthaburi", label: "จันทบุรี" },
  { slug: "chiang-mai", label: "เชียงใหม่" },
  { slug: "chiang-rai", label: "เชียงราย" },
  { slug: "chonburi", label: "ชลบุรี" },
  { slug: "chumphon", label: "ชุมพร" },
  { slug: "kalasin", label: "กาฬสินธุ์" },
  { slug: "kamphaeng-phet", label: "กำแพงเพชร" },
  { slug: "kanchanaburi", label: "กาญจนบุรี" },
  { slug: "khon-kaen", label: "ขอนแก่น" },
  { slug: "krabi", label: "กระบี่" },
  { slug: "lampang", label: "ลำปาง" },
  { slug: "lamphun", label: "ลำพูน" },
  { slug: "loei", label: "เลย" },
  { slug: "lopburi", label: "ลพบุรี" },
  { slug: "mae-hong-son", label: "แม่ฮ่องสอน" },
  { slug: "maha-sarakham", label: "มหาสารคาม" },
  { slug: "mukdahan", label: "มุกดาหาร" },
  { slug: "nakhon-nayok", label: "นครนายก" },
  { slug: "nakhon-pathom", label: "นครปฐม" },
  { slug: "nakhon-phanom", label: "นครพนม" },
  { slug: "nakhon-ratchasima", label: "นครราชสีมา" },
  { slug: "nakhon-sawan", label: "นครสวรรค์" },
  { slug: "nakhon-si-thammarat", label: "นครศรีธรรมราช" },
  { slug: "nan", label: "น่าน" },
  { slug: "narathiwat", label: "นราธิวาส" },
  { slug: "nong-bua-lamphu", label: "หนองบัวลำภู" },
  { slug: "nong-khai", label: "หนองคาย" },
  { slug: "nonthaburi", label: "นนทบุรี" },
  { slug: "pathum-thani", label: "ปทุมธานี" },
  { slug: "pattani", label: "ปัตตานี" },
  { slug: "phang-nga", label: "พังงา" },
  { slug: "phatthalung", label: "พัทลุง" },
  { slug: "phayao", label: "พะเยา" },
  { slug: "phetchabun", label: "เพชรบูรณ์" },
  { slug: "phetchaburi", label: "เพชรบุรี" },
  { slug: "phichit", label: "พิจิตร" },
  { slug: "phitsanulok", label: "พิษณุโลก" },
  { slug: "phra-nakhon-si-ayutthaya", label: "พระนครศรีอยุธยา" },
  { slug: "phrae", label: "แพร่" },
  { slug: "phuket", label: "ภูเก็ต" },
  { slug: "prachinburi", label: "ปราจีนบุรี" },
  { slug: "prachuap-khiri-khan", label: "ประจวบคีรีขันธ์" },
  { slug: "ranong", label: "ระนอง" },
  { slug: "ratchaburi", label: "ราชบุรี" },
  { slug: "rayong", label: "ระยอง" },
  { slug: "roi-et", label: "ร้อยเอ็ด" },
  { slug: "sa-kaeo", label: "สระแก้ว" },
  { slug: "sakon-nakhon", label: "สกลนคร" },
  { slug: "samut-prakan", label: "สมุทรปราการ" },
  { slug: "samut-sakhon", label: "สมุทรสาคร" },
  { slug: "samut-songkhram", label: "สมุทรสงคราม" },
  { slug: "saraburi", label: "สระบุรี" },
  { slug: "satun", label: "สตูล" },
  { slug: "sing-buri", label: "สิงห์บุรี" },
  { slug: "sisaket", label: "ศรีสะเกษ" },
  { slug: "songkhla", label: "สงขลา" },
  { slug: "sukhothai", label: "สุโขทัย" },
  { slug: "suphan-buri", label: "สุพรรณบุรี" },
  { slug: "surat-thani", label: "สุราษฎร์ธานี" },
  { slug: "surin", label: "สุรินทร์" },
  { slug: "tak", label: "ตาก" },
  { slug: "trang", label: "ตรัง" },
  { slug: "trat", label: "ตราด" },
  { slug: "ubon-ratchathani", label: "อุบลราชธานี" },
  { slug: "udon-thani", label: "อุดรธานี" },
  { slug: "uthai-thani", label: "อุทัยธานี" },
  { slug: "uttaradit", label: "อุตรดิตถ์" },
  { slug: "yala", label: "ยะลา" },
  { slug: "yasothon", label: "ยโสธร" },
];

const PUMPRADAR_PROVINCE_SLUGS = PUMPRADAR_PROVINCES.map((province) => province.slug);
const DEFAULT_IMPORT_PROVINCE_SLUG = "chonburi";

const DEMO_STATIONS = [
  {
    id: "ptt-bangna",
    name: "ปตท. บางนา กม.5",
    area: "บางนา",
    brand: "ปตท.",
    lat: 13.6698,
    lng: 100.6344,
    reportCount: 12,
    updatedMinutes: 5,
    fuelStates: { diesel: "high", gas91: "medium", gas95: "high", e20: "medium", e85: "empty", lpg: "high" },
  },
  {
    id: "bangchak-suk62",
    name: "บางจาก สุขุมวิท 62",
    area: "พระโขนง",
    brand: "บางจาก",
    lat: 13.6915,
    lng: 100.6042,
    reportCount: 9,
    updatedMinutes: 8,
    fuelStates: { diesel: "medium", gas91: "high", gas95: "medium", e20: "high", e85: "low", lpg: "unknown" },
  },
  {
    id: "pt-rama4",
    name: "PT พระราม 4",
    area: "คลองเตย",
    brand: "PT",
    lat: 13.7155,
    lng: 100.5679,
    reportCount: 6,
    updatedMinutes: 12,
    fuelStates: { diesel: "low", gas91: "medium", gas95: "high", e20: "high", e85: "medium", lpg: "high" },
  },
  {
    id: "shell-onnut",
    name: "Shell อ่อนนุช 17",
    area: "อ่อนนุช",
    brand: "Shell",
    lat: 13.7103,
    lng: 100.6149,
    reportCount: 4,
    updatedMinutes: 18,
    fuelStates: { diesel: "empty", gas91: "unknown", gas95: "low", e20: "medium", e85: "medium", lpg: "unknown" },
  },
];

const DEMO_REPORTS = [
  {
    id: "demo-1",
    stationId: "ptt-bangna",
    station: "ปตท. บางนา กม.5",
    brand: "ปตท.",
    area: "บางนา",
    lat: 13.6698,
    lng: 100.6344,
    fuel: "diesel",
    status: "high",
    note: "หัวจ่ายฝั่งซ้ายคิวสั้น เติมต่อเนื่องได้",
    reporter: "กฤต",
    createdAtMs: minutesAgoToMs(6),
    photoUrl: "",
    source: "demo",
  },
  {
    id: "demo-2",
    stationId: "bangchak-suk62",
    station: "บางจาก สุขุมวิท 62",
    brand: "บางจาก",
    area: "พระโขนง",
    lat: 13.6915,
    lng: 100.6042,
    fuel: "gas95",
    status: "medium",
    note: "ยังมี 95 แต่คิวรถเริ่มหนาแน่น",
    reporter: "มีน",
    createdAtMs: minutesAgoToMs(9),
    photoUrl: "",
    source: "demo",
  },
  {
    id: "demo-3",
    stationId: "shell-onnut",
    station: "Shell อ่อนนุช 17",
    brand: "Shell",
    area: "อ่อนนุช",
    lat: 13.7103,
    lng: 100.6149,
    fuel: "diesel",
    status: "empty",
    note: "ดีเซลหมดชั่วคราว เหลือ E20 และ E85",
    reporter: "อิฐ",
    createdAtMs: minutesAgoToMs(14),
    photoUrl: "demo",
    source: "demo",
  },
  {
    id: "demo-4",
    stationId: "pt-rama4",
    station: "PT พระราม 4",
    brand: "PT",
    area: "คลองเตย",
    lat: 13.7155,
    lng: 100.5679,
    fuel: "lpg",
    status: "high",
    note: "LPG เติมได้ตามปกติ คิวไม่เกิน 3 คัน",
    reporter: "เมธ",
    createdAtMs: minutesAgoToMs(18),
    photoUrl: "demo",
    source: "demo",
  },
  {
    id: "demo-5",
    stationId: "ptt-bangna",
    station: "ปตท. บางนา กม.5",
    brand: "ปตท.",
    area: "บางนา",
    lat: 13.6698,
    lng: 100.6344,
    fuel: "gas95",
    status: "high",
    note: "95 จ่ายได้ปกติและคิวค่อนข้างไหลเร็ว",
    reporter: "ปาล์ม",
    createdAtMs: minutesAgoToMs(27),
    photoUrl: "",
    source: "demo",
  },
];

const store = {
  page: "",
  mode: "loading",
  stationSource: {
    type: "demo",
    url: "",
    generatedAtMs: 0,
  },
  fuelPrices: {
    status: "idle",
    source: "",
    url: "",
    updatedAtMs: 0,
    effectiveAt: "",
    note: "",
    currency: "THB",
    defaultBrand: "",
    brands: [],
    unit: "บาท/ลิตร",
    items: [],
    error: "",
  },
  adminUsage: {
    status: "idle",
    label: "-",
    detail: "ยังไม่ได้ตรวจสอบ Vercel usage",
    percent: 0,
    billedCost: 0,
    effectiveCost: 0,
    chargeCount: 0,
    serviceCount: 0,
    projectName: "",
    rangeDays: 30,
    updatedAt: "",
    note: "ตรวจสอบ usage และ cost ของ Vercel ได้จากหน้า admin นี้",
  },
  adminUsageTimerId: 0,
  adminUsageLoading: false,
  app: null,
  analytics: null,
  auth: null,
  db: null,
  storage: null,
  user: null,
  location: null,
  locationWatchId: null,
  stations: [],
  reports: [],
  unsubs: [],
  pageController: null,
  authReady: false,
  liveHint: "",
  sheetRefreshTimerId: 0,
  sheetRefreshInFlight: false,
  mediaRefreshTimerId: 0,
  mediaUrlCache: new Map(),
  mediaUrlInflight: new Map(),
  firebaseStatus: {
    configReady: hasFirebaseConfig(),
    appReady: false,
    dbReady: false,
    storageReady: false,
    listeners: {
      stations: { status: "idle", count: 0 },
      reports: { status: "idle", count: 0 },
    },
    lastError: "",
    lastErrorCode: "",
    lastErrorSource: "",
    lastErrorAtMs: 0,
  },
};

document.addEventListener("DOMContentLoaded", bootstrap);

async function bootstrap() {
  store.page = document.body.dataset.page || "home";

  markActiveNavigation();
  setFooterYear();
  bindLocationButtons();
  bindAuthButtons();
  store.pageController = createPageController(store.page);
  store.pageController?.init?.();

  renderGlobalChrome();
  await setupLocation();
  void loadFuelPricesFromConfiguredSources();

  if (hasFirebaseConfig()) {
    await connectFirebase();
  } else if (canLoadStationsFromStaticJson()) {
    await connectStaticJsonOnly();
  } else if (canLoadStationsFromGoogleSheet()) {
    await connectGoogleSheetOnly();
  } else if (wantsStaticJsonStations()) {
    useFallbackMode("ตั้งค่าไฟล์ข้อมูล stations สำหรับเว็บยังไม่ครบ จึงใช้ข้อมูลสำรองภายในเว็บแทน");
  } else if (wantsGoogleSheetStations()) {
    useFallbackMode("ตั้งค่า Google Sheet endpoint สำหรับ stations ยังไม่ครบ จึงใช้ข้อมูลสำรองภายในเว็บแทน");
  } else {
    useFallbackMode("ยังไม่ได้ตั้งค่า Firebase config จึงใช้ข้อมูลสำรองและ fallback reports ในเบราว์เซอร์นี้");
  }

  ensureGoogleSheetAutoRefresh();
  refreshCurrentPage();
}

async function connectFirebase() {
  try {
    store.app = initializeApp(firebaseConfig);
    await initializeAnalyticsIfSupported();
    store.auth = getAuth(store.app);
    store.db = getFirestore(store.app);
    store.storage = getStorage(store.app);
    setStationSource("firestore");
    syncFirebaseComponentState();
    store.mode = "firebase";
    store.liveHint = canLoadStationsFromStaticJson()
      ? "กำลังเชื่อม Firebase และโหลดสถานีจากไฟล์ข้อมูลภายในเว็บ"
      : canLoadStationsFromGoogleSheet()
        ? "กำลังเชื่อม Firebase และโหลดสถานีจาก Google Sheet"
        : "กำลังเชื่อม Firestore และรอ listener จาก Firebase";
    renderGlobalChrome();

    onAuthStateChanged(store.auth, async (user) => {
      if (user?.isAnonymous) {
        await signOut(store.auth);
        return;
      }
      store.user = user;
      store.authReady = true;
      renderGlobalChrome();
      refreshCurrentPage();
    });

    let loadedStationsFromSheet = false;
    if (canLoadStationsFromStaticJson()) {
      loadedStationsFromSheet = await loadStationsFromStaticJson();
    } else if (canLoadStationsFromGoogleSheet()) {
      loadedStationsFromSheet = await loadStationsFromGoogleSheet();
    }

    subscribeRealtime({
      includeStations: !loadedStationsFromSheet,
      includeReports: true,
    });

    if (loadedStationsFromSheet) {
      store.liveHint = "";
    } else if (wantsStaticJsonStations()) {
      store.liveHint = "ไฟล์ข้อมูลภายในเว็บใช้งานไม่ได้ จึงกลับมาอ่านสถานีจาก Firestore";
    } else if (wantsGoogleSheetStations()) {
      store.liveHint = "Google Sheet endpoint ใช้งานไม่ได้ จึงกลับมาอ่านสถานีจาก Firestore";
    } else {
      store.liveHint = "";
    }
    renderGlobalChrome();
  } catch (error) {
    console.error(error);
    noteFirebaseError("connect", error);
    useFallbackMode(`เชื่อม Firebase ไม่สำเร็จ: ${humanizeError(error)}`);
  }
}

async function connectGoogleSheetOnly() {
  try {
    store.mode = "sheet";
    store.reports = [];
    store.liveHint = "กำลังโหลดข้อมูลสถานีจาก Google Sheet";
    renderGlobalChrome();

    const loaded = await loadStationsFromGoogleSheet();
    if (!loaded) {
      throw new Error("Google Sheet endpoint ไม่พร้อมใช้งาน");
    }

    store.liveHint = "หน้าเว็บกำลังใช้ข้อมูลสถานีจาก Google Sheet";
    renderGlobalChrome();
  } catch (error) {
    console.error(error);
    useFallbackMode(`โหลดข้อมูลจาก Google Sheet ไม่สำเร็จ: ${humanizeError(error)}`);
  }
}

async function connectStaticJsonOnly() {
  try {
    store.mode = "static";
    store.reports = [];
    store.liveHint = "กำลังโหลดข้อมูลสถานีจากไฟล์ข้อมูลภายในเว็บ";
    renderGlobalChrome();

    const loaded = await loadStationsFromStaticJson();
    if (!loaded) {
      throw new Error("ไฟล์ข้อมูลภายในเว็บยังไม่พร้อมใช้งาน");
    }

    store.liveHint = "หน้าเว็บกำลังใช้ข้อมูลสถานีจากไฟล์ข้อมูลภายในเว็บ";
    renderGlobalChrome();
  } catch (error) {
    console.error(error);
    useFallbackMode(`โหลดข้อมูลจากไฟล์ภายในเว็บไม่สำเร็จ: ${humanizeError(error)}`);
  }
}

async function initializeAnalyticsIfSupported() {
  if (!firebaseConfig.measurementId || !store.app) {
    return;
  }

  try {
    const supported = await isAnalyticsSupported();
    if (supported) {
      store.analytics = getAnalytics(store.app);
    }
  } catch (error) {
    return;
  }
}

function subscribeRealtime(options = {}) {
  const { includeStations = true, includeReports = true } = options;
  cleanupRealtime();

  if (includeStations) {
    setFirebaseListenerState("stations", "connecting", 0);

    const stationQuery = query(
      collection(store.db, appSettings.collections.stations),
      orderBy("updatedAt", "desc"),
      limit(appSettings.maxStationDocs)
    );

    store.unsubs.push(
      onSnapshot(
        stationQuery,
        (snapshot) => {
          setStationSource("firestore");
          setFirebaseListenerState("stations", "ok", snapshot.size);
          store.stations = snapshot.docs.map(mapStationDoc);
          refreshCurrentPage();
        },
        (error) => handleRealtimeError("stations", error)
      )
    );
  } else {
    setFirebaseListenerState("stations", store.stationSource.type === "google-sheet" ? "sheet" : "idle", store.stations.length);
  }

  if (includeReports) {
    setFirebaseListenerState("reports", "connecting", 0);

    const reportQuery = query(
      collection(store.db, appSettings.collections.reports),
      orderBy("createdAt", "desc"),
      limit(appSettings.maxFeedDocs)
    );

    store.unsubs.push(
      onSnapshot(
        reportQuery,
        (snapshot) => {
          setFirebaseListenerState("reports", "ok", snapshot.size);
          store.reports = snapshot.docs.map(mapReportDoc);
          refreshCurrentPage();
        },
        (error) => handleRealtimeError("reports", error)
      )
    );
  } else {
    setFirebaseListenerState("reports", "idle", store.reports.length);
  }
}

function cleanupRealtime() {
  store.unsubs.forEach((unsubscribe) => unsubscribe());
  store.unsubs = [];
}

function handleRealtimeError(source, error) {
  console.error(source, error);
  noteFirebaseError(source, error);
  useFallbackMode(`อ่านข้อมูลสดจาก ${source} ไม่ได้: ${humanizeError(error)}`);
}

function useFallbackMode(message) {
  cleanupRealtime();
  store.mode = "demo";
  setStationSource("demo");
  store.liveHint = message;
  syncFirebaseComponentState();
  const localReports = loadFallbackReports();
  store.reports = [...DEMO_REPORTS, ...localReports].sort((left, right) => getReportAge(left) - getReportAge(right));
  store.stations = DEMO_STATIONS.map((station) => ({
    ...station,
    fuelStates: normalizeFuelStates(station.fuelStates),
  }));
  renderGlobalChrome();
}

async function setupLocation() {
  if (!("geolocation" in navigator)) {
    store.liveHint = "เบราว์เซอร์นี้ไม่รองรับ geolocation";
    renderGlobalChrome();
    return;
  }

  if (navigator.permissions && navigator.permissions.query) {
    try {
      const permission = await navigator.permissions.query({ name: "geolocation" });
      updateLocationPermission(permission.state);
      permission.onchange = () => {
        updateLocationPermission(permission.state);
        if (permission.state === "granted") {
          startLocationWatch();
        }
      };
      if (permission.state === "granted") {
        startLocationWatch();
      } else if (appSettings.autoRequestLocationOn.includes(store.page)) {
        requestUserLocation();
      }
      return;
    } catch (error) {
      return;
    }
  }

  if (appSettings.autoRequestLocationOn.includes(store.page)) {
    requestUserLocation();
  }
}

function bindLocationButtons() {
  document.querySelectorAll("[data-request-location]").forEach((button) => {
    button.addEventListener("click", () => {
      requestUserLocation();
    });
  });
}

function requestUserLocation() {
  if (!("geolocation" in navigator)) {
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (position) => {
      setLocation(position);
      startLocationWatch();
    },
    (error) => {
      store.liveHint = `ยังไม่ได้ตำแหน่งผู้ใช้: ${humanizeLocationError(error)}`;
      renderGlobalChrome();
    },
    { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 }
  );
}

function startLocationWatch() {
  if (store.locationWatchId !== null || !("geolocation" in navigator)) {
    return;
  }

  store.locationWatchId = navigator.geolocation.watchPosition(
    (position) => setLocation(position),
    (error) => {
      store.liveHint = `ติดตามตำแหน่งต่อเนื่องไม่ได้: ${humanizeLocationError(error)}`;
      renderGlobalChrome();
    },
    { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 }
  );
}

function setLocation(position) {
  store.location = {
    lat: position.coords.latitude,
    lng: position.coords.longitude,
    accuracy: position.coords.accuracy,
  };
  hydrateLocationFields();
  renderGlobalChrome();
  refreshCurrentPage();
}

function createPageController(page) {
  if (page === "home") {
    return createHomeController();
  }
  if (page === "feed") {
    return createFeedController();
  }
  if (page === "gallery") {
    return createGalleryController();
  }
  if (page === "dashboard") {
    return createDashboardController();
  }
  if (page === "report") {
    return createReportController();
  }
  if (page === "about") {
    return createAboutController();
  }
  if (page === "admin") {
    return createAdminController();
  }
  return null;
}

function isGoogleUser(user = store.user) {
  return Boolean(user && !user.isAnonymous && user.providerData?.some((provider) => provider.providerId === "google.com"));
}

function getGoogleUserEmail(user = store.user) {
  return String(user?.email || "").trim().toLowerCase();
}

function getGoogleUserLabel(user = store.user) {
  if (!user) {
    return "";
  }
  return String(user.displayName || user.email || user.uid || "").trim();
}

function getAdminEmailAllowlist() {
  return Array.isArray(appSettings.adminEmails)
    ? appSettings.adminEmails.map((email) => String(email || "").trim().toLowerCase()).filter(Boolean)
    : [];
}

function canWriteReports() {
  return store.mode === "firebase" && Boolean(store.db) && isGoogleUser();
}

function hasAdminAccess() {
  if (store.mode !== "firebase" || !store.db || !isGoogleUser()) {
    return false;
  }

  const allowlist = getAdminEmailAllowlist();
  if (!allowlist.length) {
    return true;
  }

  return allowlist.includes(getGoogleUserEmail());
}

function bindAuthButtons() {
  document.querySelectorAll("[data-google-sign-in]").forEach((button) => {
    button.addEventListener("click", async () => {
      await handleGoogleSignIn(button);
    });
  });

  document.querySelectorAll("[data-google-sign-out]").forEach((button) => {
    button.addEventListener("click", async () => {
      await handleGoogleSignOut(button);
    });
  });
}

async function handleGoogleSignIn(trigger) {
  const messageNode = trigger?.closest("[data-auth-panel], [data-auth-gate]")?.querySelector("[data-auth-message]");

  try {
    if (store.mode !== "firebase" || !store.auth) {
      throw new Error("หน้านี้ยังไม่เชื่อม Firebase จึงยังล็อกอินด้วย Google ไม่ได้");
    }

    setMessage(messageNode, "กำลังเปิดหน้าล็อกอิน Google...");
    store.liveHint = "กำลังเปิด Google sign-in";
    renderGlobalChrome();
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    await signInWithPopup(store.auth, provider);
    setMessage(messageNode, "");
    store.liveHint = "ล็อกอิน Google สำเร็จแล้ว";
    renderGlobalChrome();
  } catch (error) {
    console.error(error);
    maybeTrackFirebaseError("auth", error);
    setMessage(messageNode, humanizeError(error));
    store.liveHint = humanizeError(error);
    renderGlobalChrome();
  }
}

async function handleGoogleSignOut(trigger) {
  const messageNode = trigger?.closest("[data-auth-panel], [data-auth-gate]")?.querySelector("[data-auth-message]");

  try {
    if (!store.auth) {
      return;
    }

    setMessage(messageNode, "กำลังออกจากระบบ...");
    store.liveHint = "กำลังออกจากระบบ Google";
    renderGlobalChrome();
    await signOut(store.auth);
    setMessage(messageNode, "");
    store.liveHint = "ออกจากระบบ Google แล้ว";
    renderGlobalChrome();
  } catch (error) {
    console.error(error);
    maybeTrackFirebaseError("auth", error);
    setMessage(messageNode, humanizeError(error));
    store.liveHint = humanizeError(error);
    renderGlobalChrome();
  }
}

function createHomeController() {
  const state = {
    fuel: "diesel",
    brands: new Set(BRANDS),
    radius: appSettings.defaultRadiusKm,
    map: null,
    stationLayer: null,
    overlayLayer: null,
  };

  return {
    init() {
      ensureHomeMap(state);

      renderSingleChoiceChips(document.querySelector("[data-fuel-chips]"), FUELS, () => state.fuel, (fuelId) => {
        state.fuel = fuelId;
        this.render();
      });

      renderMultiChoiceChips(
        document.querySelector("[data-brand-chips]"),
        BRANDS.map((brand) => ({ id: brand, label: brand })),
        state.brands,
        (brand) => {
          if (state.brands.has(brand)) {
            if (state.brands.size > 1) {
              state.brands.delete(brand);
            }
          } else {
            state.brands.add(brand);
          }
          this.render();
        }
      );

      const radiusInput = document.querySelector("[data-radius-input]");
      if (radiusInput) {
        radiusInput.value = `${state.radius}`;
        radiusInput.addEventListener("input", () => {
          state.radius = Number(radiusInput.value);
          this.render();
        });
      }
    },
    render() {
      const runtime = getRuntimeData(state.radius);
      const filteredStations = runtime.stations.filter((station) => state.brands.has(station.brand) && station.distanceKm <= state.radius);
      const visibleStations = [...filteredStations].sort((left, right) => {
        if (left.updatedMinutes !== right.updatedMinutes) {
          return left.updatedMinutes - right.updatedMinutes;
        }
        return left.distanceKm - right.distanceKm;
      });

      const knownStations = visibleStations.filter((station) => statusScore(station.fuels[state.fuel]) >= 0);
      const readyStations = knownStations.filter((station) => statusScore(station.fuels[state.fuel]) >= 0.66);
      const fastUpdates = knownStations.filter((station) => station.updatedMinutes <= 15);
      const reportCount = visibleStations.reduce((total, station) => total + station.reports, 0);

      setText("[data-radius-value]", `${state.radius.toFixed(0)} กม.`);
      setText("[data-home-visible]", `${visibleStations.length}`);
      setText("[data-home-ready]", `${readyStations.length}`);
      setText("[data-home-fast]", `${fastUpdates.length}`);
      setText("[data-home-reports]", `${reportCount}`);
      setText(
        "[data-home-summary]",
        `${store.mode === "firebase" ? "โหมดสด" : store.mode === "static" ? "โหมดข้อมูลภายในเว็บ" : "โหมดสำรอง"} | ${FUEL_LABELS[state.fuel]} | ${
          store.location ? "อิงตำแหน่งผู้ใช้จริง" : "อิงตำแหน่งกลางเริ่มต้น"
        }`
      );

      renderHomeFuelPrices(state.fuel, state.brands);
      renderHomeMap(state, visibleStations, state.fuel, state.radius);
      renderHTML(
        "[data-station-list]",
        visibleStations.length ? visibleStations.map((station) => renderStationCard(station, state.fuel)).join("") : renderEmptyState("ยังไม่มีสถานีที่ตรงกับฟิลเตอร์นี้")
      );
    },
  };
}

function renderHomeFuelPrices(selectedFuelId, selectedBrands) {
  const brandState = getHomeFuelPriceBrandState(selectedBrands);
  const note = getHomeFuelPricesNote(brandState);
  const updatedLabel = getHomeFuelPricesUpdatedLabel();
  const items = getHomeFuelPriceItems(brandState);

  setText("[data-home-price-note]", note);
  setText("[data-home-price-updated]", updatedLabel);
  renderHTML(
    "[data-home-price-grid]",
    items.length
      ? items.map((item) => renderHomeFuelPriceCard(item, selectedFuelId)).join("")
      : renderEmptyState("ยังไม่มีข้อมูลราคาน้ำมันสำหรับแสดงบนหน้าแรก")
  );
}

function getHomeFuelPriceBrandState(selectedBrands) {
  const brands = Array.isArray(store.fuelPrices?.brands) ? store.fuelPrices.brands : [];
  if (!brands.length) {
    return null;
  }

  const brandsById = new Map(brands.map((brand) => [brand.id, brand]));
  const selectedBrandIds = Array.from(selectedBrands || [])
    .map((brand) => mapStationBrandToFuelPriceBrandId(brand))
    .filter((brandId, index, list) => brandId && list.indexOf(brandId) === index);
  const selectedMatches = selectedBrandIds.filter((brandId) => brandsById.has(brandId));

  if (selectedMatches.length === 1) {
    return {
      brand: brandsById.get(selectedMatches[0]),
      reason: "selected-single",
    };
  }

  if (selectedMatches.length > 1) {
    return {
      brand: brandsById.get(selectedMatches[0]),
      reason: "selected-multi",
    };
  }

  const defaultBrandId = normalizeFuelPriceBrandId(store.fuelPrices?.defaultBrand);
  if (defaultBrandId && brandsById.has(defaultBrandId)) {
    return {
      brand: brandsById.get(defaultBrandId),
      reason: selectedBrandIds.length ? "fallback-default" : "default",
    };
  }

  return {
    brand: brands[0],
    reason: selectedBrandIds.length ? "fallback-first" : "first-available",
  };
}

function getHomeFuelPriceItems(brandState) {
  const sourceItems = Array.isArray(brandState?.brand?.items) && brandState.brand.items.length ? brandState.brand.items : Array.isArray(store.fuelPrices?.items) ? store.fuelPrices.items : [];
  const itemMap = new Map(sourceItems.map((item) => [item.id, item]));

  return FUELS.map((fuel) => {
    const existing = itemMap.get(fuel.id);
    if (existing) {
      return existing;
    }

    return {
      id: fuel.id,
      label: fuel.label,
      price: Number.NaN,
      note: "รออัปเดตราคา",
    };
  });
}

function getHomeFuelPricesNote(brandState) {
  if (store.fuelPrices.status === "loading") {
    return "กำลังโหลดราคาน้ำมันอ้างอิงจากไฟล์สาธารณะ...";
  }
  if (store.fuelPrices.status === "error") {
    return store.fuelPrices.error || "โหลดราคาน้ำมันไม่สำเร็จ";
  }
  const noteParts = [];
  if (store.fuelPrices.note) {
    noteParts.push(store.fuelPrices.note);
  }

  const brandLabel = String(brandState?.brand?.label || "").trim();
  if (brandLabel) {
    if (brandState.reason === "selected-single") {
      noteParts.push(`แสดงชุดราคา ${brandLabel}`);
    } else if (brandState.reason === "selected-multi") {
      noteParts.push(`เลือกชุดราคา ${brandLabel} เพราะกำลังดูหลายแบรนด์`);
    } else if (brandState.reason === "fallback-default" || brandState.reason === "fallback-first") {
      noteParts.push(`ไม่พบราคาของแบรนด์ที่เลือก จึงแสดง ${brandLabel}`);
    } else {
      noteParts.push(`แสดงชุดราคา ${brandLabel}`);
    }
  }

  if (noteParts.length) {
    return noteParts.join(" | ");
  }
  if (store.fuelPrices.updatedAtMs > 0) {
    return `อัปเดตล่าสุด ${formatAdminTimestamp(store.fuelPrices.effectiveAt || store.fuelPrices.updatedAtMs)}`;
  }
  return "ยังไม่มีข้อมูลราคาน้ำมันอ้างอิง";
}

function getHomeFuelPricesUpdatedLabel() {
  if (store.fuelPrices.status === "error") {
    return "ราคาโหลดไม่สำเร็จ";
  }
  if (store.fuelPrices.status === "loading") {
    return "กำลังโหลดราคา";
  }
  if (store.fuelPrices.updatedAtMs > 0) {
    return `อัปเดต ${formatShortAge(getAgeMinutesFromMs(store.fuelPrices.updatedAtMs))}`;
  }
  return "รออัปเดต";
}

function renderHomeFuelPriceCard(item, selectedFuelId) {
  const isActive = item.id === selectedFuelId;
  const priceText = formatFuelPriceValue(item.price, store.fuelPrices.unit);
  const metaText = item.note || (Number.isFinite(item.price) ? store.fuelPrices.unit : "รออัปเดตราคา");

  return `
    <article class="home-fuel-price-card${isActive ? " is-active" : ""}">
      <div class="home-fuel-price-card-head">
        <span class="tiny-badge">${escapeHtml(item.id)}</span>
        ${isActive ? '<span class="status-badge tone-ok">Fuel Filter</span>' : ""}
      </div>
      <strong>${escapeHtml(item.label)}</strong>
      <div class="home-fuel-price-value">${escapeHtml(priceText)}</div>
      <small>${escapeHtml(metaText)}</small>
    </article>
  `;
}

function formatFuelPriceValue(value, unit) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) {
    return "รออัปเดต";
  }
  return `${amount.toFixed(2)} ${unit || "บาท/ลิตร"}`;
}

function mapStationBrandToFuelPriceBrandId(value) {
  const normalizedBrand = normalizeBrandLabel(value);
  return STATION_BRAND_TO_FUEL_PRICE_BRAND[normalizedBrand] || normalizeFuelPriceBrandId(value);
}

function ensureHomeMap(state) {
  const host = document.querySelector("[data-home-map]");
  if (!host || state.map) {
    return;
  }

  if (!window.L) {
    setHomeMapNote("โหลดแผนที่ไม่ได้ในขณะนี้");
    return;
  }

  state.map = window.L.map(host, {
    zoomControl: true,
    attributionControl: true,
  });

  window.L
    .tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    })
    .addTo(state.map);

  state.stationLayer = window.L.layerGroup().addTo(state.map);
  state.overlayLayer = window.L.layerGroup().addTo(state.map);
  state.map.setView([appSettings.defaultCenter.lat, appSettings.defaultCenter.lng], radiusToZoom(appSettings.defaultRadiusKm));
  window.setTimeout(() => state.map?.invalidateSize(), 0);
}

function renderHomeMap(state, visibleStations, fuelId, radiusKm) {
  ensureHomeMap(state);

  if (!state.map || !state.stationLayer || !state.overlayLayer || !window.L) {
    setHomeMapNote("แผนที่ยังไม่พร้อมใช้งาน");
    return;
  }

  state.map.invalidateSize();
  state.stationLayer.clearLayers();
  state.overlayLayer.clearLayers();

  const center = getCurrentCenter();
  const centerLatLng = window.L.latLng(center.lat, center.lng);
  const bounds = [centerLatLng];

  state.overlayLayer.addLayer(
    window.L.circle(centerLatLng, {
      radius: radiusKm * 1000,
      color: "#0fc2c0",
      weight: 1.5,
      opacity: 0.9,
      fillColor: "#0fc2c0",
      fillOpacity: 0.08,
      dashArray: "8 8",
    })
  );

  if (store.location) {
    state.overlayLayer.addLayer(
      window.L.circleMarker(centerLatLng, {
        radius: 8,
        color: "#06111a",
        weight: 3,
        fillColor: "#ffd166",
        fillOpacity: 1,
      }).bindTooltip("ตำแหน่งของคุณ")
    );
  }

  const mappableStations = visibleStations.filter((station) => Number.isFinite(station.lat) && Number.isFinite(station.lng));

  mappableStations.forEach((station) => {
    const meta = STATUS_META[station.fuels[fuelId] || "unknown"];
    const markerLatLng = window.L.latLng(station.lat, station.lng);

    state.stationLayer.addLayer(
      window.L
        .circleMarker(markerLatLng, {
          radius: 10,
          color: "#06111a",
          weight: 2,
          fillColor: mapToneColor(meta.tone),
          fillOpacity: 1,
        })
        .bindPopup(renderHomeMapPopup(station, fuelId), { maxWidth: 280 })
    );

    bounds.push(markerLatLng);
  });

  if (!mappableStations.length) {
    setHomeMapNote(`ยังไม่มีสถานีในรัศมี ${radiusKm.toFixed(0)} กม. ของตัวกรองนี้`);
    state.map.setView(centerLatLng, radiusToZoom(radiusKm));
    return;
  }

  setHomeMapNote("");
  state.map.fitBounds(window.L.latLngBounds(bounds).pad(0.22), {
    padding: [28, 28],
    maxZoom: 14,
  });
}

function renderHomeMapPopup(station, fuelId) {
  const meta = STATUS_META[station.fuels[fuelId] || "unknown"];
  const available = Object.values(station.fuels).filter((status) => statusScore(status) >= 0.66).length;
  const externalMapUrl = buildExternalMapUrl(station.lat, station.lng);

  return `
    <article class="map-popup">
      <div>
        <span class="brand-badge">${escapeHtml(station.brand)}</span>
        <strong>${escapeHtml(station.name)}</strong>
      </div>
      <div class="meta-row">
        <span class="status-badge ${meta.tone}">${escapeHtml(meta.label)}</span>
        <span class="tiny-badge">${escapeHtml(formatDistance(station.distanceKm))}</span>
      </div>
      <p>${escapeHtml(station.area)} | ${escapeHtml(FUEL_LABELS[fuelId])} ${escapeHtml(meta.label)}</p>
      <p>${escapeHtml(getStationFreshnessText(station))} | รายงานสะสม ${escapeHtml(String(station.reports))} | พร้อมจ่าย ${available}/${FUELS.length}</p>
      <div class="map-popup-actions">
        <a class="button button-primary map-popup-link" href="${escapeHtml(externalMapUrl)}" target="_blank" rel="noopener noreferrer">เปิดใน Google Maps</a>
      </div>
    </article>
  `;
}

function buildExternalMapUrl(lat, lng) {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${lat},${lng}`)}`;
}

function setHomeMapNote(message) {
  const node = document.querySelector("[data-home-map-note]");
  if (!node) {
    return;
  }

  node.textContent = message || "";
  node.classList.toggle("is-visible", Boolean(message));
}

function mapToneColor(tone) {
  if (tone === "tone-ok") {
    return "#6ede74";
  }
  if (tone === "tone-warn") {
    return "#ffd166";
  }
  if (tone === "tone-alert") {
    return "#ff975d";
  }
  if (tone === "tone-empty") {
    return "#ff5d5d";
  }
  return "#7b90a0";
}

function radiusToZoom(radiusKm) {
  if (radiusKm <= 2) {
    return 14;
  }
  if (radiusKm <= 4) {
    return 13;
  }
  if (radiusKm <= 7) {
    return 12;
  }
  return 11;
}

function createFeedController() {
  const state = { fuel: "all", status: "all" };

  return {
    init() {
      renderSingleChoiceChips(
        document.querySelector("[data-feed-fuel-chips]"),
        [{ id: "all", label: "ทั้งหมด" }, ...FUELS],
        () => state.fuel,
        (fuelId) => {
          state.fuel = fuelId;
          this.render();
        }
      );

      renderSingleChoiceChips(
        document.querySelector("[data-feed-status-chips]"),
        [
          { id: "all", label: "ทุกสถานะ" },
          { id: "high", label: "พร้อมจ่าย" },
          { id: "medium", label: "เหลือน้อย" },
          { id: "low", label: "ใกล้หมด" },
          { id: "empty", label: "หมด" },
        ],
        () => state.status,
        (statusId) => {
          state.status = statusId;
          this.render();
        }
      );
    },
    render() {
      const runtime = getRuntimeData();
      const feedItems = buildFeedItems(runtime.reports, runtime.stations);
      const reports = feedItems.filter((report) => {
        const fuelPass = state.fuel === "all" || report.fuel === state.fuel;
        const statusPass = state.status === "all" || report.status === state.status;
        return fuelPass && statusPass;
      });
      const visibleReports = reports.slice(0, appSettings.maxFeedDocs);

      setText("[data-feed-total]", `${reports.length}`);
      setText("[data-feed-urgent]", `${reports.filter((report) => ["low", "empty"].includes(report.status)).length}`);
      setText("[data-feed-photo]", `${reports.filter((report) => Boolean(report.photoUrl)).length}`);
      setText("[data-feed-contributors]", `${new Set(reports.map((report) => normalizeReporterLabel(report.reporter))).size}`);

      const averageAge = reports.length ? Math.round(reports.reduce((total, report) => total + getReportAge(report), 0) / reports.length) : 0;
      setText("[data-feed-average-age]", averageAge ? `${averageAge} นาที` : "-");

      renderHTML("[data-feed-list]", reports.length ? visibleReports.map((report) => renderFeedCard(report)).join("") : renderEmptyState("ยังไม่มีรายงานที่ตรงกับตัวกรองนี้"));
    },
  };
}

function createGalleryController() {
  const state = { fuel: "all" };

  return {
    init() {
      renderSingleChoiceChips(
        document.querySelector("[data-gallery-fuel-chips]"),
        [{ id: "all", label: "ทุกเชื้อเพลิง" }, ...FUELS],
        () => state.fuel,
        (fuelId) => {
          state.fuel = fuelId;
          this.render();
        }
      );
    },
    render() {
      const runtime = getRuntimeData();
      const reports = runtime.reports.filter((report) => Boolean(report.photoUrl) && (state.fuel === "all" || report.fuel === state.fuel));
      reports.forEach((report) => {
        queuePhotoUrlResolution(report.photoUrl, report.photoPath);
      });

      setText("[data-gallery-total]", `${reports.length}`);
      setText("[data-gallery-recent]", `${reports.filter((report) => getReportAge(report) <= 60).length}`);
      setText("[data-gallery-fuel]", state.fuel === "all" ? "ทุกเชื้อเพลิง" : FUEL_LABELS[state.fuel]);
      renderHTML("[data-gallery-grid]", reports.length ? reports.map((report, index) => renderGalleryCard(report, index)).join("") : renderEmptyState("ยังไม่มีภาพยืนยันสำหรับตัวกรองนี้"));
      bindGalleryImages();
    },
  };
}

function createDashboardController() {
  const state = { fuel: "diesel" };

  return {
    init() {
      renderSingleChoiceChips(document.querySelector("[data-dashboard-fuel-chips]"), FUELS, () => state.fuel, (fuelId) => {
        state.fuel = fuelId;
        this.render();
      });
    },
    render() {
      const runtime = getRuntimeData();
      const knownStations = runtime.stations.filter((station) => statusScore(station.fuels[state.fuel]) >= 0);
      const readyStations = knownStations.filter((station) => statusScore(station.fuels[state.fuel]) >= 0.66);
      const riskStations = knownStations.filter((station) => statusScore(station.fuels[state.fuel]) >= 0 && statusScore(station.fuels[state.fuel]) < 0.66);
      const coverage = runtime.stations.length ? Math.round((knownStations.length / runtime.stations.length) * 100) : 0;
      const averageAge = knownStations.length
        ? Math.round(knownStations.reduce((total, station) => total + station.updatedMinutes, 0) / knownStations.length)
        : 0;

      setText("[data-dashboard-fuel-label]", FUEL_LABELS[state.fuel]);
      setText("[data-dashboard-coverage]", `${coverage}%`);
      setText("[data-dashboard-ready]", `${readyStations.length}`);
      setText("[data-dashboard-risk]", `${riskStations.length}`);
      setText("[data-dashboard-average]", averageAge ? `${averageAge} นาที` : "-");

      renderHTML(
        "[data-brand-bars]",
        BRANDS.map((brand) => {
          const brandStations = runtime.stations.filter((station) => station.brand === brand);
          const ready = brandStations.filter((station) => statusScore(station.fuels[state.fuel]) >= 0.66).length;
          const percent = brandStations.length ? `${Math.round((ready / brandStations.length) * 100)}%` : "0%";
          return renderBarRow(brand, percent, brandColor(brand));
        }).join("")
      );

      renderHTML(
        "[data-fuel-bars]",
        FUELS.map((fuel) => {
          const ready = runtime.stations.filter((station) => statusScore(station.fuels[fuel.id]) >= 0.66).length;
          const percent = runtime.stations.length ? `${Math.round((ready / runtime.stations.length) * 100)}%` : "0%";
          return renderBarRow(fuel.label, percent, brandColor("PT"));
        }).join("")
      );

      const cadenceData = [
        { label: "ต่ำกว่า 15 นาที", value: runtime.stations.filter((station) => station.updatedMinutes <= 15).length },
        { label: "15-30 นาที", value: runtime.stations.filter((station) => station.updatedMinutes > 15 && station.updatedMinutes <= 30).length },
        { label: "30-60 นาที", value: runtime.stations.filter((station) => station.updatedMinutes > 30 && station.updatedMinutes <= 60).length },
      ];

      renderHTML(
        "[data-cadence-bars]",
        cadenceData
          .map((item) => {
            const percent = runtime.stations.length ? `${Math.round((item.value / runtime.stations.length) * 100)}%` : "0%";
            return renderBarRow(item.label, percent, brandColor("ปตท."));
          })
          .join("")
      );
    },
  };
}

function createReportController() {
  return {
    init() {
      const form = document.querySelector("[data-report-form]");
      if (form) {
        form.addEventListener("submit", (event) => {
          event.preventDefault();
          submitReport(form);
        });
      }
      hydrateLocationFields();
    },
    render() {
      const reports =
        store.mode === "firebase"
          ? canWriteReports()
            ? getRuntimeData().reports.filter((report) => report.createdBy && report.createdBy === store.user.uid)
            : []
          : loadFallbackReports();

      setText("[data-report-count]", `${reports.length}`);
      renderHTML(
        "[data-user-feed]",
        reports.length
          ? reports.slice(0, 12).map((report) => renderFeedCard(report)).join("")
          : renderEmptyState(store.mode === "firebase" && !canWriteReports() ? "ล็อกอิน Google เพื่อดูรายงานที่คุณเคยส่ง" : "ยังไม่มีรายงานจากผู้ใช้นี้")
      );
      syncReportAccessUI();
    },
  };
}

function createAboutController() {
  return {
    init() {},
    render() {
      const runtime = getRuntimeData();
      setText("[data-about-stations]", `${runtime.stations.length}`);
      setText("[data-about-reports]", `${runtime.reports.length}`);
      setText("[data-about-fuels]", `${FUELS.length}`);
      setText("[data-about-contributors]", `${new Set(runtime.reports.map((report) => normalizeReporterLabel(report.reporter))).size}`);
    },
  };
}

function createAdminController() {
  const state = {
    search: "",
    selectedId: "",
    isCreating: false,
    hydratedKey: "",
    pendingDraft: null,
    reportSearch: "",
    selectedReportId: "",
    reportHydratedKey: "",
    pendingReportDraft: null,
  };

  return {
    init() {
      renderAdminFuelFields(document.querySelector("[data-admin-fuel-grid]"));
      renderAdminImportProvinceOptions(document.querySelector("[data-admin-import-province]"));
      ensureAdminUsagePolling();
      refreshAdminUsage();

      const searchInput = document.querySelector("[data-admin-search]");
      const form = document.querySelector("[data-admin-form]");
      const newButton = document.querySelector("[data-admin-new]");
      const resetButton = document.querySelector("[data-admin-reset]");
      const deleteButton = document.querySelector("[data-admin-delete]");
      const reportSearchInput = document.querySelector("[data-admin-report-search]");
      const reportForm = document.querySelector("[data-admin-report-form]");
      const reportResetButton = document.querySelector("[data-admin-report-reset]");
      const reportDeleteButton = document.querySelector("[data-admin-report-delete]");
      const importDownloadButton = document.querySelector("[data-admin-import-download]");
      const importFetchButton = document.querySelector("[data-admin-import-fetch]");
      const importFetchSubmitButton = document.querySelector("[data-admin-import-fetch-submit]");
      const importButton = document.querySelector("[data-admin-import-submit]");
      const importResetButton = document.querySelector("[data-admin-import-reset]");
      const importProvinceInput = document.querySelector("[data-admin-import-province]");
      const importProxyInput = document.querySelector("[data-admin-import-proxy]");

      initializeAdminImportProxyInput(importProxyInput);

      searchInput?.addEventListener("input", () => {
        state.search = String(searchInput.value || "").trim().toLowerCase();
        this.render();
      });

      reportSearchInput?.addEventListener("input", () => {
        state.reportSearch = String(reportSearchInput.value || "").trim().toLowerCase();
        this.render();
      });

      newButton?.addEventListener("click", () => {
        state.isCreating = true;
        state.selectedId = "";
        state.hydratedKey = "";
        state.pendingDraft = null;
        clearAdminMessage();
        this.render();
      });

      resetButton?.addEventListener("click", () => {
        state.hydratedKey = "";
        state.pendingDraft = null;
        clearAdminMessage();
        this.render();
      });

      reportResetButton?.addEventListener("click", () => {
        state.reportHydratedKey = "";
        state.pendingReportDraft = null;
        clearAdminReportMessage();
        this.render();
      });

      deleteButton?.addEventListener("click", async () => {
        await deleteAdminStation(state);
        this.render();
      });

      reportDeleteButton?.addEventListener("click", async () => {
        await deleteAdminReport(state);
        this.render();
      });

      form?.addEventListener("submit", async (event) => {
        event.preventDefault();
        await saveAdminStation(form, state);
        this.render();
      });

      reportForm?.addEventListener("submit", async (event) => {
        event.preventDefault();
        await saveAdminReport(reportForm, state);
        this.render();
      });

      importButton?.addEventListener("click", async () => {
        await importPumpRadarStationsV3();
        this.render();
      });

      importFetchButton?.addEventListener("click", async () => {
        await loadPumpRadarProvinceJsonV3();
        this.render();
      });

      importFetchSubmitButton?.addEventListener("click", async () => {
        await importPumpRadarStationsFromProxyV3();
        this.render();
      });

      importDownloadButton?.addEventListener("click", () => {
        downloadPumpRadarProvinceJsonV3();
      });

      importProvinceInput?.addEventListener("change", () => {
        clearAdminImportMessage();
        syncAdminImportState();
      });

      importProxyInput?.addEventListener("change", () => {
        persistPumpRadarProxyEndpoint(importProxyInput.value);
        clearAdminImportMessage();
        syncAdminImportState();
      });

      importResetButton?.addEventListener("click", () => {
        resetAdminImportForm();
        clearAdminImportMessage();
      });
    },
    render() {
      const stations = [...store.stations].sort((left, right) => {
        if (left.updatedMinutes !== right.updatedMinutes) {
          return left.updatedMinutes - right.updatedMinutes;
        }
        return String(left.name || "").localeCompare(String(right.name || ""), "th");
      });

      const filteredStations = stations.filter((station) => matchesAdminSearch(station, state.search));
      const selectedStation = syncAdminSelection(state, stations, filteredStations);
      const reports = [...store.reports].sort((left, right) => getReportAge(left) - getReportAge(right));
      const filteredReports = reports.filter((report) => matchesAdminReportSearch(report, state.reportSearch, state.selectedId));
      const selectedReport = syncAdminReportSelection(state, reports, filteredReports);

      setText("[data-admin-count]", `${stations.length}`);
      setText(
        "[data-admin-mode]",
        store.mode === "firebase"
          ? store.stationSource.type === "google-sheet"
            ? "Sheet + Firebase"
            : store.stationSource.type === "static-json"
              ? "Static JSON + Firebase"
              : "Firestore"
          : store.mode === "sheet"
            ? "Google Sheet"
            : store.mode === "static"
              ? "Static JSON"
              : "Backup"
      );
      setText("[data-admin-auth]", isGoogleUser() ? "Google" : store.authReady ? "ยังไม่ล็อกอิน" : "รอตรวจสอบ");
      setText("[data-admin-write]", hasAdminAccess() ? "เขียนได้" : "ปิดอยู่");
      renderAdminFirebaseStatus();
      renderAdminUsage();

      renderHTML(
        "[data-admin-list]",
        filteredStations.length
          ? filteredStations.map((station) => renderAdminStationRow(station, station.id === state.selectedId)).join("")
          : renderEmptyState("ไม่พบสถานีที่ตรงกับคำค้น")
      );

      document.querySelectorAll("[data-admin-select]").forEach((button) => {
        button.addEventListener("click", () => {
          state.selectedId = button.dataset.adminSelect || "";
          state.isCreating = false;
          state.hydratedKey = "";
          state.pendingDraft = null;
          clearAdminMessage();
          this.render();
        });
      });

      const form = document.querySelector("[data-admin-form]");
      const searchInput = document.querySelector("[data-admin-search]");
      const reportSearchInput = document.querySelector("[data-admin-report-search]");
      if (searchInput && searchInput.value !== state.search) {
        searchInput.value = state.search;
      }
      if (reportSearchInput && reportSearchInput.value !== state.reportSearch) {
        reportSearchInput.value = state.reportSearch;
      }

      renderHTML(
        "[data-admin-report-list]",
        filteredReports.length
          ? filteredReports.map((report) => renderAdminReportRow(report, report.id === state.selectedReportId)).join("")
          : renderEmptyState("ไม่พบรายงานที่ตรงกับตัวกรอง")
      );

      document.querySelectorAll("[data-admin-report-select]").forEach((button) => {
        button.addEventListener("click", () => {
          state.selectedReportId = button.dataset.adminReportSelect || "";
          state.reportHydratedKey = "";
          state.pendingReportDraft = null;
          clearAdminReportMessage();
          this.render();
        });
      });

      if (!form) {
        return;
      }

      const pendingDraft = state.pendingDraft && state.pendingDraft.stationId === state.selectedId ? state.pendingDraft : null;
      const displayDraft = state.isCreating
        ? buildEmptyAdminStationDraft()
        : pendingDraft
          ? pendingDraft
          : selectedStation
          ? buildAdminStationDraft(selectedStation)
          : buildEmptyAdminStationDraft();
      const formKey = state.isCreating ? "__new__" : pendingDraft?.stationId || selectedStation?.id || "__empty__";
      if (state.hydratedKey !== formKey) {
        hydrateAdminForm(displayDraft);
        state.hydratedKey = formKey;
      }

      setText("[data-admin-form-title]", state.isCreating ? "สร้างสถานีใหม่" : selectedStation ? selectedStation.name : "เลือกสถานีเพื่อแก้ไข");
      setText(
        "[data-admin-form-hint]",
        store.stationSource.type !== "firestore"
          ? `หน้า public กำลังอ่านข้อมูลสถานีจาก ${getStationSourceLabel()} อยู่ ให้แก้ข้อมูลที่แหล่งหลักแล้ว publish ใหม่`
          : state.isCreating
          ? "กรอกข้อมูลสถานีใหม่และสถานะน้ำมันแต่ละชนิด จากนั้นบันทึกขึ้น Firestore"
          : selectedStation
            ? `Document ID: ${selectedStation.id} | อัปเดตล่าสุด ${formatShortAge(selectedStation.updatedMinutes)}`
            : "เลือกสถานีจากรายการด้านซ้าย หรือกดสร้างสถานีใหม่"
      );

      syncAdminFormState(state, Boolean(selectedStation));

      const reportForm = document.querySelector("[data-admin-report-form]");
      if (!reportForm) {
        return;
      }

      const pendingReportDraft = state.pendingReportDraft && state.pendingReportDraft.id === state.selectedReportId ? state.pendingReportDraft : null;
      const reportDraft = pendingReportDraft ? pendingReportDraft : buildAdminReportDraft(selectedReport);
      const reportFormKey = pendingReportDraft?.id || selectedReport?.id || "__empty__";
      if (state.reportHydratedKey !== reportFormKey) {
        hydrateAdminReportForm(reportDraft);
        state.reportHydratedKey = reportFormKey;
      }

      setText("[data-admin-report-title]", selectedReport ? selectedReport.station : "เลือกรายงานเพื่อแก้ไข");
      setText(
        "[data-admin-report-hint]",
        selectedReport
          ? `Report ID: ${selectedReport.id} | อายุรายงาน ${formatAge(getReportAge(selectedReport))} | สถานี ${selectedReport.stationId}`
          : state.selectedId && !state.reportSearch
            ? "ยังไม่มีรายงานของสถานีที่เลือก"
            : "เลือกรายงานจากรายการด้านซ้าย ระบบจะบันทึกกลับไปยัง Firestore และ sync สรุปของสถานีให้"
      );
      syncAdminReportFormState(Boolean(selectedReport));
      syncAdminImportState();
    },
  };
}

function renderAdminFuelFields(host) {
  if (!host) {
    return;
  }

  host.innerHTML = FUELS.map((fuel) => renderAdminFuelField(fuel)).join("");
}

function renderAdminFuelField(fuel) {
  return `
    <label class="field admin-fuel-field">
      <span>${escapeHtml(fuel.label)}</span>
      <select name="fuel-${escapeHtml(fuel.id)}" data-admin-fuel="${escapeHtml(fuel.id)}">
        ${["high", "medium", "low", "empty", "unknown"]
          .map((status) => `<option value="${escapeHtml(status)}">${escapeHtml(STATUS_META[status].label)}</option>`)
          .join("")}
      </select>
    </label>
  `;
}

function matchesAdminSearch(station, query) {
  if (!query) {
    return true;
  }

  const haystack = [station.id, station.name, station.brand, station.area].join(" ").toLowerCase();
  return haystack.includes(query);
}

function syncAdminSelection(state, stations, filteredStations) {
  if (state.isCreating) {
    return null;
  }

  const hasSelected = stations.some((station) => station.id === state.selectedId);
  if (state.selectedId && !hasSelected && state.pendingDraft?.stationId === state.selectedId) {
    return null;
  }
  const visibleSelected = filteredStations.some((station) => station.id === state.selectedId);
  if (filteredStations.length && !visibleSelected) {
    state.selectedId = filteredStations[0].id;
  }
  if (!hasSelected) {
    state.selectedId = filteredStations[0]?.id || stations[0]?.id || "";
  }

  return stations.find((station) => station.id === state.selectedId) || null;
}

function renderAdminStationRow(station, isActive) {
  const fuels = normalizeFuelStates(station.fuelStates || station.fuels);
  const readyCount = Object.values(fuels).filter((status) => statusScore(status) >= 0.66).length;
  const knownCount = Object.values(fuels).filter((status) => statusScore(status) >= 0).length;
  const reportTotal = Number.isFinite(station.reports) ? station.reports : Number(station.reportCount || 0);
  const stationId = String(station.id || "").trim();
  const stationIdLabel = formatAdminIdentifier(stationId);

  return `
    <button class="admin-station-row${isActive ? " is-active" : ""}" type="button" data-admin-select="${escapeHtml(station.id)}" title="${escapeHtml(stationId)}">
      <div class="admin-station-row-head">
        <span class="brand-badge">${escapeHtml(station.brand)}</span>
        <span class="tiny-badge" title="${escapeHtml(stationId)}">${escapeHtml(stationIdLabel)}</span>
      </div>
      <strong>${escapeHtml(station.name)}</strong>
      <div class="meta-row muted">
        <span>${escapeHtml(station.area)}</span>
        <span>อัปเดต ${escapeHtml(formatShortAge(station.updatedMinutes))}</span>
      </div>
      <div class="detail-row muted">
        <span>พร้อมจ่าย ${readyCount}/${FUELS.length}</span>
        <span>มีข้อมูล ${knownCount}/${FUELS.length}</span>
        <span>รายงาน ${reportTotal}</span>
      </div>
    </button>
  `;
}

function buildEmptyAdminStationDraft() {
  return {
    originalId: "",
    stationId: "",
    name: "",
    brand: "",
    area: "",
    lat: store.location ? store.location.lat.toFixed(6) : "",
    lng: store.location ? store.location.lng.toFixed(6) : "",
    reportCount: 0,
    photoUrl: "",
    fuelStates: createUnknownFuelMap(),
  };
}

function buildAdminStationDraft(station) {
  if (!station) {
    return buildEmptyAdminStationDraft();
  }

  const fuels = normalizeFuelStates(station.fuelStates || station.fuels);
  return {
    originalId: station.id,
    stationId: station.id,
    name: station.name || "",
    brand: station.brand || "",
    area: station.area || "",
    lat: Number.isFinite(station.lat) ? station.lat.toFixed(6) : "",
    lng: Number.isFinite(station.lng) ? station.lng.toFixed(6) : "",
    reportCount: Number(station.reportCount || station.reports || 0),
    photoUrl: station.photoUrl || "",
    fuelStates: fuels,
  };
}

function hydrateAdminForm(draft) {
  setAdminFieldValue("[data-admin-original-id]", draft.originalId || "");
  setAdminFieldValue("[data-admin-station-id]", draft.stationId || "");
  setAdminFieldValue("[data-admin-name]", draft.name || "");
  setAdminFieldValue("[data-admin-brand]", draft.brand || "");
  setAdminFieldValue("[data-admin-area]", draft.area || "");
  setAdminFieldValue("[data-admin-lat]", draft.lat || "");
  setAdminFieldValue("[data-admin-lng]", draft.lng || "");
  setAdminFieldValue("[data-admin-report-count]", `${Number(draft.reportCount || 0)}`);
  setAdminFieldValue("[data-admin-photo-url]", draft.photoUrl || "");

  FUELS.forEach((fuel) => {
    setAdminFieldValue(`[data-admin-fuel="${fuel.id}"]`, draft.fuelStates?.[fuel.id] || "unknown");
  });
}

function setAdminFieldValue(selector, value) {
  const node = document.querySelector(selector);
  if (node) {
    node.value = value;
  }
}

function syncAdminFormState(state, hasSelection) {
  const canWrite = canManageStationsInFirestore();
  const stationIdInput = document.querySelector("[data-admin-station-id]");
  const saveButton = document.querySelector("[data-admin-save]");
  const deleteButton = document.querySelector("[data-admin-delete]");
  const form = document.querySelector("[data-admin-form]");

  if (stationIdInput) {
    stationIdInput.disabled = !state.isCreating || !canWrite;
  }
  if (saveButton) {
    saveButton.disabled = !canWrite;
  }
  if (deleteButton) {
    deleteButton.disabled = !canWrite || state.isCreating || !hasSelection;
  }
  if (form) {
    form.classList.toggle("is-readonly", !canWrite);
  }
}

async function saveAdminStation(form, state) {
  const messageBox = document.querySelector("[data-admin-message]");
  setMessage(messageBox, "กำลังบันทึกสถานี...");

  try {
    if (store.mode !== "firebase" || !store.db) {
      throw new Error("โหมดนี้ยังไม่เชื่อม Firestore จึงแก้ไขสถานีไม่ได้");
    }
    if (!hasAdminAccess()) {
      throw new Error("กรุณาเข้าสู่ระบบด้วย Google ที่มีสิทธิ์ admin ก่อนบันทึกสถานี");
    }

    const payload = readAdminStationPayload(new FormData(form), state.isCreating);
    const stationRef = doc(store.db, appSettings.collections.stations, payload.stationId);

    if (state.isCreating) {
      const existing = await getDoc(stationRef);
      if (existing.exists()) {
        throw new Error("Document ID นี้มีอยู่แล้ว เลือกชื่อใหม่หรือแก้ไขรายการเดิมแทน");
      }
    }

    await setDoc(
      stationRef,
      {
        name: payload.name,
        brand: payload.brand,
        area: payload.area,
        lat: payload.lat,
        lng: payload.lng,
        reportCount: payload.reportCount,
        photoUrl: payload.photoUrl,
        fuelStates: payload.fuelStates,
        updatedAt: serverTimestamp(),
        ...(state.isCreating ? { createdAt: serverTimestamp() } : {}),
      },
      { merge: true }
    );

    upsertAdminStationInStore(payload.stationId, {
      ...payload,
      updatedAt: new Date(),
    });

    state.isCreating = false;
    state.selectedId = payload.stationId;
    state.hydratedKey = "";
    state.pendingDraft = {
      originalId: payload.stationId,
      stationId: payload.stationId,
      name: payload.name,
      brand: payload.brand,
      area: payload.area,
      lat: payload.lat.toFixed(6),
      lng: payload.lng.toFixed(6),
      reportCount: payload.reportCount,
      photoUrl: payload.photoUrl,
      fuelStates: normalizeFuelStates(payload.fuelStates),
    };
    setMessage(messageBox, `บันทึกสถานี ${payload.name} แล้ว${getAdminFirestoreWriteSuccessNote()}`);
  } catch (error) {
    console.error(error);
    maybeTrackFirebaseError("admin-station-save", error);
    setMessage(messageBox, humanizeError(error));
  }
}

async function deleteAdminStation(state) {
  const messageBox = document.querySelector("[data-admin-message]");

  try {
    if (!state.selectedId || state.isCreating) {
      setMessage(messageBox, "เลือกสถานีก่อนลบ");
      return;
    }
    if (store.mode !== "firebase" || !store.db) {
      throw new Error("โหมดนี้ยังไม่เชื่อม Firestore จึงลบสถานีไม่ได้");
    }
    if (!hasAdminAccess()) {
      throw new Error("กรุณาเข้าสู่ระบบด้วย Google ที่มีสิทธิ์ admin ก่อนลบสถานี");
    }

    const station = store.stations.find((item) => item.id === state.selectedId);
    const confirmed = window.confirm(`ต้องการลบสถานี ${station?.name || state.selectedId} ใช่หรือไม่?`);
    if (!confirmed) {
      return;
    }

    const deletedStationId = state.selectedId;
    const reportSnapshot = await getDocs(query(collection(store.db, appSettings.collections.reports), where("stationId", "==", deletedStationId)));
    await Promise.all(reportSnapshot.docs.map((item) => deleteDoc(item.ref)));
    await deleteDoc(doc(store.db, appSettings.collections.stations, deletedStationId));
    removeAdminStationFromStore(deletedStationId);

    state.selectedId = "";
    state.hydratedKey = "";
    state.pendingDraft = null;
    state.selectedReportId = "";
    state.reportHydratedKey = "";
    state.pendingReportDraft = null;
    setMessage(messageBox, `ลบสถานีและรายงานที่เกี่ยวข้อง ${reportSnapshot.size} รายการแล้ว${getAdminFirestoreWriteSuccessNote()}`);
  } catch (error) {
    console.error(error);
    maybeTrackFirebaseError("admin-station-delete", error);
    setMessage(messageBox, humanizeError(error));
  }
}

function readAdminStationPayload(formData, isCreating) {
  const originalId = String(formData.get("originalId") || "").trim();
  const name = String(formData.get("name") || "").trim();
  const brand = String(formData.get("brand") || "").trim();
  const area = String(formData.get("area") || "").trim() || "ยังไม่ระบุพื้นที่";
  const stationIdInput = String(formData.get("stationId") || "").trim();
  const lat = parseOptionalNumber(formData.get("latitude"));
  const lng = parseOptionalNumber(formData.get("longitude"));
  const reportCount = Math.max(0, Math.round(parseOptionalNumber(formData.get("reportCount")) || 0));
  const photoUrl = String(formData.get("photoUrl") || "").trim();
  const stationId = normalizeStationName(isCreating ? stationIdInput || `${brand}-${name}` : originalId);

  if (!name || !brand) {
    throw new Error("กรอกชื่อสถานีและแบรนด์ให้ครบก่อนบันทึก");
  }
  if (!stationId) {
    throw new Error("กรุณาระบุ Document ID สำหรับสถานี");
  }
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new Error("ละติจูดและลองจิจูดต้องเป็นตัวเลข");
  }

  return {
    stationId,
    name,
    brand,
    area,
    lat,
    lng,
    reportCount,
    photoUrl,
    fuelStates: FUELS.reduce((map, fuel) => {
      const value = String(formData.get(`fuel-${fuel.id}`) || "unknown");
      map[fuel.id] = STATUS_META[value] ? value : "unknown";
      return map;
    }, {}),
  };
}

function matchesAdminReportSearch(report, query, selectedStationId) {
  if (selectedStationId && report.stationId !== selectedStationId) {
    return false;
  }

  if (query) {
    const haystack = [report.id, report.stationId, report.station, report.brand, report.reporter, report.area].join(" ").toLowerCase();
    return haystack.includes(query);
  }

  return true;
}

function syncAdminReportSelection(state, reports, filteredReports) {
  const hasSelected = reports.some((report) => report.id === state.selectedReportId);
  if (state.selectedReportId && !hasSelected && state.pendingReportDraft?.id === state.selectedReportId) {
    return null;
  }

  if (!filteredReports.length) {
    state.selectedReportId = "";
    return null;
  }

  const visibleSelected = filteredReports.some((report) => report.id === state.selectedReportId);
  if (!visibleSelected) {
    state.selectedReportId = filteredReports[0].id;
  }

  return reports.find((report) => report.id === state.selectedReportId) || null;
}

function renderAdminReportRow(report, isActive) {
  const meta = STATUS_META[report.status || "unknown"];
  const stationId = String(report.stationId || "").trim();
  const stationIdLabel = formatAdminIdentifier(stationId);

  return `
    <button class="admin-report-row${isActive ? " is-active" : ""}" type="button" data-admin-report-select="${escapeHtml(report.id)}" title="${escapeHtml(stationId || report.id)}">
      <div class="admin-station-row-head">
        <span class="brand-badge">${escapeHtml(report.brand)}</span>
        <span class="status-badge ${meta.tone}">${escapeHtml(meta.label)}</span>
      </div>
      <strong>${escapeHtml(report.station)}</strong>
      <div class="meta-row muted">
        <span>${escapeHtml(FUEL_LABELS[report.fuel] || report.fuel)}</span>
        <span>${escapeHtml(report.reporter || "ไม่ระบุชื่อ")}</span>
      </div>
      <div class="detail-row muted">
        <span title="${escapeHtml(stationId)}">${escapeHtml(stationIdLabel)}</span>
        <span>${escapeHtml(formatAge(getReportAge(report)))}</span>
      </div>
    </button>
  `;
}

function formatAdminIdentifier(value, head = 12, tail = 6) {
  const text = String(value || "").trim();
  if (!text) {
    return "-";
  }
  if (text.length <= head + tail + 3) {
    return text;
  }
  return `${text.slice(0, head)}...${text.slice(-tail)}`;
}

function buildEmptyAdminReportDraft() {
  return {
    id: "",
    originalId: "",
    originalStationId: "",
    stationId: "",
    station: "",
    brand: "",
    area: "",
    reporter: "",
    fuel: "diesel",
    status: "unknown",
    lat: "",
    lng: "",
    photoUrl: "",
    photoPath: "",
    note: "",
  };
}

function buildAdminReportDraft(report) {
  if (!report) {
    return buildEmptyAdminReportDraft();
  }

  return {
    id: report.id,
    originalId: report.id,
    originalStationId: report.stationId || "",
    stationId: report.stationId || "",
    station: report.station || "",
    brand: report.brand || "",
    area: report.area || "",
    reporter: report.reporter || "",
    fuel: report.fuel || "diesel",
    status: report.status || "unknown",
    lat: Number.isFinite(report.lat) ? report.lat.toFixed(6) : "",
    lng: Number.isFinite(report.lng) ? report.lng.toFixed(6) : "",
    photoUrl: report.photoUrl || "",
    photoPath: report.photoPath || "",
    note: report.note || "",
  };
}

function hydrateAdminReportForm(draft) {
  setAdminReportFieldValue("[data-admin-report-id]", draft.id || "");
  setAdminReportFieldValue("[data-admin-report-original-id]", draft.originalId || "");
  setAdminReportFieldValue("[data-admin-report-original-station-id]", draft.originalStationId || "");
  setAdminReportFieldValue("[data-admin-report-station-id]", draft.stationId || "");
  setAdminReportFieldValue("[data-admin-report-station]", draft.station || "");
  setAdminReportFieldValue("[data-admin-report-brand]", draft.brand || "");
  setAdminReportFieldValue("[data-admin-report-area]", draft.area || "");
  setAdminReportFieldValue("[data-admin-report-reporter]", draft.reporter || "");
  setAdminReportFieldValue("[data-admin-report-fuel]", draft.fuel || "diesel");
  setAdminReportFieldValue("[data-admin-report-status]", draft.status || "unknown");
  setAdminReportFieldValue("[data-admin-report-lat]", draft.lat || "");
  setAdminReportFieldValue("[data-admin-report-lng]", draft.lng || "");
  setAdminReportFieldValue("[data-admin-report-photo-url]", draft.photoUrl || "");
  setAdminReportFieldValue("[data-admin-report-photo-path]", draft.photoPath || "");
  setAdminReportFieldValue("[data-admin-report-note]", draft.note || "");
}

function setAdminReportFieldValue(selector, value) {
  const node = document.querySelector(selector);
  if (node) {
    node.value = value;
  }
}

function syncAdminReportFormState(hasSelection) {
  const canWrite = hasAdminAccess();
  const saveButton = document.querySelector("[data-admin-report-save]");
  const deleteButton = document.querySelector("[data-admin-report-delete]");
  const form = document.querySelector("[data-admin-report-form]");

  if (saveButton) {
    saveButton.disabled = !canWrite || !hasSelection;
  }
  if (deleteButton) {
    deleteButton.disabled = !canWrite || !hasSelection;
  }
  if (form) {
    form.classList.toggle("is-readonly", !canWrite);
  }
}

async function saveAdminReport(form, state) {
  const messageBox = document.querySelector("[data-admin-report-message]");
  setMessage(messageBox, "กำลังบันทึกรายงาน...");

  try {
    if (store.mode !== "firebase" || !store.db) {
      throw new Error("โหมดนี้ยังไม่เชื่อม Firestore จึงแก้ไขรายงานไม่ได้");
    }
    if (!hasAdminAccess()) {
      throw new Error("กรุณาเข้าสู่ระบบด้วย Google ที่มีสิทธิ์ admin ก่อนบันทึกรายงาน");
    }

    const payload = readAdminReportPayload(new FormData(form));
    const reportRef = doc(store.db, appSettings.collections.reports, payload.id);
    await setDoc(
      reportRef,
      {
        stationId: payload.stationId,
        station: payload.station,
        brand: payload.brand,
        area: payload.area,
        lat: payload.lat,
        lng: payload.lng,
        fuel: payload.fuel,
        status: payload.status,
        note: payload.note,
        reporter: payload.reporter,
        photoUrl: payload.photoUrl,
        photoPath: payload.photoPath,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    const stationIds = new Set([payload.originalStationId, payload.stationId].filter(Boolean));
    await Promise.all([...stationIds].map((stationId) => reconcileStationDocument(stationId)));

    state.selectedReportId = payload.id;
    state.reportHydratedKey = "";
    state.pendingReportDraft = buildAdminReportDraft({
      id: payload.id,
      stationId: payload.stationId,
      station: payload.station,
      brand: payload.brand,
      area: payload.area,
      reporter: payload.reporter,
      fuel: payload.fuel,
      status: payload.status,
      lat: payload.lat,
      lng: payload.lng,
      photoUrl: payload.photoUrl,
      photoPath: payload.photoPath,
      note: payload.note,
    });
    setMessage(messageBox, `บันทึกรายงาน ${payload.id} แล้ว`);
  } catch (error) {
    console.error(error);
    maybeTrackFirebaseError("admin-report-save", error);
    setMessage(messageBox, humanizeError(error));
  }
}

async function deleteAdminReport(state) {
  const messageBox = document.querySelector("[data-admin-report-message]");

  try {
    if (!state.selectedReportId) {
      setMessage(messageBox, "เลือกรายงานก่อนลบ");
      return;
    }
    if (store.mode !== "firebase" || !store.db) {
      throw new Error("โหมดนี้ยังไม่เชื่อม Firestore จึงลบรายงานไม่ได้");
    }
    if (!hasAdminAccess()) {
      throw new Error("กรุณาเข้าสู่ระบบด้วย Google ที่มีสิทธิ์ admin ก่อนลบรายงาน");
    }

    const report = store.reports.find((item) => item.id === state.selectedReportId);
    const confirmed = window.confirm(`ต้องการลบรายงาน ${report?.id || state.selectedReportId} ของ ${report?.station || "สถานีนี้"} ใช่หรือไม่?`);
    if (!confirmed) {
      return;
    }

    await deleteDoc(doc(store.db, appSettings.collections.reports, state.selectedReportId));
    if (report?.stationId) {
      await reconcileStationDocument(report.stationId);
    }

    state.selectedReportId = "";
    state.reportHydratedKey = "";
    state.pendingReportDraft = null;
    setMessage(messageBox, "ลบรายงานแล้ว");
  } catch (error) {
    console.error(error);
    maybeTrackFirebaseError("admin-report-delete", error);
    setMessage(messageBox, humanizeError(error));
  }
}

function readAdminReportPayload(formData) {
  const id = String(formData.get("originalId") || "").trim();
  const originalStationId = String(formData.get("originalStationId") || "").trim();
  const station = String(formData.get("station") || "").trim();
  const brand = String(formData.get("brand") || "").trim();
  const area = String(formData.get("area") || "").trim() || "ยังไม่ระบุพื้นที่";
  const reporter = String(formData.get("reporter") || "").trim() || "ผู้ใช้ไม่ระบุชื่อ";
  const stationIdInput = String(formData.get("stationId") || "").trim();
  const stationId = normalizeStationName(stationIdInput || `${brand}-${station}`);
  const fuel = String(formData.get("fuel") || "").trim();
  const status = String(formData.get("status") || "").trim();
  const lat = parseOptionalNumber(formData.get("latitude"));
  const lng = parseOptionalNumber(formData.get("longitude"));
  const photoUrl = String(formData.get("photoUrl") || "").trim();
  const photoPath = String(formData.get("photoPath") || "").trim();
  const note = String(formData.get("note") || "").trim() || "ไม่มีรายละเอียดเพิ่มเติม";

  if (!id) {
    throw new Error("ไม่พบ Report ID ที่ต้องการแก้ไข");
  }
  if (!station || !brand || !fuel || !STATUS_META[status]) {
    throw new Error("กรอกชื่อสถานี แบรนด์ เชื้อเพลิง และสถานะให้ครบก่อนบันทึก");
  }
  if (!stationId) {
    throw new Error("กรุณาระบุ Station ID ให้รายงานนี้");
  }
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new Error("ละติจูดและลองจิจูดของรายงานต้องเป็นตัวเลข");
  }

  return {
    id,
    originalStationId,
    stationId,
    station,
    brand,
    area,
    reporter,
    fuel,
    status,
    lat,
    lng,
    photoUrl,
    photoPath,
    note,
  };
}

async function reconcileStationDocument(stationId) {
  if (!stationId || store.mode !== "firebase" || !store.db) {
    return;
  }

  const stationRef = doc(store.db, appSettings.collections.stations, stationId);
  const [stationSnapshot, reportSnapshot] = await Promise.all([
    getDoc(stationRef),
    getDocs(query(collection(store.db, appSettings.collections.reports), where("stationId", "==", stationId))),
  ]);

  if (reportSnapshot.empty) {
    if (!stationSnapshot.exists()) {
      return;
    }

    const existingData = stationSnapshot.data();
    if (Number(existingData.reportCount || 0) > 0 || existingData.lastReportId) {
      await deleteDoc(stationRef);
      return;
    }

    await setDoc(
      stationRef,
      {
        reportCount: 0,
        fuelStates: createUnknownFuelMap(),
        lastReportId: "",
        lastReporter: "",
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
    return;
  }

  const existingData = stationSnapshot.exists() ? stationSnapshot.data() : {};
  const reports = reportSnapshot.docs
    .map((item) => ({ id: item.id, ...item.data() }))
    .sort((left, right) => timestampToMs(left.updatedAt || left.createdAt) - timestampToMs(right.updatedAt || right.createdAt));
  const latestReport = reports[reports.length - 1];
  const fuelStates = createUnknownFuelMap();

  reports.forEach((report) => {
    if (Object.prototype.hasOwnProperty.call(fuelStates, report.fuel) && STATUS_META[report.status]) {
      fuelStates[report.fuel] = report.status;
    }
  });

  const updatedAtValue =
    latestReport.updatedAt && (typeof latestReport.updatedAt.toMillis === "function" || typeof latestReport.updatedAt.seconds === "number")
      ? latestReport.updatedAt
      : latestReport.createdAt && (typeof latestReport.createdAt.toMillis === "function" || typeof latestReport.createdAt.seconds === "number")
        ? latestReport.createdAt
      : serverTimestamp();
  const createdAtValue =
    existingData.createdAt && (typeof existingData.createdAt.toMillis === "function" || typeof existingData.createdAt.seconds === "number")
      ? existingData.createdAt
      : updatedAtValue;

  await setDoc(
    stationRef,
    {
      name: latestReport.station || existingData.name || stationId,
      brand: latestReport.brand || existingData.brand || "ไม่ทราบแบรนด์",
      area: latestReport.area || existingData.area || "ยังไม่ระบุพื้นที่",
      lat: coerceNumber(latestReport.lat ?? existingData.lat),
      lng: coerceNumber(latestReport.lng ?? existingData.lng),
      reportCount: reports.length,
      updatedAt: updatedAtValue,
      createdAt: createdAtValue,
      photoUrl: latestReport.photoUrl || existingData.photoUrl || "",
      fuelStates,
      lastReportId: latestReport.id,
      lastReporter: latestReport.reporter || "",
    },
    { merge: true }
  );
}

function clearAdminMessage() {
  setMessage(document.querySelector("[data-admin-message]"), "");
}

function clearAdminReportMessage() {
  setMessage(document.querySelector("[data-admin-report-message]"), "");
}

function clearAdminImportMessage() {
  setMessage(document.querySelector("[data-admin-import-message]"), "");
}

function renderAdminImportProvinceOptions(select) {
  if (!select) {
    return;
  }

  const currentValue = normalizeProvinceSlug(select.value) || DEFAULT_IMPORT_PROVINCE_SLUG;
  const options = [
    '<option value="all">ทุกจังหวัด (all)</option>',
    ...PUMPRADAR_PROVINCES.map(
      (province) => `<option value="${escapeHtml(province.slug)}">${escapeHtml(`${province.label} (${province.slug})`)}</option>`
    ),
  ].join("");

  select.innerHTML = options;
  select.value = currentValue === "all" || PUMPRADAR_PROVINCE_SLUGS.includes(currentValue) ? currentValue : DEFAULT_IMPORT_PROVINCE_SLUG;
}

function syncAdminImportState() {
  const canImport = canImportStationsToFirestore();
  const submitButton = document.querySelector("[data-admin-import-submit]");
  const fetchButton = document.querySelector("[data-admin-import-fetch]");
  const fetchSubmitButton = document.querySelector("[data-admin-import-fetch-submit]");
  const sourceNote = document.querySelector("[data-admin-import-source-note]");
  const proxyInput = document.querySelector("[data-admin-import-proxy]");
  const proxyEndpoint = getPumpRadarProxyEndpoint();
  if (submitButton) {
    submitButton.disabled = !canImport;
  }
  if (fetchButton) {
    fetchButton.title = `PumpRadar proxy: ${proxyEndpoint}`;
  }
  if (fetchSubmitButton) {
    fetchSubmitButton.disabled = !canImport;
    fetchSubmitButton.title = `PumpRadar proxy: ${proxyEndpoint}`;
  }
  if (proxyInput) {
    proxyInput.title = `Current proxy endpoint: ${proxyEndpoint}`;
  }
  if (sourceNote) {
    sourceNote.textContent = getAdminImportSourceNote();
  }
}

function resetAdminImportForm() {
  const fileInput = document.querySelector("[data-admin-import-file]");
  const textArea = document.querySelector("[data-admin-import-json]");
  if (fileInput) {
    fileInput.value = "";
  }
  if (textArea) {
    textArea.value = "";
  }
}

function readAdminImportProvinceSlug() {
  const slugs = readAdminImportProvinceSlugs({ required: true });
  if (slugs.length !== 1 || slugs[0] === "all" || slugs[0] === "*") {
    throw new Error("เลือกจังหวัดเดียวก่อนดาวน์โหลด JSON");
  }
  return slugs[0];
}

function normalizeProvinceSlug(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-");
}

function readAdminImportProvinceSlugs(options = {}) {
  const { required = false } = options;
  const input = document.querySelector("[data-admin-import-province]");
  const isSelect = input?.tagName === "SELECT";
  const slugs = isSelect
    ? [normalizeProvinceSlug(input?.value || "")].filter(Boolean)
    : String(input?.value || "")
        .trim()
        .toLowerCase()
        .split(",")
        .map(normalizeProvinceSlug)
        .filter(Boolean);

  if (required && !slugs.length) {
    throw new Error("เลือกจังหวัดก่อนดาวน์โหลดหรือ import JSON");
  }

  if (input && slugs.length && !isSelect) {
    input.value = slugs.join(", ");
  }

  return slugs;
}

function isAllProvinceSelection(slugs) {
  return slugs.includes("all") || slugs.includes("*");
}

function getRequestedPumpRadarProvinceSlugs(slugs) {
  return isAllProvinceSelection(slugs) ? [...PUMPRADAR_PROVINCE_SLUGS] : [...slugs];
}

function filterProvincePayloadsForImport(provincePayloads, requestedSlugs) {
  if (!provincePayloads.length) {
    return { payloads: [], matchedSlugs: [] };
  }

  if (!requestedSlugs.length) {
    if (provincePayloads.length > 1) {
      throw new Error("ไฟล์นี้มีหลายจังหวัด กรุณาระบุ Province Slug ก่อน import เพื่อป้องกันการนำเข้าทั้งก้อน");
    }

    const onlyPayload = provincePayloads[0];
    return {
      payloads: [onlyPayload],
      matchedSlugs: [normalizeProvinceSlug(onlyPayload.provinceSlug || onlyPayload.province)],
    };
  }

  if (isAllProvinceSelection(requestedSlugs)) {
    return {
      payloads: provincePayloads,
      matchedSlugs: provincePayloads.map((payload) => normalizeProvinceSlug(payload.provinceSlug || payload.province)).filter(Boolean),
    };
  }

  const payloadMap = new Map(
    provincePayloads.map((payload) => [normalizeProvinceSlug(payload.provinceSlug || payload.province), payload])
  );
  const matchedPayloads = [];
  const missingSlugs = [];

  requestedSlugs.forEach((slug) => {
    const payload = payloadMap.get(slug);
    if (payload) {
      matchedPayloads.push(payload);
    } else {
      missingSlugs.push(slug);
    }
  });

  if (missingSlugs.length) {
    throw new Error(`ไม่พบจังหวัด ${missingSlugs.join(", ")} ใน JSON ชุดนี้`);
  }

  return {
    payloads: matchedPayloads,
    matchedSlugs: requestedSlugs,
  };
}

function describeProvinceImportSelection(selection) {
  if (!selection.matchedSlugs.length) {
    return "selected provinces";
  }

  if (selection.matchedSlugs.length === 1) {
    return selection.matchedSlugs[0];
  }

  if (selection.matchedSlugs.length > 5) {
    return `${selection.matchedSlugs.length} provinces`;
  }

  return selection.matchedSlugs.join(", ");
}

function buildPumpRadarProvinceUrl(slug) {
  return `https://thaipumpradar.com/api/provinces/${encodeURIComponent(slug)}/stations`;
}

function buildPumpRadarProxyUrl(slug) {
  try {
    const url = new URL(getPumpRadarProxyEndpoint(), window.location.href);
    url.searchParams.set("province", slug);
    return url.toString();
  } catch (error) {
    return `${DEFAULT_PUMPRADAR_PROXY_ENDPOINT}?province=${encodeURIComponent(slug)}`;
  }
}

function initializeAdminImportProxyInput(input) {
  if (!input) {
    return;
  }

  const stored = readStoredPumpRadarProxyEndpoint();
  input.value = stored || DEFAULT_PUMPRADAR_PROXY_ENDPOINT;
}

function readStoredPumpRadarProxyEndpoint() {
  try {
    return String(window.localStorage.getItem(PUMPRADAR_PROXY_ENDPOINT_STORAGE_KEY) || "").trim();
  } catch (error) {
    return "";
  }
}

function normalizePumpRadarProxyEndpoint(value) {
  const trimmed = String(value || "").trim();
  return trimmed || DEFAULT_PUMPRADAR_PROXY_ENDPOINT;
}

function persistPumpRadarProxyEndpoint(value) {
  const normalized = normalizePumpRadarProxyEndpoint(value);
  try {
    if (normalized === DEFAULT_PUMPRADAR_PROXY_ENDPOINT) {
      window.localStorage.removeItem(PUMPRADAR_PROXY_ENDPOINT_STORAGE_KEY);
    } else {
      window.localStorage.setItem(PUMPRADAR_PROXY_ENDPOINT_STORAGE_KEY, normalized);
    }
  } catch (error) {
    return;
  }
}

function getPumpRadarProxyEndpoint() {
  const input = document.querySelector("[data-admin-import-proxy]");
  if (input) {
    return normalizePumpRadarProxyEndpoint(input.value);
  }

  return normalizePumpRadarProxyEndpoint(readStoredPumpRadarProxyEndpoint());
}

function getPumpRadarProxyUnavailableMessage() {
  const protocol = String(window.location.protocol || "").toLowerCase();
  const hostname = String(window.location.hostname || "").toLowerCase();
  const isLocalHost = protocol === "file:" || hostname === "localhost" || hostname === "127.0.0.1";
  const proxyEndpoint = getPumpRadarProxyEndpoint();

  if (isLocalHost && (!proxyEndpoint || proxyEndpoint === DEFAULT_PUMPRADAR_PROXY_ENDPOINT)) {
    return 'PumpRadar proxy ใช้งานไม่ได้ในหน้านี้ เพราะยังไม่ได้รันผ่าน backend ของเว็บ ให้เปิดผ่าน "vercel dev" หรือใส่ URL ของฟังก์ชันที่ deploy แล้วในช่อง "PumpRadar Proxy URL"';
  }

  if (!proxyEndpoint || proxyEndpoint === DEFAULT_PUMPRADAR_PROXY_ENDPOINT) {
    return "PumpRadar proxy ตอบกลับ 404 ให้เช็กว่าฟังก์ชันฝั่งเว็บถูก deploy แล้วบน Vercel";
  }

  return `PumpRadar proxy returned 404 at ${proxyEndpoint}. Check that this URL points to a deployed backend function.`;
}

function canImportStationsToFirestore() {
  return hasAdminAccess() && store.mode === "firebase" && Boolean(store.db);
}

function assertCanImportStationsToFirestore() {
  if (store.mode !== "firebase" || !store.db) {
    throw new Error("Firestore is not connected in this mode.");
  }
  if (!hasAdminAccess()) {
    throw new Error("Please sign in with a Google account that has admin access before importing.");
  }
}

function getAdminImportSourceNote() {
  if (store.stationSource.type === "firestore") {
    return "ดึงและนำเข้าข้อมูล PumpRadar ได้ตรงจากมือถือหรือคอม ระบบจะบันทึกลง Firestore ทันที";
  }

  return `ดึงและนำเข้าได้จากมือถือหรือคอม แต่หน้า public ยังใช้ ${getStationSourceLabel()} อยู่ การนำเข้าจะบันทึกลง Firestore ก่อน และหน้า public จะยังไม่เปลี่ยนจนกว่าจะ publish ใหม่หรือสลับ source`;
}

function getAdminImportSourceSuccessNote() {
  return getAdminFirestoreWriteSuccessNote();
}

function buildPumpRadarStationEntriesFromSelection(selection) {
  const stationMap = new Map();

  selection.payloads.forEach((payload) => {
    payload.stations
      .map((station) => buildPumpRadarStationEntry(station, payload.province))
      .filter(Boolean)
      .forEach((entry) => {
        stationMap.set(entry.id, entry);
      });
  });

  return [...stationMap.values()];
}

function preparePumpRadarImport(selectionPayloads, requestedSlugs) {
  const selection = filterProvincePayloadsForImport(selectionPayloads, requestedSlugs);
  const stationEntries = buildPumpRadarStationEntriesFromSelection(selection);
  return { selection, stationEntries };
}

function createPumpRadarEditorPayload(payloads, failures = []) {
  if (payloads.length === 1 && !failures.length) {
    return payloads[0];
  }

  return {
    source: "PumpRadar",
    generatedAt: new Date().toISOString(),
    provinceCount: payloads.length,
    provinces: payloads,
    failures,
  };
}

async function fetchPumpRadarProvincePayloadViaProxy(slug) {
  const protocol = String(window.location.protocol || "").toLowerCase();
  if (protocol === "file:" && getPumpRadarProxyEndpoint() === DEFAULT_PUMPRADAR_PROXY_ENDPOINT) {
    throw new Error(getPumpRadarProxyUnavailableMessage());
  }

  const response = await fetch(buildPumpRadarProxyUrl(slug), {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (response.status === 404) {
    throw new Error(getPumpRadarProxyUnavailableMessage());
  }

  const payload = await safeJson(response);
  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.detail || `PumpRadar proxy responded with ${response.status}`);
  }

  return normalizePumpRadarProvincePayloadV3(payload);
}

async function fetchPumpRadarProvincePayloadsViaProxy(slugs, options = {}) {
  const { onProgress } = options;
  const requestedSlugs = getRequestedPumpRadarProvinceSlugs(slugs);
  const payloads = [];
  const failures = [];

  for (let index = 0; index < requestedSlugs.length; index += 1) {
    const slug = requestedSlugs[index];
    onProgress?.({
      current: index + 1,
      total: requestedSlugs.length,
      slug,
    });

    try {
      const payload = await fetchPumpRadarProvincePayloadViaProxy(slug);
      payloads.push(payload);
    } catch (error) {
      failures.push({
        provinceSlug: slug,
        error: humanizeError(error),
      });
    }
  }

  if (!payloads.length) {
    const detail = failures[0]?.error || "Could not fetch any PumpRadar province payloads.";
    throw new Error(detail);
  }

  return {
    payloads,
    failures,
    requestedSlugs,
  };
}

async function loadPumpRadarProvinceJsonV3() {
  const messageBox = document.querySelector("[data-admin-import-message]");

  try {
    const requestedSlugs = readAdminImportProvinceSlugs({ required: true });
    if (isAllProvinceSelection(requestedSlugs)) {
      throw new Error("เลือกจังหวัดเดียวถ้าต้องการดึงมาใส่กล่อง JSON ถ้าจะอัปเดตทุกจังหวัดให้ใช้ปุ่ม ดึงแล้วนำเข้า");
    }

    setMessage(messageBox, `Fetching PumpRadar JSON for ${requestedSlugs[0]}...`);
    const result = await fetchPumpRadarProvincePayloadsViaProxy(requestedSlugs, {
      onProgress: ({ current, total, slug }) => {
        setMessage(messageBox, `Fetching PumpRadar JSON ${current}/${total}: ${slug}...`);
      },
    });

    const fileInput = document.querySelector("[data-admin-import-file]");
    const textArea = document.querySelector("[data-admin-import-json]");
    if (fileInput) {
      fileInput.value = "";
    }
    if (textArea) {
      textArea.value = JSON.stringify(createPumpRadarEditorPayload(result.payloads, result.failures), null, 2);
    }

    const failureNote = result.failures.length
      ? ` Failed provinces: ${result.failures.map((item) => item.provinceSlug).join(", ")}.`
      : "";
    setMessage(messageBox, `Loaded PumpRadar JSON for ${requestedSlugs[0]} into the editor.${failureNote}`);
  } catch (error) {
    console.error(error);
    setMessage(messageBox, humanizeError(error));
  }
}

async function importPumpRadarStationsFromProxyV3() {
  const messageBox = document.querySelector("[data-admin-import-message]");
  setMessage(messageBox, "Fetching PumpRadar payloads via backend proxy...");

  try {
    assertCanImportStationsToFirestore();

    const requestedSlugs = readAdminImportProvinceSlugs({ required: true });
    const result = await fetchPumpRadarProvincePayloadsViaProxy(requestedSlugs, {
      onProgress: ({ current, total, slug }) => {
        setMessage(messageBox, `Fetching PumpRadar JSON ${current}/${total}: ${slug}...`);
      },
    });

    const { selection, stationEntries } = preparePumpRadarImport(result.payloads, requestedSlugs);
    if (!stationEntries.length) {
      throw new Error("No stations were found in the fetched PumpRadar payloads.");
    }

    const selectionLabel = describeProvinceImportSelection(selection);
    setMessage(messageBox, `Importing ${stationEntries.length} stations from ${selectionLabel}...`);
    await writeDocsInBatches(appSettings.collections.stations, stationEntries);
    syncImportedStationsInAdminStore(stationEntries);

    const failureNote = result.failures.length
      ? ` Failed provinces: ${result.failures.map((item) => item.provinceSlug).join(", ")}.`
      : "";
    setMessage(
      messageBox,
      `Imported ${stationEntries.length} stations from ${selection.payloads.length} province payloads (${selectionLabel}) via backend proxy.${failureNote}${getAdminImportSourceSuccessNote()}`
    );
  } catch (error) {
    console.error(error);
    maybeTrackFirebaseError("admin-import-proxy", error);
    setMessage(messageBox, humanizeError(error));
  }
}

async function safeJson(response) {
  try {
    return await response.json();
  } catch (error) {
    return null;
  }
}

function downloadPumpRadarProvinceJson() {
  const messageBox = document.querySelector("[data-admin-import-message]");

  try {
    const slug = readAdminImportProvinceSlug();
    const url = buildPumpRadarProvinceUrl(slug);
    const link = document.createElement("a");
    link.href = url;
    link.target = "_blank";
    link.rel = "noopener";
    link.click();
    setMessage(messageBox, `เปิด JSON ของจังหวัด ${slug} ในแท็บใหม่แล้ว`);
  } catch (error) {
    console.error(error);
    setMessage(messageBox, humanizeError(error));
  }
}

async function importPumpRadarStationsV2() {
  const messageBox = document.querySelector("[data-admin-import-message]");
  setMessage(messageBox, "กำลังตรวจข้อมูล PumpRadar...");

  try {
    if (store.mode !== "firebase" || !store.db) {
      throw new Error("โหมดนี้ยังไม่เชื่อม Firestore จึงนำเข้าข้อมูลไม่ได้");
    }
    if (!hasAdminAccess()) {
      throw new Error("กรุณาเข้าสู่ระบบด้วย Google ที่มีสิทธิ์ admin ก่อนนำเข้าข้อมูล");
    }

    const raw = await readAdminImportText();
    const provincePayloads = parsePumpRadarPayloadV2(raw);
    const stationMap = new Map();

    provincePayloads.forEach((payload) => {
      payload.stations
        .map((station) => buildPumpRadarStationEntry(station, payload.province))
        .filter(Boolean)
        .forEach((entry) => {
          stationMap.set(entry.id, entry);
        });
    });

    const stationEntries = [...stationMap.values()];

    if (!stationEntries.length) {
      throw new Error("JSON นี้ไม่มีสถานีที่พร้อมนำเข้า");
    }

    setMessage(messageBox, `กำลังนำเข้า ${stationEntries.length} สถานี...`);
    await writeDocsInBatches(appSettings.collections.stations, stationEntries);
    setMessage(messageBox, `นำเข้าข้อมูล PumpRadar แล้ว ${stationEntries.length} สถานี (${payload.province || "ไม่ระบุจังหวัด"})`);
  } catch (error) {
    console.error(error);
    maybeTrackFirebaseError("admin-import", error);
    setMessage(messageBox, humanizeError(error));
  }
}

async function readAdminImportText() {
  const textArea = document.querySelector("[data-admin-import-json]");
  const rawText = String(textArea?.value || "").trim();
  if (rawText) {
    return rawText;
  }

  const fileInput = document.querySelector("[data-admin-import-file]");
  const file = fileInput?.files?.[0];
  if (file) {
    return await file.text();
  }

  throw new Error("เลือกไฟล์ JSON หรือวาง JSON จาก PumpRadar ก่อน");
}

function parsePumpRadarPayloadV2(raw) {
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch (error) {
    throw new Error("JSON ไม่ถูกต้อง ลองตรวจว่าคัดลอกมาครบหรือไม่");
  }

  if (!payload || !Array.isArray(payload.stations)) {
    throw new Error("JSON นี้ไม่ใช่รูปแบบของ PumpRadar province API");
  }

  return payload;
}

function buildPumpRadarStationEntry(station, provinceName) {
  const stationId = String(station?.id || "").trim();
  const lat = coerceNumber(station?.lat);
  const lng = coerceNumber(station?.lon);
  if (!stationId || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  const latestReport = station.latestReport || null;
  const updatedAt = buildPumpRadarTimestamp(station.reportTime || latestReport?.createdAt) || new Date();
  const fuelStates = buildPumpRadarFuelStates(latestReport);
  const hasKnownFuel = Object.values(fuelStates).some((status) => status !== "unknown");
  const area = String(station.district || station.province || provinceName || "ยังไม่ระบุพื้นที่").trim();

  return {
    id: stationId,
    data: {
      name: String(station.name || stationId).trim(),
      brand: mapPumpRadarBrand(station.brandId),
      area,
      lat,
      lng,
      reportCount: hasKnownFuel ? 1 : 0,
      photoUrl: String(latestReport?.photoUrl || "").trim(),
      fuelStates,
      updatedAt,
      createdAt: updatedAt,
      sourceId: String(station.sourceId || "").trim(),
      importSource: "thaipumpradar",
      importProvince: String(station.province || provinceName || "").trim(),
      lastReportId: String(latestReport?.id || "").trim(),
      lastReporter: "Thairecheckpump",
    },
  };
}

function mapPumpRadarBrand(brandId) {
  return normalizeBrandLabel(brandId);
}

function mapPumpRadarStatus(status) {
  const key = String(status || "unknown").trim().toLowerCase();
  return PUMPRADAR_STATUS_MAP[key] || "unknown";
}

function buildPumpRadarFuelStates(report) {
  const fuelStates = createUnknownFuelMap();
  if (!report) {
    return fuelStates;
  }

  Object.entries(PUMPRADAR_FUEL_MAP).forEach(([localFuelId, remoteFuelIds]) => {
    const matchedValue = remoteFuelIds.map((remoteFuelId) => report[remoteFuelId]).find((value) => value !== undefined);
    fuelStates[localFuelId] = mapPumpRadarStatus(matchedValue);
  });

  return fuelStates;
}

function buildPumpRadarTimestamp(value) {
  const text = String(value || "").trim();
  if (!text) {
    return null;
  }

  const date = new Date(text);
  return Number.isFinite(date.getTime()) ? date : null;
}

async function writeDocsInBatches(collectionName, entries) {
  const batchSize = 400;
  let batch = writeBatch(store.db);
  let count = 0;

  for (const entry of entries) {
    batch.set(doc(store.db, collectionName, entry.id), entry.data);
    count += 1;

    if (count >= batchSize) {
      await batch.commit();
      batch = writeBatch(store.db);
      count = 0;
    }
  }

  if (count) {
    await batch.commit();
  }
}

async function submitReport(form) {
  const messageBox = document.querySelector("[data-form-message]");
  setMessage(messageBox, "กำลังบันทึกรายงาน...");

  try {
    const formData = new FormData(form);
    const payload = readReportPayload(formData);
    const photoValue = formData.get("photo");
    const photoFile = photoValue instanceof File && photoValue.size > 0 ? photoValue : null;

    if (!payload.station || !payload.brand || !payload.fuel || !payload.status) {
      throw new Error("กรอกชื่อปั๊ม แบรนด์ เชื้อเพลิง และสถานะให้ครบก่อนส่ง");
    }

    if (!Number.isFinite(payload.lat) || !Number.isFinite(payload.lng)) {
      throw new Error("ต้องมีพิกัดของสถานีจากตำแหน่งผู้ใช้หรือกรอกละติจูด/ลองจิจูดเอง");
    }

    if (store.mode === "firebase" && store.db) {
      if (!canWriteReports()) {
        throw new Error("กรุณาเข้าสู่ระบบด้วย Google ก่อนส่งรายงาน");
      }
      await submitReportToFirebase(payload, photoFile);
      setMessage(messageBox, "ส่งรายงานขึ้น Firebase แล้ว ข้อมูลจะสดในทุกหน้าทันทีเมื่อ listener รับ snapshot ใหม่");
    } else {
      saveFallbackReport(payload);
      useFallbackMode("ยังไม่มี Firebase config จึงบันทึกรายงานไว้ในเบราว์เซอร์นี้แทน");
      setMessage(messageBox, "บันทึกรายงานแบบ fallback แล้วในเบราว์เซอร์นี้");
    }

    form.reset();
    hydrateLocationFields();
    refreshCurrentPage();
  } catch (error) {
    console.error(error);
    maybeTrackFirebaseError("report-submit", error);
    setMessage(messageBox, humanizeError(error));
  }
}

async function submitReportToFirebase(payload, photoFile) {
  const photoMeta = await maybeUploadPhoto(photoFile);
  const reportBody = {
    stationId: payload.stationId,
    station: payload.station,
    brand: payload.brand,
    area: payload.area,
    lat: payload.lat,
    lng: payload.lng,
    fuel: payload.fuel,
    status: payload.status,
    note: payload.note,
    reporter: payload.reporter,
    distance: payload.distance,
    photoUrl: photoMeta.url,
    photoPath: photoMeta.path,
    createdBy: store.user?.uid || "",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  const reportRef = await addDoc(collection(store.db, appSettings.collections.reports), reportBody);
  const stationRef = doc(store.db, appSettings.collections.stations, payload.stationId);
  const existingStation = await getDoc(stationRef);

  if (existingStation.exists()) {
    await updateDoc(stationRef, {
      name: payload.station,
      brand: payload.brand,
      area: payload.area,
      lat: payload.lat,
      lng: payload.lng,
      reportCount: increment(1),
      updatedAt: serverTimestamp(),
      photoUrl: photoMeta.url || existingStation.data().photoUrl || "",
      [`fuelStates.${payload.fuel}`]: payload.status,
      lastReportId: reportRef.id,
      lastReporter: payload.reporter,
    });
  } else {
    await setDoc(stationRef, {
      name: payload.station,
      brand: payload.brand,
      area: payload.area,
      lat: payload.lat,
      lng: payload.lng,
      reportCount: 1,
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
      photoUrl: photoMeta.url,
      fuelStates: createFuelMap(payload.fuel, payload.status),
      lastReportId: reportRef.id,
      lastReporter: payload.reporter,
    });
  }
}

async function maybeUploadPhoto(file) {
  if (!file || !store.storage || !store.user) {
    return { url: "", path: "" };
  }

  try {
    const safeName = sanitizeFilename(file.name || "photo.jpg");
    const objectPath = `${appSettings.storageFolder}/${store.user.uid}/${Date.now()}-${safeName}`;
    const objectRef = ref(store.storage, objectPath);
    await uploadBytes(objectRef, file, { contentType: file.type || "image/jpeg" });
    const url = await getDownloadURL(objectRef);
    return { url, path: objectPath };
  } catch (error) {
    console.warn("Photo upload skipped", error);
    return { url: "", path: "" };
  }
}

function refreshCurrentPage() {
  renderGlobalChrome();
  store.pageController?.render?.();
}

function getRuntimeData(radiusKm = appSettings.defaultRadiusKm) {
  const reports = [...store.reports].sort((left, right) => getReportAge(left) - getReportAge(right));
  const baseStations = store.stations.length ? store.stations : [];
  const mergedStations = mergeStationsWithReports(baseStations, reports);
  const center = getCurrentCenter();

  const stations = mergedStations
    .map((station) => {
      const distanceKm = Number.isFinite(station.lat) && Number.isFinite(station.lng) ? haversineKm(center, station) : Number.POSITIVE_INFINITY;
      return {
        ...station,
        fuels: normalizeFuelStates(station.fuels || station.fuelStates),
        distanceKm,
        position: projectRadarPosition(center, station, radiusKm),
        updatedMinutes: Number.isFinite(station.updatedMinutes) ? station.updatedMinutes : 0,
        reports: Number.isFinite(station.reports) ? station.reports : Number(station.reportCount || 0),
      };
    })
    .sort((left, right) => left.distanceKm - right.distanceKm);

  return { reports, stations };
}

function buildFeedItems(reports, stations) {
  const items = [...reports];
  const latestReportByStation = new Map();

  reports.forEach((report) => {
    const stationKey = normalizeStationName(report.stationId || report.station || report.id);
    if (!stationKey) {
      return;
    }

    const current = latestReportByStation.get(stationKey);
    const currentMs = Number(current?.updatedAtMs || current?.createdAtMs || 0);
    const reportMs = Number(report.updatedAtMs || report.createdAtMs || 0);
    if (!current || reportMs >= currentMs) {
      latestReportByStation.set(stationKey, report);
    }
  });

  stations.forEach((station) => {
    const stationKey = normalizeStationName(station.id || station.name);
    if (!stationKey) {
      return;
    }

    const snapshotFeed = buildStationFeedItem(station);
    if (!snapshotFeed) {
      return;
    }

    const latestReport = latestReportByStation.get(stationKey);
    const latestReportMs = Number(latestReport?.updatedAtMs || latestReport?.createdAtMs || 0);
    const snapshotMs = Number(snapshotFeed.updatedAtMs || snapshotFeed.createdAtMs || 0);
    if (latestReport && latestReportMs >= snapshotMs) {
      return;
    }

    items.push(snapshotFeed);
  });

  return items.sort((left, right) => getReportAge(left) - getReportAge(right));
}

function buildStationFeedItem(station) {
  const normalizedFuelStates = normalizeFuelStates(station.fuelStates || station.fuels);
  const signal = pickStationFeedSignal(normalizedFuelStates);
  if (!signal) {
    return null;
  }

  const updatedAtMs = Number.isFinite(station.updatedAtMs)
    ? station.updatedAtMs
    : Date.now() - (Number(station.updatedMinutes || 0) * 60000);
  const importedAtMs =
    store.stationSource.type === "static-json" && Number.isFinite(store.stationSource.generatedAtMs)
      ? store.stationSource.generatedAtMs
      : 0;
  const knownFuelCount = Object.values(normalizedFuelStates).filter((status) => status !== "unknown").length;
  const readyFuelCount = Object.values(normalizedFuelStates).filter((status) => statusScore(status) >= 0.66).length;
  const note =
    store.stationSource.type === "static-json" && importedAtMs > 0
      ? `อัปขึ้นเว็บ ${formatAge(getAgeMinutesFromMs(importedAtMs))} | ข้อมูลสถานีจริง ${formatAge(getAgeMinutesFromMs(updatedAtMs))} | พร้อมจ่าย ${readyFuelCount}/${FUELS.length} | มีข้อมูล ${knownFuelCount}/${FUELS.length}`
      : `อัปเดตจาก ${getStationSourceLabel()} | พร้อมจ่าย ${readyFuelCount}/${FUELS.length} | มีข้อมูล ${knownFuelCount}/${FUELS.length}`;

  return {
    id: `station-snapshot-${station.id}`,
    stationId: station.id,
    station: station.name || station.id,
    brand: station.brand || "Unknown",
    area: station.area || "Unknown area",
    lat: station.lat,
    lng: station.lng,
    fuel: signal.fuel,
    status: signal.status,
    note: `อัปเดตจาก ${getStationSourceLabel()} | พร้อมจ่าย ${readyFuelCount}/${FUELS.length} | มีข้อมูล ${knownFuelCount}/${FUELS.length}`,
    ...(importedAtMs > 0 ? { note, importedAtMs } : { importedAtMs }),
    reporter: normalizeReporterLabel(station.lastReporter) || getStationSourceLabel(),
    createdBy: "",
    createdAtMs: updatedAtMs,
    updatedAtMs,
    photoUrl: station.photoUrl || "",
    photoPath: "",
    distance: 0,
    source: store.stationSource.type || "google-sheet",
  };
}

function pickStationFeedSignal(fuelStates) {
  const normalized = normalizeFuelStates(fuelStates);
  const priority = ["empty", "low", "medium", "high"];

  for (const status of priority) {
    const selectedFuel = FUELS.find((fuel) => normalized[fuel.id] === status);
    if (selectedFuel) {
      return { fuel: selectedFuel.id, status };
    }
  }

  return null;
}

function readReportPayload(formData) {
  const latInput = parseOptionalNumber(formData.get("latitude"));
  const lngInput = parseOptionalNumber(formData.get("longitude"));

  const lat = Number.isFinite(latInput) ? latInput : store.location?.lat;
  const lng = Number.isFinite(lngInput) ? lngInput : store.location?.lng;
  const station = String(formData.get("station") || "").trim();
  const brand = String(formData.get("brand") || "");

  return {
    stationId: normalizeStationName(`${brand}-${station}`),
    station,
    brand,
    area: String(formData.get("area") || "").trim() || "ยังไม่ระบุพื้นที่",
    distance: parseOptionalNumber(formData.get("distance")) || 2,
    lat,
    lng,
    fuel: String(formData.get("fuel") || ""),
    status: String(formData.get("status") || ""),
    note: String(formData.get("note") || "").trim() || "ผู้ใช้แจ้งอัปเดตล่าสุด",
    reporter: String(formData.get("reporter") || "").trim() || getGoogleUserLabel() || "ผู้ใช้ไม่ระบุชื่อ",
  };
}

function saveFallbackReport(payload) {
  const reports = loadFallbackReports();
  reports.unshift({
    id: `local-${Date.now()}`,
    stationId: payload.stationId,
    station: payload.station,
    brand: payload.brand,
    area: payload.area,
    lat: payload.lat,
    lng: payload.lng,
    fuel: payload.fuel,
    status: payload.status,
    note: payload.note,
    reporter: payload.reporter,
    distance: payload.distance,
    photoUrl: "",
    createdAtMs: Date.now(),
    updatedAtMs: Date.now(),
    createdBy: "local-user",
    source: "fallback",
  });
  window.localStorage.setItem(FALLBACK_STORAGE_KEY, JSON.stringify(reports.slice(0, 40)));
}

function loadFallbackReports() {
  try {
    const raw = JSON.parse(window.localStorage.getItem(FALLBACK_STORAGE_KEY) || "[]");
    return raw.map((report) => ({
      ...report,
      createdAtMs: Number(report.createdAtMs || Date.now()),
      updatedAtMs: Number(report.updatedAtMs || report.createdAtMs || Date.now()),
    }));
  } catch (error) {
    return [];
  }
}

function mapStationDoc(snapshot) {
  const data = snapshot.data();
  return {
    id: snapshot.id,
    name: data.name || snapshot.id,
    brand: normalizeBrandLabel(data.brand),
    area: data.area || "ยังไม่ระบุพื้นที่",
    lat: coerceNumber(data.lat),
    lng: coerceNumber(data.lng),
    reportCount: Number(data.reportCount || 0),
    updatedMinutes: minutesSince(data.updatedAt),
    updatedAtMs: timestampToMs(data.updatedAt),
    fuelStates: normalizeFuelStates(data.fuelStates),
    photoUrl: data.photoUrl || "",
    importSource: data.importSource || "",
    lastReporter: normalizeReporterLabel(data.lastReporter),
  };
}

function mapReportDoc(snapshot) {
  const data = snapshot.data();
  return {
    id: snapshot.id,
    stationId: data.stationId || normalizeStationName(`${data.brand || ""}-${data.station || snapshot.id}`),
    station: data.station || "ไม่ทราบสถานี",
    brand: normalizeBrandLabel(data.brand),
    area: data.area || "ยังไม่ระบุพื้นที่",
    lat: coerceNumber(data.lat),
    lng: coerceNumber(data.lng),
    fuel: data.fuel || "diesel",
    status: data.status || "unknown",
    note: data.note || "ไม่มีรายละเอียดเพิ่มเติม",
    reporter: data.reporter || "ผู้ใช้ไม่ระบุชื่อ",
    createdBy: data.createdBy || "",
    createdAtMs: timestampToMs(data.createdAt),
    updatedAtMs: timestampToMs(data.updatedAt || data.createdAt),
    photoUrl: data.photoUrl || "",
    photoPath: data.photoPath || "",
    distance: Number(data.distance || 0),
    source: "firebase",
  };
}

function syncReportAccessUI() {
  const form = document.querySelector("[data-report-form]");
  const panel = document.querySelector("[data-report-auth-panel]");
  const title = document.querySelector("[data-report-auth-title]");
  const copy = document.querySelector("[data-report-auth-copy]");
  const reporterInput = form?.querySelector('input[name="reporter"]');
  const canSubmit = store.mode === "firebase" ? canWriteReports() : true;

  if (form) {
    Array.from(form.elements).forEach((field) => {
      if ("disabled" in field) {
        field.disabled = store.mode === "firebase" && !canSubmit;
      }
    });
    form.classList.toggle("is-readonly", store.mode === "firebase" && !canSubmit);
  }

  if (reporterInput && canSubmit && !reporterInput.value.trim()) {
    reporterInput.value = getGoogleUserLabel();
  }

  if (!panel) {
    return;
  }

  if (store.mode !== "firebase") {
    setText("[data-report-auth-title]", "โหมดสำรองยังไม่ต้องล็อกอิน");
    setText("[data-report-auth-copy]", "ตอนนี้ระบบยังไม่เชื่อม Firebase จึงบันทึกรายงานแบบ local fallback ได้จากเครื่องนี้");
    setMessage(document.querySelector("[data-report-auth-message]"), "");
    return;
  }

  if (canSubmit) {
    title && (title.textContent = "ล็อกอิน Google แล้ว พร้อมส่งรายงาน");
    copy && (copy.textContent = `ส่งรายงานในชื่อ ${getGoogleUserLabel()} ได้เลย ข้อมูลจะถูกบันทึกเข้า Firestore โดยทุกคนยังเข้ามาดูข้อมูลหน้าอื่นได้ตามปกติ`);
    setMessage(document.querySelector("[data-report-auth-message]"), "");
    return;
  }

  title && (title.textContent = "เข้าสู่ระบบด้วย Google ก่อนส่งรายงาน");
  copy && (copy.textContent = "ทุกคนยังเปิดดูแผนที่ ฟีด และข้อมูลสถานีได้เหมือนเดิม แต่การแจ้งสถานะน้ำมันจะใช้ Google sign-in เพื่อระบุตัวตนผู้ส่งรายงาน");
}

function syncAdminAccessUI() {
  const gate = document.querySelector("[data-admin-auth-gate]");
  const content = document.querySelector("[data-admin-content]");
  const title = document.querySelector("[data-admin-auth-title]");
  const copy = document.querySelector("[data-admin-auth-copy]");
  const messageNode = document.querySelector("[data-admin-auth-message]");
  const canAccess = hasAdminAccess();

  if (content) {
    content.hidden = !canAccess;
  }
  if (!gate) {
    return;
  }

  gate.hidden = canAccess;
  if (canAccess) {
    setMessage(messageNode, "");
    return;
  }

  if (store.mode !== "firebase") {
    title && (title.textContent = "หน้า admin ใช้งานได้เมื่อเชื่อม Firebase");
    copy && (copy.textContent = "ระบบยังใช้ข้อมูลสำรองอยู่ จึงยังเปิดหลังบ้านแก้ข้อมูลจริงไม่ได้");
    return;
  }

  if (!isGoogleUser()) {
    title && (title.textContent = "เข้าสู่ระบบด้วย Google ก่อนเข้า admin");
    copy && (copy.textContent = "หน้า admin ไม่แสดงบนเมนู public แล้ว และการแก้ข้อมูลสถานีกับรายงานจะเปิดให้เฉพาะผู้ใช้ที่ล็อกอินด้วย Google");
    return;
  }

  title && (title.textContent = "บัญชีนี้ยังไม่มีสิทธิ์ admin");
  copy && (copy.textContent = getAdminEmailAllowlist().length ? "อีเมลนี้ยังไม่อยู่ในรายชื่อผู้ดูแล ให้เพิ่มใน appSettings.adminEmails แล้วรีโหลดหน้าอีกครั้ง" : "ตอนนี้ฝั่ง client อนุญาตเฉพาะผู้ใช้ Google ที่ผ่านเงื่อนไข admin access");
}

function mergeStationsWithReports(baseStations, reports) {
  const stations = baseStations.map((station) => cloneStation(station));
  const stationMap = new Map(stations.map((station) => [normalizeStationName(station.id || station.name), station]));
  const aggregatedCounts = new Map();

  reports
    .slice()
    .sort((left, right) => getReportAge(right) - getReportAge(left))
    .forEach((report) => {
      const key = normalizeStationName(report.stationId || report.station);
      aggregatedCounts.set(key, (aggregatedCounts.get(key) || 0) + 1);

      if (stationMap.has(key)) {
        return;
      }

      const station = {
        id: key,
        name: report.station,
        brand: report.brand,
        area: report.area,
        lat: report.lat,
        lng: report.lng,
        updatedMinutes: getReportAge(report),
        reports: 0,
        reportCount: 0,
        fuelStates: createUnknownFuelMap(),
        photoUrl: report.photoUrl || "",
      };

      stations.push(station);
      stationMap.set(key, station);
      station.updatedMinutes = Math.min(Number(station.updatedMinutes || 9999), getReportAge(report));
      station.lat = Number.isFinite(station.lat) ? station.lat : report.lat;
      station.lng = Number.isFinite(station.lng) ? station.lng : report.lng;
      station.area = station.area || report.area;
      station.brand = station.brand || report.brand;
      station.name = station.name || report.station;
      station.photoUrl = station.photoUrl || report.photoUrl || "";
      station.fuelStates = normalizeFuelStates(station.fuelStates);
      station.fuelStates[report.fuel] = report.status;
    });

  stations.forEach((station) => {
    const key = normalizeStationName(station.id || station.name);
    const baseCount = Number(station.reports || station.reportCount || 0);
    const fromReports = Number(aggregatedCounts.get(key) || 0);
    station.reports = Math.max(baseCount, fromReports);
    station.reportCount = station.reports;
  });

  return stations;
}

function renderGlobalChrome() {
  const hidePublicStatus = store.page !== "admin";
  const modeLabel =
    store.mode === "firebase"
      ? store.stationSource.type === "google-sheet"
        ? "Firebase + Sheet"
        : store.stationSource.type === "static-json"
          ? "Firebase + JSON"
          : "Firebase Live"
      : store.mode === "sheet"
        ? "Google Sheet"
      : store.mode === "static"
        ? "Static JSON"
      : store.mode === "demo"
        ? "Fallback"
        : "กำลังเริ่มระบบ";
  const authLabel =
    store.mode !== "firebase"
      ? "Auth: ไม่ได้ใช้"
      : isGoogleUser()
        ? `Auth: Google ${getGoogleUserLabel().slice(0, 24)}`
        : store.authReady
          ? "Auth: ยังไม่ล็อกอิน Google"
          : "Auth: กำลังตรวจสอบ";
  const locationLabel = store.location
    ? `Location: ${store.location.lat.toFixed(4)}, ${store.location.lng.toFixed(4)}`
    : "Location: ยังไม่มีพิกัด";

  document.querySelectorAll("[data-live-mode]").forEach((node) => {
    node.hidden = hidePublicStatus;
    node.textContent = modeLabel;
  });
  document.querySelectorAll("[data-auth-state]").forEach((node) => {
    node.hidden = hidePublicStatus;
    node.textContent = authLabel;
  });
  document.querySelectorAll("[data-location-state]").forEach((node) => {
    node.hidden = hidePublicStatus;
    node.textContent = locationLabel;
  });
  document.querySelectorAll("[data-live-hint]").forEach((node) => {
    node.hidden = hidePublicStatus;
    node.textContent = store.liveHint || "ระบบพร้อมใช้งาน";
  });
  document.querySelectorAll("[data-location-detail]").forEach((node) => {
    node.textContent = store.location
      ? `พิกัดปัจจุบัน ${store.location.lat.toFixed(6)}, ${store.location.lng.toFixed(6)} ความแม่นยำประมาณ ${Math.round(store.location.accuracy)} เมตร`
      : "อนุญาตตำแหน่งจากเบราว์เซอร์เมื่อระบบร้องขอ หรือกรอกละติจูด/ลองจิจูดเอง";
  });

  document.querySelectorAll("[data-google-sign-in]").forEach((button) => {
    button.hidden = store.mode === "firebase" && isGoogleUser();
    button.disabled = store.mode !== "firebase" || !store.auth;
  });
  document.querySelectorAll("[data-google-sign-out]").forEach((button) => {
    button.hidden = !isGoogleUser();
    button.disabled = store.mode !== "firebase" || !store.auth || !isGoogleUser();
  });

  syncReportAccessUI();
  syncAdminAccessUI();
}

function hydrateLocationFields() {
  const latInput = document.querySelector("[data-lat-input]");
  const lngInput = document.querySelector("[data-lng-input]");
  if (store.location && latInput && lngInput) {
    latInput.value = `${store.location.lat.toFixed(6)}`;
    lngInput.value = `${store.location.lng.toFixed(6)}`;
  }
}

function renderSingleChoiceChips(host, items, getSelectedId, onSelect) {
  if (!host) {
    return;
  }

  host.innerHTML = items
    .map((item) => {
      const active = getSelectedId() === item.id;
      return `<button class="chip-button${active ? " is-active" : ""}" type="button" data-chip-id="${escapeHtml(item.id)}">${escapeHtml(item.label)}</button>`;
    })
    .join("");

  host.querySelectorAll("[data-chip-id]").forEach((button) => {
    button.addEventListener("click", () => {
      onSelect(button.dataset.chipId);
      renderSingleChoiceChips(host, items, getSelectedId, onSelect);
    });
  });
}

function renderMultiChoiceChips(host, items, selectedItems, onToggle) {
  if (!host) {
    return;
  }

  host.innerHTML = items
    .map((item) => {
      const active = selectedItems.has(item.id);
      return `<button class="chip-button${active ? " is-soft-active" : ""}" type="button" data-chip-id="${escapeHtml(item.id)}">${escapeHtml(item.label)}</button>`;
    })
    .join("");

  host.querySelectorAll("[data-chip-id]").forEach((button) => {
    button.addEventListener("click", () => {
      onToggle(button.dataset.chipId);
      renderMultiChoiceChips(host, items, selectedItems, onToggle);
    });
  });
}

function renderStationCard(station, fuelId) {
  const meta = STATUS_META[station.fuels[fuelId] || "unknown"];
  return `
    <article class="station-card">
      <div class="station-head">
        <div>
          <span class="brand-badge">${escapeHtml(station.brand)}</span>
          <h3>${escapeHtml(station.name)}</h3>
          <div class="meta-row muted">
            <span>${escapeHtml(station.area)}</span>
            <span>${formatDistance(station.distanceKm)}</span>
            <span>${escapeHtml(getStationFreshnessText(station, { compact: true }))}</span>
          </div>
        </div>
        <span class="status-badge ${meta.tone}">${escapeHtml(meta.label)}</span>
      </div>
      <div class="availability-row">
        ${FUELS.map((fuel) => renderAvailabilityPill(fuel.label, station.fuels[fuel.id])).join("")}
      </div>
      <div class="detail-row muted">
        <span>${escapeHtml(FUEL_LABELS[fuelId])} คือสถานะที่เลือก</span>
        <span>รายงานสะสม ${station.reports}</span>
      </div>
    </article>
  `;
}

function renderAvailabilityPill(label, status) {
  const meta = STATUS_META[status || "unknown"];
  return `
    <span class="availability-pill ${meta.tone}">
      <span class="availability-dot"></span>
      <span>${escapeHtml(label)}</span>
      <span>${escapeHtml(meta.label)}</span>
    </span>
  `;
}

function formatFeedSourceLabel(value) {
  const source = String(value || "").trim().toLowerCase();
  if (!source) {
    return store.mode;
  }
  if (["pumpradar", "pump radar", "thaipumpradar", "thai pump radar"].includes(source)) {
    return "Thairecheckpump";
  }
  if (source === "google-sheet" || source === "sheet" || source === "google_sheets") {
    return "Google Sheet";
  }
  if (source === "static-json" || source === "static_json" || source === "json") {
    return "Static JSON";
  }
  if (source === "firebase") {
    return "firebase";
  }
  if (source === "fallback") {
    return "local";
  }
  return value;
}

function renderFeedCard(report) {
  const meta = STATUS_META[report.status || "unknown"];
  const importedBadge =
    (report.source === "static-json" || report.source === "static_json" || report.source === "json") &&
    Number.isFinite(report.importedAtMs) &&
    report.importedAtMs > 0
      ? `<span class="tiny-badge">นำเข้า ${escapeHtml(formatAge(getAgeMinutesFromMs(report.importedAtMs)))}</span>`
      : "";
  return `
    <article class="feed-card">
      <div class="feed-head">
        <div>
          <div class="meta-row">
            <span class="brand-badge">${escapeHtml(report.brand)}</span>
            <span class="status-badge ${meta.tone}">${escapeHtml(meta.label)}</span>
            ${report.photoUrl ? '<span class="tiny-badge">มีภาพยืนยัน</span>' : ""}
            <span class="tiny-badge">${escapeHtml(formatFeedSourceLabel(report.source || store.mode))}</span>
            ${importedBadge}
          </div>
          <h3>${escapeHtml(report.station)}</h3>
        </div>
        <span class="tiny-badge">${formatAge(getFeedCardAge(report))}</span>
      </div>
      <p class="muted">${escapeHtml(report.area)} | ${escapeHtml(FUEL_LABELS[report.fuel] || report.fuel)}</p>
      <p>${escapeHtml(report.note)}</p>
      <div class="detail-row muted">
        <span>โดย ${escapeHtml(normalizeReporterLabel(report.reporter))}</span>
        <span>${Number.isFinite(report.lat) && Number.isFinite(report.lng) ? `${report.lat.toFixed(4)}, ${report.lng.toFixed(4)}` : "ไม่มีพิกัด"}</span>
      </div>
    </article>
  `;
}

function renderGalleryCard(report, index) {
  const meta = STATUS_META[report.status || "unknown"];
  const feature = index % 5 === 0 ? "LIVE SNAP" : "COMMUNITY PHOTO";
  const displayPhotoUrl = getDisplayPhotoUrl(report.photoUrl, report.photoPath);
  const hasPhotoReference = hasPhotoValue(report.photoUrl) || hasPhotoValue(report.photoPath);
  const photoCacheKey = getPhotoCacheKey(report.photoUrl, report.photoPath);
  const sourceLabel = displayPhotoUrl
    ? "ภาพยืนยันล่าสุด"
    : hasPhotoReference
      ? store.mediaUrlCache.has(photoCacheKey)
        ? "ภาพสำรองของระบบ"
        : "กำลังโหลดภาพ"
      : "ภาพสำรองของระบบ";
  return `
    <article class="gallery-card">
      <div class="gallery-art ${displayPhotoUrl ? "has-photo" : ""}" style="--brand-tone:${brandColor(report.brand)};" data-gallery-art>
        ${displayPhotoUrl ? `<img class="gallery-image" data-gallery-image loading="lazy" decoding="async" src="${escapeHtml(displayPhotoUrl)}" alt="${escapeHtml(`ภาพยืนยันของ ${report.station}`)}" />` : ""}
        <div class="gallery-overlay">
          <div class="meta-row">
            <span class="tiny-badge">${feature}</span>
            <span class="status-badge ${meta.tone}">${escapeHtml(meta.label)}</span>
          </div>
          <div>
            <h3>${escapeHtml(report.station)}</h3>
            <p class="muted">${escapeHtml(FUEL_LABELS[report.fuel] || report.fuel)} | ${escapeHtml(report.area)}</p>
          </div>
        </div>
      </div>
      <div class="gallery-copy">
        <div class="detail-row muted">
          <span>${escapeHtml(report.brand)}</span>
          <span>${formatAge(getReportAge(report))}</span>
        </div>
        <p>${escapeHtml(report.note)}</p>
        <div class="detail-row muted">
          <span>โดย ${escapeHtml(normalizeReporterLabel(report.reporter))}</span>
          <span data-gallery-source-note>${escapeHtml(sourceLabel)}</span>
        </div>
      </div>
    </article>
  `;
}

function renderBarRow(label, percent, color) {
  return `
    <div class="bar-row">
      <span>${escapeHtml(label)}</span>
      <div class="bar-track">
        <div class="bar-fill" style="--value:${escapeHtml(percent)}; background:linear-gradient(90deg, ${color}, rgba(255, 123, 50, 0.92));"></div>
      </div>
      <strong>${escapeHtml(percent)}</strong>
    </div>
  `;
}

function renderEmptyState(text) {
  return `<div class="empty-state">${escapeHtml(text)}</div>`;
}

function getCurrentCenter() {
  return store.location || appSettings.defaultCenter;
}

function projectRadarPosition(center, station, radiusKm) {
  if (!Number.isFinite(station.lat) || !Number.isFinite(station.lng)) {
    return { x: 50, y: 50 };
  }

  const deltaXKm = (station.lng - center.lng) * 111.32 * Math.cos((center.lat * Math.PI) / 180);
  const deltaYKm = (station.lat - center.lat) * 110.574;
  const scale = 30 / Math.max(radiusKm, 2);
  const x = clamp(50 + deltaXKm * scale, 10, 90);
  const y = clamp(50 - deltaYKm * scale, 10, 90);
  return { x, y };
}

function haversineKm(origin, target) {
  const dLat = toRad(target.lat - origin.lat);
  const dLng = toRad(target.lng - origin.lng);
  const lat1 = toRad(origin.lat);
  const lat2 = toRad(target.lat);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return 6371 * c;
}

function toRad(value) {
  return (value * Math.PI) / 180;
}

function createFuelMap(activeFuel, activeStatus) {
  return FUELS.reduce((map, fuel) => {
    map[fuel.id] = fuel.id === activeFuel ? activeStatus || "unknown" : "unknown";
    return map;
  }, {});
}

function createUnknownFuelMap() {
  return FUELS.reduce((map, fuel) => {
    map[fuel.id] = "unknown";
    return map;
  }, {});
}

function normalizeFuelStates(value) {
  const map = createUnknownFuelMap();
  Object.entries(value || {}).forEach(([fuelId, status]) => {
    if (Object.prototype.hasOwnProperty.call(map, fuelId)) {
      map[fuelId] = STATUS_META[status] ? status : "unknown";
    }
  });
  return map;
}

function normalizeBrandLabel(value) {
  const text = String(value || "").trim();
  if (!text) {
    return "อื่นๆ";
  }

  const mapped = BRAND_LABEL_MAP[text.toUpperCase()] || BRAND_LABEL_MAP[text];
  return mapped || text;
}

function normalizeReporterLabel(value) {
  const text = String(value || "").trim();
  if (!text) {
    return "";
  }

  const normalized = text.toLowerCase();
  if (["pumpradar", "pump radar", "thaipumpradar", "thai pump radar"].includes(normalized)) {
    return "Thairecheckpump";
  }

  return text;
}

function cloneStation(station) {
  return {
    ...station,
    fuels: normalizeFuelStates(station.fuels || station.fuelStates),
    fuelStates: normalizeFuelStates(station.fuelStates || station.fuels),
  };
}

function statusScore(status) {
  return (STATUS_META[status] || STATUS_META.unknown).score;
}

function markActiveNavigation() {
  document.querySelectorAll("[data-nav]").forEach((link) => {
    if (link.dataset.nav === store.page) {
      link.setAttribute("aria-current", "page");
    }
  });
}

function setFooterYear() {
  document.querySelectorAll("[data-year]").forEach((node) => {
    node.textContent = `${new Date().getFullYear()}`;
  });
}

function setText(selector, value) {
  const node = document.querySelector(selector);
  if (node) {
    node.textContent = value;
  }
}

function renderHTML(selector, value) {
  const node = document.querySelector(selector);
  if (node) {
    node.innerHTML = value;
  }
}

function setMessage(node, value) {
  if (node) {
    node.textContent = value;
  }
}

function hasPhotoValue(value) {
  const text = String(value || "").trim();
  return Boolean(text) && text !== "demo";
}

function isDirectMediaUrl(value) {
  return /^(https?:|data:|blob:)/i.test(String(value || "").trim());
}

function getPhotoCacheKey(value, photoPath = "") {
  const explicitPath = String(photoPath || "").trim();
  if (explicitPath && explicitPath !== "demo") {
    return explicitPath;
  }

  const text = String(value || "").trim();
  if (!text || text === "demo" || isDirectMediaUrl(text)) {
    return "";
  }

  return text;
}

function getDisplayPhotoUrl(value, photoPath = "") {
  const text = String(value || "").trim();
  if (!text || text === "demo") {
    return "";
  }
  if (isDirectMediaUrl(text)) {
    return text;
  }

  const cacheKey = getPhotoCacheKey(text, photoPath);
  return cacheKey ? store.mediaUrlCache.get(cacheKey) || "" : "";
}

function queuePhotoUrlResolution(value, photoPath = "") {
  const cacheKey = getPhotoCacheKey(value, photoPath);
  if (!cacheKey || !store.storage || store.mediaUrlCache.has(cacheKey) || store.mediaUrlInflight.has(cacheKey)) {
    return;
  }

  const task = getDownloadURL(ref(store.storage, cacheKey))
    .then((url) => {
      store.mediaUrlCache.set(cacheKey, url);
      scheduleMediaRefresh();
      return url;
    })
    .catch(() => {
      store.mediaUrlCache.set(cacheKey, "");
      scheduleMediaRefresh();
      return "";
    })
    .finally(() => {
      store.mediaUrlInflight.delete(cacheKey);
    });

  store.mediaUrlInflight.set(cacheKey, task);
}

function scheduleMediaRefresh() {
  if (store.mediaRefreshTimerId) {
    return;
  }

  store.mediaRefreshTimerId = window.setTimeout(() => {
    store.mediaRefreshTimerId = 0;
    refreshCurrentPage();
  }, 80);
}

function bindGalleryImages() {
  document.querySelectorAll("[data-gallery-image]").forEach((image) => {
    image.addEventListener(
      "error",
      () => {
        const art = image.closest("[data-gallery-art]");
        const note = image.closest(".gallery-card")?.querySelector("[data-gallery-source-note]");
        art?.classList.remove("has-photo");
        note && (note.textContent = "ภาพสำรองของระบบ");
        image.remove();
      },
      { once: true }
    );
  });
}

function normalizeStationsSourceType(value) {
  const text = String(value || "firestore").trim().toLowerCase();
  if (["google-sheet", "google_sheets", "google-sheets", "sheet", "sheets"].includes(text)) {
    return "google-sheet";
  }
  if (["static-json", "static_json", "static-json-file", "json", "file-json"].includes(text)) {
    return "static-json";
  }
  return "firestore";
}

function getStationsSourceConfig() {
  const source = appSettings.dataSources?.stations || {};
  return {
    type: normalizeStationsSourceType(source.type),
    url: String(source.url || "").trim(),
  };
}

function getFuelPricesEndpoint() {
  const configuredUrl = String(appSettings.dataSources?.fuelPrices?.url || "").trim();
  return configuredUrl || DEFAULT_FUEL_PRICES_ENDPOINT;
}

async function loadFuelPrices() {
  const endpoint = getFuelPricesEndpoint();
  if (!endpoint) {
    return false;
  }

  store.fuelPrices = {
    ...store.fuelPrices,
    status: "loading",
    url: endpoint,
    error: "",
  };
  refreshCurrentPage();

  try {
    const response = await fetch(endpoint, {
      method: "GET",
      headers: {
        Accept: "application/json, text/plain;q=0.9, */*;q=0.8",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`ไฟล์ราคาน้ำมันตอบกลับ ${response.status}`);
    }

    const payload = await response.json();
    store.fuelPrices = parseFuelPricesPayload(payload, endpoint);
  } catch (error) {
    console.error(error);
    store.fuelPrices = {
      ...store.fuelPrices,
      status: "error",
      url: endpoint,
      error: `โหลดราคาน้ำมันไม่สำเร็จ: ${humanizeError(error)}`,
    };
  }

  refreshCurrentPage();
  return true;
}

function parseFuelPricesPayload(payload, endpoint) {
  const rawItems = Array.isArray(payload?.items)
    ? payload.items
    : payload?.prices && typeof payload.prices === "object"
      ? Object.entries(payload.prices).map(([id, value]) => ({
          id,
          ...(value && typeof value === "object" && !Array.isArray(value) ? value : { price: value }),
        }))
      : [];

  const items = rawItems
    .map((item) => normalizeFuelPriceItem(item))
    .filter(Boolean)
    .sort((left, right) => getFuelSortIndex(left.id) - getFuelSortIndex(right.id));

  return {
    status: items.length ? "ready" : "empty",
    source: String(payload?.source || "manual-json").trim() || "manual-json",
    url: endpoint,
    updatedAtMs: timestampToMs(payload?.updatedAt || payload?.generatedAt || payload?.effectiveAt || Date.now()),
    effectiveAt: String(payload?.effectiveAt || payload?.effectiveDate || payload?.updatedAt || "").trim(),
    note: String(payload?.note || "").trim(),
    currency: String(payload?.currency || "THB").trim() || "THB",
    unit: String(payload?.unit || "บาท/ลิตร").trim() || "บาท/ลิตร",
    items,
    error: "",
  };
}

function normalizeFuelPriceItem(item) {
  const normalizedId = normalizeFuelPriceId(item?.id);
  if (!normalizedId) {
    return null;
  }

  return {
    id: normalizedId,
    label: String(item?.label || FUEL_LABELS[normalizedId] || normalizedId).trim(),
    price: parseOptionalNumber(item?.price ?? item?.value ?? item?.amount),
    note: String(item?.note || "").trim(),
  };
}

function normalizeFuelPriceId(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replaceAll("-", "")
    .replaceAll("_", "");

  return FUEL_PRICE_ID_ALIASES[normalized] || "";
}

function getFuelSortIndex(fuelId) {
  const index = FUELS.findIndex((fuel) => fuel.id === fuelId);
  return index >= 0 ? index : FUELS.length + 1;
}

async function loadFuelPricesFromConfiguredSources() {
  const primaryEndpoint = getFuelPricesEndpoint();
  if (!primaryEndpoint) {
    return false;
  }

  store.fuelPrices = {
    ...store.fuelPrices,
    status: "loading",
    url: primaryEndpoint,
    error: "",
  };
  refreshCurrentPage();

  const endpoints = [primaryEndpoint];
  if (primaryEndpoint !== DEFAULT_FUEL_PRICES_ENDPOINT) {
    endpoints.push(DEFAULT_FUEL_PRICES_ENDPOINT);
  }

  let lastError = null;
  for (const endpoint of endpoints) {
    try {
      const payload = await fetchFuelPricesPayload(endpoint);
      store.fuelPrices = parseFuelPricesPayloadFromSource(payload, endpoint, {
        usedFallback: endpoint !== primaryEndpoint,
      });
      refreshCurrentPage();
      return true;
    } catch (error) {
      console.error(error);
      lastError = error;
    }
  }

  store.fuelPrices = {
    ...store.fuelPrices,
    status: "error",
    url: primaryEndpoint,
    error: `โหลดราคาน้ำมันไม่สำเร็จ: ${humanizeError(lastError)}`,
  };
  refreshCurrentPage();
  return false;
}

async function fetchFuelPricesPayload(endpoint) {
  const response = await fetch(endpoint, {
    method: "GET",
    headers: {
      Accept: "application/json, text/plain;q=0.9, */*;q=0.8",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`ไฟล์ราคาน้ำมันตอบกลับ ${response.status}`);
  }

  return response.json();
}

function parseFuelPricesPayloadFromSource(payload, endpoint, options = {}) {
  const brands = Array.isArray(payload?.brands)
    ? payload.brands
        .map((brand) => normalizeFuelPriceBrand(brand))
        .filter(Boolean)
        .sort((left, right) => getFuelPriceBrandSortIndex(left.id) - getFuelPriceBrandSortIndex(right.id))
    : [];
  const defaultBrandId = normalizeFuelPriceBrandId(payload?.defaultBrand);
  const defaultBrand = (defaultBrandId && brands.find((brand) => brand.id === defaultBrandId)) || brands[0] || null;
  const rawItems = Array.isArray(payload?.items)
    ? payload.items
    : payload?.prices && typeof payload.prices === "object"
      ? Object.entries(payload.prices).map(([id, value]) => ({
          id,
          ...(value && typeof value === "object" && !Array.isArray(value) ? value : { price: value }),
        }))
      : [];
  const items = brands.length ? defaultBrand?.items || [] : normalizeFuelPriceItems(rawItems);
  const noteParts = [String(payload?.note || "").trim()];
  if (options.usedFallback) {
    noteParts.push("กำลังใช้ไฟล์ราคาสำรอง");
  }

  return {
    status: items.some((item) => Number.isFinite(item.price)) || brands.length ? "ready" : "empty",
    source: String(payload?.source || "manual-json").trim() || "manual-json",
    url: endpoint,
    updatedAtMs: timestampToMs(payload?.updatedAt || payload?.generatedAt || payload?.fetchedAt || payload?.effectiveAt || Date.now()),
    effectiveAt: String(payload?.effectiveAt || payload?.effectiveDate || payload?.updatedAt || "").trim(),
    note: noteParts.filter(Boolean).join(" | "),
    currency: String(payload?.currency || "THB").trim() || "THB",
    unit: String(payload?.unit || "บาท/ลิตร").trim() || "บาท/ลิตร",
    defaultBrand: defaultBrand?.id || defaultBrandId,
    brands,
    items,
    error: "",
  };
}

function normalizeFuelPriceBrand(brand) {
  const normalizedId = normalizeFuelPriceBrandId(brand?.id || brand?.slug || brand?.code || brand?.label);
  const items = normalizeFuelPriceItems(brand?.items);
  if (!normalizedId || !items.length) {
    return null;
  }

  const fallbackLabel = String(brand?.label || FUEL_PRICE_BRAND_LABELS[normalizedId] || normalizedId.toUpperCase()).trim();
  return {
    id: normalizedId,
    label: normalizeBrandLabel(FUEL_PRICE_BRAND_LABELS[normalizedId] || fallbackLabel),
    items,
  };
}

function normalizeFuelPriceItems(items) {
  const seen = new Set();
  return (Array.isArray(items) ? items : [])
    .map((item) => normalizeFuelPriceItem(item))
    .filter((item) => {
      if (!item || seen.has(item.id)) {
        return false;
      }
      seen.add(item.id);
      return true;
    })
    .sort((left, right) => getFuelSortIndex(left.id) - getFuelSortIndex(right.id));
}

function normalizeFuelPriceBrandId(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replaceAll("&", "")
    .replaceAll("-", "")
    .replaceAll("_", "")
    .replaceAll(".", "")
    .replaceAll(" ", "");

  return FUEL_PRICE_BRAND_ID_ALIASES[normalized] || "";
}

function getFuelPriceBrandSortIndex(brandId) {
  const index = FUEL_PRICE_BRAND_PRIORITY.indexOf(brandId);
  return index >= 0 ? index : FUEL_PRICE_BRAND_PRIORITY.length + 1;
}

function wantsGoogleSheetStations() {
  return getStationsSourceConfig().type === "google-sheet";
}

function wantsStaticJsonStations() {
  return getStationsSourceConfig().type === "static-json";
}

function canLoadStationsFromGoogleSheet() {
  const source = getStationsSourceConfig();
  return source.type === "google-sheet" && Boolean(source.url);
}

function canLoadStationsFromStaticJson() {
  const source = getStationsSourceConfig();
  return source.type === "static-json" && Boolean(source.url);
}

function setStationSource(type, url = "", options = {}) {
  store.stationSource = {
    type,
    url,
    generatedAtMs: Number.isFinite(options.generatedAtMs) ? options.generatedAtMs : 0,
  };
}

function getStationSourceLabel() {
  if (store.stationSource.type === "google-sheet") {
    return "Google Sheet";
  }
  if (store.stationSource.type === "static-json") {
    return "Static JSON";
  }
  if (store.stationSource.type === "firestore") {
    return "Firestore";
  }
  return "Backup";
}

function canManageStationsInFirestore() {
  return hasAdminAccess() && store.mode === "firebase" && Boolean(store.db);
}

function getAdminFirestoreWriteSuccessNote() {
  if (store.stationSource.type === "firestore") {
    return "";
  }

  return ` หน้า public ยังใช้ ${getStationSourceLabel()} อยู่จนกว่าจะ publish หรือสลับ source`;
}

function upsertAdminStationInStore(stationId, data = {}) {
  const normalizedId = String(stationId || "").trim();
  if (!normalizedId) {
    return;
  }

  const existingIndex = store.stations.findIndex((station) => station.id === normalizedId);
  const existingStation = existingIndex >= 0 ? store.stations[existingIndex] : null;
  const updatedAtMs = timestampToMs(data.updatedAt || data.createdAt || Date.now());
  const nextStation = {
    ...existingStation,
    id: normalizedId,
    name: String(data.name || existingStation?.name || normalizedId).trim(),
    brand: normalizeBrandLabel(data.brand || existingStation?.brand),
    area: String(data.area || existingStation?.area || "ยังไม่ระบุพื้นที่").trim(),
    lat: coerceNumber(data.lat ?? existingStation?.lat),
    lng: coerceNumber(data.lng ?? existingStation?.lng),
    reportCount: Math.max(0, Math.round(Number(data.reportCount ?? existingStation?.reportCount ?? 0) || 0)),
    updatedMinutes: minutesSince(updatedAtMs),
    updatedAtMs,
    fuelStates: normalizeFuelStates(data.fuelStates || existingStation?.fuelStates),
    photoUrl: String(data.photoUrl || existingStation?.photoUrl || "").trim(),
    importSource: String(data.importSource || existingStation?.importSource || "").trim(),
    lastReporter: normalizeReporterLabel(
      String(data.lastReporter || existingStation?.lastReporter || getGoogleUserLabel() || "Admin").trim()
    ),
  };

  if (existingIndex >= 0) {
    store.stations.splice(existingIndex, 1, nextStation);
    return;
  }

  store.stations.unshift(nextStation);
}

function removeAdminStationFromStore(stationId) {
  const normalizedId = String(stationId || "").trim();
  if (!normalizedId) {
    return;
  }

  store.stations = store.stations.filter((station) => station.id !== normalizedId);
}

function syncImportedStationsInAdminStore(stationEntries) {
  if (!Array.isArray(stationEntries) || !stationEntries.length) {
    return;
  }

  stationEntries.forEach((entry) => {
    if (!entry?.id || !entry?.data) {
      return;
    }

    upsertAdminStationInStore(entry.id, entry.data);
  });
}

function syncFirebaseComponentState() {
  store.firebaseStatus.configReady = hasFirebaseConfig();
  store.firebaseStatus.appReady = Boolean(store.app);
  store.firebaseStatus.dbReady = Boolean(store.db);
  store.firebaseStatus.storageReady = Boolean(store.storage);
}

async function loadStationsFromGoogleSheet(options = {}) {
  const { background = false } = options;
  const source = getStationsSourceConfig();
  if (source.type !== "google-sheet") {
    return false;
  }
  if (!source.url) {
    throw new Error("ยังไม่ได้ใส่ Google Sheet endpoint URL สำหรับ stations");
  }

  try {
    const resolvedUrl = resolveGoogleSheetFetchUrl(source.url);
    const response = await fetch(resolvedUrl, {
      method: "GET",
      headers: {
        Accept: "application/json, text/csv, text/plain;q=0.9, */*;q=0.8",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`Google Sheet endpoint ตอบกลับ ${response.status}`);
    }

    const contentType = String(response.headers.get("content-type") || "").toLowerCase();
    const rawText = await response.text();
    const generatedAtMs = getStationSourceGeneratedAtMs(parseStationSourceMetadata(rawText, contentType));
    const rows = parseSheetStationSource(rawText, contentType, "Google Sheet endpoint");
    const parsedStations = rows.map(mapSheetStationRow).filter(Boolean);
    const stations = markChangedGoogleSheetStations(parsedStations, store.stationSource.type === "google-sheet" ? store.stations : []);
    if (!stations.length) {
      throw new Error("Google Sheet endpoint ไม่มีสถานีที่พร้อมใช้งาน");
    }

    setStationSource("google-sheet", source.url, { generatedAtMs });
    store.stations = stations;
    setFirebaseListenerState("stations", "sheet", stations.length);
    refreshCurrentPage();
    return true;
  } catch (error) {
    console.error(error);
    if (store.mode === "firebase" && !background) {
      store.liveHint = `โหลดสถานีจาก Google Sheet ไม่สำเร็จ: ${humanizeError(error)}`;
      renderGlobalChrome();
      return false;
    }
    if (store.mode === "firebase") {
      return false;
    }
    throw error;
  }
}

async function loadStationsFromStaticJson(options = {}) {
  const { background = false } = options;
  const source = getStationsSourceConfig();
  if (source.type !== "static-json") {
    return false;
  }
  if (!source.url) {
    throw new Error("ยังไม่ได้ใส่ URL ของไฟล์ข้อมูล stations สำหรับเว็บ");
  }

  try {
    const response = await fetch(source.url, {
      method: "GET",
      headers: {
        Accept: "application/json, text/plain;q=0.9, */*;q=0.8",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`ไฟล์ข้อมูล stations ตอบกลับ ${response.status}`);
    }

    const contentType = String(response.headers.get("content-type") || "").toLowerCase();
    const rawText = await response.text();
    const rows = parseSheetStationSource(rawText, contentType, "ไฟล์ข้อมูล stations");
    const parsedStations = rows.map(mapSheetStationRow).filter(Boolean);
    const generatedAtMs = getStationSourceGeneratedAtMs(parseStationSourceMetadata(rawText, contentType));
    const stations = markChangedGoogleSheetStations(parsedStations, store.stationSource.type === "static-json" ? store.stations : []);
    if (!stations.length) {
      throw new Error("ไฟล์ข้อมูล stations ไม่มีรายการที่พร้อมใช้งาน");
    }

    setStationSource("static-json", source.url, { generatedAtMs });
    store.stations = stations;
    setFirebaseListenerState("stations", "static", stations.length);
    refreshCurrentPage();
    return true;
  } catch (error) {
    console.error(error);
    if (store.mode === "firebase" && !background) {
      store.liveHint = `โหลดสถานีจากไฟล์ข้อมูลภายในเว็บไม่สำเร็จ: ${humanizeError(error)}`;
      renderGlobalChrome();
      return false;
    }
    if (store.mode === "firebase") {
      return false;
    }
    throw error;
  }
}

function getGoogleSheetRefreshMs() {
  const configuredMs = Number(appSettings.googleSheetRefreshMs || 0);
  if (Number.isFinite(configuredMs) && configuredMs >= 10000) {
    return Math.round(configuredMs);
  }
  return DEFAULT_GOOGLE_SHEET_REFRESH_MS;
}

function ensureGoogleSheetAutoRefresh() {
  if (store.sheetRefreshTimerId) {
    window.clearInterval(store.sheetRefreshTimerId);
    store.sheetRefreshTimerId = 0;
  }

  if (!canLoadStationsFromGoogleSheet()) {
    return;
  }

  const triggerRefresh = () => {
    refreshGoogleSheetInBackground();
  };

  store.sheetRefreshTimerId = window.setInterval(triggerRefresh, getGoogleSheetRefreshMs());
  window.addEventListener("focus", triggerRefresh);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      triggerRefresh();
    }
  });
}

async function refreshGoogleSheetInBackground() {
  if (store.sheetRefreshInFlight || document.hidden || !canLoadStationsFromGoogleSheet()) {
    return;
  }

  store.sheetRefreshInFlight = true;
  try {
    await loadStationsFromGoogleSheet({ background: true });
  } finally {
    store.sheetRefreshInFlight = false;
  }
}

function resolveGoogleSheetFetchUrl(url) {
  const rawUrl = String(url || "").trim();
  if (!rawUrl) {
    return "";
  }

  if (/docs\.google\.com\/spreadsheets\/d\//i.test(rawUrl)) {
    const parsed = parseGoogleSheetDocumentUrl(rawUrl);
    if (parsed?.spreadsheetId) {
      return buildGoogleSheetCsvExportUrl(parsed.spreadsheetId, parsed.gid);
    }
  }

  return rawUrl;
}

function parseGoogleSheetDocumentUrl(url) {
  try {
    const parsed = new URL(url);
    const match = parsed.pathname.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (!match) {
      return null;
    }

    const hashMatch = parsed.hash.match(/gid=(\d+)/i);
    return {
      spreadsheetId: match[1],
      gid: parsed.searchParams.get("gid") || (hashMatch ? hashMatch[1] : ""),
    };
  } catch (error) {
    return null;
  }
}

function buildGoogleSheetCsvExportUrl(spreadsheetId, gid) {
  const gidParam = String(gid || "").trim();
  return `https://docs.google.com/spreadsheets/d/${encodeURIComponent(spreadsheetId)}/export?format=csv${gidParam ? `&gid=${encodeURIComponent(gidParam)}` : ""}`;
}

function parseSheetStationSource(rawText, contentType, sourceLabel = "แหล่งข้อมูล") {
  const text = String(rawText || "").trim();
  if (!text) {
    return [];
  }

  if (text.startsWith("<!DOCTYPE html") || text.startsWith("<html")) {
    throw new Error(`${sourceLabel} ยังเปิดให้อ่านสาธารณะไม่ได้หรือปลายทางตอบกลับเป็น HTML`);
  }

  if (contentType.includes("application/json") || text.startsWith("{") || text.startsWith("[")) {
    let payload;
    try {
      payload = JSON.parse(text);
    } catch (error) {
      throw new Error(`${sourceLabel} ส่ง JSON กลับมาไม่ถูกต้อง`);
    }
    return extractSheetStationRows(payload);
  }

  return parseCsvRows(text);
}

function parseStationSourceMetadata(rawText, contentType) {
  const text = String(rawText || "").trim();
  if (!text) {
    return null;
  }

  if (!(contentType.includes("application/json") || text.startsWith("{") || text.startsWith("["))) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    return null;
  }
}

function extractSheetStationRows(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }
  if (payload && Array.isArray(payload.stations)) {
    return payload.stations;
  }
  if (payload && Array.isArray(payload.rows)) {
    return payload.rows;
  }
  return [];
}

function getStationSourceGeneratedAtMs(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return 0;
  }

  const candidates = [payload.generatedAt, payload.generated_at, payload.importedAt, payload.imported_at, payload.updatedAt, payload.updated_at];
  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }
    const timestamp = timestampToMs(candidate);
    if (Number.isFinite(timestamp) && timestamp > 0) {
      return timestamp;
    }
  }

  return 0;
}

function parseCsvRows(text) {
  const rows = [];
  let row = [];
  let value = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const nextChar = text[index + 1];

    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        value += '"';
        index += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        value += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      continue;
    }

    if (char === ",") {
      row.push(value);
      value = "";
      continue;
    }

    if (char === "\r") {
      continue;
    }

    if (char === "\n") {
      row.push(value);
      rows.push(row);
      row = [];
      value = "";
      continue;
    }

    value += char;
  }

  if (value.length || row.length) {
    row.push(value);
    rows.push(row);
  }

  if (!rows.length) {
    return [];
  }

  const [headerRow, ...dataRows] = rows;
  const headers = headerRow.map((header) => normalizeHeader(header));
  return dataRows
    .filter((dataRow) => dataRow.some((cell) => String(cell || "").trim()))
    .map((dataRow) =>
      Object.fromEntries(headers.map((header, index) => [header, dataRow[index] === undefined ? "" : dataRow[index]]))
    );
}

function normalizeHeader(value) {
  return String(value || "")
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9_]/g, "");
}

function mapSheetStationRow(row) {
  const id = String(readSheetValue(row, "id", "stationId", "station_id") || "").trim();
  if (!id) {
    return null;
  }

  const updatedValue =
    readSheetValue(row, "updatedAt", "updated_at", "reportTime", "report_time", "lastUpdatedAt", "last_updated_at", "createdAt", "created_at") ||
    "";

  return {
    id,
    name: String(readSheetValue(row, "name") || id).trim(),
    brand: normalizeBrandLabel(readSheetValue(row, "brand")),
    area: String(readSheetValue(row, "area", "district") || "ยังไม่ระบุพื้นที่").trim(),
    lat: coerceNumber(readSheetValue(row, "lat", "latitude")),
    lng: coerceNumber(readSheetValue(row, "lng", "lon", "longitude")),
    reportCount: Math.max(0, Math.round(Number(readSheetValue(row, "reportCount", "report_count") || 0) || 0)),
    updatedMinutes: minutesSince(updatedValue),
    updatedAtMs: timestampToMs(updatedValue),
    fuelStates: normalizeFuelStates(readSheetFuelStates(row)),
    photoUrl: String(readSheetValue(row, "photoUrl", "photo_url") || "").trim(),
    importSource: String(readSheetValue(row, "importSource", "import_source", "source") || "google-sheet").trim(),
    lastReporter: normalizeReporterLabel(String(readSheetValue(row, "lastReporter", "last_reporter") || "").trim()),
  };
}

function markChangedGoogleSheetStations(nextStations, previousStations) {
  if (!Array.isArray(nextStations) || !nextStations.length || !Array.isArray(previousStations) || !previousStations.length) {
    return nextStations;
  }

  const previousById = new Map(previousStations.map((station) => [station.id, station]));

  return nextStations.map((station) => {
    const previous = previousById.get(station.id);
    if (!previous || !didGoogleSheetStationChange(previous, station)) {
      return station;
    }

    if (Number(station.updatedAtMs || 0) > Number(previous.updatedAtMs || 0)) {
      return station;
    }

    return {
      ...station,
      updatedAtMs: Date.now(),
      updatedMinutes: 0,
      lastReporter: station.lastReporter || getStationSourceLabel(),
    };
  });
}

function didGoogleSheetStationChange(previous, next) {
  if (
    previous.name !== next.name ||
    previous.brand !== next.brand ||
    previous.area !== next.area ||
    previous.lat !== next.lat ||
    previous.lng !== next.lng ||
    previous.reportCount !== next.reportCount ||
    previous.photoUrl !== next.photoUrl ||
    previous.lastReporter !== next.lastReporter
  ) {
    return true;
  }

  return FUELS.some((fuel) => (previous.fuelStates?.[fuel.id] || "unknown") !== (next.fuelStates?.[fuel.id] || "unknown"));
}

function readSheetFuelStates(row) {
  const directFuelStates = readSheetValue(row, "fuelStates");
  if (directFuelStates && typeof directFuelStates === "object") {
    return directFuelStates;
  }

  if (typeof directFuelStates === "string") {
    try {
      return JSON.parse(directFuelStates);
    } catch (error) {
      return createUnknownFuelMap();
    }
  }

  return {
    diesel: readSheetValue(row, "fuel_diesel", "diesel", "fuelDiesel") || "unknown",
    gas91: readSheetValue(row, "fuel_gas91", "gas91", "fuelGas91") || "unknown",
    gas95: readSheetValue(row, "fuel_gas95", "gas95", "fuelGas95") || "unknown",
    e20: readSheetValue(row, "fuel_e20", "e20", "fuelE20") || "unknown",
    e85: readSheetValue(row, "fuel_e85", "e85", "fuelE85") || "unknown",
    lpg: readSheetValue(row, "fuel_lpg", "lpg", "fuelLpg") || "unknown",
  };
}

function readSheetValue(row, ...keys) {
  if (!row || typeof row !== "object") {
    return undefined;
  }

  for (const key of keys) {
    if (key in row && row[key] !== undefined && row[key] !== null && String(row[key]).trim() !== "") {
      return row[key];
    }

    const normalizedKey = normalizeHeader(key);
    if (normalizedKey in row && row[normalizedKey] !== undefined && row[normalizedKey] !== null && String(row[normalizedKey]).trim() !== "") {
      return row[normalizedKey];
    }
  }

  return undefined;
}

function setFirebaseListenerState(source, status, count) {
  const listener = store.firebaseStatus.listeners[source];
  if (!listener) {
    return;
  }
  listener.status = status;
  if (typeof count === "number") {
    listener.count = count;
  }
}

function getFirebaseErrorCode(error) {
  return String(error?.code || "").trim().toLowerCase();
}

function isQuotaExceededError(error) {
  const code = getFirebaseErrorCode(error);
  const message = String(error?.message || "").trim().toLowerCase();
  return (
    code.includes("quota-exceeded") ||
    code.includes("resource-exhausted") ||
    message.includes("quota exceeded") ||
    message.includes("quota-exceeded") ||
    message.includes("resource-exhausted")
  );
}

function noteFirebaseError(source, error) {
  syncFirebaseComponentState();
  store.firebaseStatus.lastError = humanizeError(error);
  store.firebaseStatus.lastErrorCode = getFirebaseErrorCode(error);
  store.firebaseStatus.lastErrorSource = source;
  store.firebaseStatus.lastErrorAtMs = Date.now();
  setFirebaseListenerState(source, "error");
}

function maybeTrackFirebaseError(source, error) {
  const code = getFirebaseErrorCode(error);
  const message = String(error?.message || "").trim().toLowerCase();
  if (
    code ||
    message.includes("firebase") ||
    message.includes("firestore") ||
    message.includes("quota exceeded") ||
    message.includes("quota-exceeded") ||
    message.includes("resource-exhausted")
  ) {
    noteFirebaseError(source, error);
  }
}

function hasFirebaseConfig() {
  return Boolean(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId);
}

function updateLocationPermission(state) {
  if (state === "denied") {
    store.liveHint = "ตำแหน่งถูกบล็อกอยู่ ให้อนุญาต geolocation ในเบราว์เซอร์ก่อน";
  }
  renderGlobalChrome();
}

function humanizeLocationError(error) {
  if (!error) {
    return "อ่านตำแหน่งไม่สำเร็จ";
  }
  if (error.code === 1) {
    return "ผู้ใช้ปฏิเสธการเข้าถึงตำแหน่ง";
  }
  if (error.code === 2) {
    return "หาอุปกรณ์ระบุตำแหน่งไม่เจอ";
  }
  if (error.code === 3) {
    return "หมดเวลาในการอ่านตำแหน่ง";
  }
  return error.message || "อ่านตำแหน่งไม่สำเร็จ";
}

function humanizeError(error) {
  if (!error) {
    return "เกิดข้อผิดพลาด";
  }

  const code = getFirebaseErrorCode(error);
  const message = String(error?.message || "").trim().toLowerCase();
  if (isQuotaExceededError(error)) {
    return "Quota exceeded: โปรเจกต์ Firebase นี้เกินโควตาแล้ว ให้เช็ค Usage/Quota ใน Firebase console ก่อนใช้งานต่อ";
  }
  if (message.includes("failed to fetch")) {
    return "ไม่สามารถโหลดแหล่งข้อมูลได้ ตรวจสอบ URL หรือเครือข่ายอีกครั้ง";
  }
  if (code.includes("permission-denied")) {
    return "Permission denied: บัญชีนี้ยังไม่มีสิทธิ์ตาม Firestore rules หรือ admin allowlist";
  }
  if (code.includes("unauthenticated")) {
    return "กรุณาเข้าสู่ระบบด้วย Google ใหม่ก่อนทำรายการนี้";
  }
  if (code.includes("unavailable")) {
    return "Firebase ยังไม่พร้อมตอบสนองหรือเครือข่ายมีปัญหา ลองใหม่อีกครั้ง";
  }
  if (code.includes("deadline-exceeded")) {
    return "Firebase ใช้เวลาตอบกลับนานเกินไป ลองใหม่อีกครั้ง";
  }
  if (code.includes("already-exists")) {
    return "ข้อมูลนี้มีอยู่แล้วใน Firebase";
  }
  if (code.includes("not-found")) {
    return "ไม่พบข้อมูลที่ต้องการใน Firebase";
  }
  return error?.message || String(error || "เกิดข้อผิดพลาด");
}

function getAdminFirebaseHealthSummary() {
  const listeners = store.firebaseStatus.listeners;
  const allowlist = getAdminEmailAllowlist();
  const quotaExceeded = isQuotaExceededError({
    code: store.firebaseStatus.lastErrorCode,
    message: store.firebaseStatus.lastError,
  });
  const stationsReady =
    listeners.stations.status === "ok" ||
    (store.stationSource.type === "google-sheet" && listeners.stations.status === "sheet") ||
    (store.stationSource.type === "static-json" && listeners.stations.status === "static");
  const listenersReady = stationsReady && listeners.reports.status === "ok";

  if (!store.firebaseStatus.configReady) {
    return {
      label: "Config missing",
      detail: "ยังไม่ได้ใส่ Firebase config ครบใน firebase-config.js",
      note: "หน้านี้จะยังทำงานแบบข้อมูลสำรองจนกว่าจะใส่ apiKey, projectId และ appId ครบ",
    };
  }

  if (quotaExceeded) {
    return {
      label: "Quota exceeded",
      detail: "โปรเจกต์นี้ชนลิมิตของ Firebase/Firestore แล้ว ตอนนี้หน้าเว็บ fallback เป็นข้อมูลสำรอง",
      note: "ถ้ายังต้องใช้หลังบ้านจริง ให้เปิด Firebase console ไปดู Usage และ Quotas ก่อน",
    };
  }

  if (store.mode !== "firebase") {
    return {
      label: "Fallback backup",
      detail: store.firebaseStatus.lastError || "ยังเชื่อม Firebase จริงไม่สำเร็จ",
      note: "ตอนนี้ข้อมูลบนหน้า admin ยังไม่ใช่ข้อมูลสดจาก Firestore",
    };
  }

  if (!listenersReady) {
    return {
      label: "Syncing",
      detail: `stations: ${listeners.stations.status}, reports: ${listeners.reports.status}`,
      note: "Firebase ต่อแล้ว แต่ยังรอ listener ของ Firestore กลับมาครบ",
    };
  }

  if (!store.authReady) {
    return {
      label: "Checking auth",
      detail: "กำลังตรวจสอบสถานะ Google sign-in",
      note: "รอ auth state พร้อมก่อน ระบบถึงจะตัดสินได้ว่าเขียนข้อมูลได้หรือไม่",
    };
  }

  if (!isGoogleUser()) {
    return {
      label: "Need sign-in",
      detail: "Firebase พร้อมแล้ว แต่ยังไม่ได้ล็อกอิน Google",
      note: "ต้องล็อกอิน Google ก่อนถึงจะเขียนข้อมูลหรือ import stations ได้",
    };
  }

  if (!hasAdminAccess()) {
    return {
      label: "No admin access",
      detail: allowlist.length ? "อีเมลนี้ยังไม่อยู่ใน appSettings.adminEmails" : "บัญชีนี้ยังไม่ผ่านเงื่อนไข admin access",
      note: "ต่อให้เชื่อม Firebase ได้ แต่ถ้า admin access ไม่ผ่าน การบันทึกก็จะโดนปฏิเสธ",
    };
  }

  if (store.stationSource.type === "google-sheet") {
    return {
      label: "Ready / sheet stations",
      detail: "หน้า public กำลังใช้ stations จาก Google Sheet ส่วนรายงานและ auth ยังใช้ Firebase",
      note: "แก้ใน Firestore จากหลังบ้านได้ แต่หน้า public จะยังไม่เปลี่ยนจนกว่าจะอัปเดต Google Sheet หรือสลับ source",
    };
  }

  if (store.stationSource.type === "static-json") {
    return {
      label: "Ready / static stations",
      detail: "หน้า public กำลังใช้ stations จากไฟล์ข้อมูลภายในเว็บ ส่วนรายงานและ auth ยังใช้ Firebase",
      note: "แก้ใน Firestore จากหลังบ้านได้ แต่หน้า public จะยังไม่เปลี่ยนจนกว่าจะ export JSON ใหม่หรือสลับ source",
    };
  }

  if (!allowlist.length) {
    return {
      label: "Ready / review rules",
      detail: "เชื่อม Firebase ได้และเขียนได้ แต่ appSettings.adminEmails ยังว่างอยู่",
      note: "ก่อนใช้งานจริงควรเติม adminEmails และล็อก Firestore rules ให้ตรงกับผู้ดูแลระบบ",
    };
  }

  return {
    label: "Ready",
    detail: "Firestore listener, Google auth และ admin access พร้อมใช้งาน",
    note: "จากฝั่งหน้าเว็บตอนนี้พร้อมใช้งานแล้ว ถ้า Firebase console ไม่ขึ้น quota exceeded เพิ่มเติม",
  };
}

function getAdminFirebaseIssueSummary() {
  if (!store.firebaseStatus.lastError) {
    return store.mode === "firebase"
      ? {
          label: "No errors",
          detail: "ยังไม่พบข้อผิดพลาดจาก Firebase ในรอบนี้",
        }
      : {
          label: "No recent error",
          detail: "ยังไม่มีข้อผิดพลาด Firebase ล่าสุดที่บันทึกไว้",
        };
  }

  const shortCode = store.firebaseStatus.lastErrorCode ? store.firebaseStatus.lastErrorCode.split("/").pop() : "";
  const timestamp = formatAdminTimestamp(store.firebaseStatus.lastErrorAtMs);
  const label = isQuotaExceededError({
    code: store.firebaseStatus.lastErrorCode,
    message: store.firebaseStatus.lastError,
  })
    ? "Quota exceeded"
    : shortCode || store.firebaseStatus.lastErrorSource || "Firebase error";
  const detail = [store.firebaseStatus.lastError, timestamp ? `เมื่อ ${timestamp}` : ""].filter(Boolean).join(" | ");

  return { label, detail };
}

function renderAdminFirebaseStatus() {
  const health = getAdminFirebaseHealthSummary();
  const issue = getAdminFirebaseIssueSummary();
  setText("[data-admin-firebase-health]", health.label);
  setText("[data-admin-firebase-detail]", health.detail);
  setText("[data-admin-last-error]", issue.label);
  setText("[data-admin-last-error-detail]", issue.detail);
  setText("[data-admin-summary-note]", health.note);
}

function ensureAdminUsagePolling() {
  if (store.page !== "admin") {
    return;
  }
  if (store.adminUsageTimerId) {
    return;
  }

  store.adminUsageTimerId = window.setInterval(() => {
    refreshAdminUsage({ background: true });
  }, DEFAULT_ADMIN_USAGE_REFRESH_MS);
}

async function refreshAdminUsage(options = {}) {
  const { background = false } = options;
  if (store.page !== "admin" || store.adminUsageLoading) {
    return false;
  }

  store.adminUsageLoading = true;
  if (!background && store.adminUsage.status === "idle") {
    store.adminUsage = {
      ...store.adminUsage,
      status: "loading",
      label: "กำลังเช็ก",
      detail: "กำลังดึง usage จาก Vercel",
    };
    renderAdminUsage();
  }

  try {
    const response = await fetch(DEFAULT_ADMIN_USAGE_ENDPOINT, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      cache: "no-store",
    });

    let payload = null;
    try {
      payload = await response.json();
    } catch (error) {
      payload = null;
    }

    if (!response.ok || !payload) {
      throw new Error(payload?.detail || payload?.message || `Vercel usage endpoint ตอบกลับ ${response.status}`);
    }

    store.adminUsage = normalizeAdminUsage(payload);
  } catch (error) {
    store.adminUsage = {
      status: "error",
      label: "เชื่อมไม่ได้",
      detail: humanizeError(error),
      percent: 0,
      billedCost: 0,
      effectiveCost: 0,
      chargeCount: 0,
      serviceCount: 0,
      projectName: "",
      rangeDays: 30,
      updatedAt: "",
      note: "หน้า admin ดึง usage ของ Vercel ไม่สำเร็จ ตรวจ token, team id/slug หรือฟังก์ชันบน Vercel อีกครั้ง",
    };
  } finally {
    store.adminUsageLoading = false;
    renderAdminUsage();
  }

  return true;
}

function normalizeAdminUsage(payload) {
  const state = String(payload?.state || (payload?.ok ? "ok" : "error")).toLowerCase();
  const rawPercent = Number(payload?.projectSharePercent || payload?.percent || 0);
  const percent = Number.isFinite(rawPercent) ? Math.max(0, rawPercent) : 0;
  const billedCost = Number(payload?.totalBilledCost || payload?.billedCost || 0) || 0;
  const effectiveCost = Number(payload?.totalEffectiveCost || payload?.effectiveCost || 0) || 0;
  const chargeCount = Number(payload?.chargeCount || 0) || 0;
  const serviceCount = Number(payload?.serviceCount || (Array.isArray(payload?.services) ? payload.services.length : 0) || 0) || 0;
  const rangeDays = Number(payload?.rangeDays || 30) || 30;
  const projectName = String(payload?.projectName || payload?.projectFilter || "").trim();
  const currency = String(payload?.currency || "USD").trim() || "USD";
  const displayState = state === "ok" && !chargeCount ? "connected" : state;
  const label =
    displayState === "missing-config"
      ? "ยังไม่ได้เชื่อม"
      : displayState === "connected"
        ? "ยังไม่พบ usage"
        : formatAdminCurrency(billedCost, currency);
  const detail =
    displayState === "missing-config"
      ? payload?.detail || "ยังไม่ได้ตั้ง VERCEL_API_TOKEN และ VERCEL_TEAM_ID หรือ VERCEL_TEAM_SLUG"
      : displayState === "connected"
        ? payload?.detail || `ยังไม่พบ usage ในช่วง ${rangeDays} วันที่เลือก`
        : `${formatAdminCurrency(effectiveCost, currency)} effective | ${formatAdminNumber(chargeCount)} charges | ${formatAdminNumber(serviceCount)} services`;

  return {
    status: displayState,
    label,
    detail,
    percent,
    billedCost,
    effectiveCost,
    chargeCount,
    serviceCount,
    projectName,
    rangeDays,
    currency,
    updatedAt: payload?.lastUpdatedAt || payload?.updatedAt || "",
    note:
      displayState === "connected"
        ? `${payload?.periodLabel || `ย้อนหลัง ${rangeDays} วัน`} | API ต่อได้แล้ว แต่ยังไม่พบ charge ในช่วงเวลานี้`
        : payload?.periodLabel ||
          payload?.note ||
          "ตัวนี้เช็ก usage และ cost ของ Vercel ไม่ได้วัดข้อมูล Firebase หรือโควตา Firestore",
  };
}

function renderAdminUsage() {
  const usage = store.adminUsage;
  setText("[data-admin-netlify-label]", usage.label);
  setText("[data-admin-netlify-detail]", usage.detail);
  setText(
    "[data-admin-netlify-builds]",
    `${usage.projectName ? `Project ${usage.projectName} | ` : ""}Charges ${formatAdminNumber(usage.chargeCount)} | Services ${formatAdminNumber(usage.serviceCount)}`
  );
  setText(
    "[data-admin-netlify-updated]",
    usage.updatedAt ? `อัปเดต ${formatAdminTimestamp(usage.updatedAt)}` : usage.status === "loading" ? "กำลังตรวจสอบ" : "ยังไม่มีเวลาล่าสุด"
  );
  setText("[data-admin-netlify-note]", usage.note);

  const progress = document.querySelector("[data-admin-netlify-progress]");
  const progressValue = document.querySelector("[data-admin-netlify-progress-value]");
  if (progress) {
    const rawWidth = usage.projectName ? Number(usage.percent || 0) : usage.status === "error" || usage.status === "missing-config" ? 0 : 100;
    const cappedPercent = clamp(rawWidth, 0, 100);
    progress.style.width = `${cappedPercent}%`;
    progress.classList.remove("is-warning", "is-danger");
    if (usage.projectName && cappedPercent >= 90) {
      progress.classList.add("is-danger");
    } else if (usage.projectName && cappedPercent >= 75) {
      progress.classList.add("is-warning");
    }
  }
  if (progressValue) {
    if (usage.projectName && Number.isFinite(Number(usage.percent || 0)) && Number(usage.percent || 0) > 0) {
      progressValue.textContent = `${Math.round(Number(usage.percent || 0))}% team`;
    } else {
      progressValue.textContent = `${formatAdminNumber(usage.rangeDays || 30)}d`;
    }
  }
}

function formatAdminCurrency(value, currency = "USD") {
  const amount = Number(value || 0);
  const safeCurrency = String(currency || "USD").trim().toUpperCase() || "USD";

  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: safeCurrency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch (error) {
    return `${safeCurrency} ${amount.toFixed(2)}`;
  }
}

function formatAdminTimestamp(value) {
  if (!value) {
    return "";
  }

  try {
    return new Date(value).toLocaleString("th-TH", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch (error) {
    return "";
  }
}

function formatAdminNumber(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? new Intl.NumberFormat("th-TH").format(Math.round(number)) : "0";
}

function coerceNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : NaN;
}

function parseOptionalNumber(value) {
  if (value === null || value === undefined) {
    return NaN;
  }
  const text = String(value).trim();
  if (!text) {
    return NaN;
  }
  const number = Number(text);
  return Number.isFinite(number) ? number : NaN;
}

function timestampToMs(value) {
  if (typeof value === "number") {
    return value;
  }
  if (value instanceof Date) {
    return value.getTime();
  }
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : Date.now();
  }
  if (value && typeof value.toMillis === "function") {
    return value.toMillis();
  }
  if (value && typeof value.seconds === "number") {
    return value.seconds * 1000;
  }
  return Date.now();
}

function minutesSince(value) {
  return Math.max(0, Math.round((Date.now() - timestampToMs(value)) / 60000));
}

function getReportAge(report) {
  return Math.max(0, Math.round((Date.now() - Number(report.updatedAtMs || report.createdAtMs || Date.now())) / 60000));
}

function getAgeMinutesFromMs(value) {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }
  return Math.max(0, Math.round((Date.now() - value) / 60000));
}

function getFeedCardAge(report) {
  if (
    (report?.source === "static-json" || report?.source === "static_json" || report?.source === "json") &&
    Number.isFinite(report?.importedAtMs) &&
    report.importedAtMs > 0
  ) {
    return getAgeMinutesFromMs(report.importedAtMs);
  }
  return getReportAge(report);
}

function getStationFreshnessText(station, options = {}) {
  const { compact = false } = options;
  const actualAgeText = compact ? formatShortAge(station.updatedMinutes) : formatAge(station.updatedMinutes);
  if (
    store.stationSource.type === "static-json" &&
    Number.isFinite(store.stationSource.generatedAtMs) &&
    store.stationSource.generatedAtMs > 0
  ) {
    const importedAgeText = compact
      ? formatShortAge(getAgeMinutesFromMs(store.stationSource.generatedAtMs))
      : formatAge(getAgeMinutesFromMs(store.stationSource.generatedAtMs));
    return compact ? `นำเข้า ${importedAgeText}` : `นำเข้า ${importedAgeText} | ข้อมูลจริง ${actualAgeText}`;
  }
  return `อัปเดต ${actualAgeText}`;
}

function normalizeStationName(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9\u0E00-\u0E7F-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function sanitizeFilename(value) {
  return String(value || "file")
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9._-]/g, "")
    .toLowerCase();
}

function formatAge(minutes) {
  if (minutes < 60) {
    return `${minutes} นาทีที่แล้ว`;
  }
  if (minutes < 1440) {
    return `${Math.round(minutes / 60)} ชม.ที่แล้ว`;
  }
  return `${Math.round(minutes / 1440)} วันที่แล้ว`;
}

function formatShortAge(minutes) {
  if (minutes < 60) {
    return `${minutes} นาที`;
  }
  return `${Math.round(minutes / 60)} ชม.`;
}

function formatDistance(km) {
  if (!Number.isFinite(km)) {
    return "ไม่ทราบระยะ";
  }
  if (km < 1) {
    return `${Math.round(km * 1000)} ม.`;
  }
  return `${km.toFixed(1)} กม.`;
}

function brandColor(brand) {
  return BRAND_COLORS[brand] || "#0fc2c0";
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[char];
  });
}

function minutesAgoToMs(minutes) {
  return Date.now() - minutes * 60000;
}

async function importPumpRadarStationsV3() {
  const messageBox = document.querySelector("[data-admin-import-message]");
  setMessage(messageBox, "Validating PumpRadar payload...");

  try {
    assertCanImportStationsToFirestore();

    const raw = await readAdminImportText();
    const provincePayloads = parsePumpRadarPayloadV3(raw);
    const requestedSlugs = readAdminImportProvinceSlugs();
    const { selection, stationEntries } = preparePumpRadarImport(provincePayloads, requestedSlugs);

    if (!stationEntries.length) {
      throw new Error("No stations were found in this PumpRadar JSON payload.");
    }

    const selectionLabel = describeProvinceImportSelection(selection);
    setMessage(messageBox, `Importing ${stationEntries.length} stations from ${selectionLabel}...`);
    await writeDocsInBatches(appSettings.collections.stations, stationEntries);
    syncImportedStationsInAdminStore(stationEntries);
    setMessage(
      messageBox,
      `Imported ${stationEntries.length} stations from ${selection.payloads.length} province payloads (${selectionLabel}).${getAdminImportSourceSuccessNote()}`
    );
  } catch (error) {
    console.error(error);
    maybeTrackFirebaseError("admin-import", error);
    setMessage(messageBox, humanizeError(error));
  }
}

function parsePumpRadarPayloadV3(raw) {
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch (error) {
    throw new Error("Invalid JSON. Please check that the content is complete.");
  }

  if (payload && Array.isArray(payload.stations)) {
    return [normalizePumpRadarProvincePayloadV3(payload)];
  }

  if (Array.isArray(payload)) {
    const provinces = payload
      .filter((item) => item && Array.isArray(item.stations))
      .map(normalizePumpRadarProvincePayloadV3);

    if (provinces.length) {
      return provinces;
    }
  }

  if (payload && Array.isArray(payload.provinces)) {
    const provinces = payload.provinces
      .filter((item) => item && Array.isArray(item.stations))
      .map(normalizePumpRadarProvincePayloadV3);

    if (provinces.length) {
      return provinces;
    }
  }

  throw new Error("This JSON is not a PumpRadar province payload or multi-province bundle.");
}

function normalizePumpRadarProvincePayloadV3(payload) {
  return {
    province: String(payload.province || payload.provinceName || payload.provinceSlug || "").trim(),
    provinceSlug: String(payload.provinceSlug || "").trim(),
    stations: Array.isArray(payload.stations) ? payload.stations : [],
  };
}

function downloadPumpRadarProvinceJsonV3() {
  const messageBox = document.querySelector("[data-admin-import-message]");

  try {
    const slugs = readAdminImportProvinceSlugs({ required: true });

    if (slugs.length > 1 || slugs[0] === "all" || slugs[0] === "*") {
      const target =
        slugs[0] === "all" || slugs[0] === "*"
          ? "powershell -ExecutionPolicy Bypass -File .\\tools\\fetch-pumpradar-provinces.ps1 -All"
          : `powershell -ExecutionPolicy Bypass -File .\\tools\\fetch-pumpradar-provinces.ps1 -Province ${slugs.join(",")}`;
      setMessage(messageBox, `Use this command in PowerShell: ${target} | On mobile, use the button "ดึงแล้วนำเข้า" instead.`);
      return;
    }

    const url = buildPumpRadarProvinceUrl(slugs[0]);
    const link = document.createElement("a");
    link.href = url;
    link.target = "_blank";
    link.rel = "noopener";
    link.click();
    setMessage(messageBox, `Opened PumpRadar JSON for ${slugs[0]} in a new tab.`);
  } catch (error) {
    console.error(error);
    setMessage(messageBox, humanizeError(error));
  }
}
