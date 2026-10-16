# SolarShare – Smart Solar Surplus Energy Coordination

College prototype. Farmers (producers) list surplus solar energy; consumers search and request it; a Government role sees aggregate community statistics.
SolarShare only coordinates manually entered data. It does NOT transfer electricity.

## Features
- Green/white dashboard with sidebar navigation for three roles: Farmer, Consumer, Government
- Energy monitoring (generation, consumption, surplus) calculated from saved listing records
- Energy sharing: listings, matching, requests, accept / reject / complete (unchanged logic)
- **Estimated Forecast**: simple average/trend estimate of recent records (not a trained AI model)
- **Carbon Wallet**: estimated CO2 saved = completed shared kWh x 0.82 kg/kWh
- Analytics chart, alerts, and equipment status
- Government overview: community totals, energy by location, recent sharing activity

Honesty labels: the **battery %**, **equipment status**, the maintenance alert, and Carbon Wallet figures shown before any share is completed are **demo/sample values** and are tagged "Demo" / "Sample" in the UI. Everything else comes from the database.

## Requirements
- Node.js 20 or newer (https://nodejs.org, LTS version)

## Run
```
npm install
npm run dev
```
Open http://localhost:3000 (the frontend and backend run together on one server).
Use `npm start` instead of `npm run dev` if you prefer.

## Demo accounts (password: demo123)
| Role | Email | Location |
|---|---|---|
| Producer | producer@demo.com | Ghaziabad (10 generated, 6 consumed, 4 surplus) |
| Producer | producer2@demo.com | Noida (5 kWh surplus) |
| Producer | producer3@demo.com | Delhi (8 kWh surplus) |
| Consumer | consumer@demo.com | Ghaziabad (needs 3 kWh) |
| Consumer | consumer2@demo.com | Noida |
| Government | government@demo.com | Overview only (cannot be self-registered) |

Carbon Wallet demo: consumer sends a request -> farmer clicks Accept, then Mark Completed -> wallet shows real figures.

Existing databases are upgraded automatically on first start (the users table gets the new 'government' role; data is kept).
Reset demo data any time: `npm run seed`

## Tech stack
Node.js, Express, SQLite (better-sqlite3), bcryptjs, JWT, HTML/CSS/JS.