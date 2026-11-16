# Connecting WIFT to Google Sheets (one-time, ~10 minutes)

WIFT pushes the accountant export straight into a Google Sheet. Google requires each app
to have its own sign-in "client". You make one once, paste two values into WIFT, and you're done.

WIFT asks for the `drive.file` permission only. It can see and edit **only the spreadsheet it
creates**: nothing else in your Drive.

## 1. Create a Google Cloud project
1. Go to <https://console.cloud.google.com/> and sign in with the Google account that should own the spreadsheet.
2. At the top, click the project picker, then **New project**. Name it `WIFT` and click **Create**.

## 2. Turn on the two APIs
In the search bar, open each of these and click **Enable**:
- **Google Sheets API**
- **Google Drive API**

## 3. Set up the consent screen
1. Go to **APIs & Services → OAuth consent screen** (it may be called **Google Auth Platform → Branding**).
2. App name: `WIFT`. User support email: yours. Developer contact: yours. Save.
3. **Audience**: choose **External**, and under **Test users** add your own Gmail address.
   (Leaving the app in "Testing" is fine for a single shop. Google may ask you to sign in again every 7 days while it stays in Testing.
   To stop that, click **Publish app**. For the `drive.file` scope, Google does not require a review.)

## 4. Create the client
1. Go to **APIs & Services → Credentials → Create credentials → OAuth client ID**.
2. Application type: **Desktop app**. Name: `WIFT desktop`. Click **Create**.
3. Copy the **Client ID** and **Client secret**.

## 5. Connect in WIFT
1. Open WIFT → **Settings → Google Sheets**.
2. Paste the Client ID and Client secret, then click **Save settings**.
3. Click **Connect Google account**. Your browser opens Google's sign-in. Pick your account and allow access.
   (While the app is in Testing you'll see "Google hasn't verified this app". Click **Continue**.)
4. Back in WIFT it shows **Connected**.

## 6. First push
**Export → Push to Google Sheets** creates a spreadsheet called "<Shop name>: WIFT accounting" with four tabs:
Jobs, Labor, Parts and Monthly summary. Click **Open the spreadsheet** and use Google's **Share** button to give your
accountant access, once. Every later push rewrites those tabs with the date range you picked.

If you delete the spreadsheet, the next push simply makes a new one.
