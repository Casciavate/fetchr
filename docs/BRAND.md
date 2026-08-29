# fetchr — Brand & Design System

**Direction:** Boarding Pass · **Mark:** M3 "Takeoff f" · **Version:** 1.0 · **Date:** 2026-08-28

This file is the single source of truth for how fetchr looks, sounds and behaves.
It is self-contained: every value, every SVG and every line of CSS needed to
rebuild the interface is in this document. Hand it to a fresh session with no
other context and it is enough.

Scope note: this document specifies design. It does not change application code.

---

## Assumptions

These were decided in the absence of a stated requirement. Each is a real choice,
not a placeholder — change them here first, then in code.

1. **Spelling is British-leaning: "Traveller" (two l's).** The codebase currently
   writes `Traveler`. All *user-facing* strings move to `Traveller`; database
   columns, props and variable names stay as they are.
2. **"Sender" replaces "Shipper" in all UI copy.** DB columns (`shipper_id`,
   `shipment_requests`) are untouched. §11 gives the full mapping.
3. **No traveller/sender mode toggle.** Role stays inferred from data
   (`getUserRole()` in `Dashboard.jsx`), both surfaces visible at once. §10
   specifies how the two contexts are distinguished without a switch.
4. **Dark theme ships, but as phase 2.** Every token has a dark value here and
   the CSS block defines both; the app may launch light-only. Nothing in the
   spec assumes dark exists.
5. **Tailwind 3.4 + CRA stays.** No migration to v4 or Vite is assumed. The
   unused `@tailwindcss/vite` dependency is dead weight and should be removed,
   but that is a code task, not a design decision.
6. **Currency is USD only**, matching the current Stripe test account. Any
   multi-currency work invalidates the money formatting rules in §11.
7. **Distances/weights are metric (kg).** No lb variant is specified.
8. **The barcode strip on tickets is decorative today** and encodes match id +
   route + date as text only. It is specified so that a scannable handover code
   can replace it later without a redesign.

---

## 1. Brand foundation

### 1.1 Positioning statement

> **fetchr turns the empty space in someone's suitcase into a delivery network.**
> People already flying carry what other people need — cheaper than a courier,
> faster than freight, and into places couriers don't reach. Every handover is
> documented, insured and paid through escrow, so two strangers can trade a
> favour with the confidence of a contract.

Say it shorter when you need to: **Spare luggage space, delivered.**

### 1.2 Personality attributes

Five attributes. Each is defined by what the product *does*, not by an adjective.

| Attribute | Behavioural definition |
|---|---|
| **Documented** | Every state change produces a record with a reference, a timestamp and a party. Nothing important happens without a receipt the user can point at. |
| **Direct** | One clear next action per screen, named as a verb. The product tells you whose turn it is before you have to ask. |
| **Worldly** | Treats Lagos, Manila and Frankfurt as equally normal. No country is "exotic", no route is "unusual", no name is mispronounced by the layout. |
| **Even-handed** | Traveller and sender see the same facts, the same fees and the same protections. The UI never advocates for one side against the other. |
| **Unshowy** | Confidence comes from precision, not decoration. We would rather ship a screen that is boring and correct than one that is impressive and vague. |

### 1.3 Voice and tone

**Voice** (constant): plain, specific, calm. Short sentences. Concrete nouns.
Numbers rather than adjectives — "3.5 kg free", never "plenty of space".

**Tone** (varies by moment):

| Moment | Tone | Example |
|---|---|---|
| Browsing matches | Neutral, informative | "8 travellers on this route in the next 30 days." |
| Money about to move | Precise, unhurried | "You'll pay $268.00 now. We hold it until you both confirm delivery." |
| Waiting on the other party | Reassuring, factual | "Amara has been notified. Most travellers reply within a day." |
| Something went wrong | Direct, accountable, no apology theatre | "Payment didn't go through — your bank declined it. Try another card." |
| Dispute or cancellation | Formal, protective, specific | "This deal is on hold. Your $268.00 stays in escrow until it's resolved." |
| Success | Brief. Then get out of the way | "Delivered. $15.84 is in your wallet." |

### 1.4 Anti-patterns — never do these

- **Never use exclamation marks** in product UI. Not in success toasts, not in
  empty states. "Delivered." is stronger than "Delivered!"
- **Never say "Oops", "Uh oh", "Whoops", or "Something went wrong"** — the last
  one is a confession that we didn't check.
- **Never call money "funds", "balance movement" or "disbursement".** It is
  money, it is paid, held, released or returned.
- **Never use "just", "simply", "easy" or "quick"** to describe an action the
  user hasn't done yet.
- **Never anthropomorphise the product.** fetchr does not "think", "love" or
  "get excited". It holds money and issues records.
- **Never use emoji in product UI.** (Current code violates this in
  `ActiveDeals.jsx` status map and `App.js` loader — see §13.4.)
- **Never hide a fee behind a chevron.** Every amount that leaves or enters a
  user's account is visible before the button that moves it.
- **Never use a countdown or scarcity device** ("2 travellers left!"). This is a
  trust product; urgency tactics are corrosive to it.
- **Never illustrate with cartoon globes, dotted-line world maps with plane
  arcs, or a smiling delivery person.** Those are the visual clichés of every
  logistics startup deck.
- **Never let orange mean anything other than "your turn".** See §3.

---

## 2. Logo

### 2.1 Concept

The mark is the **f** of fetchr, drawn so that its ascender is a **takeoff
curve** — the stem rises off the baseline, arcs right, and releases an orange
delta that clears the tile. Three readings sit on top of each other:

1. **A letterform** — it is our initial, so it is ownable in a way a generic
   plane or box is not.
2. **A departure** — stem, rotation, climb-out. The geometry is a takeoff roll.
3. **A dispatch** — the delta leaves the containing square; something has been
   sent and is now outside the system's walls.

The **crossbar of the f is the perforation rule** — the same 1px dashed line
that tears every ticket card in the product in half. The identity and the
interface are built from one piece of geometry.

The delta is the only orange element. It is the thing that moves. Everything
else is ink.

### 2.2 Mark — primary (inline SVG)

Canonical artboard is 48×48. All coordinates below are on that grid.

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="48" height="48"
     role="img" aria-label="fetchr">
  <rect width="48" height="48" rx="10" fill="#14181F"/>
  <path d="M17.5 37 V21.5 C17.5 15 23 12.5 27.5 14.5"
        fill="none" stroke="#FBFAF8" stroke-width="4.6" stroke-linecap="round"/>
  <rect x="10.5" y="21" width="16" height="4.4" rx="2.2" fill="#FBFAF8"/>
  <path d="M29 10.5 L38.5 15.5 L29 20.5 L31.4 15.5 Z" fill="#DC5518"/>
</svg>
```

### 2.3 Mark — small size variant (≤ 20px)

At 20px and below, the stroke thickens and the crossbar deepens so the counters
don't fill in. **Use this file for the 16px favicon.**

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="16" height="16"
     role="img" aria-label="fetchr">
  <rect width="48" height="48" rx="10" fill="#14181F"/>
  <path d="M17.5 37 V21.5 C17.5 15 23 12.5 27.5 14.5"
        fill="none" stroke="#FBFAF8" stroke-width="5.2" stroke-linecap="round"/>
  <rect x="10.5" y="20.8" width="16" height="5" rx="2.5" fill="#FBFAF8"/>
  <path d="M29 10 L39 15.5 L29 21 L31.6 15.5 Z" fill="#DC5518"/>
</svg>
```

### 2.4 Mark — reversed (on ink or photography)

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="48" height="48"
     role="img" aria-label="fetchr">
  <rect width="48" height="48" rx="10" fill="#FBFAF8"/>
  <path d="M17.5 37 V21.5 C17.5 15 23 12.5 27.5 14.5"
        fill="none" stroke="#14181F" stroke-width="4.6" stroke-linecap="round"/>
  <rect x="10.5" y="21" width="16" height="4.4" rx="2.2" fill="#14181F"/>
  <path d="M29 10.5 L38.5 15.5 L29 20.5 L31.4 15.5 Z" fill="#DC5518"/>
</svg>
```

### 2.5 Mark — monochrome (one colour, e.g. fax, embossing, single-colour print)

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="48" height="48"
     role="img" aria-label="fetchr">
  <rect x="1.25" y="1.25" width="45.5" height="45.5" rx="9.4"
        fill="none" stroke="currentColor" stroke-width="2.5"/>
  <path d="M17.5 37 V21.5 C17.5 15 23 12.5 27.5 14.5"
        fill="none" stroke="currentColor" stroke-width="4.6" stroke-linecap="round"/>
  <rect x="10.5" y="21" width="16" height="4.4" rx="2.2" fill="currentColor"/>
  <path d="M29 10.5 L38.5 15.5 L29 20.5 L31.4 15.5 Z" fill="currentColor"/>
</svg>
```

### 2.6 Mark — bare glyph (no tile)

For use inside the ink ticket header bar, where the tile would double up.

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="20" height="20"
     role="img" aria-label="fetchr">
  <path d="M17.5 37 V21.5 C17.5 15 23 12.5 27.5 14.5"
        fill="none" stroke="#FBFAF8" stroke-width="5" stroke-linecap="round"/>
  <rect x="10.5" y="21" width="16" height="4.6" rx="2.3" fill="#FBFAF8"/>
  <path d="M29 10.5 L39 15.5 L29 20.5 L31.4 15.5 Z" fill="#DC5518"/>
</svg>
```

### 2.7 Wordmark

The wordmark is **`fetchr`, always lowercase**, set in **Archivo ExtraBold (800)
with −0.05em tracking**, in `--ink-900` (or `--paper-100` reversed).

**In the app**, render it as HTML text next to the mark SVG — do not ship a
wordmark image:

```html
<span class="flex items-center gap-[11px]">
  <!-- mark SVG from §2.2 at 42px -->
  <span class="font-display font-extrabold text-[34px] leading-none tracking-[-0.05em] text-ink-900">
    fetchr
  </span>
</span>
```

**For anything that leaves the app** (app store assets, PDFs, email headers,
merch, favicons), the wordmark **must be converted to outlines**. This is a
required step, not an optimisation — an SVG that names a font renders as Times
on any machine without Archivo installed.

> **⚠️ Conversion required.** The SVG below uses `<text>` and therefore depends
> on the Archivo font being present. Before shipping it anywhere outside the
> app: open in Inkscape or Figma → select the text → **Path ▸ Object to Path**
> (Inkscape) or **Outline stroke / Flatten** (Figma) → re-export. Then delete
> the `font-family` attribute; if the file still renders correctly with the
> font uninstalled, the conversion worked.

```svg
<!-- NEEDS OUTLINING BEFORE EXTERNAL USE — see warning above -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 48" width="200" height="48"
     role="img" aria-label="fetchr">
  <path d="M17.5 37 V21.5 C17.5 15 23 12.5 27.5 14.5"
        fill="none" stroke="#14181F" stroke-width="4.6" stroke-linecap="round"/>
  <rect x="10.5" y="21" width="16" height="4.4" rx="2.2" fill="#14181F"/>
  <path d="M29 10.5 L38.5 15.5 L29 20.5 L31.4 15.5 Z" fill="#DC5518"/>
  <text x="52" y="35" font-family="Archivo" font-weight="800" font-size="34"
        letter-spacing="-1.7" fill="#14181F">fetchr</text>
</svg>
```

### 2.8 Clear space

Define **x = one quarter of the mark's tile height** (at 48px, x = 12px).

- Clear space on all four sides of the **mark** = **x**.
- Clear space around the **horizontal lockup** = **x**, measured from the tile
  edge and from the cap height of the wordmark.
- Nothing enters that zone: no text, no rules, no card edges, no other icons.
- Exception, and the only one: inside the **ticket header bar**, the bare glyph
  (§2.6) uses **0.5x** left and right, because the bar itself is the clear space.

### 2.9 Minimum sizes

| Asset | Minimum | Notes |
|---|---|---|
| Mark, screen | **16px** | Use the §2.3 variant below 20px |
| Mark, print | **6mm** | |
| Horizontal lockup, screen | **96px** wide | Below this, drop the wordmark and use the mark alone |
| Horizontal lockup, print | **25mm** wide | |
| Bare glyph (§2.6) | **18px** | It has no tile to protect it; below 18px the delta detaches visually |

### 2.10 Favicon and app icons

| Size | Asset | Specification |
|---|---|---|
| **16×16** | `favicon-16.png` + SVG | §2.3 small variant. Full-bleed tile, radius scales to 3.3px. Never the bare glyph. |
| **32×32** | `favicon-32.png` | §2.3 small variant, radius 6.7px. |
| **180×180** | `apple-touch-icon.png` | §2.2 primary, **radius 0 — ship it square**. iOS applies its own mask; a pre-rounded icon gets double-rounded. Add 12px of ink padding on all sides so the glyph doesn't graze the mask. |
| **512×512** | `icon-512.png` (maskable) | §2.2 primary on a full-bleed `#14181F` ground, glyph scaled to 60% and centred, so it survives Android's maskable safe zone. |
| **any** | `icon.svg` | §2.2 primary, for `<link rel="icon" type="image/svg+xml">`. |

> ⚠️ **Verify before shipping:** the 180px Apple touch icon and 512px maskable
> sizes are what current platform docs called for at time of writing, and the
> maskable safe-zone ratio in particular changes between Android versions.
> Check Apple's Human Interface Guidelines and the W3C maskable-icon spec
> before you generate the final set.

Also update these, which are still Create React App defaults:
`public/manifest.json` (`short_name: "fetchr"`, `name: "fetchr — spare luggage
space, delivered"`, `theme_color: "#14181F"`, `background_color: "#F1EEE7"`),
`public/index.html` `<title>` and `<meta name="theme-color">`, and delete
`logo192.png` / `logo512.png` / `src/logo.svg`.

### 2.11 Misuse — never

1. Never re-colour the delta. It is `#DC5518` in light contexts and `#F2732F`
   on ink; it is never green, never ink, never white-on-white.
2. Never rotate the mark. The takeoff angle is fixed.
3. Never stretch, squash or independently scale the tile and the glyph.
4. Never add effects: no drop shadow, no gradient, no glow, no bevel, no
   glassmorphism, no outline stroke on the primary variant.
5. Never place the mark on a busy photograph without the ink tile behind it.
6. Never reproduce the wordmark in another typeface, or in Archivo at any
   weight other than 800.
7. Never capitalise it. It is `fetchr` — never `Fetchr`, never `FETCHR`, never
   `fetchR`. (Current code writes "Fetchr" in `App.js` and `Dashboard.jsx`.)
8. Never lock the mark to another company's logo without a divider rule of
   `--border-strong` at 1px, with x clear space either side.
9. Never use the mark as a bullet, a loading spinner, or a repeating background
   pattern.
10. Never redraw the f in a different font's letterform — the geometry in §2.2
    is the mark, not an interpretation of one.
11. Never put the delta inside the tile. It must break the edge; that is the
    idea.

---

## 3. Colour

### 3.1 The rule that governs everything

Three colours carry meaning. They never trade jobs.

| Colour | Means | Appears on |
|---|---|---|
| **Signal (orange)** | **It is your turn.** An action is blocked on this user, right now. | One primary button per screen; "Your turn" pills; the unread dot; the focus ring |
| **Secure (green)** | **Money and identity are safe.** Escrow held, ID verified, delivery confirmed. | Escrow pills, verification badges, completed stamps, wallet credits |
| **Void (red)** | **This deal is over or contested.** Cancelled, expired, disputed, failed payment. | Cancelled stamps, dispute banners, destructive confirmations, payment errors |

Everything else in the interface is **ink on paper**. Colour is scarce on
purpose: on a healthy screen where nothing needs the user, there is **no orange
and no red anywhere**. If a screen has two orange elements, that is a bug.

Blue (`--info`) is not a fourth meaning — it is reserved for neutral system
information (an explanatory tip, a "how escrow works" note) and never for state.

### 3.2 Ramps

**Ink** — cool near-black. Text, chrome, primary surfaces.

| Step | Hex | Use |
|---|---|---|
| ink-50 | `#F5F6F7` | Cool tint for pressed states on white |
| ink-100 | `#E8EAED` | Skeleton fill, track backgrounds |
| ink-200 | `#D2D6DB` | Disabled control fill |
| ink-300 | `#ADB3BC` | Disabled text (exempt from contrast — see §12) |
| ink-400 | `#7F8794` | Placeholder text, non-essential glyphs |
| ink-500 | `#5B6472` | Secondary/muted body text |
| ink-600 | `#434B57` | Icon default |
| ink-700 | `#2F3641` | Heading text on tinted grounds |
| ink-800 | `#1F242C` | Ticket header bar (dark theme), avatar fill |
| ink-900 | `#14181F` | **Brand ink.** Primary text, primary button, header bar |
| ink-950 | `#0A0C10` | Dark-theme app ground, ticket header in dark |

**Paper** — warm neutral. Grounds and borders. Deliberately *warm* against
*cool* ink: this pairing is the whole atmospheric trick of the direction.

| Step | Hex | Use |
|---|---|---|
| paper-50 | `#FDFCFA` | — |
| paper-100 | `#FBFAF8` | Raised surface (modals, sheets) |
| paper-200 | `#F1EEE7` | **App ground.** The colour behind every ticket |
| paper-300 | `#E4E0D8` | Hairline dividers, decorative rules |
| paper-400 | `#CFCAC0` | Perforation line, ticket edge |
| paper-500 | `#8C887E` | **Control borders** (inputs, checkboxes) — 3.54:1 on white |
| paper-600 | `#6E6A61` | Hover border on controls |

**Signal** — orange.

| Step | Hex | Use |
|---|---|---|
| signal-50 | `#FDF1EA` | Tint behind "your turn" rows |
| signal-100 | `#FADCC9` | — |
| signal-200 | `#F6BE9B` | — |
| signal-300 | `#F79C63` | Dark-theme hover |
| signal-400 | `#F2732F` | **Dark-theme signal** (fills and text) |
| signal-500 | `#DC5518` | **Brand orange.** Logo delta, focus ring, 3px rules, large text |
| signal-600 | `#B8420F` | **Filled buttons and pills with white text** (5.49:1) |
| signal-700 | `#93340C` | Button hover/active; small orange text on tint |
| signal-800 | `#6E270A` | — |
| signal-900 | `#4A1A07` | — |

> **Why two oranges.** White on `signal-500` is 3.92:1 — it fails AA for normal
> text. So `signal-500` is the *graphic* orange (logo, rules, focus, non-text)
> and `signal-600` is the *interactive* orange (any fill carrying white text).
> They are close enough to read as one colour and are never adjacent.

**Secure** — green.

| Step | Hex | Use |
|---|---|---|
| secure-50 | `#EAF7F1` | Escrow/verified pill ground |
| secure-100 | `#CCEBDE` | — |
| secure-200 | `#9AD7BF` | — |
| secure-300 | `#5FBE9B` | Dark-theme text/icons on ink |
| secure-400 | `#28A87C` | **Dark-theme secure** |
| secure-500 | `#0E7C5A` | **Light-theme secure.** Badges, stamps, icons |
| secure-600 | `#0B6A4D` | Filled success button; small text on secure-50 |
| secure-700 | `#09553E` | Hover |
| secure-800 | `#073F2F` | — |
| secure-900 | `#052B20` | — |

**Void** — red (danger).

| Step | Hex | Use |
|---|---|---|
| void-50 | `#FDEEEB` | Error/dispute banner ground |
| void-100 | `#F9D5CE` | — |
| void-200 | `#F0AC9F` | — |
| void-300 | `#E5604A` | **Dark-theme void** text |
| void-400 | `#CF4028` | — |
| void-500 | `#B0301C` | **Light-theme void.** VOID stamp, error text |
| void-600 | `#952717` | Destructive button fill; small text on void-50 |
| void-700 | `#771E12` | Hover |
| void-800 | `#58160D` | — |
| void-900 | `#3B0E08` | — |

**Warn** — amber. Advisory only.

| Step | Hex | Use |
|---|---|---|
| warn-50 | `#FDF3E3` | Mismatch/advisory banner ground |
| warn-100 | `#F9E1B9` | — |
| warn-200 | `#F0C476` | — |
| warn-300 | `#DFA33C` | **Dark-theme warn** |
| warn-400 | `#C08420` | Left rule on advisory banners |
| warn-500 | `#9A6714` | **Light-theme warn** text |
| warn-600 | `#7E5310` | Small text on warn-50 |
| warn-700 | `#63400C` | — |
| warn-800 | `#482E08` | — |
| warn-900 | `#2E1D05` | — |

> **Warn vs signal.** They are both warm and could be confused. The separation
> is structural, not chromatic: **warn never appears as a filled button or a
> solid pill.** It only ever appears as text + icon on `warn-50` with a 3px
> `warn-400` left rule. If you are about to fill something with amber, you want
> signal instead — or you want nothing.

**Info** — blue. Neutral system information.

| Step | Hex | Use |
|---|---|---|
| info-50 | `#EAF1FA` | Explanatory note ground |
| info-100 | `#CCDDF3` | — |
| info-200 | `#9BBCE6` | — |
| info-300 | `#5E92D4` | **Dark-theme info** |
| info-400 | `#2E6DBE` | — |
| info-500 | `#1B549C` | **Light-theme info** text/icon |
| info-600 | `#16457F` | Small text on info-50 |
| info-700 | `#113663` | — |
| info-800 | `#0C2748` | — |
| info-900 | `#08192E` | — |

### 3.3 Semantic tokens

Components reference **only these names**, never a ramp step directly.

| Token | Light | Dark | Usage rule |
|---|---|---|---|
| `--ground` | `#F1EEE7` paper-200 | `#0E1116` | The app background behind all cards |
| `--surface` | `#FFFFFF` | `#171B22` | Ticket and card fill |
| `--surface-raised` | `#FBFAF8` paper-100 | `#1E232B` | Modals, sheets, popovers, sticky headers |
| `--surface-sunken` | `#F5F6F7` ink-50 | `#0A0C10` | Input fill, code blocks, chat bubbles received |
| `--surface-inverse` | `#14181F` ink-900 | `#0A0C10` | Ticket header bar, tooltips |
| `--ink` | `#14181F` | `#F0EFEB` | Primary text |
| `--ink-muted` | `#5B6472` ink-500 | `#9AA1AC` | Secondary text, captions |
| `--ink-subtle` | `#7F8794` ink-400 | `#6D747F` | Placeholders, disabled-adjacent, ticket field labels |
| `--ink-inverse` | `#FBFAF8` | `#F0EFEB` | Text on `--surface-inverse` |
| `--border` | `#E4E0D8` paper-300 | `#2A2F38` | Decorative dividers, card outlines |
| `--border-strong` | `#8C887E` paper-500 | `#6D747F` | Control boundaries — inputs, checkboxes, ghost buttons |
| `--border-perf` | `#CFCAC0` paper-400 | `#39404B` | The perforation dash |
| `--brand` | `#14181F` ink-900 | `#F0EFEB` | Primary button fill, logo ink, header bar |
| `--brand-hover` | `#2F3641` ink-700 | `#D2D6DB` | Primary button hover |
| `--signal` | `#DC5518` signal-500 | `#F2732F` signal-400 | Graphic orange: focus ring, rules, logo delta |
| `--signal-fill` | `#B8420F` signal-600 | `#F2732F` signal-400 | Orange fills that carry text |
| `--signal-hover` | `#93340C` signal-700 | `#F79C63` signal-300 | |
| `--signal-on` | `#FFFFFF` | `#14181F` | Text/icon on `--signal-fill` — **inverts in dark** |
| `--signal-tint` | `#FDF1EA` signal-50 | `#2A1A12` | Ground behind "your turn" rows |
| `--success` | `#0E7C5A` secure-500 | `#28A87C` secure-400 | |
| `--success-fill` | `#0B6A4D` secure-600 | `#28A87C` | |
| `--success-on` | `#FFFFFF` | `#0A0C10` | |
| `--success-tint` | `#EAF7F1` secure-50 | `#0F2A22` | |
| `--verified` | `#0E7C5A` secure-500 | `#28A87C` | Alias of success, used **only** for identity |
| `--warning` | `#9A6714` warn-500 | `#DFA33C` warn-300 | Text/icon only, never a fill |
| `--warning-rule` | `#C08420` warn-400 | `#DFA33C` | The 3px left rule |
| `--warning-tint` | `#FDF3E3` warn-50 | `#2A2010` | |
| `--danger` | `#B0301C` void-500 | `#E5604A` void-300 | |
| `--danger-fill` | `#952717` void-600 | `#E5604A` | |
| `--danger-on` | `#FFFFFF` | `#0A0C10` | |
| `--danger-tint` | `#FDEEEB` void-50 | `#2C1512` | |
| `--info` | `#1B549C` info-500 | `#5E92D4` info-300 | |
| `--info-tint` | `#EAF1FA` info-50 | `#111E2E` | |
| `--focus` | `#DC5518` signal-500 | `#F2732F` signal-400 | Focus ring; becomes `--ink-inverse` on inverse surfaces |

### 3.4 Contrast — measured, not estimated

Every ratio below was computed with the WCAG 2.x relative-luminance formula.
AA = 4.5:1 for normal text, 3:1 for text ≥18.66px bold or ≥24px, and 3:1 for
UI component boundaries and focus indicators.

**Light theme**

| Foreground | Background | Ratio | Verdict |
|---|---|---|---|
| `--ink` `#14181F` | `--surface` `#FFFFFF` | **17.79:1** | AA + AAA |
| `--ink` `#14181F` | `--surface-raised` `#FBFAF8` | **17.06:1** | AA + AAA |
| `--ink` `#14181F` | `--ground` `#F1EEE7` | **15.36:1** | AA + AAA |
| `--ink` `#14181F` | `--surface-sunken` `#F5F6F7` | **16.44:1** | AA + AAA |
| ink-700 `#2F3641` | `#FFFFFF` | **12.17:1** | AA + AAA |
| `--ink-muted` `#5B6472` | `#FFFFFF` | **5.98:1** | AA |
| `--ink-muted` `#5B6472` | `#FBFAF8` | **5.73:1** | AA |
| `--ink-muted` `#5B6472` | `#F1EEE7` | **5.16:1** | AA |
| `--ink-subtle` `#7F8794` | `#FFFFFF` | **3.62:1** | AA-large only — never use below 18.66px bold / 24px regular |
| ink-300 `#ADB3BC` (disabled) | `#FFFFFF` | **2.11:1** | Fails — permitted only on disabled controls (§12.3) |
| `--ink-inverse` `#FBFAF8` | `--surface-inverse` `#14181F` | **17.06:1** | AA + AAA |
| ink-300 `#ADB3BC` (ticket ref) | `#14181F` | **8.43:1** | AA + AAA |
| `#FFFFFF` | `--brand` `#14181F` | **17.79:1** | AA + AAA |
| `#FFFFFF` | `--signal-fill` `#B8420F` | **5.49:1** | AA |
| `#FFFFFF` | `signal-500` `#DC5518` | **3.92:1** | **Fails AA** — this is why `--signal-fill` exists |
| `#14181F` | `signal-500` `#DC5518` | **4.54:1** | AA (permitted, but reserved for the logo delta context only) |
| signal-600 `#B8420F` | `#FFFFFF` | **5.49:1** | AA |
| signal-600 `#B8420F` | `--signal-tint` `#FDF1EA` | **4.95:1** | AA |
| signal-700 `#93340C` | `#FDF1EA` | **6.92:1** | AA |
| `--success` `#0E7C5A` | `#FFFFFF` | **5.19:1** | AA |
| `#FFFFFF` | `--success-fill` `#0B6A4D` | **6.60:1** | AA |
| secure-600 `#0B6A4D` | `--success-tint` `#EAF7F1` | **5.99:1** | AA |
| `--danger` `#B0301C` | `#FFFFFF` | **6.39:1** | AA |
| `#FFFFFF` | `--danger-fill` `#952717` | **8.14:1** | AA + AAA |
| void-600 `#952717` | `--danger-tint` `#FDEEEB` | **7.21:1** | AA + AAA |
| `--warning` `#9A6714` | `#FFFFFF` | **4.86:1** | AA |
| warn-600 `#7E5310` | `--warning-tint` `#FDF3E3` | **6.10:1** | AA |
| `--info` `#1B549C` | `#FFFFFF` | **7.51:1** | AA + AAA |
| info-600 `#16457F` | `--info-tint` `#EAF1FA` | **8.42:1** | AA + AAA |
| `--border-strong` `#8C887E` | `#FFFFFF` | **3.54:1** | Passes 3:1 for control boundaries |
| `--border` `#E4E0D8` | `#FFFFFF` | **1.32:1** | Decorative only — never a control boundary |
| `--focus` `#DC5518` | `#FFFFFF` | **3.92:1** | Passes 3:1 for focus indicators |
| `--focus` `#DC5518` | `--ground` `#F1EEE7` | **3.38:1** | Passes 3:1 |

**Dark theme**

| Foreground | Background | Ratio | Verdict |
|---|---|---|---|
| `--ink` `#F0EFEB` | `--surface` `#171B22` | **15.01:1** | AA + AAA |
| `--ink` `#F0EFEB` | `--ground` `#0E1116` | **16.44:1** | AA + AAA |
| `--ink` `#F0EFEB` | `--surface-raised` `#1E232B` | **13.72:1** | AA + AAA |
| `--ink` `#F0EFEB` | input fill `#2A2F38` | **11.68:1** | AA + AAA |
| `--ink-muted` `#9AA1AC` | `#171B22` | **6.63:1** | AA |
| `--ink-muted` `#9AA1AC` | `#0E1116` | **7.27:1** | AA + AAA |
| `--ink-subtle` `#6D747F` | `#171B22` | **3.66:1** | AA-large only |
| `--signal` `#F2732F` | `#171B22` | **5.98:1** | AA |
| `--signal-on` `#14181F` | `--signal-fill` `#F2732F` | **6.16:1** | AA |
| `#FFFFFF` | `#F2732F` | **2.89:1** | **Fails** — never use white on orange in dark |
| signal-300 `#F79C63` | `#171B22` | **8.13:1** | AA + AAA |
| `--success` `#28A87C` | `#171B22` | **5.74:1** | AA |
| `--success-on` `#0A0C10` | `#28A87C` | **6.51:1** | AA |
| secure-300 `#5FBE9B` | `#171B22` | **7.67:1** | AA + AAA |
| `--danger` `#E5604A` | `#171B22` | **5.02:1** | AA |
| `--warning` `#DFA33C` | `#171B22` | **7.76:1** | AA + AAA |
| `--info` `#5E92D4` | `#171B22` | **5.38:1** | AA |
| `--ink` `#14181F` | `--brand` `#F0EFEB` | **15.46:1** | AA + AAA |
| `--border-strong` `#6D747F` | `#171B22` | **3.66:1** | Passes 3:1 for control boundaries |
| `--border` `#2A2F38` | `#171B22` | ~1.4:1 | Decorative only |
| `--focus` `#F2732F` | `#171B22` | **5.98:1** | Passes 3:1 |

**Re-run this whenever a value changes.** The script is eight lines:

```python
def lum(h):
    h = h.lstrip('#'); r, g, b = [int(h[i:i+2], 16)/255 for i in (0, 2, 4)]
    f = lambda c: c/12.92 if c <= 0.03928 else ((c+0.055)/1.055)**2.4
    return 0.2126*f(r) + 0.7152*f(g) + 0.0722*f(b)
def cr(a, b):
    l1, l2 = sorted([lum(a), lum(b)], reverse=True)
    return (l1 + 0.05) / (l2 + 0.05)
print(round(cr('#FFFFFF', '#B8420F'), 2))   # 5.49
```

---

## 4. Typography

### 4.1 The three families

| Role | Family | Weights used | Licence |
|---|---|---|---|
| **Display** | **Archivo** | 600, 700, 800 | SIL OFL 1.1 |
| **Text** | **IBM Plex Sans** | 400, 500, 600 | SIL OFL 1.1 |
| **Mono** | **IBM Plex Mono** | 400, 500, 600 | SIL OFL 1.1 |

All three are on Google Fonts and are self-hostable. Archivo is a grotesk with
signage DNA — it carries the departure-board voice at large sizes. Plex Sans is
a quiet, wide-aperture humanist that stays readable at 13px on a phone. Plex
Mono is not decoration: it is how every code, number and reference is set, so
digits align in columns without any extra work.

> ⚠️ **Verify:** licences stated above are SIL OFL 1.1 to the best of my
> knowledge for all three families. Confirm on the Google Fonts listing or in
> each repo's `OFL.txt` before shipping commercially.

### 4.2 Type scale

Root is **16px**. Never set a size in px in components — use these steps.

| Token | rem | px | Family / weight | Line height | Tracking | Usage rule |
|---|---|---|---|---|---|---|
| `display-l` | 2.25 | 36 | Archivo 800 | 1.00 | −0.035em | Screen-defining number or route on a detail page. **Max one per screen.** |
| `display-m` | 1.75 | 28 | Archivo 800 | 1.05 | −0.03em | Wallet balance, earnings total, empty-state headline |
| `title-l` | 1.5 | 24 | Archivo 700 | 1.15 | −0.02em | Screen title in the page header |
| `title-m` | 1.25 | 20 | Archivo 700 | 1.20 | −0.015em | Section headings, modal titles, sheet titles |
| `title-s` | 1.0 | 16 | Archivo 600 | 1.30 | −0.01em | Card titles, person names, list-group headers |
| `body-l` | 1.0 | 16 | Plex Sans 400 | 1.55 | 0 | Chat messages, long explanatory text, terms |
| `body-m` | 0.875 | 14 | Plex Sans 400 | 1.50 | 0 | **Default UI text.** Everything unspecified is this |
| `body-s` | 0.8125 | 13 | Plex Sans 400 | 1.45 | 0 | Secondary lines in dense cards, helper text |
| `label` | 0.75 | 12 | Plex Sans 500 | 1.35 | +0.005em | Form labels, tab labels, bottom-nav labels |
| `micro` | 0.6875 | 11 | Plex Sans 500 | 1.30 | +0.01em | Timestamps, counts, badge text |
| `overline` | 0.625 | 10 | Plex Mono 500 | 1.20 | +0.16em | **UPPERCASE.** Ticket field labels: FROM, TO, DEPARTS, FREE |
| `code-xl` | 2.0 | 32 | Plex Mono 600 | 1.00 | −0.02em | IATA codes on the match ticket |
| `code-l` | 1.25 | 20 | Plex Mono 600 | 1.05 | −0.015em | IATA codes in dense lists and headers |
| `code-m` | 0.875 | 14 | Plex Mono 500 | 1.30 | 0 | Flight numbers, deal refs, tracking codes |
| `num-l` | 1.25 | 20 | Plex Mono 600 | 1.10 | −0.01em | Ticket total, wallet figures |
| `num-m` | 0.875 | 14 | Plex Mono 500 | 1.40 | 0 | Money rows, weights, dates in data strips |

**Nothing renders below 10px.** `overline` at 10px is the floor and only exists
because uppercase mono with +0.16em tracking stays legible there. If a design
seems to need 9px, the layout is wrong.

### 4.3 Numeric and tabular figures

Money, weight, dates and codes are **always IBM Plex Mono**, which is
monospaced, so columns align natively — no `tabular-nums` needed for those.

Where digits appear inside Plex Sans running text and must align vertically
(a table of earnings, a list of counts), add:

```css
font-variant-numeric: tabular-nums;
```

> ⚠️ **Verify:** IBM Plex Sans is expected to ship a `tnum` feature, but I have
> not confirmed it in the shipped Google Fonts build. Test it — set two rows of
> digits and check they align. **If `tnum` is absent, fall back to Plex Mono**
> for that element rather than accepting ragged columns.

Rules that always apply:

- Prices, weights and totals never wrap and never break across lines
  (`white-space: nowrap`).
- The minus sign in money is **U+2212 (−)**, never a hyphen: `−$2.16`.
- The route arrow is **U+2192 (→)**: `LHR → JFK`.
- A currency amount is never abbreviated. `$1,250.00`, never `$1.25k`.

### 4.4 Text behaviour

- **Headings:** `text-wrap: balance`.
- **Body:** measure capped at **68 characters** (`max-width: 68ch`).
- **City names truncate, codes never do.** Any element containing a city name
  gets `overflow: hidden; text-overflow: ellipsis; white-space: nowrap`, with
  the full name in a `title` attribute. IATA codes are always fully visible.
- **Person names truncate at the surname**, never the given name:
  "Amara O." is the display format (§11.6), so it fits by construction.
- No hyphenation. No justified text anywhere.

---

## 5. Foundations

### 5.1 Spacing

Base unit **4px**. Only these steps exist.

| Token | px | Usage rule |
|---|---|---|
| `space-0` | 0 | |
| `space-px` | 1 | Hairlines only |
| `space-0.5` | 2 | Icon-to-label in a pill |
| `space-1` | 4 | Tight pairs: label above value |
| `space-2` | 8 | Icon-to-text, chip gaps, button icon gap |
| `space-3` | 12 | Between related rows inside a card |
| `space-4` | 16 | **Card padding.** Between cards in a list |
| `space-5` | 20 | Card padding on ≥`md` |
| `space-6` | 24 | Between distinct blocks in a card; screen gutter on ≥`md` |
| `space-8` | 32 | Between sections |
| `space-10` | 40 | Above a screen's first section |
| `space-12` | 48 | Section break on desktop |
| `space-16` | 64 | Empty-state vertical padding |

Screen gutter: **16px** below `md`, **24px** at `md`, **32px** at `lg`+.

### 5.2 Radii

The ticket world is squarer than the current app. Nothing is a pill except
pills, and nothing is `2rem` ever.

| Token | Value | Usage rule |
|---|---|---|
| `radius-none` | 0 | Full-bleed sheets, table cells |
| `radius-sm` | 3px | Pills, status chips, tags, stamps |
| `radius-md` | 5px | Buttons, inputs, selects, small tiles |
| `radius-lg` | 8px | **Tickets and cards.** The default card radius |
| `radius-xl` | 12px | Modals, bottom sheets (top corners only) |
| `radius-avatar` | 6px | Avatars — **squared, not circular** (§7.15) |
| `radius-full` | 9999px | Only: unread dots, the rating star's container, progress track caps |

Delete `borderRadius['4xl']` from the Tailwind config; nothing uses 2rem.

### 5.3 Border widths

| Token | Value | Usage rule |
|---|---|---|
| `border-hairline` | 1px | Card outlines, dividers — `--border` |
| `border-control` | 1px | Inputs and controls — `--border-strong` |
| `border-emphasis` | 2px | Selected states, focus ring |
| `border-rule` | 3px | The left rule on advisory and error banners |
| `border-stamp` | 2.5px | DELIVERED / VOID stamp outlines |
| `border-ticket-foot` | 3px | Bottom edge of a terminal-state ticket, in the state's colour |

### 5.4 Elevation

Tickets sit **flat on paper**. Shadow indicates that something has *lifted off*
the page — a modal, a sheet, a dragged item, a sticky bar — and nothing else.
Do not put a shadow on a card.

| Token | Light | Dark | Usage rule |
|---|---|---|---|
| `elev-0` | `none` | `none` | **Default for all cards and tickets.** Definition comes from the 1px border |
| `elev-1` | `0 1px 2px rgba(20,24,31,.06)` | `0 1px 2px rgba(0,0,0,.5)` | Sticky headers and the bottom nav, once scrolled |
| `elev-2` | `0 2px 4px rgba(20,24,31,.05), 0 8px 16px -8px rgba(20,24,31,.14)` | `0 2px 4px rgba(0,0,0,.5), 0 8px 16px -8px rgba(0,0,0,.6)` | Popovers, dropdowns, toasts |
| `elev-3` | `0 8px 16px -6px rgba(20,24,31,.16), 0 24px 48px -12px rgba(20,24,31,.24)` | `0 24px 48px -12px rgba(0,0,0,.7)` | Modals, bottom sheets |

In dark theme, shadows alone are insufficient — every elevated surface also
lightens by one step (`--surface` → `--surface-raised`) and keeps its 1px
`--border`.

Delete the four violet-tinted shadows in `tailwind.config.js`. A coloured
shadow is a 2021 tell and it fights the ink palette.

### 5.5 Z-index

| Token | Value | Layer |
|---|---|---|
| `z-base` | 0 | Page content |
| `z-sticky` | 100 | Sticky screen header, sticky table head |
| `z-nav` | 200 | Mobile bottom nav, desktop sidebar |
| `z-backdrop` | 300 | Scrim behind sheets and modals |
| `z-sheet` | 310 | Bottom sheet |
| `z-modal` | 410 | Modal dialog |
| `z-toast` | 500 | Toasts |
| `z-tooltip` | 600 | Tooltips, the topmost layer |

Nothing may invent a value outside this list. The current code's ad-hoc `z-30`
on the bottom nav becomes `z-nav`.

### 5.6 Motion

| Token | Value | Usage |
|---|---|---|
| `dur-instant` | 0ms | State changes that must feel mechanical (checkbox tick) |
| `dur-fast` | 120ms | Hover, press, colour and opacity changes |
| `dur-base` | 180ms | Default. Reveals, accordion, tab switch |
| `dur-slow` | 260ms | Modal in, stamp impression |
| `dur-sheet` | 320ms | Bottom sheet slide |
| `ease-standard` | `cubic-bezier(.2, 0, 0, 1)` | Default for everything |
| `ease-out` | `cubic-bezier(.16, 1, .3, 1)` | Entrances — sheets, toasts |
| `ease-in` | `cubic-bezier(.5, 0, .9, .2)` | Exits |

**Named transitions**

| Name | Definition |
|---|---|
| `press` | `transform: scale(.985)` over `dur-fast`. Buttons only. **Never `scale(.95)`** — the current `active:scale-95` is a rubber-band, not a press |
| `reveal` | `opacity 0→1` + `translateY(4px→0)` over `dur-base`, `ease-standard` |
| `sheet-in` | `translateY(100%→0)` over `dur-sheet`, `ease-out`; scrim `opacity 0→1` over `dur-base` |
| `toast-in` | `translateY(8px→0)` + fade over `dur-base`, `ease-out`; auto-dismiss at 5s |
| `stamp-in` | `scale(1.15→1)` + `rotate(-14deg→-8deg)` + fade over `dur-slow`, `ease-out`. **Fires once**, when a deal reaches a terminal state |
| `skeleton` | `opacity .55↔1` over 1400ms `ease-in-out` infinite |
| `route-draw` | The dashed route line draws left-to-right over 400ms, once, when a match card first enters the viewport. **Optional; the only decorative motion permitted in the product** |

### 5.7 Reduced motion

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: .01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: .01ms !important;
    scroll-behavior: auto !important;
  }
}
```

Beyond the blanket rule:

- `stamp-in` renders in its final position with **no rotation animation** — the
  stamp is still rotated −8°, it just doesn't move.
- `route-draw` does not run; the line is drawn immediately.
- `skeleton` becomes a static `--surface-sunken` block with no pulse.
- Toasts still appear and still auto-dismiss — reduced motion is not reduced
  information.
- No parallax, no auto-advancing carousels, and no auto-scrolling chat beyond a
  single instant jump to the newest message.

---

## 6. Iconography & imagery

### 6.1 Icons

**Set: `lucide-react`** — already a dependency, ISC licensed, ~60 icons already
in use. Do not add a second icon library.

| Rule | Value |
|---|---|
| Grid | 24×24 |
| Stroke width | **1.75** at 20px and 24px · **2** at 16px (thin strokes disappear at small sizes) |
| Caps / joins | Round |
| Fill | None. Icons are line art. The only exception is the rating star (§7.11) |
| Sizes | **16** (inline with text), **20** (buttons, list rows), **24** (nav, headers). No other size |
| Colour | `--ink-600` default · `--ink` when the row is the subject · semantic colour only when the icon *is* the state |
| Alignment | Optically centred with the text baseline, never boxed |

**Canonical icon per concept** — use these and only these, everywhere:

| Concept | Icon |
|---|---|
| Flight / trip | `Plane` |
| Request / parcel | `Package` |
| Match | `Search` |
| Deal in progress | `Zap` |
| Escrow / secured | `Lock` (never `Shield` — shield reads as antivirus) |
| Identity verified | `BadgeCheck` (fall back to `CheckCircle` if unavailable) |
| Delivered | `CheckCircle` |
| Cancelled / void | `XCircle` |
| Dispute | `AlertOctagon` |
| Advisory / mismatch | `AlertTriangle` |
| Money | `DollarSign` |
| Wallet | `Wallet` |
| Weight | `Weight` |
| Chat | `MessageCircle` |
| Profile | `User` |
| Proof upload | `Camera` |

**Emoji are not icons.** Remove `✈️` (`App.js` loader), and `✅ 🔒 📦` from the
`ActiveDeals.jsx` status map.

### 6.2 Photography

- **Subject:** real travellers, real airports, real handovers. A person holding
  a wrapped box in an arrivals hall beats any studio shot.
- **Light:** available light, warm, slightly under-exposed. No ring-light gloss.
- **Colour:** images should sit comfortably against `#F1EEE7` — favour warm
  neutrals, avoid saturated blues and teals that fight the ink.
