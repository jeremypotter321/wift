# Connecting Copper Calibration to Google Calendar (one-time, ~10 minutes)

The app copies appointments to the shop's business Google Calendar. Google requires each app to have its own
sign-in "client". You make one once, paste two values into the app, and you're done.

The app asks for `calendar.events`: it can add, change and remove events on your calendars, and nothing else
(it can't read your mail or change calendar settings or sharing). It also asks for `drive.file`, which only covers
spreadsheets the app itself creates.

## 1. Create a Google Cloud project
1. Go to <https://console.cloud.google.com/> and sign in with the **business** Google account.
2. At the top, click the project picker, then **New project**. Name it `Copper Calibration` and click **Create**.

## 2. Turn on the API
In the search bar, open **Google Calendar API** and click **Enable**.

## 3. Set up the consent screen
1. Go to **APIs & Services → OAuth consent screen** (it may be called **Google Auth Platform → Branding**).
2. App name: `Copper Calibration`. User support email: yours. Developer contact: yours. Save.
3. **Audience**: choose **External**, and under **Test users** add the business Gmail address.
   (Leaving the app in "Testing" is fine for a single shop, but Google may ask you to sign in again every 7 days.
   To stop that, click **Publish app**.)

## 4. Create the client
1. Go to **APIs & Services → Credentials → Create credentials → OAuth client ID**.
2. Application type: **Desktop app**. Name: `Copper Calibration desktop`. Click **Create**.
3. Copy the **Client ID** and **Client secret**.

## 5. Connect in the app
1. Open the app → **Settings → Google Calendar**.
2. Paste the Client ID and Client secret, then click **Save settings**.
3. Click **Connect Google account**. Your browser opens Google's sign-in. Pick the business account and allow access.
   (While the app is in Testing you'll see "Google hasn't verified this app". Click **Continue**.)
4. Back in the app it shows **Connected**. If it says "Connected without Calendar access", the account was connected
   before Calendar was added: click **Disconnect**, then **Connect Google account** again.

## 6. Turn it on
1. Leave **Calendar ID** as `primary` (the account's main calendar), or paste another calendar's ID from
   Google Calendar → that calendar's **Settings → Integrate calendar**.
2. Tick **Copy appointments to Google Calendar as they're saved** and **Save settings**.
3. Click **Copy all appointments now** once to bring over everything from the last 30 days onward.

From then on, saving an appointment updates its event and cancelling one removes it. Changes made in Google Calendar
don't come back to the app.
