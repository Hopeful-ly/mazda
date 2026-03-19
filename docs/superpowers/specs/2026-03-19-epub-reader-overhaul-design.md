# EPUB Reader Overhaul — Design Spec

## Goal

Replace epub.js with foliate-js and redesign the reader UI for rock-solid mobile and desktop experience.

## Problem

The current EPUB reader uses epub.js v0.3.93, an aging library with known CSS column bugs. Touch/swipe handling is hand-rolled and injected into iframes, making it fragile on mobile. The toolbar UX is desktop-oriented, and several features (bookmarks, scroll mode, progress scrubbing) are missing.

## Approach: foliate-js with Custom React Wrapper

Replace the rendering engine with foliate-js (the library powering Readest and Foliate). foliate-js provides:
- Built-in touch/swipe page turning in its paginator
- Paginated and scroll mode toggle without reloading
- SVG annotation overlays with hit-testing
- EPUB CFI position tracking
- Async search
- Support for EPUB, MOBI/KF8, FB2, CBZ formats

The application layer handles: tap zones, toolbar, settings, progress persistence, bookmarks, highlights UI.

## Architecture

### Rendering Layer
- **foliate-js** vendored in `public/foliate-js/` (native ES modules, no build step)
- **`<foliate-view>`** custom element created and managed from a React component via `useRef` + `useEffect`
- Dynamic import bypasses bundler: `import(/* webpackIgnore: true */ '/foliate-js/view.js')`

### Interaction Layer
- foliate-js paginator handles swipe gestures natively
- App adds tap zones: left 25% = prev, right 25% = next, center = toggle toolbar
- Keyboard: arrow keys, Page Up/Down, Space
- Desktop: hover arrows on edges

### Toolbar (Redesigned)
- **Mobile**: bottom sheet (thumb-reachable), swipe-up to expand settings
- **Desktop**: top bar (same as current but improved)
- **Progress slider** at bottom for scrubbing to any position
- **Flow mode toggle**: paginated vs continuous scroll
- **Margin control**: adjust reading width

### Features Added
- **Bookmarks**: tap bookmark icon in toolbar, view/manage in a panel (uses existing backend)
- **Highlights**: text selection shows a popover with color choices, not auto-saved
- **Scroll mode**: toggle between paginated and continuous scroll
- **Margin/width control**: adjust `max-inline-size` and `gap` on the paginator
- **Progress slider**: drag to jump to any position via `goToFraction()`

### What's Preserved
- All backend APIs (trpc reader router) — unchanged
- Database schema (UserBook, Bookmark, Highlight, UserPreferences) — unchanged
- Theme/font constants — extended with new settings
- Progress debounce logic — reused
- Other format readers (PDF, Comic, Text) — untouched
- Content API route — unchanged

### CSP Security
foliate-js requires `script-src 'self'` to prevent malicious EPUB scripts from executing. Add CSP headers in `next.config.ts`.

## Settings Schema Extension

Add to UserPreferences:
- `readerFlowMode`: "paginated" | "scrolled" (default: "paginated")
- `readerMaxWidth`: number in px (default: 720)
- `readerMargin`: number as percentage (default: 5)

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `public/foliate-js/` | Create (vendor) | foliate-js library files |
| `src/components/reader/foliate-reader.tsx` | Create | React wrapper for `<foliate-view>` |
| `src/components/reader/reader-toolbar.tsx` | Rewrite | Bottom sheet mobile, top bar desktop, progress slider |
| `src/components/reader/selection-popover.tsx` | Create | Highlight color picker on text selection |
| `src/components/reader/bookmark-panel.tsx` | Create | Bookmark list panel |
| `src/components/reader/toc-panel.tsx` | Minor update | Theme awareness |
| `src/app/(app)/reader/[id]/page.tsx` | Modify | Wire up new components |
| `src/lib/constants.ts` | Update | Add flow mode, margin, max-width settings |
| `src/components/reader/epub-reader.tsx` | Delete | Replaced by foliate-reader |
| `next.config.ts` | Update | CSP headers |
| `package.json` | Update | Remove epubjs, no new deps needed |