- **Crop:** 3:2 or 16:9. Never a circle.
- **Treatment:** no duotone, no colour overlay, no gradient scrim. If text must
  sit on an image, put it on an ink panel beside the image, not on top of it.
- **Never:** stock handshakes, cartoon globes, arrows arcing across a world
  map, smiling couriers with clipboards, or a suitcase on a white background.
- **Density:** at most **one photograph per screen**, and none at all on
  transactional screens (matches, deals, escrow, wallet).

### 6.3 Illustration and empty states

Illustrations are built from the **same geometry as the logo**: the ink tile,
the takeoff curve, the delta, the dashed perforation rule, the rounded box.

| Rule | Value |
|---|---|
| Style | Flat line art, 2px strokes on a 96×96 or 160×160 grid |
| Colour | `--ink-400` line, one `--signal` element maximum, `--paper-300` fill for solids |
| Perspective | None. Everything is orthographic |
| People | None. We draw objects and documents, not characters |
| Size in empty states | 96px on mobile, 120px on desktop |

Empty-state library (draw each once, reuse):

| Screen | Illustration |
|---|---|
| No matches | An empty ticket outline with a dashed perforation and no codes filled in |
| No flights | A departure board with blank rows |
| No requests | An open, empty box seen head-on |
| No messages | Two ticket stubs, unconnected |
| No wallet activity | A perforated stub with a blank amount field |
| Search returned nothing | A ticket with a magnifier over an empty route field |

