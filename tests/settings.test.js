// Run with:  node tests/settings.test.js
// No dependencies. Exits with code 1 if any test fails.
"use strict";

var assert = require("assert");
var fs = require("fs");
var path = require("path");
var vm = require("vm");
var Settings = require("../js/settings.js");

// Load js/config.js the way a browser would, into a fake window.
function runConfig(text) {
  var sandbox = { window: {} };
  vm.runInNewContext(text, sandbox, { filename: "config.js" });
  return JSON.parse(JSON.stringify(sandbox.window.SITE));
}
var DEFAULTS = runConfig(fs.readFileSync(path.join(__dirname, "..", "js", "config.js"), "utf8"));

function merged(saved) { return Settings.mergeSettings(DEFAULTS, saved); }
function form(overrides) {
  var f = Settings.toForm(DEFAULTS);
  Object.keys(overrides || {}).forEach(function (k) { f[k] = overrides[k]; });
  return f;
}
function errorsFor(f) { return Settings.validateForm(f).errors; }
function warningsFor(f) { return Settings.validateForm(f).warnings; }
function firstService(f) { return f.serviceGroups[0].services[0]; }

var tests = [];
function test(name, fn) { tests.push({ name: name, fn: fn }); }

/* ---- merging saved settings over defaults ---- */

test("nothing saved: effective settings equal js/config.js", function () {
  assert.deepStrictEqual(merged(null), DEFAULTS);
  assert.deepStrictEqual(merged(undefined), DEFAULTS);
});

test("garbage saved data falls back to the defaults", function () {
  [42, "hello", [], [1, 2], true, { businessName: 5 }].forEach(function (junk) {
    assert.deepStrictEqual(merged(junk), DEFAULTS, JSON.stringify(junk));
  });
});

test("each field falls back on its own when the saved value has the wrong type", function () {
  var s = merged({
    businessName: 7,
    phone: "(415) 555-0123",
    descriptor: null,
    about: "not a list",
    hours: { saturday: "10-18", monday: { open: "09:00", close: "08:00" }, tuesday: { open: "09:00", close: "17:00" }, funday: { open: "1", close: "2" } },
    booking: { minNoticeHours: "24", maxDaysAhead: 30, bufferMinutes: -5, slotMinutes: 7 },
    serviceGroups: "nope",
    gallery: [{ src: "javascript:alert(1)", alt: "x" }, { src: "images/a.jpg", alt: "A" }, "junk"],
    heroImage: { src: "data:image/png;base64,AAAA", alt: "" },
    portrait: null,
    closedDates: ["2026-12-25", "2026-02-30", "soon", "2026-12-25", 20261225],
    previewMode: false,
    timeZone: "Europe/Paris",
    unknownKey: 1
  });
  assert.strictEqual(s.businessName, DEFAULTS.businessName);
  assert.strictEqual(s.descriptor, DEFAULTS.descriptor);
  assert.strictEqual(s.phone, "(415) 555-0123");
  assert.deepStrictEqual(s.about, DEFAULTS.about);
  assert.deepStrictEqual(s.hours.saturday, DEFAULTS.hours.saturday);
  assert.strictEqual(s.hours.monday, null, "bad Monday hours keep the default (closed)");
  assert.deepStrictEqual(s.hours.tuesday, { open: "09:00", close: "17:00" });
  assert.ok(!("funday" in s.hours));
  assert.strictEqual(s.booking.minNoticeHours, DEFAULTS.booking.minNoticeHours, "string number ignored");
  assert.strictEqual(s.booking.maxDaysAhead, 30);
  assert.strictEqual(s.booking.bufferMinutes, DEFAULTS.booking.bufferMinutes);
  assert.strictEqual(s.booking.slotMinutes, DEFAULTS.booking.slotMinutes);
  assert.deepStrictEqual(s.serviceGroups, DEFAULTS.serviceGroups);
  assert.deepStrictEqual(s.gallery, [{ src: "images/a.jpg", alt: "A" }]);
  assert.deepStrictEqual(s.heroImage, DEFAULTS.heroImage, "unsafe hero image keeps the default");
  assert.strictEqual(s.portrait, null, "a removed portrait stays removed");
  assert.deepStrictEqual(s.closedDates, ["2026-12-25"]);
  assert.strictEqual(s.previewMode, true, "previewMode is never taken from saved data");
  assert.strictEqual(s.timeZone, DEFAULTS.timeZone, "time zone is never taken from saved data");
  assert.ok(!("unknownKey" in s));
});

