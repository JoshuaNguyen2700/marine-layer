// Run with:  node tests/scheduling.test.js
// No dependencies. Exits with code 1 if any test fails.
"use strict";

var assert = require("assert");
var S = require("../js/scheduling.js");

// Same rules as the default config, written out here so the tests don't
// change when the owner edits js/config.js.
var settings = {
  hours: {
    sunday: null,
    monday: null,
    tuesday: { open: "10:00", close: "18:00" },
    wednesday: { open: "10:00", close: "18:00" },
    thursday: { open: "10:00", close: "18:00" },
    friday: { open: "10:00", close: "18:00" },
    saturday: { open: "10:00", close: "18:00" }
  },
  closedDates: ["2026-11-26"], // a Thursday off
  booking: { slotMinutes: 15, bufferMinutes: 15, minNoticeHours: 12, maxDaysAhead: 60 }
};

// "Now" for most tests: Thursday 2026-11-12, 9:00 am Pacific.
var NOW = { date: "2026-11-12", minutes: 9 * 60 };
var TUE = "2026-11-17";
var t = S.parseTime;

function booking(date, start, duration, status) {
  return { date: date, startMinutes: t(start), durationMinutes: duration, status: status || "confirmed" };
}
function slots(date, duration, bookings, now) {
  return S.openSlots(settings, { date: date, duration: duration, bookings: bookings || [], now: now || NOW });
}
function times(list) { return list.map(S.formatTime12); }

var tests = [];
function test(name, fn) { tests.push({ name: name, fn: fn }); }

/* ---- date helpers ---- */

test("date keys are built from numbers and roll over months and years", function () {
  assert.strictEqual(S.dateKey(2026, 11, 31), "2026-12-01");
  assert.strictEqual(S.addDays("2026-12-31", 1), "2027-01-01");
  assert.strictEqual(S.addDays("2026-03-08", 1), "2026-03-09"); // DST start day
  assert.strictEqual(S.addDays("2026-11-01", 1), "2026-11-02"); // DST end day
  assert.strictEqual(S.weekday("2026-11-12"), 4); // Thursday
  assert.strictEqual(S.weekday(TUE), 2);
  assert.strictEqual(S.daysInMonth(2028, 2), 29);
});

test("12-hour formatting", function () {
  assert.deepStrictEqual(times([0, 600, 720, 765, 1005]), ["12:00 am", "10:00 am", "12:00 pm", "12:45 pm", "4:45 pm"]);
});

test("nowInZone reads Pacific wall-clock time regardless of the machine's zone", function () {
  // 2026-11-13 04:30 UTC is 2026-11-12 8:30 pm PST (UTC-8)
  assert.deepStrictEqual(S.nowInZone("America/Los_Angeles", new Date(Date.UTC(2026, 10, 13, 4, 30))),
    { date: "2026-11-12", minutes: 20 * 60 + 30 });
  // 2026-07-01 07:15 UTC is 2026-07-01 12:15 am PDT (UTC-7)
  assert.deepStrictEqual(S.nowInZone("America/Los_Angeles", new Date(Date.UTC(2026, 6, 1, 7, 15))),
    { date: "2026-07-01", minutes: 15 });
});

/* ---- availability rules ---- */

test("fits within hours: 60-min service plus 15-min buffer on a 10-6 day", function () {
  var s = slots(TUE, 60);
  assert.strictEqual(s[0], t("10:00"));
  assert.strictEqual(s[s.length - 1], t("16:45")); // 4:45 + 60 + 15 = 6:00
  assert.strictEqual(s.length, 28);
  assert.ok(s.every(function (m) { return m % 15 === 0; }), "every start is on the 15-minute grid");
});

test("buffer: next start after a booking waits for its 15-minute buffer", function () {
  var s = slots(TUE, 60, [booking(TUE, "10:00", 60)]);
  assert.strictEqual(s[0], t("11:15"));
  assert.ok(s.indexOf(t("11:00")) === -1);
});

