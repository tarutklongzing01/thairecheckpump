# Google Sheets Setup

คู่มือนี้ใช้สำหรับย้ายข้อมูล `stations` ออกจาก Firestore ไปอยู่ใน Google Sheet แล้วให้หน้าเว็บอ่านมาแสดงผลแทน

## ภาพรวม

- `stations` อ่านจาก Google Sheet endpoint
- `reports`, `auth`, และ admin reports ยังใช้ Firebase ได้ตามเดิม
- ถ้าตั้ง `stations` เป็น Google Sheet แล้ว หน้า public จะไม่พึ่ง Firestore reads ของสถานี

## ทางที่ปลอดภัยกว่า

ถ้าไม่ต้องการให้ browser เห็นลิงก์ Google Sheet ตรงใน DevTools:

- ใช้ Google Sheet เป็นที่กรอกข้อมูลหลังบ้านเหมือนเดิม
- export CSV แล้วแปลงเป็น `stations-public.json`
- ให้หน้าเว็บอ่าน `./stations-public.json` แทน

คำสั่งแปลง CSV เป็น JSON:

```powershell
powershell -ExecutionPolicy Bypass -File .\tools\export-stations-public-json.ps1
```

## 1. แปลง PumpRadar JSON เป็น CSV

รันคำสั่งนี้จากโฟลเดอร์โปรเจกต์:

```powershell
powershell -ExecutionPolicy Bypass -File .\tools\export-pumpradar-to-sheet.ps1
```

ไฟล์ผลลัพธ์จะถูกสร้างเป็น `stations-for-google-sheet.csv`

คอลัมน์หลักที่สคริปต์สร้าง:

- `id`
- `name`
- `brand`
- `area`
- `lat`
- `lng`
- `reportCount`
- `photoUrl`
- `updatedAt`
- `createdAt`
- `importSource`
- `importProvince`
- `lastReportId`
- `lastReporter`
- `fuel_diesel`
- `fuel_gas91`
- `fuel_gas95`
- `fuel_e20`
- `fuel_e85`
- `fuel_lpg`

## 2. นำ CSV เข้า Google Sheet

1. สร้าง Google Sheet ใหม่
2. ตั้งชื่อแท็บเป็น `stations`
3. ใช้เมนู `File > Import` แล้วอัปโหลด `stations-for-google-sheet.csv`
4. ให้ header อยู่แถวแรกตามเดิม

## 3. ทางเลือกการเปิดให้เว็บอ่านข้อมูล

มี 2 วิธี

- วิธีเร็ว: ใช้ลิงก์ Google Sheet ตรง แล้วเปิดสิทธิ์ `Anyone with the link can view`
- วิธีควบคุม format เอง: ใช้ Apps Script web app

### วิธีเร็ว: ใช้ลิงก์ Google Sheet ตรง

ถ้ามีลิงก์แบบนี้อยู่แล้ว:

```txt
https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit?gid=SHEET_GID#gid=SHEET_GID
```

เว็บจะสามารถแปลงเป็น CSV export URL ให้อัตโนมัติได้ ถ้า Sheet เปิดสิทธิ์ให้อ่านได้

แก้ไฟล์ `firebase-config.js`:

```js
dataSources: {
  stations: {
    type: "google-sheet",
    url: "https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit?gid=SHEET_GID#gid=SHEET_GID",
  },
},
```

สำคัญ:

- ต้องตั้ง share เป็น `Anyone with the link can view`
- ถ้ายัง private อยู่ เว็บจะโหลดไม่สำเร็จและ fallback กลับ

### วิธี Apps Script: สร้าง JSON endpoint เอง

1. ใน Google Sheet ไปที่ `Extensions > Apps Script`
2. วางโค้ดจากไฟล์ [tools/google-sheet-stations-webapp.gs](C:/Users/Tarutserway/Desktop/radapump/tools/google-sheet-stations-webapp.gs)
3. กด `Deploy > New deployment`
4. เลือกชนิด `Web app`
5. ตั้ง `Who has access` เป็น `Anyone`
6. Deploy แล้วคัดลอก Web app URL

endpoint ที่ได้จะคืน JSON รูปแบบนี้:

```json
{
  "ok": true,
  "source": "google-sheet",
  "sheet": "stations",
  "generatedAt": "2026-03-22T10:00:00.000Z",
  "count": 123,
  "stations": [
    {
      "id": "osm_node_123",
      "name": "ปั๊มตัวอย่าง",
      "brand": "ปตท.",
      "area": "ชลบุรี",
      "lat": 13.36,
      "lng": 100.98,
      "reportCount": 1,
      "updatedAt": "2026-03-22T09:00:00.000Z",
      "fuelStates": {
        "diesel": "high",
        "gas91": "unknown",
        "gas95": "medium",
        "e20": "unknown",
        "e85": "unknown",
        "lpg": "unknown"
      }
    }
  ]
}
```

## 4. เปิดให้เว็บอ่าน stations จาก Google Sheet

แก้ไฟล์ `firebase-config.js`:

```js
dataSources: {
  stations: {
    type: "google-sheet",
    url: "https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit?gid=SHEET_GID#gid=SHEET_GID",
  },
},
```

หรือถ้าจะใช้ Apps Script:

```js
dataSources: {
  stations: {
    type: "google-sheet",
    url: "https://script.google.com/macros/s/REPLACE_WITH_YOUR_DEPLOYMENT/exec",
  },
},
```

ถ้าต้องการกลับไปอ่านจาก Firestore:

```js
dataSources: {
  stations: {
    type: "firestore",
    url: "",
  },
},
```

## 5. ผลกระทบหลังเปิดใช้

- หน้า `home`, `feed`, `dashboard`, `gallery`, `about` จะอ่าน `stations` จาก Google Sheet
- ถ้ามี Firebase config อยู่ หน้า `report` และ Firestore reports ยังทำงานต่อได้
- หน้า admin จะเตือนว่า `stations` ถูกควบคุมจาก Google Sheet แล้ว จึงควรแก้ใน Sheet แทน Firestore

## 6. อัปเดตข้อมูลรอบถัดไป

เมื่อมี JSON ใหม่:

1. รัน `export-pumpradar-to-sheet.ps1` ใหม่
2. อัปโหลด/แทนที่ข้อมูลในแท็บ `stations`
3. เว็บจะอ่านข้อมูลรอบใหม่จาก endpoint เดิม
