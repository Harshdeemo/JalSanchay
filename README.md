# JalSanchay – Rooftop Rainwater Planner

Draw your roof on a satellite map and get a rainwater harvesting plan: yearly yield, tank size, recharge pit size, an itemised cost list (BOQ) and payback time. You can fill in the form by voice (Hindi or English) and save the result as a PDF.

## What it does

| Step | Where it happens |
|------|------------------|
| Search an address or use GPS, trace the roof on a satellite map | `frontend/map.js` (Leaflet + Esri imagery) |
| Roof area and perimeter measured on the globe | Turf.js in the browser |
| Fill the form by speaking ("Roof 120 square meters, 4 people, Delhi") | `frontend/voice.js` (browser Web Speech API) |
| Ten-year local rainfall, rainy days, dry spell, monthly rain | `backend/lib/weather.js` (Open-Meteo, with a city-table fallback) |
| Yield, tank size, recharge pit size, savings, payback | `backend/lib/assess.js` |
| Itemised cost list | `backend/lib/boq.js` + `backend/data/rates.js` |
| Download as PDF | Browser print dialog with a print layout (choose "Save as PDF") |
| Save plans to open later | Browser localStorage (this device only) |

## Project layout

```
jalsanchay/
├── backend/               Node.js + Express API
│   ├── server.js          routes: /api/health, /api/cities, /api/climate, /api/assess
│   ├── lib/               assess.js, weather.js, boq.js
│   ├── data/              rainfall.js (fallback table), rates.js (unit prices)
│   ├── test/              unit tests
│   └── package.json
├── frontend/              Static site, no build step
│   ├── index.html, styles.css
│   ├── app.js             page logic, report, saved reports
│   ├── map.js             map and polygon drawing
│   ├── voice.js           voice assistant and speech parser
│   ├── config.js          set your backend URL here
│   └── test/
├── render.yaml            optional backend deploy config
├── .gitignore
└── README.md
```

## Run it on your computer

You need [Node.js](https://nodejs.org) 18 or newer and an internet connection (map tiles, rainfall data and address search come from the internet).

1. **Backend**
   ```bash
   cd backend
   npm install
   npm start          # http://localhost:4000
   ```
   Check http://localhost:4000/api/health

2. **Frontend** (second terminal)
   ```bash
   cd frontend
   npx serve .        # or: python3 -m http.server 3000
   ```
   Open the address it prints. Use Chrome or Edge if you want the voice button.

3. **Tests** (optional)
   ```bash
   cd backend  && npm test
   cd ../frontend && npm test
   ```

## Push to GitHub

1. Create an empty repository on github.com (for example `jalsanchay`), without a README.
2. In the project root:
   ```bash
   git init
   git add .
   git commit -m "Initial commit: JalSanchay"
   git branch -M main
   git remote add origin https://github.com/<your-username>/jalsanchay.git
   git push -u origin main
   ```

## Deploy

Deploy the backend first, because the frontend needs its URL.

**Backend on Render (free)**
1. On render.com choose New → Web Service and connect your GitHub repo.
2. Root Directory `backend`, Build Command `npm install`, Start Command `npm start`.
3. Copy the URL it gives you, for example `https://jalsanchay-api.onrender.com`. The free plan sleeps when idle, so the first request after a while can take about a minute.

**Frontend on Vercel (free)**
1. Edit `frontend/config.js`, set `window.JALSANCHAY_API` to your Render URL, commit and push.
2. On vercel.com choose Add New → Project and import the repo.
3. Root Directory `frontend`, Framework Preset "Other", leave build settings empty, Deploy.
4. In Settings → Domains, pick a simple name such as `jalsanchay.vercel.app` (choose another if it is taken).

**Lock down CORS (recommended)**
In Render set `CORS_ORIGIN` to your Vercel URL, for example `https://jalsanchay.vercel.app`, and redeploy.

## Good to know

- **Rainfall** comes from the free [Open-Meteo](https://open-meteo.com) archive (average of the last ten full years at your pin). If it cannot be reached, the app falls back to a rounded average for the nearest city in `backend/data/rainfall.js` and says so in the report.
- **Prices** in `backend/data/rates.js` are rough placeholders, not live market rates. Replace them with local quotes.
- **Sizing rules** (runoff factors, 135 L per person per day, a tank holding about 15 days of non-drinking use, 25 mm design storm for the recharge pit) are planning-level assumptions at the top of `backend/lib/assess.js`.
- **Maps and search:** the satellite imagery is Esri World Imagery and address search is OpenStreetMap Nominatim. Both are fine for a small project; for heavy traffic use a paid provider (Mapbox, Google Maps) and follow its terms.
- **Accounts:** sign-in and cloud-saved reports are not included. Reports are saved in the browser. A database such as Supabase can be added later.
- Results are estimates, not engineering drawings. Confirm with a qualified engineer before building.
