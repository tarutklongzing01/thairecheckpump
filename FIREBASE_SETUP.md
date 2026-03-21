# Firebase Setup

ไฟล์นี้อธิบายค่าที่ต้องเตรียมเพื่อให้เว็บในโฟลเดอร์นี้ทำงานกับ Firebase จริง

## 1. เตรียม Firebase project

- สร้าง Firebase project และเพิ่ม Web app
- เปิดใช้ `Authentication`
- เปิด provider แบบ `Google`
- เปิด `Cloud Firestore`
- เปิด `Cloud Storage`

## 2. ใส่ config

แก้ไฟล์ `firebase-config.js` แล้วใส่ค่าจาก Firebase console

ถ้าต้องการจำกัดหน้า admin ให้เฉพาะบางบัญชี ให้เพิ่มอีเมลใน `appSettings.adminEmails` เช่น:

```js
adminEmails: ["your-admin@gmail.com"]
```

## 3. โครงข้อมูลที่หน้าเว็บนี้ใช้

### Collection: `stations`

เอกสารหนึ่งตัวแทนหนึ่งสถานี

```json
{
  "name": "ปตท. บางนา กม.5",
  "brand": "ปตท.",
  "area": "บางนา",
  "lat": 13.668,
  "lng": 100.634,
  "reportCount": 4,
  "updatedAt": "serverTimestamp",
  "createdAt": "serverTimestamp",
  "photoUrl": "https://...",
  "fuelStates": {
    "diesel": "high",
    "gas91": "medium",
    "gas95": "high",
    "e20": "medium",
    "e85": "unknown",
    "lpg": "unknown"
  }
}
```

### Collection: `reports`

เอกสารหนึ่งตัวแทนหนึ่งการแจ้งรายงาน

```json
{
  "stationId": "ptt-bangna-km5",
  "station": "ปตท. บางนา กม.5",
  "brand": "ปตท.",
  "area": "บางนา",
  "lat": 13.668,
  "lng": 100.634,
  "fuel": "diesel",
  "status": "high",
  "note": "ยังเติมได้",
  "reporter": "กฤต",
  "photoUrl": "https://...",
  "photoPath": "reports/uid/file.jpg",
  "createdBy": "firebase-auth-uid",
  "createdAt": "serverTimestamp"
}
```

## 4. Rules ตัวอย่างสำหรับการเริ่มต้น

ใช้ได้เฉพาะช่วงพัฒนาเท่านั้น ควร tighten rules ก่อนขึ้น production

### Firestore rules

```txt
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /stations/{document=**} {
      allow read: if true;
      allow write: if request.auth != null
        && request.auth.token.firebase.sign_in_provider == "google.com"
        && request.auth.token.email in ["your-admin@gmail.com"];
    }

    match /reports/{document=**} {
      allow read: if true;
      allow write: if request.auth != null
        && request.auth.token.firebase.sign_in_provider == "google.com";
    }
  }
}
```

### Storage rules

```txt
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /reports/{userId}/{allPaths=**} {
      allow read: if true;
      allow write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

## 5. การรัน local

แนะนำให้เปิดผ่าน local server แทนการเปิดไฟล์ `file://` ตรงๆ เพราะ geolocation และ Firebase บางส่วนต้องการ secure context หรือ localhost

ตัวอย่าง:

```powershell
php -S localhost:8080
```

หรือใช้ local server อื่นที่คุณมีอยู่แล้ว