### 6.4 Avatars

- **Squared, `radius-avatar` 6px** — not circles. Circles belong to social
  products; this is a document product, and a squared avatar sits correctly in
  a ticket's grid.
- Photo when available; otherwise **initials**, max 2 characters, IBM Plex
  Mono 600, on `--surface-inverse` with `--ink-inverse` text.
- Sizes: **24** (inline in chat), **32** (list rows), **40** (ticket person
  row), **56** (profile header), **96** (profile page).
- **Never overlay the verification tick on the avatar.** It sits beside the
  name as a labelled badge (§7.10). An overlapping tick is illegible at 24px
  and is exactly where trust must not be ambiguous.

### 6.5 Maps

Maps are supporting evidence, never decoration.

| Element | Light | Dark |
|---|---|---|
| Land | `#F1EEE7` | `#0E1116` |
| Water | `#E4E0D8` | `#171B22` |
| Roads | `#FFFFFF` | `#2A2F38` |
| Borders | `#CFCAC0` 1px | `#39404B` 1px |
| Labels | `--ink-muted`, Plex Sans 500, 11px | same token |
| Route line | `--ink` 2px, `stroke-dasharray: 4 4` | same |
| Origin / destination markers | `--ink` 8px squared dots, 2px `--surface` outline | same |
| Live position | `--signal` 10px dot with a 2px `--surface` ring | `--signal` |

