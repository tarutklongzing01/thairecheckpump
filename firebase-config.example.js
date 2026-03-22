export const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.firebasestorage.app",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID",
  measurementId: "G-XXXXXXXXXX",
};

export const appSettings = {
  sdkVersion: "12.7.0",
  defaultCenter: { lat: 13.736717, lng: 100.523186 },
  defaultRadiusKm: 6,
  googleSheetRefreshMs: 30000,
  maxStationDocs: 250,
  maxFeedDocs: 80,
  dataSources: {
    stations: {
      type: "firestore",
      url: "",
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
