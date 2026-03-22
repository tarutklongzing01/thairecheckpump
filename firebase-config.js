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
      type: "google-sheet",
      url: "https://docs.google.com/spreadsheets/d/15_Rc3INQqZ-qoCWBKiHGB2znQzO5O8G1GltH2ZwU1uA/edit?gid=447543159#gid=447543159",
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