test("buffer: a new appointment plus its buffer must finish before the next booking", function () {
  var s = slots(TUE, 60, [booking(TUE, "13:00", 60)]);
  assert.ok(s.indexOf(t("11:45")) !== -1, "11:45 + 60 + 15 = 1:00 fits");
  assert.ok(s.indexOf(t("12:00")) === -1, "12:00 would run into the 1:00 booking");
});

test("overlap: no start time inside or across an existing booking", function () {
  var s = slots(TUE, 45, [booking(TUE, "12:00", 60)]);
  ["11:15", "11:30", "11:45", "12:00", "12:30", "13:00"].forEach(function (x) {
    assert.ok(s.indexOf(t(x)) === -1, x + " should be blocked");
  });
  assert.ok(s.indexOf(t("11:00")) !== -1, "11:00 + 45 + 15 = 12:00 just fits");
  assert.ok(s.indexOf(t("13:15")) !== -1, "12:00 + 60 + 15 = 1:15 is free");
});

test("cancelled bookings don't block time", function () {
  var s = slots(TUE, 60, [booking(TUE, "10:00", 60, "cancelled")]);
  assert.strictEqual(s[0], t("10:00"));
});

test("bookings on other days don't block time", function () {
  var s = slots(TUE, 60, [booking("2026-11-18", "10:00", 60)]);
  assert.strictEqual(s.length, 28);
});

test("closed days: Sunday, Monday and a listed closed date have no times", function () {
  assert.deepStrictEqual(slots("2026-11-15", 60), []); // Sunday
  assert.deepStrictEqual(slots("2026-11-16", 60), []); // Monday
  assert.deepStrictEqual(slots("2026-11-26", 60), []); // closedDates
  assert.ok(slots("2026-11-27", 60).length > 0);       // Friday after
});

test("minimum notice: nothing within 12 hours of now", function () {
  // Tuesday 12:30 am -> earliest bookable is 12:30 pm the same day
  var s = slots(TUE, 60, [], { date: TUE, minutes: 30 });
  assert.strictEqual(s[0], t("12:30"));
  // Tuesday 8:00 am -> earliest is 8:00 pm, after closing: no times today
  assert.deepStrictEqual(slots(TUE, 60, [], { date: TUE, minutes: 8 * 60 }), []);
  // Monday 9:00 pm -> 9:00 am Tuesday, so Tuesday opens at 10:00 as usual
  assert.strictEqual(slots(TUE, 60, [], { date: "2026-11-16", minutes: 21 * 60 })[0], t("10:00"));
  // Monday 11:00 pm -> 11:00 am Tuesday
  assert.strictEqual(slots(TUE, 60, [], { date: "2026-11-16", minutes: 23 * 60 })[0], t("11:00"));
});

test("booking window: open up to 60 days ahead, not after, not in the past", function () {
  var last = S.addDays(NOW.date, 60);
  assert.strictEqual(last, "2027-01-11"); // a Monday, closed anyway
  assert.ok(slots("2027-01-09", 60).length > 0, "Saturday, 58 days ahead");
  assert.deepStrictEqual(slots("2027-01-12", 60), [], "Tuesday, 61 days ahead");
  assert.deepStrictEqual(slots("2026-11-11", 60), [], "yesterday");
  var range = S.bookingRange(settings, NOW);
  assert.deepStrictEqual(range, { first: "2026-11-12", last: "2027-01-11" });
});

test("long service near closing: 3 hr 30 min highlights", function () {
  var s = slots(TUE, 210);
  assert.strictEqual(s[s.length - 1], t("14:15")); // 2:15 + 210 + 15 = 6:00
  assert.ok(s.indexOf(t("14:30")) === -1);
  // With a 3:00 pm booking, the long service must start by 11:15
  var s2 = slots(TUE, 210, [booking(TUE, "15:00", 60)]);
  assert.strictEqual(s2[s2.length - 1], t("11:15"));
});

