# Digital Library — Setup Guide

Credentials and console setup, step by step.

Sections:

1. [Firebase](#1-firebase) — auth + database (this section)
2. Google Drive — file storage (added later)
3. Vercel — admin panel deployment (added later)

---

## 1. Firebase

You will end this section with **four** things:

| # | What | Where it goes | Secret? |
|---|------|---------------|---------|
| A | Web app config object | `admin/.env.local` | No — safe to share |
| B | Service account JSON | `admin/.secrets/` (gitignored) | **YES — never commit or paste publicly** |
| C | `google-services.json` | `mobile/android/app/` | No |
| D | Project ID | everywhere | No |

---

### Step 1.1 — Create the project

1. Go to **https://console.firebase.google.com** and sign in with the Google account that should own this project.
2. Click **Create a project** (or **Add project**).
3. Project name: `digital-library-ruth-puaf`
   - Firebase appends a random suffix to make the ID unique, e.g. `digital-library-ruth-puaf-a1b2c`. **Write down the final Project ID** — that is item **D**.
4. Click **Continue**.
5. **Google Analytics** — toggle it **off**. We do not need it, and it adds an extra account-linking step.
6. Click **Create project**, wait for it to finish, then click **Continue**.

---

### Step 1.2 — Enable Email/Password authentication

> ℹ️ The Firebase console was redesigned — there is **no "Build" section** any more.
> Products now live under **Product categories** in the sidebar:
> - **Authentication** → under **Security**
> - **Firestore** → under **Databases & Storage**

1. In the left sidebar: **Security → Authentication**.
2. Click **Get started**.
3. Open the **Sign-in method** tab.
4. Under *Native providers*, click **Email/Password**.
5. Turn on the **first** toggle (Email/Password).
   Leave **Email link (passwordless sign-in)** **off** — students log in with the password you issue them.
6. Click **Save**.

You should now see `Email/Password — Enabled` in the providers list.

---

### Step 1.3 — Create the Firestore database

1. Left sidebar: **Databases & Storage → Firestore**
   (may appear as *Firestore Database* or *Cloud Firestore*).
2. Click **Create database**.
3. **Location** — pick the region closest to your students.
   - Pakistan / India → `asia-south1 (Mumbai)`
   - Europe → `eur3` or `europe-west1`
   - US → `nam5` or `us-central1`

   > ⚠️ The location is **permanent**. It cannot be changed later without recreating the project.

4. Start in **Production mode** (locked down).
   Do **not** pick Test mode — it auto-opens your database to the public internet for 30 days.
   We deploy proper security rules from the repo, so locked-down is correct here.
5. Click **Create** and wait for provisioning.

---

### Step 1.4 — Get the web app config (item A)

This is for the React admin panel.

1. In the left sidebar click **⚙ Settings → Project settings**
   (in the redesigned console *Settings* sits directly under *Project Overview*).
2. Stay on the **General** tab, scroll to **Your apps**.
3. Click the **web icon `</>`**.
4. App nickname: `admin-panel`
5. **Do not** tick *Also set up Firebase Hosting* — we deploy to Vercel.
6. Click **Register app**.
7. You will see a code block containing `const firebaseConfig = { ... }`. **Copy the whole object.** It looks like:

   ```js
   const firebaseConfig = {
     apiKey: "AIza...",
     authDomain: "digital-library-ruth-puaf-a1b2c.firebaseapp.com",
     projectId: "digital-library-ruth-puaf-a1b2c",
     storageBucket: "digital-library-ruth-puaf-a1b2c.firebasestorage.app",
     messagingSenderId: "123456789012",
     appId: "1:123456789012:web:abc123def456"
   };
   ```

8. Click **Continue to console**.

> This config is **not a secret**. It ships inside every web app's JavaScript by design; access is controlled by Firestore security rules, not by hiding these values. Safe to paste in chat.

If you close the page before copying: **Project settings → General → Your apps → admin-panel → Config**.

---

### Step 1.5 — Generate the service account key (item B)

This lets the server create student accounts. **It bypasses all security rules.**

1. **Project settings** → **Service accounts** tab.
2. Make sure **Firebase Admin SDK** is selected, with **Node.js** as the language.
3. Click **Generate new private key** → confirm with **Generate key**.
4. A `.json` file downloads (something like `digital-library-...-firebase-adminsdk-....json`).
5. Move that file into this folder, keeping the name simple:

   ```
   Digital Library - Ruth Puaf\admin\.secrets\firebase-admin.json
   ```

   Create the `admin\.secrets\` folders if they do not exist yet. This path is gitignored — it will never be committed.

> 🔐 **Treat this file like a password to the entire project.**
> Anyone holding it can read and delete every student record and book.
> - Do **not** commit it to git.
> - Do **not** paste its contents into chat, email, or Slack.
> - Do **not** upload it anywhere public.
>
> Just save it to the path above and tell me it is in place — I will read it from disk locally, and for production you will paste it into Vercel's environment variables yourself.
>
> If it ever leaks: **Project settings → Service accounts → Manage service account permissions**, delete the key, and generate a new one.

---

### Step 1.6 — Register the Android app (item C)

This is for the Flutter mobile app.

1. **Project settings** → **General** → **Your apps** → click **Add app** → **Android icon 🤖**.
2. **Android package name** — must match exactly:

   ```
   com.ruthpuaf.digitallibrary
   ```

3. App nickname: `Digital Library` (optional)
4. **Debug signing certificate SHA-1** — leave blank. It is only needed for Google Sign-In / phone auth, which we are not using.
5. Click **Register app**.
6. Click **Download google-services.json**.
7. Save it to:

   ```
   Digital Library - Ruth Puaf\mobile\android\app\google-services.json
   ```

   The `mobile/` folders do not exist yet — save the file anywhere for now (e.g. Downloads) and move it once the Flutter project is scaffolded.

8. Click **Next → Next → Continue to console**. Ignore the Gradle instructions on screen; the Flutter tooling handles that wiring.

> This file is also **not secret** — it ships inside the APK.

---

### Step 1.7 — Checklist

Before moving on, confirm:

- [ ] Project created, Project ID written down
- [ ] Authentication → Email/Password shows **Enabled**
- [ ] Firestore Database exists, created in **Production mode**
- [ ] Web config object copied (item A)
- [ ] `admin\.secrets\firebase-admin.json` saved (item B)
- [ ] `google-services.json` downloaded (item C)

Then send me:

- The **web config object** (paste it — not secret)
- **Confirmation** that the service account JSON is saved at the path above (do not paste it)
- The **email + password** you want for the first admin login

---

## 2. Google Drive

Book files live in Google Drive rather than Firebase Storage, which would
require the paid Blaze plan.

You will end with four values for `admin/.env.local`:
`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`,
`GOOGLE_DRIVE_FOLDER_ID`. **All four are secret.**

> **Why OAuth instead of a service account?** A service account has no Drive
> storage quota of its own, so uploading into a personal Gmail account fails
> with *"Service Accounts do not have storage quota"*. Instead you grant
> consent once and we keep the resulting refresh token.

---

### Step 2.1 — Enable the Drive API

1. Go to **https://console.cloud.google.com/apis/library/drive.googleapis.com**
2. Top-left project picker → select **digital-library-ruth-puaf**
   (your Firebase project is already a Google Cloud project — do not create a new one).
3. Click **Enable**.

---

### Step 2.2 — Configure the OAuth consent screen

1. Go to **APIs & Services → OAuth consent screen**.
2. User type: **External** → **Create**.
3. Fill in the required fields only:
   - App name: `Digital Library`
   - User support email: your email
   - Developer contact email: your email
4. **Save and continue**.
5. **Scopes** → **Add or remove scopes** → filter for `drive.file` and tick:

   ```
   https://www.googleapis.com/auth/drive.file
   ```

   > Use **`drive.file`, not `drive`**. It grants access only to files this app
   > creates, so a leaked token cannot read the rest of your Drive.

   **Update** → **Save and continue**.
6. **Test users** → **Add users** → add your own Google address → **Save and continue**.
7. **Publish the app** — see step 2.2b below. Do this *before* generating the
   refresh token.

---

### Step 2.2b — Publish the consent screen

> ⚠️ **Do not skip this.** While the app sits in *Testing*, Google expires
> refresh tokens after **7 days**. Uploads then break with `invalid_grant`
> a week after setup looked perfectly fine — a genuinely confusing failure to
> debug. Publishing makes refresh tokens permanent.

The console moved this page out of *APIs & Services* into **Google Auth
Platform**. Go straight to:

**https://console.cloud.google.com/auth/audience**

(Check the project picker says **digital-library-ruth-puaf**.)

1. Find **Publishing status** — it reads `Testing`
2. Click **PUBLISH APP**
3. Confirm the *"available to any user with a Google Account"* dialog
4. Status now reads **In production** ✅

*Older console layout:* **APIs & Services → OAuth consent screen → Publish app**.

**If it warns about verification, ignore it.** Verification is only enforced
for *sensitive* and *restricted* scopes such as full `drive`. The `drive.file`
scope is **non-sensitive** — it only reaches files the app itself created — so
the app publishes instantly with no review.

The one visible side effect: during step 2.4 you will hit a
**"Google hasn't verified this app"** interstitial. Click
**Advanced → Go to Digital Library (unsafe)**. It refers to your own app, which
only you will ever authorise.

> **Order matters.** A refresh token minted while the app was still in Testing
> keeps its 7-day expiry — publishing later does not extend it. If you already
> generated one, redo step 2.4 to mint a fresh one.

---

### Step 2.3 — Create the OAuth client

1. **APIs & Services → Credentials** → **Create credentials** → **OAuth client ID**.
2. Application type: **Web application**
3. Name: `Digital Library Admin`
4. Under **Authorised redirect URIs** → **Add URI**:

   ```
   https://developers.google.com/oauthplayground
   ```

   This must match exactly — no trailing slash.
5. **Create**. Copy the **Client ID** and **Client secret**.
6. Put them in `admin/.env.local`:

   ```
   GOOGLE_CLIENT_ID=....apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=GOCSPX-....
   ```

---

### Step 2.4 — Get the refresh token

1. Open **https://developers.google.com/oauthplayground**
2. Click the **⚙ gear** (top right) → tick **Use your own OAuth credentials**
   → paste your Client ID and Client secret → close the panel.
3. In the left list, scroll to **Drive API v3** and tick **only**:

   ```
   https://www.googleapis.com/auth/drive.file
   ```

4. Click **Authorise APIs** → choose your Google account → **Continue** through
   the "Google hasn't verified this app" warning (it is your own app) → **Allow**.
5. Back in the playground, click **Exchange authorisation code for tokens**.
6. Copy the **Refresh token** (starts with `1//`) into `admin/.env.local`:

   ```
   GOOGLE_REFRESH_TOKEN=1//0g....
   ```

> 🔐 The refresh token grants ongoing access to files this app creates in your
> Drive. Treat it like a password — it is gitignored, never paste it publicly.

---

### Step 2.5 — Create the books folder

From the `admin` directory:

```bash
node --env-file=.env.local scripts/setup-drive-folder.js
```

It prints a line like:

```
GOOGLE_DRIVE_FOLDER_ID=1AbC2dEfGh3IjKlMnOpQrStUvWxYz
```

Add that to `admin/.env.local`. Re-running the script is safe — it reuses the
existing folder rather than creating duplicates.

> The script creates the folder rather than you picking one by hand, because
> the narrow `drive.file` scope cannot see folders it did not create.

---

### Step 2.6 — Checklist

- [ ] Drive API enabled on `digital-library-ruth-puaf`
- [ ] Consent screen configured with the `drive.file` scope
- [ ] Consent screen **published** (not left in Testing)
- [ ] OAuth client created with the playground redirect URI
- [ ] All four `GOOGLE_*` values in `admin/.env.local`

## 3. Vercel

_Added once the admin panel is built._
