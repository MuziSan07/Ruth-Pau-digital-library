# Ruth Pau Digital Library

A digital library platform with two front ends over a shared Firebase backend:
an administrator web panel for managing the catalogue, and a Flutter mobile app
where students sign in and read.

## Components

- **`admin/` — administrator web panel.** React + Vite single-page app with a
  serverless API (deployed on Vercel). Administrators manage students and books;
  book files are stored on Google Drive. Every write goes through the API using
  the Firebase Admin SDK — clients never write directly.
- **`mobile/` — student app.** Flutter app: sign in, browse the catalogue, and
  read books in PDF, EPUB and plain-text readers.
- **Firebase backend.** Firestore holds users and books; `firestore.rules` and
  `firestore.indexes.json` define access and indexes. Authentication is Firebase
  Auth, with an `admin` role set as a custom claim by the API.

## Security model

- The mobile app and admin panel only ever **read** through Firestore rules.
  Every write goes through the Vercel serverless API with the Firebase Admin SDK,
  which bypasses rules — so a compromised client cannot create students, edit
  books, or promote itself to admin.
- Firestore rules fail closed: the default is deny-all, students can read only
  their own profile, and only signed-in, non-suspended accounts can browse the
  catalogue.
- The Firebase client API keys in `mobile/` are **not secrets** — they are public
  identifiers that ship inside every app build. Access is controlled by the
  Firestore rules above, not by hiding these values. Real secrets (service
  accounts, `.env` files, signing keystores) are gitignored and never committed.

## Project layout

```
Ruth-Pau-digital-library/
├── admin/                  # React + Vite admin panel + serverless API
│   ├── api/                # Vercel serverless functions (books, students)
│   ├── scripts/            # seed-admin, setup-drive-folder, deploy-rules, ...
│   ├── src/                # web app source
│   └── package.json
├── mobile/                 # Flutter student app
│   ├── lib/                # app source
│   └── pubspec.yaml
├── docs/
│   └── SETUP.md            # step-by-step credentials and console setup
├── firestore.rules         # Firestore security rules
├── firestore.indexes.json  # Firestore composite indexes
└── firebase.json
```

## Quick start

Full credential and console setup is in [docs/SETUP.md](docs/SETUP.md).

### Admin panel

```bash
cd admin
npm install
npm run dev          # runs the API and web app together
```

Useful scripts: `npm run seed:admin` (create the first administrator),
`npm run setup:drive` (provision the Google Drive folder), `npm run build`.

### Mobile app

```bash
cd mobile
flutter pub get
flutter run
```

## License

Released under the MIT License. See the [LICENSE](LICENSE) file for details.
