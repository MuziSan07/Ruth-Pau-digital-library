# Admin panel

The administrator web panel for the Ruth Pau Digital Library. A React + Vite
single-page app backed by a serverless API (deployed on Vercel) that talks to
Firebase with the Admin SDK and stores book files on Google Drive.

See [../README.md](../README.md) for the overall architecture and
[../docs/SETUP.md](../docs/SETUP.md) for credential and console setup.

## Develop

```bash
npm install
npm run dev
```

`npm run dev` runs the serverless API (`dev-server.mjs`) and the Vite web app
together. The API reads environment variables from `.env.local` — copy
`.env.example` and fill it in; the real file is gitignored.

## Scripts

| Command | What it does |
|---------|--------------|
| `npm run dev` | Run the API and web app together (local development) |
| `npm run build` | Production build of the web app |
| `npm run preview` | Preview the production build |
| `npm run lint` | Lint with Oxlint |
| `npm run seed:admin` | Create the first administrator account |
| `npm run setup:drive` | Provision the Google Drive storage folder |

Other maintenance scripts live in `scripts/` (`deploy-rules.js`,
`create-indexes.js`, `bulk-import.js`).

## Deploy

The panel deploys to Vercel (`vercel.json` holds the SPA rewrite and function
config). The serverless API lives under `api/`.
