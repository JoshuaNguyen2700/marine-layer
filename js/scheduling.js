/*
  Scheduling: pure availability logic. No DOM, no storage.

  Everything here works in the business's wall-clock time:
  - a day is a "date key" string "YYYY-MM-DD"
  - a time of day is minutes after midnight (600 = 10:00 am)
  - "now" is passed in as { date: "YYYY-MM-DD", minutes: 615 }
    (use nowInZone() to get it from a real clock)

  Dates are built from year/month/day numbers with Date.UTC, so the
  visitor's own time zone and daylight saving never shift a day.

  Loads in the browser as window.Scheduling, and in Node via require().
*/
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.Scheduling = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var DAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  var MS_PER_DAY = 86400000;

  /* ---------- Dates as plain numbers ---------- */

  function pad(n) { return (n < 10 ? "0" : "") + n; }

  // month is 1-12
  function dateKey(year, month, day) {
    // Normalise overflow (e.g. day 32) through UTC arithmetic.
    var d = new Date(Date.UTC(year, month - 1, day));
    return d.getUTCFullYear() + "-" + pad(d.getUTCMonth() + 1) + "-" + pad(d.getUTCDate());
  }

  function parseDateKey(key) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key));
    if (!m) throw new Error("Bad date key: " + key);
    return { year: +m[1], month: +m[2], day: +m[3] };
  }

  // Whole days since 1970-01-01 for a date key (timezone-free).
  function dayNumber(key) {
    var p = parseDateKey(key);
    return Math.round(Date.UTC(p.year, p.month - 1, p.day) / MS_PER_DAY);
  }

  function addDays(key, n) {
    var p = parseDateKey(key);
    return dateKey(p.year, p.month, p.day + n);
  }

  // 0 = Sunday ... 6 = Saturday
  function weekday(key) {
    var p = parseDateKey(key);
    return new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay();
  }

  function daysInMonth(year, month) {
    return new Date(Date.UTC(year, month, 0)).getUTCDate();
  }

  // "10:00" -> 600
  function parseTime(hhmm) {
    var m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm).trim());
    if (!m) throw new Error("Bad time: " + hhmm);
    return (+m[1]) * 60 + (+m[2]);
  }

  // 600 -> "10:00 am", 780 -> "1:00 pm", 0 -> "12:00 am"
  function formatTime12(minutes) {
    var h = Math.floor(minutes / 60) % 24;
    var mm = minutes % 60;
    var suffix = h < 12 ? "am" : "pm";
    var h12 = h % 12 === 0 ? 12 : h % 12;
    return h12 + ":" + pad(mm) + " " + suffix;
  }

  // Absolute wall-clock minutes, used to compare date+time pairs.
  function absMinutes(key, minutes) {
    return dayNumber(key) * 1440 + minutes;
  }

  /*
    Current wall-clock date and time in a time zone, from a real Date.
    Uses Intl, which every current browser and Node support.
  */
  function nowInZone(timeZone, date) {
    var d = date || new Date();
    var parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timeZone,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hourCycle: "h23"
    }).formatToParts(d);
    var v = {};
    parts.forEach(function (p) { v[p.type] = p.value; });
    var hour = +v.hour === 24 ? 0 : +v.hour;
    return { date: v.year + "-" + v.month + "-" + v.day, minutes: hour * 60 + (+v.minute) };
  }

  /* ---------- Working hours ---------- */

  // Returns { open, close } in minutes for a date, or null when closed.
  function hoursForDate(settings, key) {
    if (settings.closedDates && settings.closedDates.indexOf(key) !== -1) return null;
    var day = settings.hours && settings.hours[DAY_NAMES[weekday(key)]];
    if (!day || !day.open || !day.close) return null;
    var open = parseTime(day.open), close = parseTime(day.close);
    if (close <= open) return null;
    return { open: open, close: close };
  }

  function isActive(booking) {
    return booking && booking.status !== "cancelled";
  }

  function bookingsOn(bookings, key) {
    return (bookings || []).filter(function (b) { return isActive(b) && b.date === key; });
  }

  // Is the date within [today, today + maxDaysAhead]?
  function inWindow(settings, key, now) {
    var diff = dayNumber(key) - dayNumber(now.date);
    return diff >= 0 && diff <= settings.booking.maxDaysAhead;
  }

  /*
    The core rule. A start time is open only if:
    - the day is a working day inside the booking window,
    - start + duration + buffer fits inside working hours,
    - it is at least minNoticeHours after now,
    - [start, start + duration + buffer) does not overlap any existing
      booking's [start, start + its duration + buffer).
  */
  function isSlotOpen(settings, opts) {
    var key = opts.date, start = opts.start, duration = opts.duration;
    var now = opts.now, rules = settings.booking;
    var buffer = rules.bufferMinutes || 0;

    if (!inWindow(settings, key, now)) return false;
    var hours = hoursForDate(settings, key);
    if (!hours) return false;
    if (start < hours.open || start + duration + buffer > hours.close) return false;

    var earliest = absMinutes(now.date, now.minutes) + rules.minNoticeHours * 60;
    if (absMinutes(key, start) < earliest) return false;

    var end = start + duration + buffer;
    var taken = bookingsOn(opts.bookings, key);
    for (var i = 0; i < taken.length; i++) {
      var b = taken[i];
      var bStart = b.startMinutes;
      var bEnd = b.startMinutes + b.durationMinutes + buffer;
      if (start < bEnd && bStart < end) return false;
    }
    return true;
  }

  // All open start times (minutes) for one day.
  function openSlots(settings, opts) {
    var hours = hoursForDate(settings, opts.date);
    if (!hours || !inWindow(settings, opts.date, opts.now)) return [];
    var step = settings.booking.slotMinutes || 15;
    var out = [];
    for (var t = hours.open; t < hours.close; t += step) {
      if (isSlotOpen(settings, {
        date: opts.date, start: t, duration: opts.duration,
        bookings: opts.bookings, now: opts.now
      })) out.push(t);
    }
    return out;
  }

  // First and last bookable date keys.
  function bookingRange(settings, now) {
    return { first: now.date, last: addDays(now.date, settings.booking.maxDaysAhead) };
  }

  // { "2026-11-17": [600, 615, ...], ... } for every day in a month.
  function monthAvailability(settings, opts) {
    var result = {};
    var n = daysInMonth(opts.year, opts.month);
    for (var d = 1; d <= n; d++) {
      var key = dateKey(opts.year, opts.month, d);
      result[key] = openSlots(settings, {
        date: key, duration: opts.duration, bookings: opts.bookings, now: opts.now
      });
    }
    return result;
  }

  // The next `count` days that have at least one open time.
  function nextOpenDays(settings, opts) {
    var out = [];
    var range = bookingRange(settings, opts.now);
    for (var key = range.first; dayNumber(key) <= dayNumber(range.last); key = addDays(key, 1)) {
      var slots = openSlots(settings, {
        date: key, duration: opts.duration, bookings: opts.bookings, now: opts.now
      });
      if (slots.length) out.push({ date: key, slots: slots });
      if (out.length >= opts.count) break;
    }
    return out;
  }

  // Pick a few times spread through the day (at least `gap` minutes apart).
  function spreadTimes(slots, max, gap) {
    var out = [];
    for (var i = 0; i < slots.length && out.length < max; i++) {
      if (!out.length || slots[i] - out[out.length - 1] >= gap) out.push(slots[i]);
    }
    return out;
  }

  /* ---------- Calendar file (.ics) ---------- */

  function icsEscape(text) {
    return String(text || "")
      .replace(/\\/g, "\\\\")
      .replace(/;/g, "\\;")
      .replace(/,/g, "\\,")
      .replace(/\r?\n/g, "\\n");
  }

  // Fold lines longer than 75 octets (RFC 5545 section 3.1).
  function icsFold(line) {
    var out = [], current = "", bytes = 0;
    for (var i = 0; i < line.length; i++) {
      var ch = line[i];
      var code = line.charCodeAt(i);
      var size = code < 0x80 ? 1 : code < 0x800 ? 2 : (code >= 0xD800 && code <= 0xDBFF) ? 4 : 3;
      if (code >= 0xDC00 && code <= 0xDFFF) size = 0; // second half of a surrogate pair
      var limit = out.length ? 74 : 75; // continuation lines start with a space
      if (bytes + size > limit && size > 0) {
        out.push(current);
        current = "";
        bytes = 0;
      }
      current += ch;
      bytes += size;
    }
    out.push(current);
    return out.join("\r\n ");
  }

  function icsLocal(key, minutes) {
    var p = parseDateKey(key);
    var extraDays = Math.floor(minutes / 1440);
    if (extraDays) { key = addDays(key, extraDays); p = parseDateKey(key); minutes -= extraDays * 1440; }
    return p.year + pad(p.month) + pad(p.day) + "T" + pad(Math.floor(minutes / 60)) + pad(minutes % 60) + "00";
  }

  function icsUtcStamp(date) {
    return date.getUTCFullYear() + pad(date.getUTCMonth() + 1) + pad(date.getUTCDate()) + "T" +
      pad(date.getUTCHours()) + pad(date.getUTCMinutes()) + pad(date.getUTCSeconds()) + "Z";
  }

  var LA_VTIMEZONE = [
    "BEGIN:VTIMEZONE",
    "TZID:America/Los_Angeles",
    "BEGIN:DAYLIGHT",
    "TZOFFSETFROM:-0800",
    "TZOFFSETTO:-0700",
    "TZNAME:PDT",
    "DTSTART:20070311T020000",
    "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU",
    "END:DAYLIGHT",
    "BEGIN:STANDARD",
    "TZOFFSETFROM:-0700",
    "TZOFFSETTO:-0800",
    "TZNAME:PST",
    "DTSTART:20071104T020000",
    "RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU",
    "END:STANDARD",
    "END:VTIMEZONE"
  ];

  /*
    Build an .ics calendar file for one booking.
    event: { uid, date, startMinutes, durationMinutes, summary, location, description }
    Times are written with TZID=America/Los_Angeles plus a matching VTIMEZONE,
    which Apple Calendar, Google Calendar and Outlook all import correctly.
  */
  function buildICS(event, stampDate) {
    var lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Marine Layer//Booking//EN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH"
    ].concat(LA_VTIMEZONE, [
      "BEGIN:VEVENT",
      "UID:" + event.uid,
      "DTSTAMP:" + icsUtcStamp(stampDate || new Date()),
      "DTSTART;TZID=America/Los_Angeles:" + icsLocal(event.date, event.startMinutes),
      "DTEND;TZID=America/Los_Angeles:" + icsLocal(event.date, event.startMinutes + event.durationMinutes),
      "SUMMARY:" + icsEscape(event.summary)
    ]);
    if (event.location) lines.push("LOCATION:" + icsEscape(event.location));
    if (event.description) lines.push("DESCRIPTION:" + icsEscape(event.description));
    lines.push("STATUS:CONFIRMED", "END:VEVENT", "END:VCALENDAR");
    return lines.map(icsFold).join("\r\n") + "\r\n";
  }

  return {
    DAY_NAMES: DAY_NAMES,
    dateKey: dateKey,
    parseDateKey: parseDateKey,
    dayNumber: dayNumber,
    addDays: addDays,
    weekday: weekday,
    daysInMonth: daysInMonth,
    parseTime: parseTime,
    formatTime12: formatTime12,
    absMinutes: absMinutes,
    nowInZone: nowInZone,
    hoursForDate: hoursForDate,
    isSlotOpen: isSlotOpen,
    openSlots: openSlots,
    bookingRange: bookingRange,
    monthAvailability: monthAvailability,
    nextOpenDays: nextOpenDays,
    spreadTimes: spreadTimes,
    buildICS: buildICS
  };
});