test("older or partial service data: bad services are dropped, all-bad keeps defaults", function () {
  // Old shape: a flat list instead of groups
  assert.deepStrictEqual(merged({ services: [{ id: "x", name: "X" }] }).serviceGroups, DEFAULTS.serviceGroups);
  // Groups where nothing is usable
  assert.deepStrictEqual(merged({ serviceGroups: [{ title: "Hair" }, 5] }).serviceGroups, DEFAULTS.serviceGroups);
  // Mixed: keep the good ones, drop bad and duplicate ids
  var s = merged({ serviceGroups: [{ name: "Hair", services: [
    { id: "a", name: "Cut", minutes: 60, price: 95, priceFrom: false, description: "d" },
    { id: "b", name: "No price", minutes: 60 },
    { id: "a", name: "Duplicate id", minutes: 30, price: 10 },
    { id: "c", name: "Too long", minutes: 900, price: 10 },
    { id: "d", name: "Odd", minutes: 45, price: 0, priceFrom: "yes" }
  ] }] });
  assert.deepStrictEqual(s.serviceGroups, [{ name: "Hair", services: [
    { id: "a", name: "Cut", minutes: 60, price: 95, priceFrom: false, description: "d" },
    { id: "d", name: "Odd", minutes: 45, price: 0, priceFrom: false, description: "" }
  ] }]);
});

test("an empty list of groups is kept (owner removed everything)", function () {
  assert.deepStrictEqual(merged({ serviceGroups: [] }).serviceGroups, []);
  assert.strictEqual(merged({ serviceGroups: [] }).booking.heroServiceId, "");
});

test("the hero's default service always points at a real service", function () {
  var groups = [{ name: "Brows", services: [{ id: "brow-x", name: "Brow X", minutes: 30, price: 35, priceFrom: false, description: "" }] }];
  assert.strictEqual(merged({ serviceGroups: groups }).booking.heroServiceId, "brow-x", "removed default falls back to the first service");
  assert.strictEqual(merged({ serviceGroups: groups, booking: { heroServiceId: "nope" } }).booking.heroServiceId, "brow-x");
  assert.strictEqual(merged({ booking: { heroServiceId: "blowout" } }).booking.heroServiceId, "blowout");
});

test("arrays are replaced whole, not merged by position", function () {
  var s = merged({ policies: ["Only one policy"], gallery: [], about: ["One paragraph"] });
  assert.deepStrictEqual(s.policies, ["Only one policy"]);
  assert.deepStrictEqual(s.gallery, []);
  assert.deepStrictEqual(s.about, ["One paragraph"]);
});

test("Instagram saved in any accepted form is stored as a bare name", function () {
  assert.strictEqual(merged({ instagram: "@marinelayer.sf" }).instagram, "marinelayer.sf");
  assert.strictEqual(merged({ instagram: "javascript:alert(1)" }).instagram, "");
});

/* ---- normalising ---- */

test("phone numbers normalise to (415) 555-0123", function () {
  ["4155550123", "415.555.0123", "415 555 0123", "+1 (415) 555-0123", "1-415-555-0123"].forEach(function (p) {
    assert.strictEqual(Settings.normalizePhone(p), "(415) 555-0123", p);
  });
  assert.strictEqual(Settings.normalizePhone(""), "");
  assert.strictEqual(Settings.normalizePhone("555 0123"), null);
  assert.strictEqual(Settings.normalizePhone("415 555 CALL"), null);
});

test("Instagram accepts name, @name and instagram.com addresses", function () {
  ["marinelayer.sf", "@marinelayer.sf", "instagram.com/marinelayer.sf", "https://www.instagram.com/marinelayer.sf/",
    "https://instagram.com/marinelayer.sf?hl=en"].forEach(function (v) {
    assert.strictEqual(Settings.normalizeInstagram(v), "marinelayer.sf", v);
  });
  assert.strictEqual(Settings.normalizeInstagram(""), "");
  assert.strictEqual(Settings.normalizeInstagram("bad name!"), null);
  assert.strictEqual(Settings.normalizeInstagram("https://evil.com/marinelayer"), null);
});

