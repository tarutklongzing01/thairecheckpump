export const firebaseConfig = {
  apiKey: "AIzaSyBkuA8ktvY4Qytoh28MF2eMEoL_eQLLFDg",
  authDomain: "thairecheckpump.firebaseapp.com",
  projectId: "thairecheckpump",
  storageBucket: "thairecheckpump.firebasestorage.app",
  messagingSenderId: "672029149407",
  appId: "1:672029149407:web:92c7b1d8008fa90d26c16a",
  measurementId: "G-J60LB697PM",
};

export const appSettings = {
  sdkVersion: "12.7.0",
  defaultCenter: { lat: 13.736717, lng: 100.523186 },
  defaultRadiusKm: 6,
  googleSheetRefreshMs: 30000,
  maxStationDocs: 1500,
  maxFeedDocs: 80,
  dataSources: {
    stations: {
      type: "static-json",
      url: "./stations-public.json",
    },
  },
  collections: {
    stations: "stations",
    reports: "reports",
  },
  storageFolder: "reports",
  adminEmails: [],
  autoRequestLocationOn: ["home", "report"],
};
