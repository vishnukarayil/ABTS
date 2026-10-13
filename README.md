# Blood donor register: setup notes

Two files go live: `index.html` (the page, free static hosting) and `Code.gs` (the backend, a Google Apps Script attached to a Google Sheet).

## 1. Backend (10 minutes)

1. Create a new Google Sheet in an account Ahalia controls (not a volunteer's personal login). Name it e.g. "Donor register".
2. **Extensions > Apps Script**. Delete the sample code, paste in `Code.gs`, save.
3. Choose the function `setup` in the toolbar and click **Run**. Approve the permissions. This creates the `Registrations` and `FutureHeroes` tabs.
4. **Deploy > New deployment > type: Web app**. Execute as: **Me**. Who has access: **Anyone**. Deploy and copy the **Web app URL** (ends in `/exec`).
5. If you change `Code.gs` later, use **Deploy > Manage deployments > Edit > New version**. Saving alone does not update the live URL.

## 2. Page

Open `index.html` in a text editor and fill in the `CONFIG` block at the top of the script:

| Setting | What to put |
|---|---|
| `API_URL` | the `/exec` URL from step 4 |
| `EVENT_NAME` | e.g. `the Organ Donation Conference` (used mid-sentence, so keep it lowercase "the") |
| `CONTACT` | an email or phone shown in the consent text and footer for questions and data deletion |
| `PAGE_URL` | the final address, e.g. `https://donate.pathonotes.in/` (used for share links) |
| `ORGAN_PLEDGE_URL` | optional: the official organ pledge page, shown as a separate link. Check the current official portal before using |
| `COLLEGES` | must match `COLLEGES` in `Code.gs` exactly |

Until `API_URL` is set, the page runs in **demo mode**: everything works, nothing is saved, and the leaderboard shows sample data.

## 3. Hosting on Cloudflare Pages (free)

1. Cloudflare dashboard > **Workers & Pages > Create > Pages > Upload assets**.
2. Name the project, drag in a folder containing only `index.html`, deploy. You get `something.pages.dev`.
3. **Custom domain**: in the project, **Custom domains > Set up a domain**, enter `donate.pathonotes.in`. If pathonotes.in's DNS is not on Cloudflare, add a CNAME record at your DNS provider pointing `donate` to your `something.pages.dev` address.
4. To update the page, upload a new `index.html` as a new deployment.

(GitHub Pages or Netlify work the same way: put `index.html` in a repo or folder and publish.)

## 4. Addresses to use

- Donor page: `https://donate.pathonotes.in/?src=qr` (put different `src` values on different placements: `?src=nfc`, `?src=poster-hall`, `?src=programme`)
- **Live leaderboard for the stall screen**: `https://donate.pathonotes.in/?view=board` (refreshes every 20 seconds, aggregated counts only)
- Write the **short `donate.pathonotes.in` address** into the QR and NFC tags, not the `pages.dev` one, so you can move hosting later without rewriting tags.

NFC: write a URL record with a free phone app, then lock the tag (write-protect). QR is the fallback on all signage.

## 5. Test before the event

- [ ] Full run on one iPhone and two Android phones, on mobile data.
- [ ] Register with a test number; check the row in the Sheet. Register the same number again: it should say "already on the register" and add no second row.
- [ ] Answer "No" to "Are you 18 or older?": confirm the Sheet's `FutureHeroes` tab gets only a college and no personal data.
- [ ] Open `?view=board` on the stall screen and confirm counts move.
- [ ] Referral: open a registrant's share link (`?ref=CODE`) on another phone, register, then tap "Check my level" on the first phone.
- [ ] Switch a phone to airplane mode, register, turn it back on: the page should save the registration automatically.
- [ ] Get about 20 people to submit at the same moment. The backend queues them with a lock; everything should arrive.

## 6. Data handling

- **Under-18s**: the page stores no name or number for them. It only adds one to their college's Future Hero count. This is deliberate, because consent for minors' data needs a parent or guardian.
- **Consent** is a separate, unticked checkbox with a stated purpose. Keep `CONTACT` real so people can ask for deletion.
- The Sheet holds names and mobile numbers: share it with as few people as possible and download or delete it once the follow-up drive is done.
- Eligibility answers are not stored, only the outcome (`eligible`, `reserve`, `future`). The stored blood group is self-reported and shown as "confirmed at first donation".
- The eligibility questions are a pre-screen only. Have your medical officer check them against Ahalia's donor selection SOP before printing anything; edit the `ELIG` list in `index.html` if the thresholds or wording differ.

## Limits to know

- Apps Script handles a few hundred registrants over a day comfortably. Its URL is public, so the backend validates every field and ignores bots (honeypot field), but a determined person could still send fake rows. Spot-check the Sheet.
- Levels: **Rookie** = finished the quiz, **Lifesaver** = registered, **Champion** = 3 friends registered through your link, **Future Hero** = under 18 or below the weight limit.