test("image addresses: only http(s) or paths inside the site", function () {
  ["https://images.pexels.com/photos/1/a.jpeg?w=800", "http://example.com/a.png", "images/my-photo.jpg",
    "images/My Photo.JPG", "./images/a.webp", "photos/2026/a.jpg"].forEach(function (v) {
    assert.ok(Settings.isSafeImageSrc(v), v);
  });
  ["javascript:alert(1)", " JaVaScRiPt:alert(1)", "data:image/png;base64,AAAA", "file:///C:/a.jpg", "C:\\photos\\a.jpg",
    "//evil.example/a.jpg", "vbscript:x", "images/a.jpg\" onerror=\"alert(1)", "<img>", "", "   "].forEach(function (v) {
    assert.ok(!Settings.isSafeImageSrc(v), v);
  });
});

/* ---- validation ---- */

test("the unchanged defaults have no errors", function () {
  assert.deepStrictEqual(errorsFor(form()), {});
});

test("business name is required", function () {
  assert.ok(/business name/.test(errorsFor(form({ businessName: "  " })).businessName));
});

test("closing time must be after opening time", function () {
  var f = form();
  f.hours.saturday = { open: true, from: "18:00", to: "10:00" };
  assert.strictEqual(errorsFor(f)["hours.saturday.to"], "Closing time on Saturday must be after the opening time (6:00 pm).");
  f.hours.saturday = { open: false, from: "18:00", to: "10:00" };
  assert.ok(!errorsFor(f)["hours.saturday.to"], "a closed day isn't checked");
  f.hours.sunday = { open: true, from: "", to: "16:00" };
  assert.ok(/opening time for Sunday/.test(errorsFor(f)["hours.sunday.from"]));
});

test("service length must be whole minutes from 5 to 600; off-grid is only a warning", function () {
  ["", "abc", "4", "601", "60.5", "-30"].forEach(function (v) {
    var f = form(); firstService(f).minutes = v;
    assert.ok(/whole minutes, between 5 and 600/.test(errorsFor(f)["serviceGroups.0.services.0.minutes"]), "minutes " + v);
  });
  var f2 = form(); firstService(f2).minutes = "50";
  assert.ok(!errorsFor(f2)["serviceGroups.0.services.0.minutes"]);
  assert.ok(/multiple of the 15-minute/.test(warningsFor(f2)["serviceGroups.0.services.0.minutes"]));
});

test("price must be a number, not negative", function () {
  var f = form(); firstService(f).price = "-5";
  assert.strictEqual(errorsFor(f)["serviceGroups.0.services.0.price"], "The price can't be below 0.");
  firstService(f).price = "ninety";
  assert.ok(/as a number/.test(errorsFor(f)["serviceGroups.0.services.0.price"]));
  firstService(f).price = "";
  assert.ok(/Enter a price/.test(errorsFor(f)["serviceGroups.0.services.0.price"]));
  ["95", "95.50", "$95", "0"].forEach(function (p) {
    firstService(f).price = p;
    assert.ok(!errorsFor(f)["serviceGroups.0.services.0.price"], p);
  });
});

test("email needs an @ and a domain", function () {
  assert.ok(/Add the @/.test(errorsFor(form({ email: "hello.example.com" })).email));
  assert.ok(/after the @/.test(errorsFor(form({ email: "hello@example" })).email));
  assert.ok(!errorsFor(form({ email: "hello@example.com" })).email);
  assert.ok(!errorsFor(form({ email: "" })).email, "email is optional");
});

test("phone must be a 10-digit US number when given", function () {
  assert.strictEqual(errorsFor(form({ phone: "415 555 012" })).phone,
    "Enter a 10-digit US phone number, like (415) 555-0123. This one has 9 digits.");
  assert.ok(!errorsFor(form({ phone: "+1 415 555 0123" })).phone);
  assert.ok(!errorsFor(form({ phone: "" })).phone);
});

test("Instagram must be a valid name", function () {
  assert.ok(/Instagram name/.test(errorsFor(form({ instagram: "javascript:alert(1)" })).instagram));
  assert.ok(!errorsFor(form({ instagram: "https://www.instagram.com/marinelayer.sf/" })).instagram);
});

