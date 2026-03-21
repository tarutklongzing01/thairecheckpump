import { firebaseConfig, appSettings } from "./firebase-config.js";
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

const PUMPRADAR_BRAND_MAP = {
  PTT: "เธเธ•เธ—.",
  BANGCHAK: "เธเธฒเธเธเธฒเธ",
  PT: "PT",
  SHELL: "Shell",
  ESSO: "Esso",
  SUSCO: "เธเธฑเธชเนเธเน",
  CALTEX: "Caltex",
  OTHER: "อื่นๆ",
};

const PUMPRADAR_STATUS_MAP = {
  available: "high",
  limited: "medium",
  out: "empty",
  unknown: "unknown",
};

const PUMPRADAR_FUEL_MAP = {
  diesel: "diesel",
  benzine91: "gas91",
  benzine95: "gas95",
  e20: "e20",
  e85: "e85",
  lpg: "lpg",
};

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

  if (hasFirebaseConfig()) {
    await connectFirebase();
  } else {
    useFallbackMode("ยังไม่ได้ตั้งค่า Firebase config จึงใช้ข้อมูลเดโมและ fallback reports ในเบราว์เซอร์นี้");
  }

  refreshCurrentPage();
}

async function connectFirebase() {
  try {
    store.app = initializeApp(firebaseConfig);
    await initializeAnalyticsIfSupported();
    store.auth = getAuth(store.app);
    store.db = getFirestore(store.app);
    store.storage = getStorage(store.app);
    store.mode = "firebase";
    store.liveHint = "กำลังเชื่อม Firestore และรอ listener จาก Firebase";
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

    subscribeRealtime();
    store.liveHint = "";
    renderGlobalChrome();
  } catch (error) {
    console.error(error);
    useFallbackMode(`เชื่อม Firebase ไม่สำเร็จ: ${humanizeError(error)}`);
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

function subscribeRealtime() {
  cleanupRealtime();

  const stationQuery = query(
    collection(store.db, appSettings.collections.stations),
    orderBy("updatedAt", "desc"),
    limit(appSettings.maxStationDocs)
  );

  const reportQuery = query(
    collection(store.db, appSettings.collections.reports),
    orderBy("createdAt", "desc"),
    limit(appSettings.maxFeedDocs)
  );

  store.unsubs.push(
    onSnapshot(
      stationQuery,
      (snapshot) => {
        store.stations = snapshot.docs.map(mapStationDoc);
        refreshCurrentPage();
      },
      (error) => handleRealtimeError("stations", error)
    )
  );

  store.unsubs.push(
    onSnapshot(
      reportQuery,
      (snapshot) => {
        store.reports = snapshot.docs.map(mapReportDoc);
        refreshCurrentPage();
      },
      (error) => handleRealtimeError("reports", error)
    )
  );
}

function cleanupRealtime() {
  store.unsubs.forEach((unsubscribe) => unsubscribe());
  store.unsubs = [];
}

function handleRealtimeError(source, error) {
  console.error(source, error);
  useFallbackMode(`อ่านข้อมูลสดจาก ${source} ไม่ได้: ${humanizeError(error)}`);
}

function useFallbackMode(message) {
  cleanupRealtime();
  store.mode = "demo";
  store.liveHint = message;
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
      const visibleStations = runtime.stations
        .filter((station) => state.brands.has(station.brand) && station.distanceKm <= state.radius)
        .sort((left, right) => left.distanceKm - right.distanceKm);

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
        `${store.mode === "firebase" ? "โหมดสด" : "โหมดเดโม"} | ${FUEL_LABELS[state.fuel]} | ${
          store.location ? "อิงตำแหน่งผู้ใช้จริง" : "อิงตำแหน่งกลางเริ่มต้น"
        }`
      );

      renderHomeMap(state, visibleStations, state.fuel, state.radius);
      renderHTML(
        "[data-station-list]",
        visibleStations.length ? visibleStations.map((station) => renderStationCard(station, state.fuel)).join("") : renderEmptyState("ยังไม่มีสถานีที่ตรงกับฟิลเตอร์นี้")
      );
    },
  };
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
      <p>อัปเดต ${escapeHtml(formatShortAge(station.updatedMinutes))} | รายงานสะสม ${escapeHtml(String(station.reports))} | พร้อมจ่าย ${available}/${FUELS.length}</p>
    </article>
  `;
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
      const reports = runtime.reports.filter((report) => {
        const fuelPass = state.fuel === "all" || report.fuel === state.fuel;
        const statusPass = state.status === "all" || report.status === state.status;
        return fuelPass && statusPass;
      });

      setText("[data-feed-total]", `${reports.length}`);
      setText("[data-feed-urgent]", `${reports.filter((report) => ["low", "empty"].includes(report.status)).length}`);
      setText("[data-feed-photo]", `${reports.filter((report) => Boolean(report.photoUrl)).length}`);
      setText("[data-feed-contributors]", `${new Set(reports.map((report) => report.reporter)).size}`);

      const averageAge = reports.length ? Math.round(reports.reduce((total, report) => total + getReportAge(report), 0) / reports.length) : 0;
      setText("[data-feed-average-age]", averageAge ? `${averageAge} นาที` : "-");

      renderHTML("[data-feed-list]", reports.length ? reports.map((report) => renderFeedCard(report)).join("") : renderEmptyState("ยังไม่มีรายงานที่ตรงกับตัวกรองนี้"));
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

      setText("[data-gallery-total]", `${reports.length}`);
      setText("[data-gallery-recent]", `${reports.filter((report) => getReportAge(report) <= 60).length}`);
      setText("[data-gallery-fuel]", state.fuel === "all" ? "ทุกเชื้อเพลิง" : FUEL_LABELS[state.fuel]);
      renderHTML("[data-gallery-grid]", reports.length ? reports.map((report, index) => renderGalleryCard(report, index)).join("") : renderEmptyState("ยังไม่มีภาพยืนยันสำหรับตัวกรองนี้"));
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
      setText("[data-about-contributors]", `${new Set(runtime.reports.map((report) => report.reporter)).size}`);
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
      const importButton = document.querySelector("[data-admin-import-submit]");
      const importResetButton = document.querySelector("[data-admin-import-reset]");

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
        await importPumpRadarStations();
        this.render();
      });

      importDownloadButton?.addEventListener("click", () => {
        downloadPumpRadarProvinceJson();
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
      setText("[data-admin-mode]", store.mode === "firebase" ? "Firestore" : "Demo");
      setText("[data-admin-auth]", isGoogleUser() ? "Google" : store.authReady ? "ยังไม่ล็อกอิน" : "รอตรวจสอบ");
      setText("[data-admin-write]", hasAdminAccess() ? "เขียนได้" : "ปิดอยู่");

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
        state.isCreating
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

  return `
    <button class="admin-station-row${isActive ? " is-active" : ""}" type="button" data-admin-select="${escapeHtml(station.id)}">
      <div class="admin-station-row-head">
        <span class="brand-badge">${escapeHtml(station.brand)}</span>
        <span class="tiny-badge">${escapeHtml(station.id)}</span>
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
  const canWrite = hasAdminAccess();
  const stationIdInput = document.querySelector("[data-admin-station-id]");
  const saveButton = document.querySelector("[data-admin-save]");
  const deleteButton = document.querySelector("[data-admin-delete]");
  const form = document.querySelector("[data-admin-form]");

  if (stationIdInput) {
    stationIdInput.disabled = !state.isCreating;
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
    setMessage(messageBox, `บันทึกสถานี ${payload.name} แล้ว`);
  } catch (error) {
    console.error(error);
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

    const reportSnapshot = await getDocs(query(collection(store.db, appSettings.collections.reports), where("stationId", "==", state.selectedId)));
    await Promise.all(reportSnapshot.docs.map((item) => deleteDoc(item.ref)));
    await deleteDoc(doc(store.db, appSettings.collections.stations, state.selectedId));
    state.selectedId = "";
    state.hydratedKey = "";
    state.pendingDraft = null;
    state.selectedReportId = "";
    state.reportHydratedKey = "";
    state.pendingReportDraft = null;
    setMessage(messageBox, `ลบสถานีและรายงานที่เกี่ยวข้อง ${reportSnapshot.size} รายการแล้ว`);
  } catch (error) {
    console.error(error);
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

  return `
    <button class="admin-report-row${isActive ? " is-active" : ""}" type="button" data-admin-report-select="${escapeHtml(report.id)}">
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
        <span>${escapeHtml(report.stationId)}</span>
        <span>${escapeHtml(formatAge(getReportAge(report)))}</span>
      </div>
    </button>
  `;
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

function syncAdminImportState() {
  const canWrite = hasAdminAccess();
  const submitButton = document.querySelector("[data-admin-import-submit]");
  if (submitButton) {
    submitButton.disabled = !canWrite;
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
  const input = document.querySelector("[data-admin-import-province]");
  const slug = String(input?.value || "").trim().toLowerCase().replace(/\s+/g, "-");
  if (!slug) {
    throw new Error("กรอก province slug ก่อนดาวน์โหลด JSON");
  }
  if (input) {
    input.value = slug;
  }
  return slug;
}

function buildPumpRadarProvinceUrl(slug) {
  return `https://thaipumpradar.com/api/provinces/${encodeURIComponent(slug)}/stations`;
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

async function importPumpRadarStations() {
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
    const payload = parsePumpRadarPayload(raw);
    const stationEntries = payload.stations
      .map((station) => buildPumpRadarStationEntry(station, payload.province))
      .filter(Boolean);

    if (!stationEntries.length) {
      throw new Error("JSON นี้ไม่มีสถานีที่พร้อมนำเข้า");
    }

    setMessage(messageBox, `กำลังนำเข้า ${stationEntries.length} สถานี...`);
    await writeDocsInBatches(appSettings.collections.stations, stationEntries);
    setMessage(messageBox, `นำเข้าข้อมูล PumpRadar แล้ว ${stationEntries.length} สถานี (${payload.province || "ไม่ระบุจังหวัด"})`);
  } catch (error) {
    console.error(error);
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

function parsePumpRadarPayload(raw) {
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
      lastReporter: "PumpRadar",
    },
  };
}

function mapPumpRadarBrand(brandId) {
  const key = String(brandId || "OTHER").trim().toUpperCase();
  return PUMPRADAR_BRAND_MAP[key] || String(brandId || "อื่นๆ").trim() || "อื่นๆ";
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

  Object.entries(PUMPRADAR_FUEL_MAP).forEach(([remoteFuelId, localFuelId]) => {
    fuelStates[localFuelId] = mapPumpRadarStatus(report[remoteFuelId]);
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
    brand: data.brand || "ไม่ทราบแบรนด์",
    area: data.area || "ยังไม่ระบุพื้นที่",
    lat: coerceNumber(data.lat),
    lng: coerceNumber(data.lng),
    reportCount: Number(data.reportCount || 0),
    updatedMinutes: minutesSince(data.updatedAt),
    fuelStates: normalizeFuelStates(data.fuelStates),
    photoUrl: data.photoUrl || "",
  };
}

function mapReportDoc(snapshot) {
  const data = snapshot.data();
  return {
    id: snapshot.id,
    stationId: data.stationId || normalizeStationName(`${data.brand || ""}-${data.station || snapshot.id}`),
    station: data.station || "ไม่ทราบสถานี",
    brand: data.brand || "ไม่ทราบแบรนด์",
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
    setText("[data-report-auth-title]", "โหมดเดโมยังไม่ต้องล็อกอิน");
    setText("[data-report-auth-copy]", "ตอนนี้ระบบยังไม่เชื่อม Firebase จึงบันทึกรายงานแบบ local demo ได้จากเครื่องนี้");
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
    copy && (copy.textContent = "ระบบยังอยู่ในโหมดเดโม จึงยังเปิดหลังบ้านแก้ข้อมูลจริงไม่ได้");
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
  const modeLabel =
    store.mode === "firebase"
      ? "Firebase Live"
      : store.mode === "demo"
        ? "Fallback Demo"
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
    node.textContent = modeLabel;
  });
  document.querySelectorAll("[data-auth-state]").forEach((node) => {
    node.textContent = authLabel;
  });
  document.querySelectorAll("[data-location-state]").forEach((node) => {
    node.textContent = locationLabel;
  });
  document.querySelectorAll("[data-live-hint]").forEach((node) => {
    node.textContent = store.liveHint || "ระบบพร้อมใช้งาน";
  });
  document.querySelectorAll("[data-location-detail]").forEach((node) => {
    node.textContent = store.location
      ? `พิกัดปัจจุบัน ${store.location.lat.toFixed(6)}, ${store.location.lng.toFixed(6)} ความแม่นยำประมาณ ${Math.round(store.location.accuracy)} เมตร`
      : 'กด "ใช้ตำแหน่งฉัน" ด้านบนเพื่อกรอกพิกัดอัตโนมัติ หรือกรอกละติจูด/ลองจิจูดเอง';
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
            <span>อัปเดต ${formatShortAge(station.updatedMinutes)}</span>
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

function renderFeedCard(report) {
  const meta = STATUS_META[report.status || "unknown"];
  return `
    <article class="feed-card">
      <div class="feed-head">
        <div>
          <div class="meta-row">
            <span class="brand-badge">${escapeHtml(report.brand)}</span>
            <span class="status-badge ${meta.tone}">${escapeHtml(meta.label)}</span>
            ${report.photoUrl ? '<span class="tiny-badge">มีภาพยืนยัน</span>' : ""}
            <span class="tiny-badge">${escapeHtml(report.source || store.mode)}</span>
          </div>
          <h3>${escapeHtml(report.station)}</h3>
        </div>
        <span class="tiny-badge">${formatAge(getReportAge(report))}</span>
      </div>
      <p class="muted">${escapeHtml(report.area)} | ${escapeHtml(FUEL_LABELS[report.fuel] || report.fuel)}</p>
      <p>${escapeHtml(report.note)}</p>
      <div class="detail-row muted">
        <span>โดย ${escapeHtml(report.reporter)}</span>
        <span>${Number.isFinite(report.lat) && Number.isFinite(report.lng) ? `${report.lat.toFixed(4)}, ${report.lng.toFixed(4)}` : "ไม่มีพิกัด"}</span>
      </div>
    </article>
  `;
}

function renderGalleryCard(report, index) {
  const meta = STATUS_META[report.status || "unknown"];
  const feature = index % 5 === 0 ? "LIVE SNAP" : "COMMUNITY PHOTO";
  return `
    <article class="gallery-card">
      <div class="gallery-art" style="--brand-tone:${brandColor(report.brand)};">
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
          <span>โดย ${escapeHtml(report.reporter)}</span>
          <span>${report.photoUrl && report.photoUrl !== "demo" ? "ภาพจาก Firebase Storage" : "ภาพ placeholder/เดโม"}</span>
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
  return error?.message || String(error || "เกิดข้อผิดพลาด");
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
