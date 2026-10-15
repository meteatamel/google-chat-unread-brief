# Build an Automated "Unread Messages Brief" in Google Chat (Workspace Studio + Apps Script)

## Motivation

Coming to work every morning often means facing a wall of unread Google Chat messages from the night before across colleagues in different time zones. Skimming through every space and thread to catch up and mark them as read takes time.

Instead, this guide shows you how to build an automated **Unread Messages Brief** directly inside Google Chat—powered by **Google Workspace Studio** (`studio.workspace.google.com`) and a **Google Apps Script Custom Step** (with zero Google Cloud Console setup required)—so a high-level summary of your unread messages is ready for you every morning and on demand whenever you want it:

- **Daily 7:45 AM Scheduled Brief**: Automatically summarizes your unread messages from the last 24 hours (top-level messages and threads you follow, without marking them as read) and posts a clean bulleted brief with clickable space links into your private **`Unread Messages Brief`** space each weekday morning.
- **On-Demand Trigger (`/briefnow`)**: Type `/briefnow` in your **`Unread Messages Brief`** space anytime during the day to generate a fresh summary on demand.

---

## Step 1: Create Your Private Space in Google Chat

1. Open [Google Chat](https://chat.google.com).
2. Click **New chat** (`+`) → **Create a space**.
3. Name the space **`Unread Messages Brief`** (keep it private with just yourself).

---

## Step 2: Set Up & Install the Apps Script Custom Step

1. Go to [script.google.com](https://script.google.com) and click **New project** (name it `Unread Messages Brief`).
2. Enable the manifest file:
   - Click **Project Settings** (⚙️ icon on the left sidebar).
   - Check the box **"Show 'appsscript.json' manifest file in editor"**.
3. Copy the files from this repository into the editor:
   - Click **Editor** (`< >` icon on the left sidebar).
   - Open `appsscript.json` and replace its contents with [`appsscript.json`](./appsscript.json).
   - Open `Code.gs` and replace its contents with [`Code.gs`](./Code.gs).
   - Click **Save** (💾).
4. **Authorize the Script in Apps Script**:
   - In the top toolbar dropdown (next to **Run** / **Debug**), select `onExecuteFetchUnread` and click **Run**.
   - Approve the Google OAuth permissions prompt when asked.
5. **Install Test Deployment for Workspace Studio**:
   - Click **Deploy** (top right) → **Test deployments**.
   - Next to **Application(s): Google Workspace Add-on**, click **Install**.
   - Click **Done**.

---

## Step 3: Build the On-Demand Flow in Google Workspace Studio

Open [Google Workspace Studio](https://studio.workspace.google.com) (refresh the page if it was already open so your newly installed **Unread Messages Brief** custom step appears).

> [!NOTE]
> Workspace Studio displays each output variable using its `description` from [`appsscript.json`](./appsscript.json) (for example, `unreadMessagesText` appears in the **`+ Variables`** picker under **`Fetch Unread Chat Messages` → `Formatted unread messages and space links ready...`**).

1. Click **New flow** (name it `Unread Messages Brief`).
2. **Starter**:
   - Select **Chat → When I get a chat message**.
   - **Conversation type**: Choose **Spaces & named group DMs**.
   - **Spaces**: Select **`Unread Messages Brief`**.
   - Enter `/briefnow` in **"Message has"** field and choose **"Match text exactly"**.
3. **Step 2 (Chat — Post in a space — Progress Indicator)**:
   - Click **+ Add step** → **Chat → Post in a space**.
   - Select your **`Unread Messages Brief`** space.
   - In the **Message** box, paste:
     ```text
     ⏳ _Scanning unread messages and generating your brief. Please wait..._
     ```
4. **Step 3 (Custom Step — Fetch Unread)**:
   - Click **+ Add step** → scroll to **Unread Messages Brief** → select **Fetch Unread Chat Messages**.
   - Set **Exclude Space Name or ID** to `Unread Messages Brief`.
   - Set **Max Lookback Window (Hours)** to `24`.
5. **Step 4 (Built-in Gemini Step — Summarize)**:
   - Click **+ Add step** → select **Ask Gemini with skills**.
   - Paste the prompt text below into the prompt box:
     ```text
     Provide a high-level summary of my unread Google Chat messages below, formatted as a bulleted list grouped by Space.
     - If the input says NO_UNREAD_MESSAGES, just reply: "🎉 You're all caught up! No unread Google Chat messages."
     - Format each Space as a bullet point starting with the Space name in bold (* **Space Name**:) followed by an overall summary whose length is proportional to the discussion (keep it brief for 1–2 messages, and more detailed for longer discussions).
     - Mention key people's names naturally in bold using double asterisks (e.g. **Aaron**), without overdoing it. If there is only 1 message and no sender name is shown, say "One person discussing/asking about...".
     - At the end of each Space's bullet item, include a clickable chat icon linked to its exact Link from the input: [💬](https://chat.google.com/room/...).
     - Do not add any concluding remarks or trailing blank lines after the last bullet item.

     Unread Messages Data:
     ```
   - With your cursor on the last line (under `Unread Messages Data:`), click the **`+ Variables`** button on the input box and select **`Step 3: Fetch Unread Chat Messages` → `Formatted unread messages and space links ready...`** *(it will appear as a clickable pill/chip—do not type it as plain text)*.
6. **Step 5 (Chat — Post in a space)**:
   - Click **+ Add step** → **Chat → Post in a space**.
   - Select your **`Unread Messages Brief`** space.
   - Build the **Message** box as follows:
     1. Paste the title at the top and press Enter twice:
        ```text
        ☕ *Unread Messages Brief*
        ```
     2. Click **`+ Variables`** → select **`Step 4: Ask Gemini with skills` → `Content created by Gemini`** and press Enter twice.
     3. Paste the footer:
        ```text
        💡 _`/briefnow` to refresh summary_
        ```
7. Click **Turn on**.

---

## Step 4: Test Your Flow in Google Chat

1. **Mark a Chat Conversation as Unread**:
   - In Google Chat, hover over any space or DM (other than `Unread Messages Brief`), click **`⋮`**, and select **Mark as unread**.
2. **Trigger the Summary Manually in Chat**:
   - Open your **`Unread Messages Brief`** space and send the message:
     ```text
     /briefnow
     ```
   - Immediately, **Step 2** posts `⏳ Scanning unread messages and generating your brief. Please wait...`, and then **Step 5** posts your **☕ Unread Messages Brief** with bold space names, high-level summaries, bolded sender names, and a clickable `💬` link at the end of each space summary.
3. **Verify Unread Badges Are Still Intact**:
   - Look at your Google Chat sidebar—the summarized conversations remain **unread**, and clicking any space link jumps straight to that space.

---

## Step 5: Schedule Your Daily 7:45 AM Brief

Once your `/briefnow` flow is working, create the daily morning schedule by making a copy of the flow (since Workspace Studio only allows one Starter per flow):

1. In your Workspace Studio **My flows** list, click **More (`⋮`)** next to `Unread Messages Brief` and select **Make a copy**.
2. Rename it to `Unread Messages Brief - Scheduled`.
3. Change the **Starter** at the top to **Schedule** → **Every weekday at 7:45 AM** (and delete the `⏳` progress step in Step 2 so it only posts the finished brief), then click **Turn on**.

---

## Notes & Design Decisions

1. **Why not just use Google Chat's built-in "Ask Gemini" tab?**
   - You can ask the **Ask Gemini** tab in Google Chat to summarize your unread messages, but it includes *all* unread messages across every background thread—whereas this flow filters strictly for **top-level unread messages** and **messages from threads you actively follow**.
   - Additionally, there is no way to schedule automatic daily summaries in the **Ask Gemini** tab.
2. **Why isn't there a "Mark all unread messages as read" command?**
   - While reading unread state (`spaces.list`, `messages.list`, `getSpaceReadState`, `getThreadReadState`) works out of the box with Apps Script's default project, the Google Chat API blocks write calls (`updateSpaceReadState`) unless you create, link, and configure a Google Cloud project in the Cloud Console. Keeping it read-only avoids any Google Cloud project setup.
