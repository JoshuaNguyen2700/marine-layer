/*
  Renders everything that comes from js/config.js: names, service menu,
  photos, about, hours, contact, policies and the footer license line.
  Also exposes small helpers (window.SiteUI) used by booking.js and
  appointments.js. Any element it looks for may be missing on a page;
  it simply skips that part.
*/
(function () {
  "use strict";

  var SITE = window.SITE || {};
  var S = window.Scheduling;

  /* ---------- Helpers ---------- */

  function has(value) {
    return typeof value === "string" ? value.trim() !== "" : value != null;
  }

  // el("p", { class: "x", text: "hi" }, child, child...)
  function el(tag, attrs) {
    var node = document.createElement(tag);
    attrs = attrs || {};
    Object.keys(attrs).forEach(function (key) {
      var v = attrs[key];
      if (v == null || v === false) return;
      if (key === "text") node.textContent = v;
      else if (key === "class") node.className = v;
      else if (key === "dataset") Object.keys(v).forEach(function (d) { node.dataset[d] = v[d]; });
      else if (key.indexOf("on") === 0 && typeof v === "function") node.addEventListener(key.slice(2), v);
      else if (v === true) node.setAttribute(key, "");
      else node.setAttribute(key, v);
    });
    for (var i = 2; i < arguments.length; i++) append(node, arguments[i]);
    return node;
  }

  function append(node, child) {
    if (child == null || child === false) return;
    if (Array.isArray(child)) { child.forEach(function (c) { append(node, c); }); return; }
    node.appendChild(typeof child === "string" ? document.createTextNode(child) : child);
  }

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
    return node;
  }

  function services() {
    var out = [];
    (SITE.serviceGroups || []).forEach(function (g) {
      (g.services || []).forEach(function (s) { out.push(s); });
    });
    return out;
  }

  function findService(id) {
    return services().filter(function (s) { return s.id === id; })[0] || null;
  }

  function formatMoney(amount) {
    var n = Number(amount);
    var text = n % 1 === 0 ? String(n) : n.toFixed(2);
    return (SITE.currency || "$") + text;
  }

  function formatPrice(service) {
    if (!service || !has(service.price)) return "";
    return (service.priceFrom ? "from " : "") + formatMoney(service.price);
  }

  function formatDuration(minutes) {
    var h = Math.floor(minutes / 60), m = minutes % 60;
    if (!h) return m + " min";
    return h + " hr" + (m ? " " + m + " min" : "");
  }

  function now() {
    return S.nowInZone(SITE.timeZone || "America/Los_Angeles");
  }

  // Format a "YYYY-MM-DD" key without ever parsing it as a local date.
  // style: "long" -> "Tuesday, November 17", "short" -> "Tue, Nov 17"
  function formatDate(key, style) {
    var p = S.parseDateKey(key);
    var d = new Date(Date.UTC(p.year, p.month - 1, p.day, 12));
    var showYear = p.year !== S.parseDateKey(now().date).year;
    var opts = style === "short"
      ? { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }
      : { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" };
    if (showYear) opts.year = "numeric";
    return new Intl.DateTimeFormat("en-US", opts).format(d);
  }

  function formatMonth(year, month) {
    return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" })
      .format(new Date(Date.UTC(year, month - 1, 1, 12)));
  }

  /*
    Links built from settings. Every value the owner or a client typed is
    rendered as text (textContent), never as HTML, and every link is built
    with a fixed scheme so nothing can become a javascript: link.
  */
  var Settings = window.Settings;

  function telHref(phone) {
    // Digits and a leading + only.
    var digits = String(phone).replace(/[^\d+]/g, "").replace(/(?!^)\+/g, "");
    return "tel:" + digits;
  }

  function mailHref(email) {
    var value = String(email).trim();
    if (Settings && Settings.emailProblem(value)) return null;
    if (!/^[^\s@<>"']+@[^\s@<>"']+$/.test(value)) return null;
    return "mailto:" + encodeURI(value);
  }

  function instagramHandle(value) {
    if (Settings) return Settings.normalizeInstagram(value) || "";
    var s = String(value).trim().replace(/^@/, "");
    return /^[A-Za-z0-9._]{1,30}$/.test(s) ? s : "";
  }

  function safeImageSrc(src) {
    if (Settings) return Settings.isSafeImageSrc(src);
    return /^https?:\/\//i.test(String(src).trim());
  }

  function locationLine() {
    var parts = [];
    if (has(SITE.streetAddress)) parts.push(SITE.streetAddress.trim());
    if (has(SITE.neighborhood)) parts.push(SITE.neighborhood.trim());
    if (has(SITE.city)) parts.push(SITE.city.trim());
    return parts.join(", ");
  }

  function prefersReducedMotion() {
    return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  /*
    Put a configured photo into a <figure> (or any box) that already has
    a fixed aspect ratio in CSS. No config -> the box is hidden.
    Image fails to load -> the image is removed and the Fog-coloured box
    stays, so nothing looks broken.
  */
  function fillPhoto(box, image, opts) {
    if (!box) return;
    clear(box);
    if (!image || !has(image.src) || !safeImageSrc(image.src)) { box.hidden = true; return; }
    box.hidden = false;
    opts = opts || {};
    var img = el("img", {
      src: String(image.src).trim(),
      alt: typeof image.alt === "string" ? image.alt : "",
      width: opts.width || 800,
      height: opts.height || 1000,
      loading: opts.eager ? "eager" : "lazy",
      decoding: "async",
      fetchpriority: opts.eager ? "high" : null
    });
    img.addEventListener("error", function () {
      if (img.parentNode) img.parentNode.removeChild(img);
      box.classList.add("photo--missing");
    });
    img.addEventListener("load", function () { box.classList.add("photo--loaded"); });
    box.appendChild(img);
  }

  window.SiteUI = {
    has: has, el: el, clear: clear, services: services, findService: findService,
    formatPrice: formatPrice, formatDuration: formatDuration, formatDate: formatDate,
    formatMonth: formatMonth, formatTime: function (m) { return S.formatTime12(m); },
    now: now, telHref: telHref, mailHref: mailHref, locationLine: locationLine,
    prefersReducedMotion: prefersReducedMotion, fillPhoto: fillPhoto
  };

  /* ---------- Rendering ---------- */

  function setText(selector, value) {
    document.querySelectorAll(selector).forEach(function (node) {
      if (has(value)) { node.textContent = value; node.hidden = false; }
      else node.hidden = true;
    });
  }

  function renderBasics() {
    setText("[data-site='name']", SITE.businessName);
    setText("[data-site='descriptor']", SITE.descriptor);
    setText("[data-site='heroSentence']", SITE.heroSentence);
    setText("[data-site='priceNote']", SITE.priceNote);
    setText("[data-site='timeZoneLabel']", SITE.timeZoneLabel);
  }

  function renderMenu() {
    var menu = document.getElementById("menu");
    if (!menu) return;
    clear(menu);
    (SITE.serviceGroups || []).forEach(function (group, gi) {
      if (!(group.services || []).length) return; // empty groups stay off the public menu
      var headingId = "menu-group-" + gi;
      var list = el("ul", { class: "menu__list", role: "list" });
      (group.services || []).forEach(function (s) {
        list.appendChild(el("li", { class: "menu__row" },
          el("div", { class: "menu__what" },
            el("h4", { class: "menu__name", text: s.name }),
            has(s.description) ? el("p", { class: "menu__desc", text: s.description }) : null
          ),
          el("p", { class: "menu__duration" },
            el("span", { class: "sr-only", text: "Duration: " }), formatDuration(s.minutes)),
          el("p", { class: "menu__price" },
            el("span", { class: "sr-only", text: "Price: " }), formatPrice(s)),
          el("button", {
            type: "button", class: "button button--line menu__book",
            "aria-label": "Book " + s.name.toLowerCase(),
            dataset: { serviceId: s.id },
            text: "Book"
          })
        ));
      });
      menu.appendChild(el("section", { class: "menu__group", "aria-labelledby": headingId },
        el("h3", { class: "menu__group-title", id: headingId, text: group.name }),
        list
      ));
    });

    menu.addEventListener("click", function (event) {
      var btn = event.target.closest("[data-service-id]");
      if (!btn) return;
      document.dispatchEvent(new CustomEvent("booking:start", { detail: { serviceId: btn.dataset.serviceId } }));
    });
  }

  function renderPhotos() {
    fillPhoto(document.getElementById("hero-photo"), SITE.heroImage, { width: 1200, height: 800, eager: true });

    var section = document.getElementById("gallery");
    var grid = document.getElementById("gallery-grid");
    if (section && grid) {
      var items = (SITE.gallery || []).filter(function (g) { return g && has(g.src); });
      clear(grid);
      if (!items.length) { section.hidden = true; }
      else {
        section.hidden = false;
        setText("[data-site='galleryTitle']", SITE.galleryTitle || "Photos");
        items.forEach(function (image) {
          var fig = el("figure", { class: "photo gallery__item" });
          grid.appendChild(el("li", null, fig));
          fillPhoto(fig, image, { width: 800, height: 1000 });
        });
      }
    }
  }

  function renderAbout() {
    var body = document.getElementById("about-body");
    if (!body) return;
    clear(body);
    if (has(SITE.ownerName)) body.appendChild(el("p", { class: "about__name", text: SITE.ownerName }));
    (SITE.about || []).forEach(function (para) {
      if (has(para)) body.appendChild(el("p", { text: para }));
    });
    var portrait = document.getElementById("about-portrait");
    fillPhoto(portrait, SITE.portrait, { width: 900, height: 1125 });
    var layout = document.querySelector(".about");
    if (layout) layout.classList.toggle("about--with-photo", !!(portrait && !portrait.hidden));
  }

  function renderVisit() {
    var where = document.getElementById("visit-where");
    if (where) {
      var line = locationLine();
      setText("#visit-where-text", line);
      where.hidden = !has(line);
    }

    var hoursBody = document.getElementById("hours-body");
    if (hoursBody) {
      clear(hoursBody);
      // Week shown Monday first, the way people read opening hours.
      var order = [1, 2, 3, 4, 5, 6, 0];
      order.forEach(function (i) {
        var name = S.DAY_NAMES[i];
        var day = SITE.hours && SITE.hours[name];
        var label = name.charAt(0).toUpperCase() + name.slice(1);
        var value = day && day.open && day.close
          ? S.formatTime12(S.parseTime(day.open)) + " to " + S.formatTime12(S.parseTime(day.close))
          : "Closed";
        hoursBody.appendChild(el("tr", { class: day ? "" : "is-closed" },
          el("th", { scope: "row", text: label }),
          el("td", { text: value })
        ));
      });
    }

    var contact = document.getElementById("visit-contact");
    var list = document.getElementById("contact-list");
    if (contact && list) {
      clear(list);
      if (has(SITE.phone) && /\d/.test(SITE.phone)) {
        list.appendChild(el("li", null, el("span", { class: "contact__label", text: "Phone" }),
          el("a", { href: telHref(SITE.phone), text: SITE.phone.trim() })));
      }
      if (has(SITE.email) && mailHref(SITE.email)) {
        list.appendChild(el("li", null, el("span", { class: "contact__label", text: "Email" }),
          el("a", { href: mailHref(SITE.email), text: SITE.email.trim() })));
      }
      if (has(SITE.instagram)) {
        var handle = instagramHandle(SITE.instagram);
        if (handle) {
          list.appendChild(el("li", null, el("span", { class: "contact__label", text: "Instagram" }),
            el("a", { href: "https://www.instagram.com/" + encodeURIComponent(handle) + "/", rel: "me", text: "@" + handle })));
        }
      }
      contact.hidden = !list.children.length;
    }

    var policies = document.getElementById("policy-list");
    if (policies) {
      clear(policies);
      (SITE.policies || []).forEach(function (p) { if (has(p)) policies.appendChild(el("li", { text: p })); });
      var wrap = document.getElementById("visit-policies");
      if (wrap) wrap.hidden = !policies.children.length;
    }
  }

  function renderFooter() {
    var license = document.getElementById("license-line");
    if (license) {
      license.textContent = "California cosmetology license" +
        (has(SITE.licenseNumber) ? " " + SITE.licenseNumber.trim() : "");
    }
    var year = document.getElementById("footer-year");
    if (year) year.textContent = S.parseDateKey(now().date).year;
  }

  function renderPreviewNotices() {
    document.querySelectorAll("[data-preview-note]").forEach(function (node) {
      node.hidden = !SITE.previewMode;
    });
  }

  function renderTitle() {
    if (!has(SITE.businessName)) return;
    var page = document.body.dataset.page;
    if (page === "home") {
      document.title = SITE.businessName + (has(SITE.descriptor) ? ": " + SITE.descriptor.charAt(0).toLowerCase() + SITE.descriptor.slice(1) : "");
    } else if (page === "appointments") {
      document.title = "Appointments: " + SITE.businessName;
    } else if (page === "owner") {
      document.title = "Edit site: " + SITE.businessName;
    }
  }

  renderBasics();
  renderTitle();
  renderMenu();
  renderPhotos();
  renderAbout();
  renderVisit();
  renderFooter();
  renderPreviewNotices();
})();
