# Marine Layer website

A one-page site for a California-licensed cosmetologist in San Francisco. Visitors can see services and prices and book an appointment. There's also a small owner area: one page lists booked appointments, and another lets you edit the site's details.

It's plain HTML, CSS and JavaScript. There's nothing to install or build.

## Look at it on your computer

The site needs to be opened through a small local web server, not by double-clicking the file. Either of these works from inside this folder:

```
python -m http.server 8000
```
or
```
npx serve .
```

Then open http://localhost:8000 in your browser. Stop the server with Ctrl+C when you're done.

## The owner area

The footer of the public site has a quiet "Owner area" link. The owner area has two pages, linked to each other at the top:

- **Appointments** (`appointments.html`): upcoming appointments by day, with a way to cancel one.
- **Edit site** (`owner.html`): a form for everything the site says. No coding needed.

**Neither page has a login yet.** Anyone who finds the address can open them, so keep it to yourself, and add a login before the site holds real client details.

## Edit the site's details (the Edit site page)

Open `owner.html` (or follow "Owner area", then "Edit site"). The page is split into sections, with links at the top or side:

- **Business:** name, descriptor line, your name, the sentence at the top, the About text (leave a blank line between paragraphs) and the heading above the photo row.
- **Location and contact:** city, neighborhood, street address, phone, email, Instagram and license number. All optional. A blank field is hidden on the site. Everything here is public.
- **Hours:** open or closed for each day, with opening and closing times, plus single days off. Changing hours never removes appointments that are already booked.
- **Booking rules and policies:** minimum notice, how far ahead clients can book, the buffer after each appointment, how often start times are offered, the cancellation policy, the policy list and the price note.
- **Services:** select a service to edit its name, description, length, price, "from" price and group. You can add, remove (with a confirm step) and move services up and down, and rename the groups. You also choose which service the "Next open appointments" block at the top of the home page uses. Appointments already booked keep the name, length and price they were booked with, even if you change or remove the service.
- **Photos:** each photo is an image address plus a short description, with a small preview. You can type a web address (starting with https://) or the path to your own file. To use your own photos, put the files in a folder called `images` next to `index.html` and type, for example, `images/my-photo.jpg`.

When you change anything, a bar at the bottom says **Unsaved changes**. Select **Save changes** to save, or **Discard changes** to go back to the last saved version. If something needs fixing, the page says exactly what and moves you to it. Some things are only notes (for example a photo with no description) and don't stop you saving. The browser warns you if you try to leave with unsaved changes.

### "Saved only in this browser": what that means

There's no server behind the site yet, so **Save changes stores your edits in the browser you're using**, on that one device. You see your changes on the public site in that browser straight away, but:

- visitors on their own phones and computers **still see the original details** from `js/config.js`;
- if you clear your browser data, or switch to another browser or device, your edits aren't there.

The Edit site page says this at the top.

### Make your changes permanent: the settings file

At the end of the Edit site page, **Download settings file** saves a file called `config.js` with all your saved details. To make them permanent for every visitor:

1. Save your changes on the Edit site page.
2. Select **Download settings file**.
3. Replace `js/config.js` on the site with the downloaded file (or send it to whoever looks after the site).

The file is ordinary, commented JavaScript, so it can still be edited by hand. Settings that aren't on the form, such as preview mode and the time zone, are copied over unchanged.

**Reset to original** (also at the end of the page) removes every change saved in this browser and goes back to what `js/config.js` says. It asks you to confirm first. Appointments aren't affected.

## Change the words, prices and hours by hand

If you'd rather edit the file directly: almost everything the site says lives in **`js/config.js`**. Open it in any text editor (Notepad works) and change the text between the quote marks. Save, then reload the page. (Edits saved on the Edit site page in a browser take priority in that browser. Use **Reset to original** there to see the file's version.)

- **Business name and tagline:** `businessName`, `descriptor`, `heroSentence`.
- **Your name:** `ownerName`. Left as `""`, it doesn't appear anywhere.
- **About text:** `about`. Each line in quotes is one paragraph. The current text is a draft that only says what's known for sure. Rewrite it in your own words.
- **Address, phone, email, Instagram:** `neighborhood`, `streetAddress`, `phone`, `email`, `instagram`. Any field left as `""` simply doesn't show.
- **License number:** `licenseNumber`. The footer always says "California cosmetology license" and adds the number once you fill it in. California asks licensees to display their Board of Barbering and Cosmetology license, so fill this in before launch.
- **Hours:** `hours`. Use the 24-hour clock ("10:00" is 10 am, "18:00" is 6 pm). Set a day to `null` to close it. For single days off, add dates to `closedDates`, e.g. `["2026-12-25"]`.
- **Booking rules:** `booking`. These set the 15-minute start-time grid, the cleanup buffer after each appointment, the minimum notice (12 hours) and how far ahead people can book (60 days).
- **Policies:** `cancellationPolicy` (shown on the confirmation screen) and `policies` (shown in the Visit section).
- **Services and prices:** `serviceGroups`. Each service has a `name`, `minutes`, `price`, `priceFrom` (true shows "from $110") and a one-line `description`. To add a service, copy a line and give it a new, unique `id`. Don't change the `id` of a service people have already booked.