test("image addresses must be http(s) or a relative path; missing alt text is a warning", function () {
  var f = form({ heroImage: { src: "javascript:alert(1)", alt: "x" } });
  assert.ok(/https:\/\/ or a file in the site folder/.test(errorsFor(f)["heroImage.src"]));
  f = form({ portrait: { src: "images/me.jpg", alt: "" } });
  assert.ok(!errorsFor(f)["portrait.src"]);
  assert.ok(/Describe the photo/.test(warningsFor(f)["portrait.alt"]));
  f = form(); f.gallery[2].src = "data:image/png;base64,AAAA";
  assert.ok(errorsFor(f)["gallery.2.src"]);
});

test("groups need names; an empty group is fine; no services at all is a warning", function () {
  var f = form(); f.serviceGroups[1].name = "";
  assert.ok(/group a name/.test(errorsFor(f)["serviceGroups.1.name"]));
  f = form(); f.serviceGroups[1].services = [];
  assert.deepStrictEqual(errorsFor(f), {});
  f = form(); f.serviceGroups.forEach(function (g) { g.services = []; });
  assert.deepStrictEqual(errorsFor(f), {});
  assert.ok(/nobody can book/.test(warningsFor(f).services));
});

test("booking rules must be whole numbers in range; closed dates must be real dates", function () {
  var e = errorsFor(form({ minNoticeHours: "twelve", maxDaysAhead: "0", bufferMinutes: "-1", slotMinutes: "7" }));
  assert.ok(e.minNoticeHours && e.maxDaysAhead && e.bufferMinutes && e.slotMinutes);
  e = errorsFor(form({ closedDates: ["2026-12-25", "", "2026-12-25"] }));
  assert.ok(/Choose a date/.test(e["closedDates.1"]));
  assert.ok(/already in the list/.test(e["closedDates.2"]));
});

/* ---- form -> saved settings ---- */

test("fromForm normalises values and keeps the hero service valid", function () {
  var f = form({ phone: "415.555.0123", instagram: "@studio_sf", aboutText: "First line\ncontinues.\n\n\nSecond paragraph.  ", heroServiceId: "gone" });
  f.hours.monday = { open: true, from: "09:00", to: "13:00" };
  f.hours.saturday = { open: false, from: "10:00", to: "18:00" };
  f.closedDates = ["2027-01-01", "2026-12-25"];
  f.policies = ["  Keep this  ", "", "   "];
  firstService(f).minutes = "75"; firstService(f).price = "$99.50";
  var saved = Settings.fromForm(f);
  assert.strictEqual(saved.phone, "(415) 555-0123");
  assert.strictEqual(saved.instagram, "studio_sf");
  assert.deepStrictEqual(saved.about, ["First line continues.", "Second paragraph."]);
  assert.deepStrictEqual(saved.hours.monday, { open: "09:00", close: "13:00" });
  assert.strictEqual(saved.hours.saturday, null);
  assert.deepStrictEqual(saved.closedDates, ["2026-12-25", "2027-01-01"]);
  assert.deepStrictEqual(saved.policies, ["Keep this"]);
  assert.strictEqual(saved.serviceGroups[0].services[0].minutes, 75);
  assert.strictEqual(saved.serviceGroups[0].services[0].price, 99.5);
  assert.strictEqual(saved.booking.heroServiceId, "haircut-style");
  // And the result merges cleanly over the defaults
  assert.deepStrictEqual(merged(saved), Object.assign({}, DEFAULTS, saved, { booking: saved.booking }));
});

test("toForm -> fromForm -> merge reproduces the defaults exactly", function () {
  var saved = Settings.fromForm(Settings.toForm(DEFAULTS));
  assert.deepStrictEqual(merged(saved), DEFAULTS);
});

test("new service ids are stable, readable and never collide", function () {
  assert.strictEqual(Settings.newServiceId("Scalp treatment", ["blowout"]), "scalp-treatment");
  assert.strictEqual(Settings.newServiceId("Blowout", ["blowout", "blowout-2"]), "blowout-3");
  assert.strictEqual(Settings.newServiceId("", []), "service");
  assert.strictEqual(Settings.newServiceId("<script>", []), "script");
});