No 3D tilt, no traffic layer, no POI pins, no satellite imagery, and no
Uber-style dark-purple map style.

---

## 7. Component specs

Every component below lists anatomy, sizes, states and the exact tokens. A state
not listed does not exist. `focus-visible` is specified once here and applies to
**every** interactive element in the product:

```css
outline: 2px solid var(--focus);
outline-offset: 2px;
border-radius: inherit;
```

On `--surface-inverse` (the ticket header bar, tooltips) the ring switches to
`--ink-inverse` at the same width and offset.

### 7.1 Buttons

**Anatomy:** `[optional leading icon 20px] [label] [optional trailing icon 20px]`,
centred, `gap: space-2`.

**Sizes**

| Size | Height | Padding X | Type | Icon | Use |
|---|---|---|---|---|---|
| `sm` | 36px | 12px | `label` 12px Archivo 600 | 16px | Inside cards, table rows |
| `md` | 44px | 16px | `body-m` 14px Archivo 600 | 20px | **Default.** Meets the 44px target minimum |
| `lg` | 52px | 20px | `title-s` 16px Archivo 600 | 20px | Single primary action on a screen; full-width on mobile |

All buttons: `radius-md` (5px), `font-family: Archivo`, `letter-spacing: -0.005em`,
`white-space: nowrap`.

**Variants and states**

| Variant | State | Fill | Text | Border |
|---|---|---|---|---|
| **Primary** | default | `--brand` | `--surface` | none |
| | hover | `--brand-hover` | `--surface` | none |
| | active | `--brand`, `press` transform | `--surface` | none |
| | focus-visible | `--brand` + ring | `--surface` | none |
| | disabled | `ink-200` | `ink-400` | none |
| | loading | `--brand`, label stays, 16px spinner replaces leading icon | `--surface` | none |
| **Signal** | default | `--signal-fill` | `--signal-on` | none |
| | hover | `--signal-hover` | `--signal-on` | none |
| | active | `--signal-hover`, `press` | `--signal-on` | none |
| | disabled | `ink-200` | `ink-400` | none |
| | loading | `--signal-fill` + spinner | `--signal-on` | none |
| **Secondary** | default | `--surface` | `--ink` | 1px `--border-strong` |
| | hover | `--surface-sunken` | `--ink` | 1px `paper-600` |
| | active | `--surface-sunken`, `press` | `--ink` | 1px `paper-600` |
| | disabled | `--surface` | `ink-300` | 1px `--border` |
| **Ghost** | default | transparent | `--ink` | none |
| | hover | `--surface-sunken` | `--ink` | none |
| | active | `--surface-sunken`, `press` | `--ink` | none |
| | disabled | transparent | `ink-300` | none |
| **Danger** | default | `--danger-fill` | `--danger-on` | none |
| | hover | `void-700` | `--danger-on` | none |
| | disabled | `ink-200` | `ink-400` | none |

**Error state.** A button has no error state. Errors belong to the form or the
toast, never to the control that submitted it.

**Rules**

- **One `Signal` button per screen, maximum.** It is the action that is blocked
  on this user right now. If two screens' worth of actions are visible, the
  second becomes `Primary`.
- `Primary` is ink, and it is the workhorse. `Signal` is the exception, not the
  upgrade.
- A `Danger` button is never the only button in a dialog — it is always paired
  with a `Secondary` cancel, and cancel is on the left.
- Loading buttons keep their label and their width. Never collapse a button to
  a spinner; the user loses the target.
- Full-width buttons only below `sm` breakpoint, or as the single action in a
  sheet.

### 7.2 Input (text, number, textarea)

**Anatomy:** `label` (always visible, above) → `control` → `helper or error` (below).

| Part | Spec |
|---|---|
| Label | `label` 12px Plex Sans 500, `--ink-muted`, `margin-bottom: space-1` |
| Control | height **44px** (textarea min 88px), padding `12px 14px`, `radius-md`, fill `--surface-sunken`, border 1px `--border-strong`, text `body-m` `--ink` |
| Placeholder | `--ink-subtle`. **Never carries meaning** — it is an example, not a label |
| Helper | `micro` 11px `--ink-muted`, `margin-top: space-1` |
| Leading icon | 20px `--ink-500`, 14px from the left edge, control padding-left becomes 42px |

**States**

| State | Spec |
|---|---|
| default | as above |
| hover | border `paper-600` |
| focus-visible | border 1px `--signal`, fill `--surface`, plus the standard focus ring |
| filled | identical to default — no special styling |
| disabled | fill `ink-100`, border `--border`, text `ink-400`, `cursor: not-allowed` |
| readonly | fill `--surface-sunken`, border `--border`, text `--ink`, no focus ring on click |
| error | border 1px `--danger`, message below in `micro` `--danger` prefixed with a 14px `AlertTriangle`, `aria-invalid="true"`, `aria-describedby` pointing at the message |
| loading | 16px spinner right-aligned inside the control, input stays enabled |

**Rules**

- Label is always present and always visible. Placeholder-only inputs are
  banned (they fail §12.4 and they break on autofill).
- Numeric inputs use `inputmode="decimal"` and Plex Mono for the value.
- No inputs inside a ticket card. Forms live on form screens and in sheets.

### 7.3 Select

Native `<select>` styled to match `.input`, plus a 20px `ChevronDown` in
`--ink-500`, 14px from the right, `pointer-events: none`, control padding-right
42px. Same state table as §7.2.

Use a custom listbox **only** when options need two lines or an icon (airline
picker). In that case: trigger is a `Secondary` button; the panel is
`--surface-raised`, `radius-lg`, `elev-2`, max-height `320px`, scrollable;
options are 44px tall, hover `--surface-sunken`, selected shows a 16px `Check`
in `--signal` on the right; keyboard is `↑ ↓ Home End Enter Esc` with
`aria-activedescendant`.

Below `sm`, a custom listbox becomes a **bottom sheet** (§7.20), never a
floating panel.

### 7.4 Route picker

The most important control in the product. It appears in `AddFlight.jsx`,
`NewRequest.jsx` and search.

**Anatomy:** two stacked airport fields joined by a swap button.

```
┌──────────────────────────────────────────┐
│ FROM                                      │
│ LHR  London Heathrow                  ✕   │
├────────────────────────────────  ⇅  ─────┤
│ TO                                        │
│ JFK  New York John F. Kennedy         ✕   │
└──────────────────────────────────────────┘
```

| Part | Spec |
|---|---|
| Container | `--surface`, 1px `--border-strong`, `radius-lg`, divided by a 1px `--border` rule |
| Field | 56px tall, padding `10px 14px`, contains `overline` label + value row |
| Value | `code-m` 14px Plex Mono 600 `--ink` for the IATA code, then `space-2`, then `body-m` `--ink-muted` for the city (truncating) |
| Empty | placeholder "Airport or city" in `--ink-subtle`, no code shown |
| Swap | 36×36 button, `--surface`, 1px `--border-strong`, `radius-full`, centred on the divider rule, right-aligned 14px from the edge, contains a 16px `ArrowUpDown`. `aria-label="Swap origin and destination"` |
| Clear | 20px `X` in `--ink-400`, only when the field has a value, 44px hit area |

**Results list** (existing `AirportSearch.jsx`): each row 56px, `code-l` 20px
Plex Mono 600 code on the left in a 64px fixed column, then city name
`body-m` `--ink` and country `body-s` `--ink-muted` stacked. Matched substring
is **not** highlighted in colour — it is `font-weight: 600` in `--ink`.

**States:** empty, typing (spinner in the field), results, **no results**
(48px row: "No airport matches "Zzz". Try a city name or a 3-letter code."),
selected, error.

**Rule:** the code column never truncates, never wraps, and is always exactly
3 characters wide by construction.

### 7.5 Date picker

- Trigger is an input (§7.2) with a leading `Calendar` icon; value displays as
  `Fri 12 Sep` in `code-m` Plex Mono.
- Panel: `--surface-raised`, `radius-lg`, `elev-2`, 7-column grid, cells 40×40,
  `radius-sm`.
- Day states: default `--ink` · outside-month `ink-300` · **today** 1px
  `--border-strong` outline · **selected** `--brand` fill, `--surface` text ·
  in-range `--surface-sunken` · disabled `ink-300` with no hit area ·
  hover `--surface-sunken`.
- Departure dates in the past are disabled, not hidden.
- Month label `title-s`; weekday headers `overline` uppercase `--ink-subtle`.
- Below `sm` the panel is a bottom sheet.
- Keyboard: arrows move by day, `PageUp/PageDown` by month, `Enter` selects,
  `Esc` closes and returns focus to the trigger.

### 7.6 Weight (kg) input

**Anatomy:** stepper + numeric field + unit suffix + optional slider.

| Part | Spec |
|---|---|
| Container | 44px tall, `--surface-sunken`, 1px `--border-strong`, `radius-md`, `display: flex` |
| − / + | 44×44 ghost buttons, 20px `Minus` / `Plus`, step **0.5 kg** |
| Value | flex-1, centred, `num-l` 20px Plex Mono 600, `inputmode="decimal"` |
| Unit | `body-m` `--ink-muted`, static text `kg`, 12px right padding |
| Slider (optional) | below, 4px track `ink-100`, filled portion `--brand`, thumb 20px `--surface` with 2px `--brand` border |

**States:** default · hover (border `paper-600`) · focus-visible (ring on the
container, not the inner input) · at-min (− disabled) · at-max (+ disabled,
helper reads "23 kg is the airline limit for this fare") · error (over
capacity, border `--danger`, message below) · disabled.

**Rules:** one decimal place, always shown (`3.0 kg`, never `3 kg`). Values are
clamped, not rejected — typing `99` snaps to the max with a helper explaining
why. Never allow a negative or zero weight to be submitted.

### 7.7 Ticket card — the core component

Three variants share one anatomy: **match ticket**, **trip ticket**,
**request ticket**.

**Anatomy (top to bottom)**

1. **Header bar** — `--surface-inverse` fill, 40px tall, `radius-lg` top corners,
   padding `0 16px`. Left: bare glyph (§2.6) at 20px + `fetchr` in Archivo 800
   15px `--ink-inverse`. Right: reference in `code-m` 11px `ink-300`, format
   `TYPE · [match %] · #REF`.
2. **Body** — `--surface`, padding 16px, `gap: space-3`:
   - **Route block** — 3-column grid `1fr auto 1fr`. Each end: `overline`
     label (FROM / TO), `code-xl` 32px IATA code, `body-s` city truncating.
     Centre: 1px dashed `--border-perf` connector with duration in `overline`
     below it. The TO column is right-aligned.
   - **Data strip** — 4 equal columns, 1px `--border` top and bottom, 11px
     vertical padding. Each cell: `overline` label + `num-m` value. **Fixed
     order everywhere: Date · Departs · Flight · Free.** Terminal-state
     tickets substitute: Delivered · Weight · Carrier · Escrow.
   - **Person row** — 40px avatar, name + verification badge, sub-line
     (`micro` `--ink-muted`: "14 deliveries · since 2024"), rating right-aligned.
   - **Advisory** (conditional) — §7.9.
3. **Perforation** — see below.
4. **Coupon** — padding `14px 16px 16px`, `gap: space-3`: money rows (§7.12),
   actions (§7.1), barcode strip.
5. **Barcode** — 26px tall repeating bar pattern in `--ink` at 82% opacity
   (60% in dark), with the deal code below in `overline` `--ink-muted`,
   letter-spacing `0.28em`, format `REF·ORIGINDEST·DDMMYY`.

**The perforation** — the detail that makes it a ticket:

```css
.perf {
  position: relative;
  height: 0;
  margin: 0 14px;
  border-top: 1px dashed var(--border-perf);
}
.perf::before, .perf::after {
  content: "";
  position: absolute;
  top: -8px;
  width: 16px; height: 16px;
  border-radius: 9999px;
  background: var(--ground);          /* the punch takes the page colour */
  border: 1px solid var(--border);
}
.perf::before { left: -22px;  clip-path: inset(0 0 0 50%); }
.perf::after  { right: -22px; clip-path: inset(0 50% 0 0); }
```

The notch fill **must** be `--ground` in both themes — that is what makes it
read as a hole rather than a grey dot.

**Card states**

