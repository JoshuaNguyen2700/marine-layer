/*
  ============================================================
  SITE CONTENT: edit this file to change what the site says.
  ============================================================

  How to edit safely:
  - Change only the text between the quote marks "like this".
  - Keep every comma at the end of a line where it already is.
  - To leave something out (for example a phone number you don't
    want to publish yet), set it to empty quotes: "".
    Empty fields simply don't appear on the site.
  - Save the file and reload the page to see the change.
*/

window.SITE = {

  /* ---------- Name and basics ---------- */

  businessName: "Marine Layer",
  descriptor: "Hair, makeup, lashes and brows in San Francisco",

  // One plain sentence shown under the name at the top of the page.
  heroSentence:
    "Book a haircut, color, styling, makeup, lashes or brows with a newly licensed cosmetologist in San Francisco.",

  // Your own name, for example "Sam Rivera". Leave "" to keep it off the site.
  ownerName: "",

  // A few short paragraphs about you, written as you. Each pair of
  // quotes is one paragraph. Replace these with your own words.
  about: [
    "I'm a cosmetologist licensed in California, and I work in San Francisco.",
    "I do hair (cuts, color, highlights and styling) as well as makeup, lashes and brows.",
    "I'm newly licensed and taking new clients now. Book a time on this page, and add a note if there's anything I should know before we start."
  ],

  /* ---------- Photos ---------- */
  //
  //  PLACEHOLDER STOCK PHOTOS. Replace before the site goes live.
  //
  //  Every photo below is a free stock photo from Pexels (pexels.com),
  //  loaded straight from Pexels. None of them show the owner or the
  //  owner's clients. Swap each one for your own photos before launch,
  //  and only ever show your own clients' results (with their permission)
  //  as examples of your work.
  //
  //  To use your own photo: put the file in the site folder (for example
  //  in a folder called "images") and change src to "images/your-file.jpg".
  //  Always describe the photo in alt, for people using screen readers.
  //  To remove a photo, set it to null (or remove a gallery line).
  //  "source" is only a note of where the placeholder came from.

  // Shown next to "Next open appointments" at the top of the page.
  heroImage: {
    src: "https://images.pexels.com/photos/7440129/pexels-photo-7440129.jpeg?auto=compress&cs=tinysrgb&w=1200",
    alt: "A stylist blow-drying the long, light blonde hair of a smiling woman in a salon",
    source: "https://www.pexels.com/photo/photo-of-a-man-using-a-hair-dryer-on-a-woman-7440129/"
  },

  // A short row of photos between the price menu and booking.
  galleryTitle: "Hair, makeup, lashes and brows",
  gallery: [
    { src: "https://images.pexels.com/photos/7440135/pexels-photo-7440135.jpeg?auto=compress&cs=tinysrgb&w=800",
      alt: "A stylist brushing through a woman's long, wavy blonde hair",
      source: "https://www.pexels.com/photo/photo-of-a-woman-in-a-gray-shirt-getting-her-hair-brushed-7440135/" },
    { src: "https://images.pexels.com/photos/5646475/pexels-photo-5646475.jpeg?auto=compress&cs=tinysrgb&w=800",
      alt: "A bride with soft, shoulder-length waves getting ready for her wedding",
      source: "https://www.pexels.com/photo/a-close-up-shot-of-a-beautiful-woman-5646475/" },
    { src: "https://images.pexels.com/photos/33986832/pexels-photo-33986832.jpeg?auto=compress&cs=tinysrgb&w=800",
      alt: "A makeup artist applying lip color to a bride in a white robe, her hair in an updo",
      source: "https://www.pexels.com/photo/bride-getting-makeup-done-before-wedding-ceremony-33986832/" },
    { src: "https://images.pexels.com/photos/7984966/pexels-photo-7984966.jpeg?auto=compress&cs=tinysrgb&w=800",
      alt: "A makeup artist working on a seated client's face in a bright beauty studio",
      source: "https://www.pexels.com/photo/woman-in-peachy-t-shirt-doing-makeup-on-woman-sitting-on-the-chair-7984966/" },
    { src: "https://images.pexels.com/photos/12323068/pexels-photo-12323068.jpeg?auto=compress&cs=tinysrgb&w=800",
      alt: "A woman in a terry headband applying mascara to her lashes",
      source: "https://www.pexels.com/photo/young-woman-doing-makeup-with-mascara-12323068/" },
    { src: "https://images.pexels.com/photos/4972986/pexels-photo-4972986.jpeg?auto=compress&cs=tinysrgb&w=800",
      alt: "Close-up of a softly groomed brow and eye",
      source: "https://www.pexels.com/photo/womans-face-with-black-hair-4972986/" }
  ],

  // Photo for the About section. This placeholder is a stock photo of a
  // model, not the owner: replace it with a photo of you, or set
  // it to null to show no photo.
  portrait: {
    src: "https://images.pexels.com/photos/24362255/pexels-photo-24362255.jpeg?auto=compress&cs=tinysrgb&w=900",
    alt: "Placeholder stock photo of a smiling woman with shoulder-length dark hair in a black top, against a grey background",
    source: "https://www.pexels.com/photo/smiling-woman-in-black-tank-top-24362255/"
  },


  /* ---------- Where and how to reach you ---------- */
  // Any field left as "" is hidden on the site.

  city: "San Francisco, California",
  neighborhood: "",        // e.g. "Inner Sunset"
  streetAddress: "",       // e.g. "1234 Irving Street, Suite 2"
  phone: "",               // e.g. "(415) 555-0123"
  email: "",               // e.g. "hello@example.com"
  instagram: "",           // your handle without the @, e.g. "marinelayer.sf"

  // Your California Board of Barbering and Cosmetology license number.
  // The footer always says "California cosmetology license";
  // the number is added once you fill it in here.
  licenseNumber: "",


  /* ---------- Time zone ---------- */
  // All booking times are your local studio time.
  timeZone: "America/Los_Angeles",   // don't change unless you move
  timeZoneLabel: "Pacific Time",


  /* ---------- Weekly hours ---------- */
  // 24-hour clock: "10:00" is 10 am, "18:00" is 6 pm.
  // Set a day to null to mark it closed.

  hours: {
    sunday:    null,
    monday:    null,
    tuesday:   { open: "10:00", close: "18:00" },
    wednesday: { open: "10:00", close: "18:00" },
    thursday:  { open: "10:00", close: "18:00" },
    friday:    { open: "10:00", close: "18:00" },
    saturday:  { open: "10:00", close: "18:00" }
  },

  // Single days you're closed (holidays, time off), written "YYYY-MM-DD".
  // Example: closedDates: ["2026-12-25", "2027-01-01"],
  closedDates: [],


  /* ---------- Booking rules ---------- */

  booking: {
    slotMinutes: 15,          // start times are offered every 15 minutes
    bufferMinutes: 15,        // cleanup time kept free after each appointment
    minNoticeHours: 12,       // how far ahead someone must book
    maxDaysAhead: 60,         // how far into the future people can book
    heroServiceId: "haircut-style"  // service used for "Next open appointments" at the top
  },

  // true  = bookings are stored only in the browser they were made in
  //         (for trying the site out). A small notice says so.
  // false = only once a real booking backend is connected (see README).
  previewMode: true,


  /* ---------- Policies ---------- */
  // Shown on the page and on the confirmation screen.

  cancellationPolicy:
    "Please give at least 24 hours' notice to cancel or reschedule.",

  policies: [
    "Please give at least 24 hours' notice to cancel or reschedule.",
    "Color services may need a patch test or a short consultation first."
  ],

  priceNote:
    "Prices marked “from” are starting prices and can change with hair length and thickness.",


  /* ---------- Services and prices ---------- */
  // minutes:   how long the appointment takes
  // price:     a number, no $ sign
  // priceFrom: true shows "from $110", false shows "$110"
  // id:        a short label used by the booking system; don't change it
  //            once people have booked, and keep each one different.

  currency: "$",

  serviceGroups: [
    {
      name: "Hair",
      services: [
        { id: "haircut-style", name: "Haircut and style", minutes: 60, price: 95, priceFrom: false,
          description: "A cut shaped to how you wear your hair, finished with a blow-dry and style." },
        { id: "blowout", name: "Blowout", minutes: 45, price: 65, priceFrom: false,
          description: "Wash and blow-dry, smooth or with volume. No cut." },
        { id: "root-touch-up", name: "Root touch-up color", minutes: 90, price: 110, priceFrom: true,
          description: "Color on new growth at the roots, matched to the rest of your hair." },
        { id: "all-over-color", name: "All-over color", minutes: 120, price: 150, priceFrom: true,
          description: "One color from roots to ends." },
        { id: "partial-highlights", name: "Partial highlights", minutes: 150, price: 190, priceFrom: true,
          description: "Highlights through the top and around your face." },
        { id: "full-highlights", name: "Full highlights or balayage", minutes: 210, price: 280, priceFrom: true,
          description: "Highlights throughout, foiled or hand-painted for a softer grow-out." },
        { id: "gloss-toner", name: "Gloss or toner", minutes: 45, price: 60, priceFrom: false,
          description: "A sheer color layer that adjusts tone and adds shine." },
        { id: "deep-conditioning", name: "Deep conditioning treatment", minutes: 30, price: 40, priceFrom: false,
          description: "A conditioning treatment for dry or color-treated hair." },
        { id: "event-styling", name: "Event styling or updo", minutes: 75, price: 110, priceFrom: false,
          description: "An updo or finished style for a wedding, party or photos." }
      ]
    },
    {
      name: "Makeup, lashes and brows",
      services: [
        { id: "event-makeup", name: "Event makeup", minutes: 60, price: 120, priceFrom: false,
          description: "Full makeup for an event, a night out or photos." },
        { id: "bridal-trial", name: "Bridal makeup trial", minutes: 90, price: 150, priceFrom: false,
          description: "A run-through of your wedding-day makeup, so the look is settled ahead of time." },
        { id: "lash-lift-tint", name: "Lash lift and tint", minutes: 60, price: 95, priceFrom: false,
          description: "Lifts and darkens your natural lashes. No extensions." },
        { id: "classic-lash-full", name: "Classic lash extensions, full set", minutes: 120, price: 160, priceFrom: false,
          description: "One extension on each natural lash for length and fullness." },
        { id: "lash-fill", name: "Lash fill", minutes: 60, price: 75, priceFrom: false,
          description: "Replaces extensions that have grown out since your last set or fill." },
        { id: "brow-shaping", name: "Brow shaping", minutes: 30, price: 35, priceFrom: false,
          description: "Brows shaped and cleaned up to suit your face." },
        { id: "brow-tint", name: "Brow tint", minutes: 20, price: 25, priceFrom: false,
          description: "Tints brow hairs for more color and definition." },
        { id: "brow-lamination", name: "Brow lamination", minutes: 45, price: 80, priceFrom: false,
          description: "Sets brow hairs in a fuller, brushed-up shape." }
      ]
    }
  ]
};