## Photos: replace them before launch

All the photos on the site right now are **placeholder stock photos from Pexels**. None of them show the owner or the owner's clients, and they mustn't be presented as anyone's portfolio.

Before the site goes live:

1. Replace the hero photo, the six photos in the photo row and the About portrait, either on the Edit site page (Photos section) or in `js/config.js` (`heroImage`, `gallery`, `portrait`).
2. Use only your own photos. The photo row should show only your own clients' results, with their permission.
3. Put image files in the site folder (e.g. an `images` folder) and point `src` at them, such as `"images/balayage-1.jpg"`. Always fill in `alt` with a short description of the photo.

To remove a photo, set it to `null`. To remove the photo row, empty the list: `gallery: []`. The layout still looks finished without any photos, and if an image ever fails to load, a plain grey-blue block shows in its place.

## What "preview mode" means

`previewMode: true` in the config means **bookings are saved only in the browser they were made in** (using the browser's local storage). That's fine for trying the site out, but it means:

- A booking made on a client's phone **never reaches you**. It only exists on that phone.
- The appointments page only shows bookings made in the same browser you're using.
- No emails or texts are sent to anyone. The confirmation screen says so.

While preview mode is on, a small notice saying this appears on the booking section and on the appointments page.

## The appointments page

`appointments.html` (in the owner area) lists upcoming appointments by day with the client's details, lets you cancel one (with a confirm step), and folds past and cancelled appointments underneath. Every appointment is shown, even one that now falls outside your working hours or is for a service you've since removed.

**It has no login in this version.** Anyone who finds the address can see it. Add a login before real client details are stored there.

## What's needed to go live

1. **A real booking backend.** Bookings need to be stored on a server so that every visitor's booking reaches you and everyone sees the same open times. Firebase (Firestore), Supabase, or a small API of your own all work. Only `js/store.js` has to change: write an object with the same three methods (`listBookings`, `createBooking`, `cancelBooking`) and set it as `window.BookingStore`. The backend must also refuse a booking that overlaps an existing one, because the check in the browser can't see other people's bookings.
2. **A login for the owner area** (appointments and Edit site), through the same backend.
3. **Settings that reach everyone.** Either replace `js/config.js` with the downloaded settings file whenever you make changes, or connect the Edit site page to the backend (only `js/settings.js` has to change; see below).
4. **Confirmation messages**, if you want them: an email or text sent by the backend when a booking is created. Until that exists, the site doesn't claim one was sent.
5. **Your own details**: name, license number, contact details, real hours and prices.
6. **Your own photos** in place of the placeholders (see above).
7. Set `previewMode: false` once the backend is connected.
8. **Hosting.** Any static host works (Netlify, Cloudflare Pages, GitHub Pages, or your own server).

## For developers

- `js/scheduling.js`: pure availability logic (no DOM). It works in business wall-clock time (America/Los_Angeles). Dates are "YYYY-MM-DD" keys built from numbers and times are minutes after midnight, so the visitor's own time zone never shifts a day. It also builds the `.ics` calendar file.
- `js/store.js`: booking storage adapter (localStorage now).
- `js/settings.js`: the owner's edits. It loads right after `js/config.js` on every page, keeps the file's values as `window.SITE_DEFAULTS`, and replaces `window.SITE` with the defaults plus any saved edits. The merge is defensive: a saved value of the wrong type or shape falls back to the default for that field, arrays are replaced whole, and settings the form can't edit (`previewMode`, `timeZone`, `currency`) always come from the file. It also holds the pure helpers (validation, normalising phone/Instagram/image addresses, and `generateConfigFile`) and `window.SettingsStore`, an async adapter (`load`, `save`, `reset`, plus a synchronous `peek` used once at page load) backed by localStorage. To use a backend, replace `SettingsStore`. Because the public pages need settings before they render, the simplest backend version regenerates `js/config.js` on the server when the owner saves.
- `js/booking.js`: booking flow and the "Next open appointments" block.
- `js/site.js`: renders everything from the config and holds shared display helpers. Everything typed by the owner or a client is rendered as text, never HTML, and links are built with fixed schemes (`tel:`, `mailto:`, `https://www.instagram.com/`). Image addresses must be http(s) or a relative path.
- `js/appointments.js`: appointments page.
- `js/owner.js`: Edit site page.
- Tests: `node tests/scheduling.test.js` and `node tests/settings.test.js` (no dependencies).

Minimum notice is measured in wall-clock hours, so on the two nights a year when the clocks change it can be off by an hour.