| State | Treatment |
|---|---|
| default | `--surface`, 1px `--border`, `elev-0` |
| hover (interactive cards only) | border `--border-strong`; **no lift, no shadow, no scale** |
| focus-visible | standard ring on the card |
| pressed | `press` transform |
| **your turn** | 3px `--signal` left border on the whole ticket + a `Your turn` pill in the header row |
| awaiting other party | unchanged, with a grey `Waiting on {name}` pill |
| completed | `DELIVERED` stamp (§7.13), 3px `--success` bottom border |
| cancelled / void | `VOID` stamp, 3px `--danger` bottom border, whole card at `opacity: .72`, IATA codes drop to `--ink-muted` |
| disputed | `AlertOctagon` + `Disputed` pill, 3px `--danger` bottom border, **full opacity** — a dispute is active, not archived |
| loading | skeleton (§7.22) with the same anatomy |

**Variant differences**

- **Trip ticket** (traveller's own flight, `MyFlights.jsx`): reference reads
  `TRIP · #REF`; data strip is Date · Departs · Flight · Free; coupon shows
  earnings potential and a `Manage` action instead of money rows.
- **Request ticket** (sender's own request, `MyRequests.jsx`): the route block's
  centre connector carries a `Package` icon instead of a duration; data strip is
  Needed by · Weight · Value · Offers.

### 7.8 Match card (list density)

In `Matches.jsx`, a full ticket is too tall for a scrollable list. The compact
variant keeps the header bar and route block, drops the barcode and the money
detail to a single line, and keeps the perforation:

- Header bar 32px, route uses `code-l` 20px instead of 32px.
- Data strip becomes a single `micro` line: `12 Sep · 14:25 · BA 178 · 3.5 kg`.
- Coupon shows only `You pay $268.00` and one action.
- Total height target: **≤ 220px**.

Tapping opens the full ticket in a sheet.

### 7.9 Advisory banner (in-card)

Used for the expectation mismatch already implemented in `Matches.jsx`.

- Ground `--warning-tint`, 3px `--warning-rule` left border, `radius: 0 4px 4px 0`,
  padding `8px 10px`, `gap: space-2`.
- 14px `AlertTriangle` in `--warning`, then a bold headline `body-s` 600 and a
  plain explanation on the next line, both `--warning`.
- Copy formula: **what's wrong** then **what it means for you**.
  "Carry only — Amara won't buy the item, and your request needs buy-and-carry."
- Never dismissible. Never animated.

Error variant swaps to `--danger-tint` / `--danger` and an `AlertOctagon`.
Info variant swaps to `--info-tint` / `--info` and an `Info` icon.

### 7.10 Verification badge

| Level | Visual | Copy |
|---|---|---|
| **ID verified** | 16px `BadgeCheck` in `--verified` + label on `--success-tint`, `radius-sm`, padding `2px 5px`, `overline` uppercase | `ID VERIFIED` |
| **Email + phone only** | 16px `Check` in `--ink-500`, no ground | `CONTACT CONFIRMED` |
| **Unverified** | 16px `AlertCircle` in `--ink-400`, no ground | `NOT VERIFIED` |

**Rules**

- **Never icon-only.** A tick with no word is a decoration; the label is the
  trust signal. `aria-label="Identity verified"` in all cases.
- Never green for anything below full ID verification. Partial verification is
  grey, not amber — amber implies a warning about the person, which we are not
  making.
- Placement: immediately after the name, same line, `gap: space-2`. Never on
  the avatar.
- The badge is never clickable in a list. On a profile it links to a plain
  explanation of what was checked.

### 7.11 Rating display

- Format: **one filled 14px `Star` in `--ink`** (not gold — gold competes with
  the warn token), then the score in `num-m` Plex Mono 600, then the count in
  `micro` `--ink-subtle` in parentheses: `★ 4.9 (23)`.
- **Never render five stars.** Five stars at list density is noise, and it
  makes 4.6 and 4.8 look identical.
- Ratings below **3.0** render the score in `--danger`. This is a fact, not a
  judgement — do not hide it, do not soften it, do not omit the star.
- Fewer than 3 reviews: show `★ 5.0 (2)` with the count in `--ink-muted` and a
  `micro` qualifier below in lists where space allows: "New traveller". Never
  show a bare 5.0 that implies a track record that doesn't exist.
- No rating at all: `No ratings yet` in `micro` `--ink-subtle`. Never `★ 0.0`,
  and never `★ —`.

### 7.12 Price display

- Always Plex Mono, always 2 decimal places, always `$` prefixed.
- Money rows: label `num-m` `--ink-muted` left, value `num-m` `--ink-muted`
  right, `justify-content: space-between`.
- Total row: 1px `--border` top, 9px padding-top, label `num-m` `--ink`,
  value `num-l` 20px Plex Mono 700 `--ink`.
- **Deductions are shown, not netted silently**: `fetchr fee · 12%` on the left,
  `−$2.16` on the right, in `--ink-muted`.
- The canonical breakdown, in this exact order, per the fee logic in
  `CLAUDE.md`:

  | Line | Sender sees | Traveller sees |
  |---|---|---|
  | Transport | `Transport · 3.5 kg × $8.00` → `$28.00` | same |
  | Shop fee | `Shop fee` → `$40.00` | same |
  | Item | `Item` → `$200.00` | same |
  | fetchr fee | not shown as a separate charge | `fetchr fee · 10%` → `−$6.80` |
  | **Total** | **`You pay`** → **`$268.00`** | **`You receive`** → **`$261.20`** |

  The fee is charged on `transport + shop fee` only — never on the item price.
- A price is never a link and never truncates.

### 7.13 Status pills

44px is not required — pills are not interactive. Height 22px, padding `4px 8px`,
`radius-sm`, `overline` 10px uppercase Plex Mono 500, `gap: space-0.5`,
`white-space: nowrap`.

| Pill | Ground | Text | Meaning |
|---|---|---|---|
| `YOUR TURN · PAY ESCROW` | `--signal-fill` | `--signal-on` | Action blocked on this user |
| `YOUR TURN · UPLOAD PROOF` | `--signal-fill` | `--signal-on` | " |
| `ESCROW SECURED` | `--success-tint` + 1px inset `--success` at 30% | `--success` | Money is held |
| `ID VERIFIED` | `--success-tint` | `--verified` | Identity checked |
| `DELIVERED` | `--success-tint` | `--success` | Terminal, good |
| `WAITING ON {NAME}` | `ink-100` | `--ink-muted` | Other party's move |
| `TERMS AGREED` | `ink-100` | `--ink-muted` | Neutral progress |
| `92% MATCH` | `ink-100` | `--ink` | Score, not state |
| `CANCELLED` | `--danger-tint` + 1px inset `--danger` at 28% | `--danger` | Terminal, bad |
| `DISPUTED` | `--danger-tint` | `--danger` | Active problem |

**Rules:** one state pill per card. `92% MATCH` may accompany it because it is a
score, not a state. Pills never carry icons except `ID VERIFIED`.

### 7.14 Stamps

The only expressive element in the system. Terminal states only.

```css
.stamp {
  position: absolute; right: 14px; top: 96px;
  transform: rotate(-8deg);
  font: 800 15px/1 Archivo; letter-spacing: .14em; text-transform: uppercase;
  border: 2.5px solid currentColor; border-radius: 3px;
  padding: 5px 10px; opacity: .9; pointer-events: none;
}
```

`DELIVERED` in `--success` · `VOID` in `--danger` · `REFUNDED` in `--ink-muted`.
Animated once with `stamp-in`. `aria-hidden="true"` — the state is already in
the pill and in the timeline, and a rotated word is not a screen-reader message.

**Never** stamp an in-progress deal, and never use more than one stamp per card.

### 7.15 Progress / tracking timeline

Vertical on mobile, horizontal on `md`+. Mirrors the real lifecycle:
`matched → terms_agreed → in_escrow → proof_uploaded → completed`.

**Anatomy per step:** marker (16px) + label (`label` 12px) + timestamp
(`micro` `--ink-subtle`) + connector (2px).

| Step state | Marker | Connector to next | Label |
|---|---|---|---|
| complete | `--success` filled square, `radius-sm`, 12px `Check` in `--success-on` | 2px solid `--success` | `--ink` |
| current, waiting on user | `--signal-fill` filled square + 2px `--signal` ring at 4px offset | 2px dashed `--border-perf` | `--ink` 600 weight |
| current, waiting on other | `--surface` square, 2px `--border-strong` | 2px dashed `--border-perf` | `--ink` 600 |
| upcoming | `ink-200` filled square | 2px solid `ink-100` | `--ink-subtle` |
| failed / cancelled | `--danger` filled square, 12px `X` | 2px solid `--danger` | `--danger` |

Step labels, fixed: `Matched` · `Terms agreed` · `Escrow paid` · `Proof
uploaded` · `Delivered`.

**Screen reader:** the timeline is an `<ol>`. Each `<li>` contains a visually
hidden state word before the label — "Completed: Terms agreed, 12 Sep 14:22" /
"Current step: Escrow paid, waiting for you" / "Not started: Delivered". The
current step carries `aria-current="step"`. The connector is CSS only and is
never announced.

### 7.16 Tabs

- Underline style, never pills. Track: 1px `--border` bottom rule spanning the
  full width.
- Tab: 44px tall, padding `0 space-3`, `label` 12px Plex Sans 500 `--ink-muted`.
- Selected: `--ink`, weight 600, 2px `--ink` underline sitting on the track.
- Hover: `--ink`. Focus-visible: standard ring, inset by 2px.
- Disabled: `ink-300`, no hit area.
- Overflow: horizontal scroll with `scroll-snap-align: start`, no arrows, and a
  12px `--surface`-to-transparent fade on the right edge.
- Counts render as `micro` in `--ink-subtle` after the label — `Active 3` —
  never as a coloured dot.

### 7.17 Bottom navigation (mobile)

- Height **56px** + `env(safe-area-inset-bottom)`, `--surface`, 1px `--border`
  top, `z-nav`, `elev-1` once the page has scrolled. **No blur, no
  transparency** — the current `bg-white/90 backdrop-blur-md` goes.
- 5 items, equal width, each a 44px minimum target: 24px icon above an 11px
  `micro` label.
- Selected: icon and label `--ink`, label weight 600, and a **2px `--ink` rule
  along the top edge of that item**. Unselected: `--ink-400`.
- **Colour is not the only selected signal** — the top rule and the weight
  change carry it too.
- Badge: 8px `--signal` dot at the icon's top-right, or a count in a 16px pill
  (`--signal-fill` / `--signal-on`, `micro` 10px) when the number matters.
  Numbers above 9 render as `9+`.
- Items, fixed order: `Home · Matches · Chat · Deals · Profile`.

### 7.18 Sidebar (desktop)

- 240px fixed, `--surface`, 1px `--border` right, `z-nav`, full height.
- Logo lockup at the top, 24px padding, then nav groups.
- Group label: `overline` uppercase `--ink-subtle`, 12px bottom margin, 20px top
  margin. Groups, fixed: **Account · Traveller · Sender · Deals** (§10).
- Item: 40px tall, `radius-md`, padding `0 12px`, 20px icon + `body-m` label,
  `gap: space-3`, colour `--ink-muted`.
- Hover: `--surface-sunken`, text `--ink`. Selected: `--surface-sunken` fill,
  text `--ink` 600, plus a **3px `--ink` left rule** inset into the radius.
- An item whose screen has a pending action shows a `--signal` 6px dot,
  right-aligned.

### 7.19 Modals

- Scrim: `rgba(20,24,31,.5)`, `z-backdrop`, fades over `dur-base`.
- Panel: `--surface-raised`, `radius-xl`, `elev-3`, max-width **480px**,
  max-height `calc(100dvh - 96px)`, `z-modal`.
- Header: 56px, `title-m`, 1px `--border` bottom, close button 44×44 with a 20px
  `X` at the right.
- Body: 20px padding, scrolls independently.
- Footer: 1px `--border` top, 16px padding, actions right-aligned, cancel first.
- Focus is trapped, `Esc` closes, focus returns to the trigger, the body is
  `overflow: hidden` while open, `role="dialog"` + `aria-modal="true"` +
  `aria-labelledby` on the title.
- **Destructive confirmations never pre-select the destructive button.** Focus
  lands on cancel.

### 7.20 Bottom sheets (mobile)

- Replaces modals below `md`. `--surface-raised`, `radius-xl` **top corners
  only**, `elev-3`, `z-sheet`, max-height `88dvh`, bottom padding includes
  `env(safe-area-inset-bottom)`.
- 32×4px `ink-200` grab handle, `radius-full`, centred, 8px from the top.
- Enters with `sheet-in`. Dismiss by swipe-down past 25% of height, scrim tap,
  or `Esc`.
- A sheet containing a form gets a sticky footer with the primary action, 1px
  `--border` top.

### 7.21 Toasts

- Position: bottom centre on mobile (above the bottom nav, 16px gap), bottom
  right on desktop. `z-toast`.
- `--surface-inverse` fill, `--ink-inverse` text, `radius-md`, `elev-2`,
  padding `12px 14px`, max-width 400px, `body-m`.
- 16px leading icon: `CheckCircle` `secure-300` for success, `AlertOctagon`
  `void-300` for error, none for neutral.
- Auto-dismiss **5s** (success/neutral) or **8s** (error). Errors also carry a
  text action ("Retry") in `--signal` — never an icon-only dismiss.
- One toast at a time; a second replaces the first. `role="status"`
  (`role="alert"` for errors).
- **Toasts never carry critical information alone.** If the user must act, it
  belongs on the screen, not in a toast.

### 7.22 Skeletons

- Fill `--surface-sunken`, `radius-sm`, animated with `skeleton`.
- Skeletons mirror the **real anatomy**: a ticket skeleton has a header bar
  block, two 32px code blocks, a four-cell strip and a button block — not three
  grey rectangles.
- Text lines: 12px tall, last line 60% width.
- Show only after **200ms** of loading; below that, show nothing (a flash is
  worse than a pause).
- After **10s**, replace with an error state offering `Retry`.
- Container carries `aria-busy="true"`; content is `aria-hidden` while loading.

### 7.23 Empty states

**Anatomy:** illustration (§6.3) → headline → one sentence → one action.

| Part | Spec |
|---|---|
| Illustration | 96px mobile / 120px desktop, `--ink-400` line art |
| Headline | `title-m` `--ink`, states the fact plainly |
| Body | `body-m` `--ink-muted`, max 2 lines, says what to do about it |
| Action | One `Primary` button. A second action, if any, is a `Ghost` text link below |
| Padding | `space-16` vertical, centred, max-width 320px |

Copy pattern — **fact, cause, action**:

| Screen | Headline | Body | Action |
|---|---|---|---|
| No matches | `No travellers on this route yet` | We'll notify you when someone flies LHR → JFK before 12 Sep. | `Widen the dates` |
| No flights | `No flights added` | Add a trip you're already taking and start earning on the luggage space you're not using. | `Add a flight` |
| No requests | `No requests yet` | Post what you need and travellers on your route will offer to carry it. | `Post a request` |
| Search empty | `No airport matches "Zzz"` | Try a city name, or a 3-letter airport code like LHR. | `Clear search` |
| No messages | `No conversations` | Chat opens once both sides accept a match. | `See matches` |
| Wallet empty | `No money yet` | Completed deliveries land here, usually within a day of both sides confirming. | `Find a match` |

Never illustrate an *error* with an empty state, and never write "Nothing to
see here".

---

## 8. Layout

### 8.1 Breakpoints

Tailwind defaults, unchanged — there is no reason to invent new ones.

| Name | Min width | What changes |
|---|---|---|
| *(base)* | 0 | Single column, bottom nav, sheets instead of modals, 16px gutter |
| `sm` | 640px | Two-column stat grid, buttons stop being full-width |
| `md` | 768px | **Sidebar replaces bottom nav.** Modals replace sheets. 24px gutter |
| `lg` | 1024px | Two-column content, ticket lists beside a detail pane, 32px gutter |
| `xl` | 1280px | Content max-width caps; sidebar stays 240px |
| `2xl` | 1536px | No new layout — only more margin |

### 8.2 Grid and containers

- **Mobile:** single column, 16px gutters, cards full-bleed within them.
- **`md`+:** 12-column grid, 24px gap, inside a content area that begins after
  the 240px sidebar.
- **Container max-widths:** content `1200px`; a reading column (terms, help,
  dispute explanations) `680px`; a form column `560px`; a modal `480px`.
- **Ticket lists** at `lg`+ use a 2-column grid with 20px gap; at `xl`+, 3
  columns **only** for the compact match card (§7.8) — the full ticket stays at
  2 so the route block keeps its width.
- Ticket minimum width is **320px**. Below that the 4-cell data strip collapses
  to 2×2.

### 8.3 Mobile-first rules

1. Write the mobile rule first; add `md:` and up. Never `max-` variants except
   for the bottom nav's `md:hidden`.
2. Any horizontal overflow is a bug. Wide content — the data strip, tables in
   `Earnings`/`AdminDashboard` — scrolls inside its own `overflow-x: auto`
   container, never the page body.
3. Touch targets are **44×44 minimum** with 8px between adjacent targets.
4. Sticky elements are limited to two per screen: the header and the bottom nav.
5. `100vh` is banned — use `100dvh`.

### 8.4 Safe areas

```css
padding-bottom: calc(var(--space-2) + env(safe-area-inset-bottom));
padding-left:  max(var(--space-4), env(safe-area-inset-left));
padding-right: max(var(--space-4), env(safe-area-inset-right));
```

Applies to the bottom nav, bottom sheets, sticky footers and toasts. The
viewport meta must include `viewport-fit=cover`:

```html
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
```

Scroll containers that sit above the bottom nav add `padding-bottom: 72px` so
the last card is never trapped under it.

### 8.5 Navigation patterns

| Surface | Mobile | Desktop |
|---|---|---|
| Primary nav | Bottom nav, 5 items (§7.17) | Sidebar, grouped (§7.18) |
| Screen title | Sticky 56px header: title `title-l`, back chevron left, at most one action right | In-page `title-l`, no sticky header |
| Secondary nav | Tabs under the header | Tabs, or sidebar sub-items |
| Detail views | Push a full screen, back chevron returns | Detail pane beside the list at `lg`+ |
| Overflow actions | Bottom sheet | Dropdown, `elev-2` |
| Create actions | Primary button in the empty state or the header | Same, plus sidebar entries |

There is no floating action button. The action lives where its content is.

---

## 9. Trust & safety UI patterns

### 9.1 The trust-signal hierarchy

When space is short, cut from the bottom. This order is deliberate: it ranks
**what is structurally guaranteed** above **what is claimed**.

| Rank | Signal | Why it ranks here | Where it always appears |
|---|---|---|---|
| **1** | **Escrow state** | The only signal backed by money that has actually moved. It protects the user regardless of who the other person is | Ticket coupon, deal header, chat header |
| **2** | **ID verification** | Checked by us against a document, not self-reported | Person row, profile header, chat header |
| **3** | **Completed deliveries** | A count of finished transactions is harder to fake than a score | Person sub-line, profile |
| **4** | **Star rating** | Real but noisy — 5.0 from 2 reviews says almost nothing | Person row, profile |
| **5** | **Member since** | Weak, but a 2024 account with no deliveries is still informative | Profile, person sub-line when space allows |

A rating **never appears without its count**. A count of completed deliveries
never appears without the rating if one exists. Neither ever appears without the
verification badge, in whatever state it is.

### 9.2 Escrow — how it's expressed

Escrow is the product's central promise, so it is stated in three places with
consistent wording, never abbreviated, never behind a tooltip.

| Deal state | Pill | Sentence shown near the money |
|---|---|---|
| Before payment (sender) | `YOUR TURN · PAY ESCROW` | "You'll pay $268.00 now. We hold it until you both confirm delivery." |
| Before payment (traveller) | `WAITING ON {NAME}` | "Nothing to do yet — {name} pays into escrow before you fly." |
| Held | `ESCROW SECURED` | "$268.00 is held by fetchr. Neither side can move it alone." |
| Proof uploaded | `YOUR TURN · CONFIRM DELIVERY` | "Confirm you received it and we release $261.20 to {name}." |
| Released | `DELIVERED` | "Released 03 Aug. $15.84 is in your wallet." |
| Cancelled before payment | `CANCELLED` | "No money moved." |
| Cancelled after payment | `REFUNDED` | "Your $268.00 was returned to your card on 21 Jul." |
| Disputed | `DISPUTED` | "This deal is on hold. Your $268.00 stays in escrow until it's resolved." |

Never say "funds", "hold period", "settlement", or "disbursement". Never say
"guaranteed" — say exactly what is held and by whom.

> **Implementation note:** Stripe uses `capture_method: 'manual'`, so these
> payments read as *uncaptured* in the Stripe dashboard until both parties
> confirm. That is correct behaviour (per `CLAUDE.md`) and the UI must never
> describe it as pending or failed.

### 9.3 Verification levels

| Level | Requirements | UI treatment |
|---|---|---|
| **Unverified** | Account exists | `NOT VERIFIED` grey chip. May browse; may not accept a match |
| **Contact confirmed** | Email + phone | `CONTACT CONFIRMED` grey chip |
| **ID verified** | Government ID checked | `ID VERIFIED` green badge (§7.10) |

Show the *actual* level, never an aspirational one. A profile with no ID shows
the grey chip plus one plain line: "This traveller hasn't verified their ID."
No amber, no warning triangle — we report the fact and let the user decide.

The route to verification is always one tap from the badge on **your own**
profile, never nagged elsewhere.

### 9.4 Insurance

Until an underwritten product exists, the copy must not imply one.

- Permitted: "Every deal is covered by escrow — your money is only released
  when you confirm delivery."
- **Banned until a real policy exists:** "insured", "insurance", "protected up
  to $X", "guaranteed", any shield iconography implying cover.
- When cover does exist, it becomes trust rank 1.5: a `Lock` + "Covered to
  $500" chip in `--success-tint`, and one sentence in the coupon naming the
  underwriter and the exclusions link.

### 9.5 Disputes

- A disputed deal keeps **full opacity** and gains a 3px `--danger` bottom
  border, a `DISPUTED` pill and a persistent banner (§7.9 error variant) at the
  top of the deal and the chat.
- The banner states: what is frozen, how much, since when, and what happens
  next, with a timeframe. "Your $268.00 is frozen. We've asked both sides for
  details and will decide within 5 working days."
- Both parties see **identical wording**. Never editorialise toward one side.
- Chat stays open during a dispute; the escrow actions are disabled with a
  visible reason, never hidden.
- Resolution stamps the ticket `REFUNDED` or `RELEASED`, whichever occurred,
  and writes the outcome and the date into the timeline as a sixth step.

### 9.6 Reporting and blocking

A `Flag` action sits in the overflow menu of every profile, deal and chat —
never as a primary button, never hidden more than one tap deep. Reporting opens
a sheet with fixed reasons, a free-text field and one sentence about what
happens next. Confirmation is a toast: "Reported. We'll review within 24 hours."

---

## 10. Dual-mode UX

The decision: **there is no mode switch.** Role is inferred from data, both
surfaces are visible at once, and a person can be a traveller and a sender in
the same session without changing anything. That is the constraint this section
designs for.

Because there is no switch, **context must be legible from the content itself.**
Three devices carry it, consistently:

### 10.1 The icon pair

`Plane` means *you are flying* — traveller context, always.
`Package` means *you are sending* — sender context, always.

They appear at the same size, in the same position, in every card header,
sidebar group, empty state and notification for that context. This is the
primary signal and it is never substituted.

### 10.2 The perspective line

Every ticket states the user's own role in its reference line, so a card is
never ambiguous:

- `TRIP · #F2291` — your flight, you are the traveller
- `REQUEST · #F2291` — your request, you are the sender
- `MATCH · 92% · #F2291` — a proposed pairing; the person row shows **the other
  party**, and the money line is written from your side: `You pay` or
  `You receive`

**Money is always written from the reader's perspective.** The same deal shows
`You pay $268.00` to the sender and `You receive $261.20` to the traveller.
Never show both totals to one person — that is the single most disorienting
thing a two-sided marketplace can do.

### 10.3 The section grouping

Navigation keeps the existing grouping, renamed:

```
Account   Profile · Earnings · Wallet
Traveller My Flights · Add Flight
Sender    Post a Request · My Requests
Deals     Matches · Active Deals · Completed · Chat
```

`Deals` is deliberately unsegregated — once a deal exists, both roles use the
same screens, and splitting them would double the surface for no gain.

### 10.4 What must NOT differ

- **No colour coding by role.** Travellers do not get blue, senders do not get
  green. Colour is reserved for state (§3.1), and role-tinting would destroy
  that. This is the most likely mistake and it is banned outright.
- No separate typography, radii, card shape, button style or density.
- No separate logo variant, no "traveller mode" chrome, no theme change.
- No duplicated components with role-specific styling — one ticket component
  with a variant prop.

### 10.5 Role inference and how it's shown

`getUserRole()` derives the label from activity: flights → Traveller, requests
→ Sender, both → **"Traveller & Sender"**, neither → **"New member"**.

- The label is displayed **only** on the profile and in the sidebar footer, as
  `micro` `--ink-muted`. It is descriptive, never a control, and never a badge.
- A new member sees **both** empty states on the home screen, equally weighted,
  in a fixed order: traveller first (it requires a trip they already have),
  sender second. Neither is dismissed by using the other.
- Nothing in the product is hidden because of an inferred role. Inference
  changes emphasis and ordering, never availability.

---

## 11. Microcopy

### 11.1 Button labels

- **Verb + object**, sentence case, **maximum 3 words**: `Accept match`,
  `Pay escrow`, `Upload proof`, `Confirm delivery`, `Add a flight`,
  `Post a request`.
- The label names the **outcome**, not the mechanism: `Pay escrow`, not `Submit
  payment`. `Confirm delivery`, not `Complete`.
- Banned labels: `Submit`, `OK`, `Continue` (unless a genuine multi-step form),
  `Click here`, `Learn more` (say what will be learned: `How escrow works`).
- Destructive labels name the loss: `Cancel this deal`, not `Yes` / `Confirm`.
- The cancel button in a dialog is labelled `Keep it` / `Not now` — never
  `Cancel` next to an action that also means cancelling.

### 11.2 Error message formula

```
{What happened}. {Why, if we know it}. {What to do next}.
```

Maximum two sentences. Never apologise, never blame the user, never surface a
raw code in the primary line.

| Situation | Write | Not |
|---|---|---|
| Card declined | "Payment didn't go through — your bank declined it. Try another card." | "Oops! Something went wrong with your payment." |
| Network | "Couldn't reach fetchr. Check your connection and try again." | "Error: NETWORK_FAILURE" |
| Over capacity | "That's more than Amara's 3.5 kg. Lower the weight or find another traveller." | "Invalid weight." |
| Expired flight | "This flight left on 12 Sep. Search for a later one." | "This match is no longer available." |
| Upload failed | "The photo didn't upload — it may be over 10 MB. Try a smaller image." | "Upload error." |
| Empty required field | "Add a destination airport." | "This field is required." |

A technical reference, when support might need it, goes on a second line in
`code-m` `--ink-subtle`: `ref: pi_3Q8x…`.

### 11.3 Dates and times

| Case | Format | Example |
|---|---|---|
| Date, current year | `EEE d MMM` | `Fri 12 Sep` |
| Date, other year | `d MMM yyyy` | `12 Sep 2027` |
| Time | 24-hour, zero-padded | `14:25` |
| Time with airport, when a route crosses zones | `HH:mm` + IATA | `14:25 LHR` |
| Date + time together | `EEE d MMM · HH:mm` | `Fri 12 Sep · 14:25` |
| Duration | `Hh MMm` | `7h 55m`, `18h 40m` |
| Relative, under 24h only | `in Xh` / `Xh ago` | `in 6h` |
| Today / tomorrow | Word, then time | `Today · 14:25` |
| Layover | `Xh in {IATA}` | `12h in DXB` |

Never "yesterday at 3pm-ish". Never `09/12/26` — ambiguous across regions.
Timestamps in chat are `HH:mm`, with a date separator row between days.

### 11.4 Currency

- Always `$268.00` — symbol, thousands separator, **exactly two decimals**.
- Negative: `−$6.80` (U+2212).
- Zero: `$0.00`, never `Free` unless it genuinely is free of charge.
- Ranges: `$40.00 – $65.00` (en dash, spaces).
- Per-unit: `$8.00/kg`, no spaces.
- Never abbreviate, never round in the UI, never show a currency code next to
  the symbol (`$268.00`, not `USD $268.00`).

### 11.5 Weight

- `3.5 kg` — one decimal, always shown, space before the unit, `kg` lowercase.
- Ranges: `0.5 – 8.0 kg`.
- Per-unit price: `$8.00/kg`.
- Never `3.5kg`, never `3,5 kg`, never `KG`, never `kilos`.

### 11.6 Names, routes and capitalisation

- **People:** given name + surname initial — `Amara O.` Full surnames appear
  nowhere in the UI, including chat headers.
- **Routes:** `LHR → JFK` (U+2192). In prose: "from London Heathrow to New York
  JFK".
- **Airports:** IATA code first in data contexts, city name first in prose.
- **Capitalisation:** sentence case for everything — headings, buttons, labels,
  toasts, nav items. The **only** uppercase in the product is the `overline`
  step (ticket field labels) and stamps.
- `fetchr` is always lowercase, even at the start of a sentence. If that reads
  badly, rewrite the sentence.

### 11.7 Glossary — the exact word to use everywhere

| Use this | Never this | Code/DB equivalent |
|---|---|---|
| **Sender** | Shipper, buyer, customer, requester | `shipper_id`, `shipment_requests` |
| **Traveller** | Traveler, courier, carrier, driver, mule | `traveler_id` |
| **Flight** | Trip, journey, route (when it's a specific flight) | `flights` |
| **Request** | Order, job, shipment, parcel | `shipment_requests` |
| **Match** | Suggestion, recommendation, pairing | `matches` |
| **Deal** | Booking, contract, transaction, order | `matches` after acceptance |
| **Escrow** | Funds hold, safe pay, vault | `in_escrow` |
| **Transport fee** | Delivery fee, shipping cost | `weight_kg × price_per_kg` |
| **Shop fee** | Purchase fee, buying commission, personal shopper fee | `matches.agreed_shop_fee` |
| **Item price** | Product cost, goods value | `shipment_requests.purchase_price` |
| **fetchr fee** | Commission, service charge, platform fee, take rate | `fetchrFee` |
| **Delivery proof** | POD, evidence, receipt photo | `proof_uploaded` |
| **Buy-and-carry** | Shopping service, purchase request | `requires_purchase` |
| **Carry only** | Transport only, standard delivery | `delivery_type` |
| **Wallet** | Balance, account, credits | `wallet_balance` |
| **Payout** | Withdrawal, cash out, transfer | — |
| **Free space** | Available capacity, allowance | `available_kg` |

---

## 12. Accessibility

These are requirements, not goals. A component that fails one of them is not
finished.

### 12.1 Contrast

- Body text ≥ **4.5:1**; text ≥18.66px bold or ≥24px regular ≥ **3:1**.
- UI component boundaries and state indicators ≥ **3:1** — hence
  `--border-strong` on every control (§3.2). `--border` is decorative and may
  not be the only thing defining a control.
- Focus indicators ≥ **3:1** against the adjacent background.
- Every pair used in the product is measured in §3.4. If you introduce a colour,
  measure it there before you use it.

### 12.2 Focus

- **Never remove the outline.** `outline: none` without a replacement is a bug.
- Ring: `2px solid var(--focus)`, `outline-offset: 2px`, following the element's
  radius; switches to `--ink-inverse` on inverse surfaces.
- `:focus-visible` only — pointer clicks don't show the ring, keyboard does.
- Focus order follows visual order. Modals and sheets trap focus and restore it
  to the trigger on close.
- Skip link as the first focusable element on every screen: "Skip to main
  content", visually hidden until focused.

### 12.3 Targets

- **44×44 CSS px minimum** for anything tappable, including icon-only buttons,
  the clear `X` in inputs, and bottom-nav items. Pad the hit area rather than
  growing the visual.
- 8px minimum between adjacent targets.
- Disabled controls are exempt from contrast (WCAG explicitly exempts them),
  which is why `ink-300` at 2.11:1 is permitted there **and nowhere else**. A
  disabled control still explains itself — put the reason in adjacent helper
  text, not a tooltip.

### 12.4 Forms

- Every input has a `<label for>`. Placeholders are never labels.
- Required fields are marked in the label text — "Destination (required)" — not
  by an asterisk alone.
- Errors: `aria-invalid="true"` + `aria-describedby` pointing at the message,
  which is `role="alert"` and adjacent to the field. Never colour-only.
- Validate on blur and on submit, never on every keystroke.
- On submit failure, focus moves to the first invalid field and the page
  announces the count: "2 fields need attention".
- Autocomplete attributes on everything standard (`name`, `email`, `tel`,
  `postal-code`, `cc-*` where Stripe permits).

### 12.5 Keyboard paths

Every one of these must complete without a mouse:

1. Sign in → dashboard → open a match → accept it.
2. Add a flight: route picker (typed codes), date picker (arrows), kg stepper
   (arrows), submit.
3. Post a request, including the buy-and-carry toggle.
4. Pay escrow, including the Stripe card fields.
5. Upload delivery proof (file input reachable and labelled).
6. Confirm delivery.
7. Open, read and reply in a chat.
8. Cancel a deal, including the confirmation dialog.

### 12.6 Screen readers

- **Landmarks:** one `<main>`, `<nav aria-label="Primary">`, `<header>`,
  `role="search"` on the match filter. One `<h1>` per screen.
- **Tracking timeline:** an `<ol>` where each `<li>` carries a visually hidden
  state word before the label, and the active step has `aria-current="step"`
  (§7.15).
- **Trust badges:** never icon-only; `aria-label="Identity verified"`. The
  rating reads as "Rated 4.9 out of 5 from 23 reviews" via visually hidden
  text — not "star 4.9 bracket 23".
- **Money:** `$268.00` reads correctly; do not split the symbol into a separate
  element.
- **Route:** the arrow is decorative — mark it `aria-hidden` and provide
  "London Heathrow to New York John F. Kennedy" as hidden text.
- **Stamps:** `aria-hidden="true"` (§7.14).
- **Live regions:** new chat messages and deal state changes announce via
  `aria-live="polite"`; payment errors via `role="alert"`.
- **Barcode:** decorative, `aria-hidden="true"`; the deal reference beneath it
  is real text and is announced.

### 12.7 Motion and other

- Respect `prefers-reduced-motion` (§5.7).
- Nothing flashes more than 3 times per second.
- The interface works at **200% zoom** and at **320px** width without
  horizontal scrolling.
- Content is never conveyed by colour alone: every state has an icon, a word,
  or a shape alongside it.
- All text is real text. No text baked into images.

---

## 13. Implementation

### 13.1 Font loading

Replace the `@import` currently sitting **after** `@tailwind` in
`src/index.css` — an `@import` in that position is invalid CSS and is
render-blocking on a cold cache. Put this in `public/index.html` `<head>`:

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@600;700;800&family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600&display=swap">
```

Self-hosting later removes the third-party round trip: download the woff2 files,
serve from `/fonts`, and declare `@font-face` with `font-display: swap` and
matching `unicode-range`. The `--font-*` stacks below already name real
fallbacks so a font failure degrades instead of breaking layout.

### 13.2 The complete `:root` block

Drop this at the top of `src/index.css`, **before** `@tailwind base`.

```css
:root {
  /* ── Ink ramp ───────────────────────────── */
  --ink-50:#F5F6F7;  --ink-100:#E8EAED; --ink-200:#D2D6DB; --ink-300:#ADB3BC;
  --ink-400:#7F8794; --ink-500:#5B6472; --ink-600:#434B57; --ink-700:#2F3641;
  --ink-800:#1F242C; --ink-900:#14181F; --ink-950:#0A0C10;

  /* ── Paper ramp ─────────────────────────── */
  --paper-50:#FDFCFA;  --paper-100:#FBFAF8; --paper-200:#F1EEE7;
  --paper-300:#E4E0D8; --paper-400:#CFCAC0; --paper-500:#8C887E;
  --paper-600:#6E6A61;

  /* ── Signal (orange) ────────────────────── */
  --signal-50:#FDF1EA;  --signal-100:#FADCC9; --signal-200:#F6BE9B;
  --signal-300:#F79C63; --signal-400:#F2732F; --signal-500:#DC5518;
  --signal-600:#B8420F; --signal-700:#93340C; --signal-800:#6E270A;
  --signal-900:#4A1A07;

  /* ── Secure (green) ─────────────────────── */
  --secure-50:#EAF7F1;  --secure-100:#CCEBDE; --secure-200:#9AD7BF;
  --secure-300:#5FBE9B; --secure-400:#28A87C; --secure-500:#0E7C5A;
  --secure-600:#0B6A4D; --secure-700:#09553E; --secure-800:#073F2F;
  --secure-900:#052B20;

  /* ── Void (red) ─────────────────────────── */
  --void-50:#FDEEEB;  --void-100:#F9D5CE; --void-200:#F0AC9F;
  --void-300:#E5604A; --void-400:#CF4028; --void-500:#B0301C;
  --void-600:#952717; --void-700:#771E12; --void-800:#58160D;
  --void-900:#3B0E08;

  /* ── Warn (amber) ───────────────────────── */
  --warn-50:#FDF3E3;  --warn-100:#F9E1B9; --warn-200:#F0C476;
  --warn-300:#DFA33C; --warn-400:#C08420; --warn-500:#9A6714;
  --warn-600:#7E5310; --warn-700:#63400C; --warn-800:#482E08;
  --warn-900:#2E1D05;

  /* ── Info (blue) ────────────────────────── */
  --info-50:#EAF1FA;  --info-100:#CCDDF3; --info-200:#9BBCE6;
  --info-300:#5E92D4; --info-400:#2E6DBE; --info-500:#1B549C;
  --info-600:#16457F; --info-700:#113663; --info-800:#0C2748;
  --info-900:#08192E;

  /* ── Semantic tokens · LIGHT ────────────── */
  --ground:            var(--paper-200);
  --surface:           #FFFFFF;
  --surface-raised:    var(--paper-100);
  --surface-sunken:    var(--ink-50);
  --surface-inverse:   var(--ink-900);

  --ink:               var(--ink-900);
  --ink-muted:         var(--ink-500);
  --ink-subtle:        var(--ink-400);
  --ink-disabled:      var(--ink-300);
  --ink-inverse:       var(--paper-100);

  --border:            var(--paper-300);
  --border-strong:     var(--paper-500);
  --border-hover:      var(--paper-600);
  --border-perf:       var(--paper-400);

  --brand:             var(--ink-900);
  --brand-hover:       var(--ink-700);
  --brand-on:          #FFFFFF;

  --signal:            var(--signal-500);
  --signal-fill:       var(--signal-600);
  --signal-hover:      var(--signal-700);
  --signal-on:         #FFFFFF;
  --signal-tint:       var(--signal-50);

  --success:           var(--secure-500);
  --success-fill:      var(--secure-600);
  --success-hover:     var(--secure-700);
  --success-on:        #FFFFFF;
  --success-tint:      var(--secure-50);
  --verified:          var(--secure-500);

  --warning:           var(--warn-500);
  --warning-rule:      var(--warn-400);
  --warning-tint:      var(--warn-50);

  --danger:            var(--void-500);
  --danger-fill:       var(--void-600);
  --danger-hover:      var(--void-700);
  --danger-on:         #FFFFFF;
  --danger-tint:       var(--void-50);

  --info:              var(--info-500);
  --info-tint:         var(--info-50);

  --focus:             var(--signal-500);

  /* ── Elevation · LIGHT ──────────────────── */
  --elev-0: none;
  --elev-1: 0 1px 2px rgba(20,24,31,.06);
  --elev-2: 0 2px 4px rgba(20,24,31,.05), 0 8px 16px -8px rgba(20,24,31,.14);
  --elev-3: 0 8px 16px -6px rgba(20,24,31,.16), 0 24px 48px -12px rgba(20,24,31,.24);
  --scrim:  rgba(20,24,31,.5);

  /* ── Type ───────────────────────────────── */
  --font-display: "Archivo", ui-sans-serif, system-ui, -apple-system, sans-serif;
  --font-sans:    "IBM Plex Sans", ui-sans-serif, system-ui, -apple-system, sans-serif;
  --font-mono:    "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace;

  /* ── Space ──────────────────────────────── */
  --space-px:1px;  --space-0-5:2px; --space-1:4px;  --space-2:8px;
  --space-3:12px;  --space-4:16px;  --space-5:20px; --space-6:24px;
  --space-8:32px;  --space-10:40px; --space-12:48px; --space-16:64px;

  /* ── Radii ──────────────────────────────── */
  --radius-sm:3px; --radius-md:5px; --radius-lg:8px; --radius-xl:12px;
  --radius-avatar:6px; --radius-full:9999px;

  /* ── Motion ─────────────────────────────── */
  --dur-fast:120ms; --dur-base:180ms; --dur-slow:260ms; --dur-sheet:320ms;
  --ease-standard: cubic-bezier(.2,0,0,1);
  --ease-out:      cubic-bezier(.16,1,.3,1);
  --ease-in:       cubic-bezier(.5,0,.9,.2);

  /* ── Z-index ────────────────────────────── */
  --z-sticky:100; --z-nav:200; --z-backdrop:300; --z-sheet:310;
  --z-modal:410;  --z-toast:500; --z-tooltip:600;
}

/* ── Semantic tokens · DARK (system preference) ───────────────────────── */
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --ground:          #0E1116;
    --surface:         #171B22;
    --surface-raised:  #1E232B;
    --surface-sunken:  #0A0C10;
    --surface-inverse: #0A0C10;

    --ink:             #F0EFEB;
    --ink-muted:       #9AA1AC;
    --ink-subtle:      #6D747F;
    --ink-disabled:    #4A515C;
    --ink-inverse:     #F0EFEB;

    --border:          #2A2F38;
    --border-strong:   #6D747F;
    --border-hover:    #8D949F;
    --border-perf:     #39404B;

    --brand:           #F0EFEB;
    --brand-hover:     #D2D6DB;
    --brand-on:        #14181F;

    --signal:          var(--signal-400);
    --signal-fill:     var(--signal-400);
    --signal-hover:    var(--signal-300);
    --signal-on:       #14181F;
    --signal-tint:     #2A1A12;

    --success:         var(--secure-400);
    --success-fill:    var(--secure-400);
    --success-hover:   var(--secure-300);
    --success-on:      #0A0C10;
    --success-tint:    #0F2A22;
    --verified:        var(--secure-400);

    --warning:         var(--warn-300);
    --warning-rule:    var(--warn-300);
    --warning-tint:    #2A2010;

    --danger:          var(--void-300);
    --danger-fill:     var(--void-300);
    --danger-hover:    var(--void-200);
    --danger-on:       #0A0C10;
    --danger-tint:     #2C1512;

    --info:            var(--info-300);
    --info-tint:       #111E2E;

    --focus:           var(--signal-400);

    --elev-1: 0 1px 2px rgba(0,0,0,.5);
    --elev-2: 0 2px 4px rgba(0,0,0,.5), 0 8px 16px -8px rgba(0,0,0,.6);
    --elev-3: 0 24px 48px -12px rgba(0,0,0,.7);
    --scrim:  rgba(0,0,0,.66);
  }
}

/* ── Semantic tokens · DARK (explicit choice) ─────────────────────────── */
:root[data-theme="dark"] {
  --ground:#0E1116; --surface:#171B22; --surface-raised:#1E232B;
  --surface-sunken:#0A0C10; --surface-inverse:#0A0C10;
  --ink:#F0EFEB; --ink-muted:#9AA1AC; --ink-subtle:#6D747F;
  --ink-disabled:#4A515C; --ink-inverse:#F0EFEB;
  --border:#2A2F38; --border-strong:#6D747F; --border-hover:#8D949F;
  --border-perf:#39404B;
  --brand:#F0EFEB; --brand-hover:#D2D6DB; --brand-on:#14181F;
  --signal:var(--signal-400); --signal-fill:var(--signal-400);
  --signal-hover:var(--signal-300); --signal-on:#14181F; --signal-tint:#2A1A12;
  --success:var(--secure-400); --success-fill:var(--secure-400);
  --success-hover:var(--secure-300); --success-on:#0A0C10;
  --success-tint:#0F2A22; --verified:var(--secure-400);
  --warning:var(--warn-300); --warning-rule:var(--warn-300); --warning-tint:#2A2010;
  --danger:var(--void-300); --danger-fill:var(--void-300);
  --danger-hover:var(--void-200); --danger-on:#0A0C10; --danger-tint:#2C1512;
  --info:var(--info-300); --info-tint:#111E2E;
  --focus:var(--signal-400);
  --elev-1:0 1px 2px rgba(0,0,0,.5);
  --elev-2:0 2px 4px rgba(0,0,0,.5), 0 8px 16px -8px rgba(0,0,0,.6);
  --elev-3:0 24px 48px -12px rgba(0,0,0,.7);
  --scrim:rgba(0,0,0,.66);
}

/* ── Base ─────────────────────────────────────────────────────────────── */
html { -webkit-text-size-adjust: 100%; }

body {
  margin: 0;
  background: var(--ground);
  color: var(--ink);
  font-family: var(--font-sans);
  font-size: .875rem;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}
:focus:not(:focus-visible) { outline: none; }

::selection { background: var(--signal-100); color: var(--ink-900); }

::-webkit-scrollbar { width: 10px; height: 10px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb {
  background: var(--border-strong);
  border: 3px solid var(--ground);
  border-radius: var(--radius-full);
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: .01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: .01ms !important;
    scroll-behavior: auto !important;
  }
}
```

### 13.3 Tailwind config

Replace the `theme.extend` block in `tailwind.config.js` wholesale:

```js
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        ink:    { 50:'#F5F6F7',100:'#E8EAED',200:'#D2D6DB',300:'#ADB3BC',400:'#7F8794',
                  500:'#5B6472',600:'#434B57',700:'#2F3641',800:'#1F242C',900:'#14181F',950:'#0A0C10' },
        paper:  { 50:'#FDFCFA',100:'#FBFAF8',200:'#F1EEE7',300:'#E4E0D8',400:'#CFCAC0',
                  500:'#8C887E',600:'#6E6A61' },
        signal: { 50:'#FDF1EA',100:'#FADCC9',200:'#F6BE9B',300:'#F79C63',400:'#F2732F',
                  500:'#DC5518',600:'#B8420F',700:'#93340C',800:'#6E270A',900:'#4A1A07' },
        secure: { 50:'#EAF7F1',100:'#CCEBDE',200:'#9AD7BF',300:'#5FBE9B',400:'#28A87C',
                  500:'#0E7C5A',600:'#0B6A4D',700:'#09553E',800:'#073F2F',900:'#052B20' },
        void:   { 50:'#FDEEEB',100:'#F9D5CE',200:'#F0AC9F',300:'#E5604A',400:'#CF4028',
                  500:'#B0301C',600:'#952717',700:'#771E12',800:'#58160D',900:'#3B0E08' },
        warn:   { 50:'#FDF3E3',100:'#F9E1B9',200:'#F0C476',300:'#DFA33C',400:'#C08420',
                  500:'#9A6714',600:'#7E5310',700:'#63400C',800:'#482E08',900:'#2E1D05' },
        info:   { 50:'#EAF1FA',100:'#CCDDF3',200:'#9BBCE6',300:'#5E92D4',400:'#2E6DBE',
                  500:'#1B549C',600:'#16457F',700:'#113663',800:'#0C2748',900:'#08192E' },

        // semantic aliases — prefer these in components
        ground:            'var(--ground)',
        surface:           'var(--surface)',
        'surface-raised':  'var(--surface-raised)',
        'surface-sunken':  'var(--surface-sunken)',
        'surface-inverse': 'var(--surface-inverse)',
        content:           'var(--ink)',
        'content-muted':   'var(--ink-muted)',
        'content-subtle':  'var(--ink-subtle)',
        'content-inverse': 'var(--ink-inverse)',
        line:              'var(--border)',
        'line-strong':     'var(--border-strong)',
        'line-perf':       'var(--border-perf)',
        brand:             'var(--brand)',
        'brand-hover':     'var(--brand-hover)',
        accent:            'var(--signal)',
        'accent-fill':     'var(--signal-fill)',
        'accent-hover':    'var(--signal-hover)',
        'accent-on':       'var(--signal-on)',
        'accent-tint':     'var(--signal-tint)',
        success:           'var(--success)',
        'success-fill':    'var(--success-fill)',
        'success-tint':    'var(--success-tint)',
        verified:          'var(--verified)',
        warning:           'var(--warning)',
        'warning-tint':    'var(--warning-tint)',
        danger:            'var(--danger)',
        'danger-fill':     'var(--danger-fill)',
        'danger-tint':     'var(--danger-tint)',
      },
      fontFamily: {
        display: ['Archivo', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        sans:    ['IBM Plex Sans', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono:    ['IBM Plex Mono', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      fontSize: {
        overline:  ['0.625rem', { lineHeight: '1.2',  letterSpacing: '0.16em' }],
        micro:     ['0.6875rem',{ lineHeight: '1.3',  letterSpacing: '0.01em' }],
        label:     ['0.75rem',  { lineHeight: '1.35', letterSpacing: '0.005em' }],
        'body-s':  ['0.8125rem',{ lineHeight: '1.45' }],
        'body-m':  ['0.875rem', { lineHeight: '1.5' }],
        'body-l':  ['1rem',     { lineHeight: '1.55' }],
        'title-s': ['1rem',     { lineHeight: '1.3',  letterSpacing: '-0.01em' }],
        'title-m': ['1.25rem',  { lineHeight: '1.2',  letterSpacing: '-0.015em' }],
        'title-l': ['1.5rem',   { lineHeight: '1.15', letterSpacing: '-0.02em' }],
        'display-m':['1.75rem', { lineHeight: '1.05', letterSpacing: '-0.03em' }],
        'display-l':['2.25rem', { lineHeight: '1',    letterSpacing: '-0.035em' }],
        'code-m':  ['0.875rem', { lineHeight: '1.3' }],
        'code-l':  ['1.25rem',  { lineHeight: '1.05', letterSpacing: '-0.015em' }],
        'code-xl': ['2rem',     { lineHeight: '1',    letterSpacing: '-0.02em' }],
        'num-m':   ['0.875rem', { lineHeight: '1.4' }],
        'num-l':   ['1.25rem',  { lineHeight: '1.1',  letterSpacing: '-0.01em' }],
      },
      borderRadius: {
        sm: '3px', md: '5px', lg: '8px', xl: '12px', avatar: '6px',
      },
      boxShadow: {
        'elev-1': 'var(--elev-1)',
        'elev-2': 'var(--elev-2)',
        'elev-3': 'var(--elev-3)',
      },
      transitionTimingFunction: {
        standard: 'cubic-bezier(.2,0,0,1)',
        'ease-out-soft': 'cubic-bezier(.16,1,.3,1)',
      },
      transitionDuration: { fast: '120ms', base: '180ms', slow: '260ms', sheet: '320ms' },
      zIndex: { sticky:'100', nav:'200', backdrop:'300', sheet:'310', modal:'410', toast:'500', tooltip:'600' },
      keyframes: {
        reveal:  { '0%': { opacity:'0', transform:'translateY(4px)' }, '100%': { opacity:'1', transform:'none' } },
        sheetIn: { '0%': { transform:'translateY(100%)' }, '100%': { transform:'none' } },
        toastIn: { '0%': { opacity:'0', transform:'translateY(8px)' }, '100%': { opacity:'1', transform:'none' } },
        stampIn: { '0%': { opacity:'0', transform:'scale(1.15) rotate(-14deg)' },
                   '100%': { opacity:'.9', transform:'scale(1) rotate(-8deg)' } },
        skeleton:{ '0%,100%': { opacity:'.55' }, '50%': { opacity:'1' } },
      },
      animation: {
        reveal:  'reveal 180ms cubic-bezier(.2,0,0,1)',
        'sheet-in':'sheetIn 320ms cubic-bezier(.16,1,.3,1)',
        'toast-in':'toastIn 180ms cubic-bezier(.16,1,.3,1)',
        'stamp-in':'stampIn 260ms cubic-bezier(.16,1,.3,1)',
        skeleton:'skeleton 1400ms ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
```

**Deleted deliberately:** the `brand` violet ramp, all four violet-tinted
shadows, `borderRadius['4xl']`, and the `float` / `gradient` animations. Nothing
in the new system uses them.

### 13.4 Migration checklist

Ordered by **visual impact per unit of effort** — the first three items change
every screen at once and should be done in a single sitting. "Effort" is a
rough size, not a promise.

| # | Target | Change | Effort | Impact |
|---|---|---|---|---|
| **1** | `src/index.css` | Add the §13.2 `:root` block. Delete `.glass`, `.gradient-purple`, the four `.shadow-*` classes, the `float`/`gradient` keyframes, and the stray Google Fonts `@import`. | S | **Every screen** |
| **2** | `tailwind.config.js` | Replace `theme.extend` with §13.3. | S | Every screen |
| **3** | `public/index.html`, `public/manifest.json`, favicons | Font links (§13.1), `viewport-fit=cover`, real `<title>`, `theme_color: #14181F`, new icon set (§2.10). Delete `logo192/512.png`, `src/logo.svg`. | S | First impression, install banner, browser tab |
| **4** | `src/index.css` component layer | Rewrite `.btn-primary`, `.btn-secondary`, `.input-field`, `.badge-*`, `.card` against the new tokens (§7.1, §7.2, §7.13). Add `.btn-signal`, `.btn-danger`, `.ticket`, `.perf`, `.stamp`. Delete the `.input-field.pl-*` `!important` overrides — set padding per usage instead. | M | Every screen, no JSX edits |
| **5** | `Dashboard.jsx` (797 ln) | Shell: sidebar (§7.18), bottom nav (§7.17 — drop `bg-white/90 backdrop-blur`), sticky header, stat cards. Rename nav group "Shipper" → "Sender". Fix `getUserRole()` strings to "Traveller & Sender" / "New member". | L | The frame around all 16 screens |
| **6** | `Matches.jsx` (590 ln) | The match ticket (§7.7/§7.8) — the highest-value card in the product. Keep the existing mismatch banner logic, restyle to §7.9. | L | The screen that sells the product |
| **7** | `ActiveDeals.jsx` (282 ln) | Tracking timeline (§7.15), status pills (§7.13), stamps (§7.14). **Delete the emoji** in the status map. Replace the percentage progress with the 5-step timeline. | M | The trust story, made visible |
| **8** | `App.js` | Loading screen: ink mark, no `✈️`, no `animate-pulse` purple tile. Lowercase "fetchr". | S | First 400ms of every session |
| **9** | `Messages.jsx` (1088 ln) | Chat bubbles on `--surface-sunken`/`--surface-inverse`, escrow blocks to §9.2 wording, proof upload to §7.2 states. | L | Where deals actually happen |
| **10** | `MyFlights.jsx` / `MyRequests.jsx` | Trip ticket and request ticket variants (§7.7). | M | Two screens, one component |
| **11** | `AddFlight.jsx` (1207 ln) + `shared/AirportSearch.jsx` | Route picker (§7.4), date picker (§7.5), kg input (§7.6). Airline results keep the existing `airlines.js` logic — restyle only. | L | The traveller's first real task |
| **12** | `NewRequest.jsx` (1047 ln) | Same form primitives; buy-and-carry toggle; item value and weight inputs. | L | The sender's first real task |
| **13** | `EscrowPayment.jsx` (533 ln) | Money display (§7.12), Stripe `CardElement` styles to match §7.2 (pass `style.base` with `--font-mono`, `--ink`, `--ink-subtle`). Keep `calcFees()` untouched. | M | The moment money moves |
| **14** | `Completed.jsx` | Rating display (§7.11) — replace the 5-star row with `★ 4.9 (23)`; DELIVERED stamps. | M | Post-delivery confidence |
| **15** | `Wallet.jsx` (835 ln) / `Earnings.jsx` | `display-m` figures in Plex Mono, money rows, recharts restyle: `--ink` series, `--border` grid, no gradients. | M | Traveller retention |
| **16** | `Profile.jsx` (902 ln) | Avatar (§6.4), verification badges (§7.10), trust hierarchy order (§9.1). | M | Where trust is judged |
| **17** | `Auth.jsx` | Remove the two gradients; ink lockup, single `Primary` button, form per §7.2. | M | First screen a new user sees |
| **18** | `AdminDashboard.jsx` | Internal — tables to `--border` rules, mono figures. Last, deliberately. | M | Internal only |

**Cross-cutting sweeps** (do once, across all files, after step 4):

- `violet-*` / `purple-*` → `brand` / `accent` tokens. 66 occurrences of
  `text-violet-600` alone.
- `gray-*` → `ink-*` (text) or `paper-*` (borders and grounds). Note the split:
  `border-gray-100` → `border-line`, `text-gray-400` → `text-content-subtle`.
- `rounded-2xl` / `rounded-xl` → `rounded-lg` (8px) on cards, `rounded-md` on
  controls.
- `active:scale-95` → `active:scale-[.985]`.
- `shadow-card` / `shadow-card-hover` → nothing; cards are `elev-0` with a
  border.
- "Shipper" → "Sender" and "Traveler" → "Traveller" in **user-facing strings
  only** — never in `shipper_id`, `traveler_id`, or any DB/prop identifier.
- Remove every emoji from JSX.

---

## 14. Do / Don't

**1 — The accent**
- ✅ One orange button on the deal screen: `Pay escrow`, because it is the
  sender's move.
- ❌ Orange `Accept match`, orange `Message`, and an orange `View profile` on
  the same card. Now nothing is the action.

**2 — Escrow copy**
- ✅ "$268.00 is held by fetchr. Neither side can move it alone."
- ❌ "Your funds are secured in our escrow facility pending bilateral
  confirmation."

**3 — The route block**
- ✅ `LHR` at 32px mono, "London Heathrow" at 13px underneath, truncating.
- ❌ "London Heathrow Airport → New York John F. Kennedy International" wrapped
  across three lines at 16px, with the codes in a tooltip.

**4 — Ratings**
- ✅ `★ 4.9 (23)` — one star, the number, the count.
- ❌ Five gold stars with a half-star for 4.9, which at 14px is indistinguishable
  from 4.6 and adds 60px of width to every card.

**5 — A bad review**
- ✅ `★ 1.0 (4)` rendered in `--danger`, on the card, at the same size as
  everyone else's.
- ❌ Hiding ratings below 3.0, or showing "New traveller" for someone with four
  one-star reviews.

**6 — Verification**
- ✅ A green `ID VERIFIED` badge next to the name, and a grey "This traveller
  hasn't verified their ID" line when they haven't.
- ❌ A green tick overlapping the avatar corner at 24px, with no label, that
  actually means "email confirmed".

**7 — Empty search**
- ✅ "No travellers on this route yet. We'll notify you when someone flies
  LHR → JFK before 12 Sep." + `Widen the dates`.
- ❌ A centred illustration of a globe and "Nothing to see here!"

**8 — Cancellation**
- ✅ A `VOID` stamp, a `--danger` bottom rule, 72% opacity, and "Your $268.00
  was returned to your card on 21 Jul."
- ❌ Silently removing the deal from the list, so the sender wonders whether
  their $268 vanished with it.

**9 — Dual role**
- ✅ One ticket component; `TRIP · #F2291` when it's your flight, `REQUEST ·
  #F2291` when it's your request, `You pay` / `You receive` written from the
  reader's side.
- ❌ Blue cards for travellers, green cards for senders — which destroys the
  meaning of green and makes every screen a colour-matching puzzle.

**10 — Surfaces**
- ✅ A white ticket with a 1px `--border` sitting flat on `--ground`, defined by
  its perforation and its ink header.
- ❌ `bg-white/70 backdrop-blur-xl` with a violet glow shadow and a
  purple-to-indigo gradient header — which is what the app wears today, and
  what every AI-generated app wears with it.

---

## Change log

| Version | Date | Change |
|---|---|---|
| 1.0 | 2026-08-28 | First edition. Direction "Boarding Pass" with mark M3 "Takeoff f", chosen from three proposed directions and four proposed marks. |