test("isSlotOpen matches openSlots (used for the re-check at confirm time)", function () {
  var bookings = [booking(TUE, "10:00", 60)];
  assert.strictEqual(S.isSlotOpen(settings, { date: TUE, start: t("10:00"), duration: 60, bookings: bookings, now: NOW }), false);
  assert.strictEqual(S.isSlotOpen(settings, { date: TUE, start: t("11:15"), duration: 60, bookings: bookings, now: NOW }), true);
  assert.strictEqual(S.isSlotOpen(settings, { date: TUE, start: t("10:05"), duration: 60, bookings: [], now: NOW }), true,
    "off-grid starts are still evaluated by the same rules");
});

test("nextOpenDays skips today when notice rules it out and skips closed days", function () {
  var days = S.nextOpenDays(settings, { count: 3, duration: 60, bookings: [], now: NOW });
  // Thu 9 am now: today is out (notice), Fri 13, Sat 14, then Tue 17
  assert.deepStrictEqual(days.map(function (d) { return d.date; }), ["2026-11-13", "2026-11-14", "2026-11-17"]);
});

test("monthAvailability covers every day and leaves closed days empty", function () {
  var m = S.monthAvailability(settings, { year: 2026, month: 11, duration: 60, bookings: [], now: NOW });
  assert.strictEqual(Object.keys(m).length, 30);
  assert.strictEqual(m["2026-11-16"].length, 0);
  assert.strictEqual(m["2026-11-17"].length, 28);
});

test("spreadTimes picks times at least an hour apart", function () {
  assert.deepStrictEqual(S.spreadTimes([600, 615, 630, 660, 675, 720, 780, 840], 4, 60), [600, 660, 720, 780]);
});

/* ---- calendar file ---- */

test(".ics file uses America/Los_Angeles wall-clock times and CRLF lines", function () {
  var ics = S.buildICS({
    uid: "b_test@marine-layer",
    date: TUE, startMinutes: t("16:45"), durationMinutes: 60,
    summary: "Haircut and style, Marine Layer",
    location: "San Francisco, California",
    description: "Cancel or reschedule; 24 hours' notice.\nThanks"
  }, new Date(Date.UTC(2026, 10, 12, 17, 0, 0)));
  assert.ok(ics.indexOf("DTSTART;TZID=America/Los_Angeles:20261117T164500\r\n") !== -1);
  assert.ok(ics.indexOf("DTEND;TZID=America/Los_Angeles:20261117T174500\r\n") !== -1);
  assert.ok(ics.indexOf("DTSTAMP:20261112T170000Z\r\n") !== -1);
  assert.ok(ics.indexOf("BEGIN:VTIMEZONE\r\nTZID:America/Los_Angeles") !== -1);
  assert.ok(ics.indexOf("SUMMARY:Haircut and style\\, Marine Layer") !== -1);
  assert.ok(ics.indexOf("Cancel or reschedule\\; 24 hours' notice.\\nThanks") !== -1);
  assert.ok(/^BEGIN:VCALENDAR\r\n/.test(ics) && /END:VCALENDAR\r\n$/.test(ics));
  assert.ok(ics.split("\r\n").every(function (line) { return Buffer.byteLength(line, "utf8") <= 75; }), "lines folded at 75 octets");
  assert.ok(ics.replace(/\r\n/g, "").indexOf("\n") === -1, "no bare line feeds");
});

test(".ics long lines fold and unfold back to the original text", function () {
  var long = "Notes: " + new Array(40).join("café ") + "end";
  var ics = S.buildICS({ uid: "x", date: TUE, startMinutes: 600, durationMinutes: 30, summary: "S", description: long });
  var unfolded = ics.replace(/\r\n /g, "");
  assert.ok(unfolded.indexOf("DESCRIPTION:" + long + "\r\n") !== -1);
});

/* ---- run ---- */

var failed = 0;
tests.forEach(function (tc) {
  try {
    tc.fn();
    console.log("  ok    " + tc.name);
  } catch (err) {
    failed++;
    console.log("  FAIL  " + tc.name);
    console.log("        " + (err && err.message));
  }
});
console.log("\n" + (tests.length - failed) + " of " + tests.length + " tests passed.");
process.exitCode = failed ? 1 : 0;
