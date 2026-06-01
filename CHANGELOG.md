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
- [ ] Checklist Schedules — replace the hardcoded Morning Process with a general-purpose scheduled checklist system
  - In Settings, user can create multiple named checklists (e.g. "Morning Process", "Monthly Reconcile", "Bi-Weekly Brain Dump Audit")
  - Each checklist has its own item editor — opened via an inline dialog (no native alert/confirm, works with pop-up blockers)
  - Each checklist has a configurable schedule with rich recurrence options:
    - Daily
    - Weekdays only / Weekends only
    - Specific days of the week (e.g. every Monday & Wednesday)
    - Weekly (every N weeks on a chosen day)
    - Bi-weekly
    - Monthly — by date (e.g. 1st, 15th), by weekday position (e.g. first Monday, last Friday), or first/last weekday of the month
    - Quarterly / Yearly
    - Custom interval (every N days)
    - One-time (specific date)
  - Each checklist has a persistence setting:
    - Disappears at end of day whether checked or not (resets on next occurrence)
    - Persists until fully checked off — stays visible on subsequent days; user can also manually pull it to the current day
  - Banners for scheduled checklists appear below Morning Process — only shown if the checklist applies to the viewed day (by schedule or by carry-forward), hidden otherwise
  - Checklist state (checked items, carry status) is saved per-day alongside todo data
- [ ] (your next items here)
