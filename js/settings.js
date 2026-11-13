/*
  Settings: the owner's edits, layered over the defaults in js/config.js.

  Load order on every page:
    js/config.js    -> window.SITE (the defaults)
    js/settings.js  -> keeps those as window.SITE_DEFAULTS and replaces
                       window.SITE with defaults + saved edits
    everything else reads window.SITE as before

  Two parts:
  1. Pure functions (no DOM, loadable in Node via require):
       mergeSettings(defaults, saved)  -> effective settings, defensive
       toForm(settings)                -> plain values for the edit form
       validateForm(form)              -> { errors, warnings } keyed by field path
       fromForm(form)                  -> clean saved settings (editable fields only)
       generateConfigFile(effective)   -> text of a complete js/config.js
       normalizePhone / normalizeInstagram / isSafeImageSrc / ...
  2. In the browser: window.SettingsStore, an async adapter
       load()          -> Promise<saved settings or null>
       save(settings)  -> Promise<saved settings>
       reset()         -> Promise<void>
     plus peek(), a synchronous read used once at page load.
     Right now it uses this browser's localStorage. To go live, replace
     SettingsStore with one that talks to a backend. Because the public
     pages need the settings before they render, a backend version should
     either provide peek() from a cached copy or (simpler) regenerate
     js/config.js on the server whenever the owner saves.
*/
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.Settings = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var VERSION = 1;
  var DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  var SLOT_CHOICES = [5, 10, 15, 20, 30, 60];

  // Fields the owner can change. Everything else (previewMode, timeZone,
  // currency...) always comes from js/config.js.
  var STRING_FIELDS = [
    "businessName", "descriptor", "heroSentence", "ownerName", "galleryTitle",
    "city", "neighborhood", "streetAddress", "phone", "email", "instagram",
    "licenseNumber", "cancellationPolicy", "priceNote"
  ];
  var REQUIRED_STRINGS = ["businessName"];
  var EDITABLE_KEYS = STRING_FIELDS.concat([
    "about", "hours", "closedDates", "booking", "policies", "serviceGroups",
    "heroImage", "gallery", "portrait"
  ]);

  /* ---------- Small helpers ---------- */

  function copy(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
  function isObject(v) { return v !== null && typeof v === "object" && !Array.isArray(v); }
  function isString(v) { return typeof v === "string"; }
  function str(v) { return v == null ? "" : String(v); }
  function trim(v) { return str(v).trim(); }
  function isInt(n) { return typeof n === "number" && isFinite(n) && Math.floor(n) === n; }

  function parseTimeValue(v) {
    var m = /^(\d{2}):(\d{2})$/.exec(str(v));
    if (!m) return null;
    var h = +m[1], mm = +m[2];
    if (h > 23 || mm > 59) return null;
    return h * 60 + mm;
  }

  function isDateKey(v) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str(v));
    if (!m) return false;
    var d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
  }

  // Whole number from a number or a string of digits; NaN otherwise.
  function toInt(v) {
    if (typeof v === "number") return isInt(v) ? v : NaN;
    var s = trim(v);
    return /^-?\d+$/.test(s) ? parseInt(s, 10) : NaN;
  }

  // Price from a number or a string like "95", "95.50" or "$95".
  function toPrice(v) {
    if (typeof v === "number") return isFinite(v) ? v : NaN;
    var s = trim(v).replace(/^\$/, "").replace(/,/g, "");
    return /^-?\d+(\.\d{1,2})?$/.test(s) ? parseFloat(s) : NaN;
  }

  /* ---------- Normalising and checking single values ---------- */

  function phoneDigits(v) { return str(v).replace(/\D/g, ""); }

  // "4155550123", "415.555.0123", "+1 415 555 0123" -> "(415) 555-0123"
  // Returns "" for empty, null if it isn't a US number.
  function normalizePhone(v) {
    var s = trim(v);
    if (!s) return "";
    if (/[a-z]/i.test(s)) return null;
    var d = phoneDigits(s);
    if (d.length === 11 && d.charAt(0) === "1") d = d.slice(1);
    if (d.length !== 10) return null;
    return "(" + d.slice(0, 3) + ") " + d.slice(3, 6) + "-" + d.slice(6);
  }

  // "name", "@name", "instagram.com/name", "https://www.instagram.com/name/?hl=en" -> "name"
  // Returns "" for empty, null if it isn't a valid Instagram name.
  function normalizeInstagram(v) {
    var s = trim(v);
    if (!s) return "";
    var url = /^(?:https?:\/\/)?(?:www\.)?instagram\.com\/([^\/?#]+)\/?(?:[?#].*)?$/i.exec(s);
    if (url) s = url[1];
    s = s.replace(/^@/, "");
    return /^[A-Za-z0-9._]{1,30}$/.test(s) ? s : null;
  }

  function emailProblem(v) {
    var s = trim(v);
    if (!s) return "";
    if (/\s/.test(s)) return "Remove the space from the email address.";
    var at = s.indexOf("@");
    if (at === -1) return "Add the @ to the email address, for example hello@example.com.";
    if (s.indexOf("@", at + 1) !== -1) return "Use only one @ in the email address.";
    if (at === 0) return "Add the part before the @, for example hello@example.com.";
    var domain = s.slice(at + 1);
    if (!/^[^.@]+(\.[^.@]+)+$/.test(domain) || /\.[a-z]?$/i.test(domain)) {
      return "Finish the part after the @, for example example.com.";
    }
    if (/[<>"'()\\,;:]/.test(s)) return "Remove the symbols that can't be in an email address, such as < > ( ) , ; :";
    return "";
  }

  // Only web addresses (http/https) or paths inside the site folder.
  function isSafeImageSrc(v) {
    var s = trim(v);
    if (!s) return false;
    if (/^https?:\/\/[^\s"'<>\\]+$/i.test(s)) return true;
    // relative path: no scheme (javascript:, data:, file:, C:), no //host, no backslashes or quotes
    if (/^[a-z][a-z0-9+.\-]*:/i.test(s)) return false;
    if (/^\/\//.test(s)) return false;
    return /^[^"'<>\\`]+$/.test(s) && /[A-Za-z0-9]/.test(s);
  }

  /* ---------- Merging saved edits over defaults ---------- */

  function cleanImage(value) {
    if (!isObject(value) || !isSafeImageSrc(value.src)) return undefined;
    var out = { src: trim(value.src), alt: isString(value.alt) ? value.alt : "" };
    if (isString(value.source) && /^https?:\/\//i.test(value.source)) out.source = value.source;
    return out;
  }

  function cleanDay(value) {
    if (value === null) return null;
    if (!isObject(value)) return undefined;
    var o = parseTimeValue(value.open), c = parseTimeValue(value.close);
    if (o === null || c === null || c <= o) return undefined;
    return { open: value.open, close: value.close };
  }

  function cleanService(s) {
    if (!isObject(s)) return null;
    if (!isString(s.id) || !trim(s.id)) return null;
    if (!isString(s.name) || !trim(s.name)) return null;
    if (!isInt(s.minutes) || s.minutes < 5 || s.minutes > 600) return null;
    if (typeof s.price !== "number" || !isFinite(s.price) || s.price < 0) return null;
    return {
      id: s.id,
      name: s.name,
      minutes: s.minutes,
      price: s.price,
      priceFrom: s.priceFrom === true,
      description: isString(s.description) ? s.description : ""
    };
  }

  function cleanGroups(value) {
    if (!Array.isArray(value)) return undefined;
    var seen = {};
    var groups = [];
    value.forEach(function (g) {
      if (!isObject(g) || !isString(g.name) || !Array.isArray(g.services)) return;
      var services = [];
      g.services.forEach(function (s) {
        var clean = cleanService(s);
        if (clean && !seen[clean.id]) { seen[clean.id] = true; services.push(clean); }
      });
      groups.push({ name: g.name, services: services });
    });
    // Saved something, but none of it was usable: keep the defaults.
    if (value.length && !groups.length) return undefined;
    return groups;
  }

  function stringList(value) {
    if (!Array.isArray(value)) return undefined;
    return value.filter(isString);
  }

  /*
    defaults: the object from js/config.js
    saved:    whatever was stored (may be null, old, partial or garbage)
    Returns a complete settings object. Any saved value that is the wrong
    type or shape is ignored and the default is used for that field.
  */
  function mergeSettings(defaults, saved) {
    var out = copy(defaults) || {};
    if (!isObject(saved)) return finish(out);

    STRING_FIELDS.forEach(function (key) {
      if (!(key in saved) || !isString(saved[key])) return;
      if (REQUIRED_STRINGS.indexOf(key) !== -1 && !trim(saved[key])) return;
      out[key] = saved[key];
    });
    if ("instagram" in saved && isString(saved.instagram)) {
      var ig = normalizeInstagram(saved.instagram);
      out.instagram = ig === null ? (defaults.instagram || "") : ig;
    }

    var about = stringList(saved.about);
    if (about) out.about = about;

    if (isObject(saved.hours)) {
      out.hours = copy(defaults.hours) || {};
      DAYS.forEach(function (day) {
        if (!(day in saved.hours)) return;
        var clean = cleanDay(saved.hours[day]);
        if (clean !== undefined) out.hours[day] = clean;
      });
    }

    if (Array.isArray(saved.closedDates)) {
      out.closedDates = saved.closedDates.filter(isDateKey)
        .filter(function (d, i, all) { return all.indexOf(d) === i; }).sort();
    }

    if (isObject(saved.booking)) {
      var b = saved.booking, rules = out.booking = copy(defaults.booking) || {};
      if (SLOT_CHOICES.indexOf(b.slotMinutes) !== -1) rules.slotMinutes = b.slotMinutes;
      if (isInt(b.bufferMinutes) && b.bufferMinutes >= 0 && b.bufferMinutes <= 120) rules.bufferMinutes = b.bufferMinutes;
      if (isInt(b.minNoticeHours) && b.minNoticeHours >= 0 && b.minNoticeHours <= 720) rules.minNoticeHours = b.minNoticeHours;
      if (isInt(b.maxDaysAhead) && b.maxDaysAhead >= 1 && b.maxDaysAhead <= 365) rules.maxDaysAhead = b.maxDaysAhead;
      if (isString(b.heroServiceId)) rules.heroServiceId = b.heroServiceId;
    }

    var policies = stringList(saved.policies);
    if (policies) out.policies = policies;

    var groups = cleanGroups(saved.serviceGroups);
    if (groups) out.serviceGroups = groups;

    ["heroImage", "portrait"].forEach(function (key) {
      if (!(key in saved)) return;
      if (saved[key] === null) { out[key] = null; return; }
      var img = cleanImage(saved[key]);
      if (img) out[key] = img;
    });

    if (Array.isArray(saved.gallery)) {
      out.gallery = saved.gallery.map(cleanImage).filter(Boolean);
    }

    return finish(out);
  }

  // Rules that must hold however the settings were produced.
  function finish(out) {
    var ids = allServices(out).map(function (s) { return s.id; });
    if (!out.booking) out.booking = {};
    if (ids.indexOf(out.booking.heroServiceId) === -1) out.booking.heroServiceId = ids[0] || "";
    if (out.instagram) {
      var ig = normalizeInstagram(out.instagram);
      out.instagram = ig || "";
    }
    return out;
  }

  function allServices(settings) {
    var list = [];
    (settings.serviceGroups || []).forEach(function (g) {
      (g.services || []).forEach(function (s) { list.push(s); });
    });
    return list;
  }

  // Only the editable part, for saving.
  function pickEditable(settings) {
    var out = {};
    EDITABLE_KEYS.forEach(function (key) {
      if (key in settings) out[key] = copy(settings[key]);
    });
    return out;
  }

  /* ---------- The edit form's model ---------- */

  function toForm(settings) {
    var hours = {};
    DAYS.forEach(function (day) {
      var h = settings.hours && settings.hours[day];
      hours[day] = h ? { open: true, from: h.open, to: h.close } : { open: false, from: "10:00", to: "18:00" };
    });
    var rules = settings.booking || {};
    function img(i) { return i ? { src: i.src || "", alt: i.alt || "", source: i.source || "" } : null; }
    return {
      businessName: str(settings.businessName),
      descriptor: str(settings.descriptor),
      ownerName: str(settings.ownerName),
      heroSentence: str(settings.heroSentence),
      aboutText: (settings.about || []).join("\n\n"),
      galleryTitle: str(settings.galleryTitle),
      city: str(settings.city),
      neighborhood: str(settings.neighborhood),
      streetAddress: str(settings.streetAddress),
      phone: str(settings.phone),
      email: str(settings.email),
      instagram: str(settings.instagram),
      licenseNumber: str(settings.licenseNumber),
      hours: hours,
      closedDates: (settings.closedDates || []).slice(),
      minNoticeHours: str(rules.minNoticeHours),
      maxDaysAhead: str(rules.maxDaysAhead),
      bufferMinutes: str(rules.bufferMinutes),
      slotMinutes: str(rules.slotMinutes || 15),
      heroServiceId: str(rules.heroServiceId),
      cancellationPolicy: str(settings.cancellationPolicy),
      policies: (settings.policies || []).slice(),
      priceNote: str(settings.priceNote),
      serviceGroups: (settings.serviceGroups || []).map(function (g) {
        return {
          name: str(g.name),
          services: (g.services || []).map(function (s) {
            return {
              id: s.id, name: str(s.name), description: str(s.description),
              minutes: str(s.minutes), price: str(s.price), priceFrom: !!s.priceFrom
            };
          })
        };
      }),
      heroImage: img(settings.heroImage),
      gallery: (settings.gallery || []).map(img),
      portrait: img(settings.portrait)
    };
  }

  var DAY_LABEL = {};
  DAYS.forEach(function (d) { DAY_LABEL[d] = d.charAt(0).toUpperCase() + d.slice(1); });

  function time12(v) {
    var m = parseTimeValue(v);
    if (m === null) return v;
    var h = Math.floor(m / 60), mm = m % 60;
    return (h % 12 === 0 ? 12 : h % 12) + ":" + (mm < 10 ? "0" : "") + mm + " " + (h < 12 ? "am" : "pm");
  }

  function durationText(minutes) {
    var h = Math.floor(minutes / 60), m = minutes % 60;
    if (!h) return m + " min";
    return h + " hr" + (m ? " " + m + " min" : "");
  }

  /*
    Checks the form. Returns { errors: {path: message}, warnings: {path: message} }.
    Paths look like "businessName", "hours.saturday.to",
    "serviceGroups.0.services.2.minutes", "gallery.1.src".
    Errors block saving; warnings don't.
  */
  function validateForm(form) {
    var errors = {}, warnings = {};
    function err(path, msg) { if (!errors[path]) errors[path] = msg; }
    function warn(path, msg) { if (!warnings[path]) warnings[path] = msg; }

    if (!trim(form.businessName)) err("businessName", "Enter a business name. It appears at the top of every page.");
    if (trim(form.businessName).length > 80) err("businessName", "Shorten the business name to 80 characters or fewer.");

    var p = trim(form.phone);
    if (p && normalizePhone(p) === null) {
      var digits = phoneDigits(p).length;
      err("phone", /[a-z]/i.test(p)
        ? "Use only numbers in the phone number, like (415) 555-0123."
        : "Enter a 10-digit US phone number, like (415) 555-0123. This one has " + digits + (digits === 1 ? " digit." : " digits."));
    }

    var e = emailProblem(form.email);
    if (e) err("email", e);

    if (trim(form.instagram) && normalizeInstagram(form.instagram) === null) {
      err("instagram", "Enter an Instagram name like marinelayer.sf, @marinelayer.sf or the full instagram.com address. Names use only letters, numbers, periods and underscores.");
    }

    DAYS.forEach(function (day) {
      var h = form.hours && form.hours[day];
      if (!h || !h.open) return;
      var o = parseTimeValue(h.from), c = parseTimeValue(h.to);
      if (o === null) err("hours." + day + ".from", "Enter an opening time for " + DAY_LABEL[day] + ", or mark it closed.");
      if (c === null) err("hours." + day + ".to", "Enter a closing time for " + DAY_LABEL[day] + ", or mark it closed.");
      if (o !== null && c !== null && c <= o) {
        err("hours." + day + ".to", "Closing time on " + DAY_LABEL[day] + " must be after the opening time (" + time12(h.from) + ").");
      }
    });

    (form.closedDates || []).forEach(function (d, i) {
      if (!trim(d)) err("closedDates." + i, "Choose a date, or remove this row.");
      else if (!isDateKey(d)) err("closedDates." + i, "Enter the date as year-month-day, like 2026-12-25.");
      else if (form.closedDates.indexOf(d) !== i) err("closedDates." + i, "This date is already in the list. Remove this row.");
    });

    var notice = toInt(form.minNoticeHours);
    if (isNaN(notice) || notice < 0 || notice > 720) err("minNoticeHours", "Enter minimum notice in whole hours, from 0 to 720 (30 days).");
    var ahead = toInt(form.maxDaysAhead);
    if (isNaN(ahead) || ahead < 1 || ahead > 365) err("maxDaysAhead", "Enter how far ahead clients can book in whole days, from 1 to 365.");
    var buffer = toInt(form.bufferMinutes);
    if (isNaN(buffer) || buffer < 0 || buffer > 120) err("bufferMinutes", "Enter the buffer in whole minutes, from 0 to 120.");
    var slot = toInt(form.slotMinutes);
    if (SLOT_CHOICES.indexOf(slot) === -1) err("slotMinutes", "Choose a start-time interval from the list.");

    var total = 0;
    (form.serviceGroups || []).forEach(function (g, gi) {
      var base = "serviceGroups." + gi;
      if (!trim(g.name)) err(base + ".name", "Give this group a name, like Hair.");
      (g.services || []).forEach(function (s, si) {
        total++;
        var sp = base + ".services." + si;
        if (!trim(s.name)) err(sp + ".name", "Enter a name for this service.");
        var mins = toInt(s.minutes);
        if (isNaN(mins) || mins < 5 || mins > 600) {
          err(sp + ".minutes", "Enter the length in whole minutes, between 5 and 600. For 1 hr 30 min, enter 90.");
        } else if (SLOT_CHOICES.indexOf(slot) !== -1 && mins % slot !== 0) {
          warn(sp + ".minutes", durationText(mins) + " isn't a multiple of the " + slot + "-minute start-time interval. It still works, but appointments won't line up neatly.");
        }
        var price = toPrice(s.price);
        if (!trim(s.price)) err(sp + ".price", "Enter a price, like 95. Use 0 for a free service.");
        else if (isNaN(price)) err(sp + ".price", "Enter the price as a number, like 95 or 95.50, with no other text.");
        else if (price < 0) err(sp + ".price", "The price can't be below 0.");
      });
    });
    if (!total) warn("services", "There are no services, so nobody can book. Add at least one service.");

    function checkImage(path, image) {
      if (!image) return;
      if (!trim(image.src)) err(path + ".src", "Enter an image address, or select Remove photo.");
      else if (!isSafeImageSrc(image.src)) {
        err(path + ".src", "Use a web address starting with https:// or a file in the site folder, like images/my-photo.jpg.");
      } else if (!trim(image.alt)) {
        warn(path + ".alt", "Describe the photo in a few words for people who use screen readers.");
      }
    }
    checkImage("heroImage", form.heroImage);
    checkImage("portrait", form.portrait);
    (form.gallery || []).forEach(function (img, i) { checkImage("gallery." + i, img); });

    return { errors: errors, warnings: warnings };
  }

  // Form -> clean saved settings. Only call after validateForm found no errors.
  function fromForm(form) {
    var hours = {};
    DAYS.forEach(function (day) {
      var h = form.hours[day];
      hours[day] = h && h.open ? { open: h.from, close: h.to } : null;
    });
    function img(i) {
      if (!i || !trim(i.src)) return null;
      var out = { src: trim(i.src), alt: trim(i.alt) };
      if (i.source) out.source = i.source;
      return out;
    }
    var about = str(form.aboutText).split(/\n\s*\n/).map(function (para) {
      return para.replace(/\s*\n\s*/g, " ").trim();
    }).filter(Boolean);

    var groups = (form.serviceGroups || []).map(function (g) {
      return {
        name: trim(g.name),
        services: (g.services || []).map(function (s) {
          return {
            id: s.id, name: trim(s.name), minutes: toInt(s.minutes), price: toPrice(s.price),
            priceFrom: !!s.priceFrom, description: trim(s.description)
          };
        })
      };
    });
    var ids = [];
    groups.forEach(function (g) { g.services.forEach(function (s) { ids.push(s.id); }); });

    var out = {
      businessName: trim(form.businessName),
      descriptor: trim(form.descriptor),
      ownerName: trim(form.ownerName),
      heroSentence: trim(form.heroSentence),
      about: about,
      galleryTitle: trim(form.galleryTitle),
      city: trim(form.city),
      neighborhood: trim(form.neighborhood),
      streetAddress: trim(form.streetAddress),
      phone: normalizePhone(form.phone) || "",
      email: trim(form.email),
      instagram: normalizeInstagram(form.instagram) || "",
      licenseNumber: trim(form.licenseNumber),
      hours: hours,
      closedDates: (form.closedDates || []).filter(isDateKey).sort(),
      booking: {
        slotMinutes: toInt(form.slotMinutes),
        bufferMinutes: toInt(form.bufferMinutes),
        minNoticeHours: toInt(form.minNoticeHours),
        maxDaysAhead: toInt(form.maxDaysAhead),
        heroServiceId: ids.indexOf(form.heroServiceId) !== -1 ? form.heroServiceId : (ids[0] || "")
      },
      cancellationPolicy: trim(form.cancellationPolicy),
      policies: (form.policies || []).map(trim).filter(Boolean),
      priceNote: trim(form.priceNote),
      serviceGroups: groups,
      heroImage: img(form.heroImage),
      gallery: (form.gallery || []).map(img).filter(Boolean),
      portrait: img(form.portrait)
    };
    return out;
  }

  // A new id that never collides with existing ones and never changes.
  function newServiceId(name, existing) {
    var base = trim(name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32) || "service";
    var id = base, n = 2;
    while (existing.indexOf(id) !== -1) id = base + "-" + (n++);
    return id;
  }

  /* ---------- Writing a complete js/config.js ---------- */

  // A JS literal for any JSON value, safe to drop into a .js file or even
  // an inline <script>: < > and line separators are escaped.
  function literal(value, indent) {
    var json = JSON.stringify(value, null, 2);
    if (json === undefined) json = "null";
    json = json
      .replace(/</g, "\\u003c").replace(/>/g, "\\u003e")
      .replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
    // Unquote simple keys for readability: `"name": ` -> `name: `
    json = json.replace(/^(\s*)"([A-Za-z_$][\w$]*)": /gm, "$1$2: ");
    return json.split("\n").join("\n" + (indent || ""));
  }

  var SECTIONS = [
    { title: "Name and basics", keys: [
      ["businessName"], ["descriptor"],
      ["heroSentence", "One plain sentence shown under the name at the top of the page."],
      ["ownerName", "Your own name. Leave \"\" to keep it off the site."],
      ["about", "Paragraphs for the About section, written as you."]
    ] },
    { title: "Photos", note: [
      "Placeholder stock photos must be replaced with your own before launch.",
      "src: a web address (https://...) or a file in the site folder, e.g. \"images/me.jpg\".",
      "alt: a short description for people using screen readers. null = no photo."
    ], keys: [["heroImage"], ["galleryTitle"], ["gallery"], ["portrait"]] },
    { title: "Where and how to reach you", note: ["Any field left as \"\" is hidden on the site."], keys: [
      ["city"], ["neighborhood"], ["streetAddress"], ["phone"], ["email"],
      ["instagram", "Instagram name without the @."],
      ["licenseNumber", "California Board of Barbering and Cosmetology license number."]
    ] },
    { title: "Time zone", keys: [["timeZone"], ["timeZoneLabel"]] },
    { title: "Weekly hours", note: ["24-hour clock: \"18:00\" is 6 pm. null = closed that day."], keys: [
      ["hours"], ["closedDates", "Single days off, written \"YYYY-MM-DD\"."]
    ] },
    { title: "Booking rules", keys: [
      ["booking", "slotMinutes: start-time interval. bufferMinutes: kept free after each appointment.\n" +
        "minNoticeHours: how far ahead people must book. maxDaysAhead: how far into the future.\n" +
        "heroServiceId: service used for \"Next open appointments\"."],
      ["previewMode", "true = bookings and edits are stored only in the browser they were made in."]
    ] },
    { title: "Policies", keys: [["cancellationPolicy"], ["policies"], ["priceNote"]] },
    { title: "Services and prices", note: [
      "minutes: length. price: a number, no $ sign. priceFrom: true shows \"from $110\".",
      "id: used by the booking system. Don't change it once people have booked."
    ], keys: [["currency"], ["serviceGroups"]] }
  ];

  function comment(text, indent) {
    return text.split("\n").map(function (line) { return indent + "// " + line; }).join("\n");
  }

  /*
    Text of a complete, commented js/config.js for the given effective
    settings. Every key in `settings` is written out, including ones the
    owner can't edit (previewMode, timeZone, currency...), so nothing is lost.
  */
  function generateConfigFile(settings, meta) {
    meta = meta || {};
    var written = {};
    var out = [];
    out.push("/*");
    // Only fixed text goes in comments; everything the owner typed is in
    // escaped string literals below.
    out.push("  SITE CONTENT: everything the site says.");
    out.push("  Made by the Edit site page" + (meta.date && /^\d{4}-\d{2}-\d{2}$/.test(meta.date) ? " on " + meta.date : "") + ".");
    out.push("");
    out.push("  To make these settings permanent for every visitor, replace js/config.js");
    out.push("  with this file. You can still edit it by hand: change only the text");
    out.push("  between the quote marks, and keep the commas where they are.");
    out.push("*/");
    out.push("");
    out.push("window.SITE = {");

    var blocks = [];
    SECTIONS.forEach(function (section) {
      var lines = [];
      var present = section.keys.filter(function (k) { return k[0] in settings; });
      if (!present.length) return;
      lines.push("  /* ---------- " + section.title + " ---------- */");
      if (section.note) lines.push(comment(section.note.join("\n"), "  "));
      lines.push("");
      present.forEach(function (k) {
        if (k[1]) lines.push(comment(k[1], "  "));
        lines.push("  " + k[0] + ": " + literal(settings[k[0]], "  ") + ",");
        written[k[0]] = true;
      });
      blocks.push(lines.join("\n"));
    });

    var extra = Object.keys(settings).filter(function (k) { return !written[k]; });
    if (extra.length) {
      var lines = ["  /* ---------- Other settings ---------- */", ""];
      extra.forEach(function (k) { lines.push("  " + JSON.stringify(k) + ": " + literal(settings[k], "  ") + ","); });
      blocks.push(lines.join("\n"));
    }

    // Drop the trailing comma of the last property.
    var body = blocks.join("\n\n").replace(/,\s*$/, "");
    out.push(body);
    out.push("};");
    out.push("");
    return out.join("\n");
  }

  /* ---------- Browser: storage adapter and bootstrap ---------- */

  function createLocalStorageSettingsStore(key) {
    function read() {
      try {
        var raw = window.localStorage.getItem(key);
        if (!raw) return null;
        var data = JSON.parse(raw);
        if (isObject(data) && isObject(data.settings)) return data.settings;
        if (isObject(data)) return data; // older shape: settings stored directly
        return null;
      } catch (e) {
        return null;
      }
    }
    return {
      kind: "localStorage",
      peek: read,
      load: function () { return Promise.resolve(read()); },
      save: function (settings) {
        return new Promise(function (resolve) {
          var data = { version: VERSION, savedAt: new Date().toISOString(), settings: copy(settings) };
          window.localStorage.setItem(key, JSON.stringify(data));
          resolve(copy(settings));
        });
      },
      reset: function () {
        return new Promise(function (resolve) {
          try { window.localStorage.removeItem(key); } catch (e) { /* nothing stored */ }
          resolve();
        });
      }
    };
  }

  var api = {
    VERSION: VERSION,
    DAYS: DAYS,
    SLOT_CHOICES: SLOT_CHOICES,
    EDITABLE_KEYS: EDITABLE_KEYS,
    mergeSettings: mergeSettings,
    pickEditable: pickEditable,
    toForm: toForm,
    validateForm: validateForm,
    fromForm: fromForm,
    newServiceId: newServiceId,
    generateConfigFile: generateConfigFile,
    normalizePhone: normalizePhone,
    normalizeInstagram: normalizeInstagram,
    emailProblem: emailProblem,
    isSafeImageSrc: isSafeImageSrc,
    durationText: durationText,
    toInt: toInt,
    toPrice: toPrice
  };

  if (typeof window !== "undefined" && window.SITE) {
    window.SettingsStore = createLocalStorageSettingsStore("marine-layer.settings.v1");
    window.SITE_DEFAULTS = copy(window.SITE);
    window.SITE = mergeSettings(window.SITE_DEFAULTS, window.SettingsStore.peek());
  }

  return api;
});
