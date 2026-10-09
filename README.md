# Laurentian EcoClean Co. — Official Website

> Premium, eco-friendly residential and commercial cleaning services across Greater Vancouver and the Lower Mainland, British Columbia.

---

## 🌟 About Laurentian EcoClean Co.

**Laurentian EcoClean Co.** is a Canadian cleaning enterprise delivering hospital-grade cleanliness and hospitality-level care for homes, condominiums, commercial offices, and post-construction properties. 

Our mission combines non-toxic green chemistry, HEPA multi-stage filtration, and fully bonded, living-wage cleaning professionals to ensure pristine indoor air quality and sparkling, sanitized spaces.

---

## 🚀 Key Features

- **Self-Contained Architecture**: Built as a lightweight, high-performance static application (`index.html`) with zero heavy framework bloat or external runtime dependencies.
- **Classic & Trustworthy Visual Design**:
  - Custom 4-colour brand design system defined via CSS variables.
  - Refined typography hierarchy, soft elevations, and smooth hover interactions.
  - Subtle CSS rotate animation on the brand logo emblem during header hover.
- **Mobile-First & Fully Responsive**:
  - Accessible mobile hamburger navigation drawer with keyboard trap and ESC dismiss support.
  - Sticky header with instant "Call Now" CTA.
  - Fixed WhatsApp Floating Action Button (FAB) at the bottom-right for instant inquiries.
- **Full Service Suite Showcase**:
  - Residential Regular Cleaning
  - Deep Cleaning & Seasonal Detail
  - Move-In / Move-Out Relocation Turnover
  - Commercial Office & Workspace Sanitization
  - Recurring Maintenance Subscriptions
  - Post-Construction Particulate Cleaning
- **Interactive FAQ Accordion**:
  - Six comprehensive questions covering insurance, pet-safe botanical cleaners, cancellation, and satisfaction guarantee.
  - Smooth native height animations with ARIA expanded state management.
- **Comprehensive Canadian SEO & Structured Data**:
  - Target meta tags for Vancouver & Lower Mainland search queries.
  - Open Graph & Twitter Card social preview cards.
  - Valid Schema.org `CleaningService` / `LocalBusiness` JSON-LD schema with Canadian postal address, hours, and geo-coordinates.
- **Inclusive Accessibility (A11y)**:
  - WCAG AA compliant color contrast ratios.
  - High-visibility focus indicators (`:focus-visible`).
  - Respects user motion preferences (`prefers-reduced-motion: reduce`).

---

## 🎨 Brand Colour System

The visual identity is strictly anchored by four core brand colours:

| Token | Hex Value | Role |
| :--- | :--- | :--- |
| `--brand-primary` | `#184A3B` | Canadian Spruce Green — Trust, reliability, grounding |
| `--brand-secondary` | `#D4901A` | Warm Amber Ochre — High-visibility CTAs, hospitality warmth |
| `--brand-surface` | `#F0F6F2` | Soft Sage Mist — Tranquil, hygienic background surfaces |
| `--brand-dark` | `#14221D` | Deep Nordic Slate — High-contrast typography & footer |

---

## 📍 Business Information & Service Coverage

- **Head Office**: 742 Burrard Street, Suite 500, Vancouver, BC V6Z 2S7, Canada
- **Phone**: `+1 (604) 555-0189`
- **Email**: `quotes@laurentianecoclean.ca` / `hello@laurentianecoclean.ca`
- **Operating Hours**:
  - Monday – Friday: 7:30 AM – 7:00 PM PST
  - Saturday: 8:30 AM – 5:00 PM PST
  - Sunday: Closed (On-call for commercial accounts)
- **Primary Service Areas**:
  - Vancouver (Downtown, Kitsilano, Yaletown, Mount Pleasant)
  - North Vancouver (Lonsdale, Deep Cove, Lynn Valley)
  - West Vancouver (Ambleside, Dundarave)
  - Burnaby (Brentwood, Metrotown, Burnaby Heights)
  - Richmond (Steveston, City Centre)
  - New Westminster
  - Coquitlam & Port Moody
  - Surrey & White Rock

---

## 🛠️ Local Development & Preview

This project runs with standard web tooling:

```bash
# Install dependencies
npm install

# Start the local development server (port 3000)
npm run dev

# Build the production bundle
npm run build

# Preview the production build
npm run preview
```

You can also open `index.html` directly in any modern web browser without a web server or build step.

---

## 🚀 Vercel Deployment Guide

The project is fully configured for zero-configuration, error-free deployment on [Vercel](https://vercel.com):

1. **Push your code to GitHub / GitLab / Bitbucket**.
2. **Import the repository into Vercel**.
3. Vercel automatically detects the configuration from `vercel.json`:
   - **Framework Preset**: `Vite`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
4. Click **Deploy**.

### Fixed Vercel Build Issues
- **Peer Dependency Conflicts**: Resolved `esbuild` / `vite` peer resolution errors by aligning dependencies and adding `.npmrc` (`legacy-peer-deps=true`).
- **Generated `package-lock.json`**: Ensures npm builds predictably on Vercel's build workers.
- **Configured `vercel.json`**: Explicitly maps the build command and output directory to prevent fallback detection errors.

---

## 📈 Google Search Central SEO Starter Guide Compliance

The website follows best practices outlined in [Google's SEO Starter Guide](https://developers.google.com/search/docs/fundamentals/seo-starter-guide):

1. **Rich Snippets & Structured Data (JSON-LD `@graph`)**:
   - `CleaningService` / `LocalBusiness` entity with coordinates, opening hours, aggregate ratings (4.9/5 from 148 reviews), and full service catalog.
   - `FAQPage` schema enabling interactive question dropdowns directly in Google Search results.
   - `BreadcrumbList` schema for hierarchical navigation display.
   - `WebSite` schema for sitelinks eligibility.
2. **Descriptive Anchor Links**:
   - Replaced generic CTAs with context-rich anchor text (e.g., *"Request Residential Cleaning Quote"*, *"Request Move-Out Cleaning Quote"*) providing clear intent signals to search crawlers.
3. **Core Web Vitals & Image Optimization**:
   - Preconnect & DNS-prefetch headers for remote image assets (`images.unsplash.com`).
   - Prioritized LCP hero image with `fetchpriority="high"`, explicit dimensions (`1200x900`), and `decoding="async"`.
   - Lazy-loading on all below-the-fold imagery.
4. **Crawlability & Technical SEO**:
   - Valid XML sitemap (`/sitemap.xml`) referencing all 8 primary sections.
   - Clean `robots.txt` (`/robots.txt`) with sitemap location directive.
   - Advanced robot snippet controls: `max-image-preview:large`, `max-snippet:-1`, `max-video-preview:-1`.
   - Semantic landmarks and `<address>` wrapping for business contact data.

---

## 📄 License & Attribution

&copy; 2026 Laurentian EcoClean Co. All rights reserved. Registered in British Columbia, Canada.