/* ---- generating config.js ---- */

test("a generated config file loads to exactly the effective settings", function () {
  var text = Settings.generateConfigFile(DEFAULTS, { date: "2026-11-13" });
  assert.deepStrictEqual(runConfig(text), DEFAULTS);
  var edited = merged({ businessName: "Fog and Shear", phone: "(415) 555-0123", hours: Object.assign({}, DEFAULTS.hours, { saturday: { open: "09:00", close: "15:00" } }) });
  assert.deepStrictEqual(runConfig(Settings.generateConfigFile(edited)), edited);
});

test("the generated file keeps keys the form can't edit and has comments", function () {
  var text = Settings.generateConfigFile(DEFAULTS);
  var loaded = runConfig(text);
  assert.strictEqual(loaded.previewMode, true);
  assert.strictEqual(loaded.timeZone, "America/Los_Angeles");
  assert.strictEqual(loaded.currency, "$");
  assert.ok(/\/\* ---------- Services and prices ---------- \*\//.test(text));
  assert.ok(/replace js\/config\.js/.test(text));
  var withExtra = Object.assign({}, DEFAULTS, { "some-new-key": { a: 1 } });
  assert.deepStrictEqual(runConfig(Settings.generateConfigFile(withExtra)), withExtra);
});

test("hostile text survives save -> generate -> load as plain, inert text", function () {
  var hostile = [
    "</script><script>alert(1)</script>",
    "<img src=x onerror=alert(1)>",
    "Quote \" and 'single' and `back` ticks",
    "Back\\slash \\n not a newline \\u0041",
    "Comment */ end /* start",
    "Template ${alert(1)}",
    "Line\u2028separator\u2029para",
    "Unicode caf\u00e9 \ud83d\udc87"
  ];
  var f = form({
    businessName: hostile[0],
    descriptor: hostile[1],
    heroSentence: hostile[2],
    ownerName: hostile[3],
    aboutText: hostile.join("\n\n"),
    priceNote: hostile[4],
    cancellationPolicy: hostile[5],
    licenseNumber: hostile[6],
    policies: hostile.slice()
  });
  firstService(f).name = hostile[1];
  firstService(f).description = hostile[7];
  f.heroImage = { src: "images/a.jpg", alt: hostile[1] };
  assert.deepStrictEqual(errorsFor(f), {});
  var saved = Settings.fromForm(f);
  var effective = merged(JSON.parse(JSON.stringify(saved))); // as if read back from storage
  var text = Settings.generateConfigFile(effective);
  assert.ok(text.indexOf("</script>") === -1, "no raw </script> in the file");
  assert.ok(text.indexOf("<img") === -1, "no raw tags in the file");
  var loaded = runConfig(text);
  assert.deepStrictEqual(loaded, effective);
  assert.strictEqual(loaded.businessName, hostile[0]);
  assert.strictEqual(loaded.descriptor, hostile[1]);
  assert.strictEqual(loaded.serviceGroups[0].services[0].name, hostile[1]);
  assert.deepStrictEqual(loaded.policies, hostile);
  // The sandbox never ran anything from the strings.
  var ran = false;
  vm.runInNewContext(text, { window: {}, alert: function () { ran = true; } });
  assert.strictEqual(ran, false);
});

test("hostile links never get through: javascript: images and Instagram are refused", function () {
  var f = form({ instagram: "javascript:alert(1)" });
  f.gallery[0].src = "javascript:alert(1)";
  var e = errorsFor(f);
  assert.ok(e.instagram && e["gallery.0.src"]);
  var s = merged({ instagram: "javascript:alert(1)", gallery: [{ src: "javascript:alert(1)", alt: "" }], portrait: { src: "JAVASCRIPT:alert(1)", alt: "" } });
  assert.strictEqual(s.instagram, "");
  assert.deepStrictEqual(s.gallery, []);
  assert.deepStrictEqual(s.portrait, DEFAULTS.portrait);
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
    console.log("        " + (err && err.message).split("\n").slice(0, 12).join("\n        "));
  }
});
console.log("\n" + (tests.length - failed) + " of " + tests.length + " tests passed.");
process.exitCode = failed ? 1 : 0;
