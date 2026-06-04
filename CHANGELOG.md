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
- [x] Bidirectional Gist sync — auto-pull every 60s; merge todos by updatedAt, checklist state by timestamp, settings by version; deleted items never resurrected
- [x] Force sync button pushes then pulls and shows a toast confirmation when complete
- [x] Local folder sync — picks a folder, writes focusapp-data.json every 5 min when data changes
- [x] Archive button updated to box/archive SVG icon
- [x] Export and Gist sync include panel names and all settings
- [x] Checklist banners — even padding above and below, consistent gap between multiple banners
- [x] Allow whitespace-only items (e.g. a single space) as visual spacers in todo lists

## To Do

- [x] Change "Now Focusing" banner blue to a lighter shade so it stands out more
- [x] Checklist Schedules — replace the hardcoded Morning Process with a general-purpose scheduled checklist system (13 recurrence types, drag-reorderable items, links/notes per item, red until complete/blue when done, incomplete checklists carry forward to today)

## To Do

- [x] Separate sync into two buttons — a push icon and a pull icon
- [x] Add padding above banner lists so they don't overlap the dark grey top ribbon
- [x] Switch the date next to "FocusApp" from period-separated to slash-separated (e.g. 06/04/2026)
- [x] Make the header date copy to clipboard on click
- [x] Resizable settings panel — drag handle lets user adjust width; panel always opens at the default width, user changes are not persisted across close/reopen
