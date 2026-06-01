# FocusApp Changelog

## Done

- [x] Initial app — dual-panel todo list with IndexedDB persistence
- [x] Day-split bar (panels swap order at a configurable time)
- [x] Carry forward — move incomplete items to today
- [x] Undo / redo
- [x] Trash (soft delete, restore, permanent delete)
- [x] Multi-select mode (bulk delete, bulk carry, copy as text, export)
- [x] Edit modal (priority, due date, status, links, notes)
- [x] Date navigation (prev / next / today)
- [x] Pending-carry banner on Today view
- [x] Import / export JSON (includes settings)
- [x] Theme support (light / dark / system)
- [x] Drag-and-drop reorder
- [x] Online / offline indicator
- [x] Force sync button
- [x] SVG favicon (focus target icon)
- [x] Remove confirmation pop-ups on delete (X button acts immediately)
- [x] Make the app work with pop-up blockers (replaced all alert/confirm calls)
- [x] Carrying items forward deletes them from the original day instead of copying
- [x] Morning Process — collapsible red/blue banner with daily checklist, resets each day from template
- [x] Inline text editing — single click on item text to edit in place
- [x] Settings auto-save on change — no manual save button required
- [x] Per-panel last-edited timestamp in panel header
- [x] App automatically switches to "Today" when a new day rolls around (with toast notification)
- [x] Carry Forward hidden on past days with no incomplete items
- [x] GitHub Gist sync — auto-push on every change, reconnect push, restore from Gist
- [x] Local folder sync — picks a folder, writes focusapp-data.json every 5 min when data changes
- [x] Archive button updated to box/archive SVG icon
- [x] Export and Gist sync include panel names and all settings
- [x] Checklist banners — even padding above and below, consistent gap between multiple banners
- [x] Allow whitespace-only items (e.g. a single space) as visual spacers in todo lists

## To Do

- [x] Change "Now Focusing" banner blue to a lighter shade so it stands out more
- [x] Scheduled Checklists — general-purpose scheduled checklist system
  - In Settings, user can create multiple named checklists (e.g. "Morning Process", "Monthly Reconcile", "Bi-Weekly Brain Dump Audit")
  - Settings → "Scheduled Checklists" section: create, edit, delete named checklists
  - Each checklist configured via an inline modal (no native alert/confirm — works with pop-up blockers)
  - Rich schedule options: daily, weekdays, weekends, specific days of week, every N days, weekly (every N weeks on a day), bi-weekly, monthly by date, monthly by weekday position (e.g. first Monday, last Friday), first/last weekday of month, quarterly, yearly, one-time
  - Start date field — checklist won't appear before that date
  - Persistence: "resets each occurrence" or "persists until all checked off" with pull-to-today button
  - Color-coded collapsible banners appear below Morning Process, shown only when applicable to viewed day
  - Per-day checklist state stored in IndexedDB (DB upgraded to v3)
  - Included in export/import/Gist sync automatically
- [ ] (your next items here)
