// FocusApp — main application logic
// Runs after DOM is fully parsed (script at bottom of <body>).
(function () {
  'use strict';

  // ── Helpers ────────────────────────────────────────────────────────────────

  function el(id) { return document.getElementById(id); }

  function show(elem) { elem.classList.remove('hidden'); }
  function hide(elem) { elem.classList.add('hidden'); }

  function todayKey() {
    var d  = new Date();
    var mm = String(d.getMonth() + 1).padStart(2, '0');
    var dd = String(d.getDate()).padStart(2, '0');
    return mm + '.' + dd + '.' + d.getFullYear();
  }

  function keyToDate(key) {
    var parts = key.split('.');
    return new Date(+parts[2], +parts[0] - 1, +parts[1]);
  }

  function shiftKey(key, delta) {
    var d = keyToDate(key);
    d.setDate(d.getDate() + delta);
    var mm = String(d.getMonth() + 1).padStart(2, '0');
    var dd = String(d.getDate()).padStart(2, '0');
    return mm + '.' + dd + '.' + d.getFullYear();
  }

  function formatDateLabel(key) {
    var d      = keyToDate(key);
    var today  = new Date(); today.setHours(0, 0, 0, 0);
    var target = new Date(d); target.setHours(0, 0, 0, 0);
    var diff   = Math.round((target - today) / 86400000);
    var wd     = d.toLocaleDateString('en-US', { weekday: 'long' });
    var full   = d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    if (diff ===  0) return 'Today — ' + wd + ', ' + full;
    if (diff === -1) return 'Yesterday — ' + wd + ', ' + full;
    if (diff ===  1) return 'Tomorrow — ' + wd + ', ' + full;
    return wd + ', ' + full;
  }

  function to12h(hhmm) {
    var parts = hhmm.split(':');
    var h = +parts[0];
    var m = +parts[1];
    var ampm = h < 12 ? 'AM' : 'PM';
    var hour = h % 12 || 12;
    return hour + ':' + String(m).padStart(2, '0') + ' ' + ampm;
  }

  function makeId() {
    return Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  }

  function isOverdue(dateStr) {
    if (!dateStr) return false;
    var today = new Date(); today.setHours(0, 0, 0, 0);
    var due   = new Date(dateStr + 'T00:00:00');
    return due < today;
  }

  // ── State ──────────────────────────────────────────────────────────────────

  var currentDate  = todayKey();
  var settings     = {};
  var selectedIds  = new Set();
  var editingId    = null;
  var dragSrcId    = null;
  var undoStack    = [];
  var redoStack    = [];
  var selectMode   = false;
  var doneOpen     = { left: true, right: true };

  // ── DOM refs (all assigned after DOM is ready) ─────────────────────────────

  var undoBtn       = el('undo-btn');
  var redoBtn       = el('redo-btn');
  var trashBtn      = el('trash-btn');
  var syncBtn       = el('sync-btn');
  var settingsBtn   = el('settings-btn');
  var onlineDot     = el('online-dot');
  var onlineLabel   = el('online-label');
  var dateKeyEl     = el('date-key');
  var dateLabelEl   = el('date-label');
  var prevBtn       = el('prev-btn');
  var nextBtn       = el('next-btn');
  var todayBtnEl    = el('today-btn');
  var carryBtn      = el('carry-btn');
  var panelsEl      = el('panels');
  var dsToggleBtn   = el('ds-toggle');
  var dsLeftName    = el('ds-left-name');
  var dsRightName   = el('ds-right-name');
  var dsSwitchTime  = el('ds-switch-time');
  var selectToolbar = el('select-toolbar');
  var selectCountEl = el('select-count');
  var copyPlainBtn  = el('copy-plain-btn');
  var exportSelBtn  = el('export-sel-btn');
  var deleteSelBtn  = el('delete-sel-btn');
  var carrySelBtn   = el('carry-sel-btn');
  var deselectBtn   = el('deselect-btn');
  var settingsOvl   = el('settings-overlay');
  var settingsDrw   = el('settings-drawer');
  var closeSettings = el('close-settings');
  var saveSettings  = el('save-settings-btn');
  var exportAllBtn  = el('export-all-btn');
  var importBtn     = el('import-btn');
  var importFile    = el('import-file');
  var trashOvl      = el('trash-overlay');
  var trashDrw      = el('trash-drawer');
  var closeTrash    = el('close-trash');
  var trashList     = el('trash-list');
  var emptyTrash    = el('empty-trash-btn');
  var modalOvl      = el('modal-overlay');
  var itemModal     = el('item-modal');
  var closeModal    = el('close-modal');
  var modalCancel   = el('modal-cancel');
  var modalSave     = el('modal-save');
  var itemTpl         = el('item-tpl');
  var selectModeBtn     = el('select-mode-btn');
  var carryBanner       = el('carry-banner');
  var carryBannerMsg    = el('carry-banner-msg');
  var carryBannerBtn    = el('carry-banner-btn');
  var carryBannerDismiss = el('carry-banner-dismiss');

  // ── Select mode ────────────────────────────────────────────────────────────

  function setSelectMode(on) {
    selectMode = on;
    selectModeBtn.classList.toggle('active', on);
    selectModeBtn.textContent = on ? 'Done Selecting' : 'Select';
    if (!on) {
      selectedIds.clear();
      updateSelectToolbar();
    }
    // Show/hide all sel-chk checkboxes
    document.querySelectorAll('.sel-chk').forEach(function (c) {
      c.classList.toggle('hidden', !on);
    });
  }

  selectModeBtn.addEventListener('click', function () {
    setSelectMode(!selectMode);
  });

  // ── Undo / redo ────────────────────────────────────────────────────────────

  function refreshUndoButtons() {
    undoBtn.disabled = undoStack.length === 0;
    redoBtn.disabled = redoStack.length === 0;
  }

  function snapshotForUndo() {
    return DB.getTodosByDate(currentDate).then(function (todos) {
      undoStack.push(JSON.parse(JSON.stringify(todos)));
      redoStack = [];
      refreshUndoButtons();
    });
  }

  function applySnapshot(snapshot) {
    return DB.getTodosByDate(currentDate).then(function (current) {
      var deletes = current.map(function (t) { return DB.deleteTodo(t.id); });
      return Promise.all(deletes);
    }).then(function () {
      var puts = snapshot.map(function (t) { return DB.putTodo(t); });
      return Promise.all(puts);
    }).then(render);
  }

  function doUndo() {
    if (!undoStack.length) return;
    DB.getTodosByDate(currentDate).then(function (current) {
      redoStack.push(JSON.parse(JSON.stringify(current)));
      var snapshot = undoStack.pop();
      refreshUndoButtons();
      applySnapshot(snapshot);
    });
  }

  function doRedo() {
    if (!redoStack.length) return;
    DB.getTodosByDate(currentDate).then(function (current) {
      undoStack.push(JSON.parse(JSON.stringify(current)));
      var snapshot = redoStack.pop();
      refreshUndoButtons();
      applySnapshot(snapshot);
    });
  }

  undoBtn.addEventListener('click', doUndo);
  redoBtn.addEventListener('click', doRedo);

  document.addEventListener('keydown', function (e) {
    var tag = document.activeElement.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (e.ctrlKey && !e.shiftKey && e.key === 'z') { e.preventDefault(); doUndo(); }
    if (e.ctrlKey && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) { e.preventDefault(); doRedo(); }
  });

  // ── Online status ──────────────────────────────────────────────────────────

  function updateOnline() {
    var on = navigator.onLine;
    onlineDot.className = 'dot ' + (on ? 'online' : 'offline');
    onlineLabel.textContent = on ? 'Online' : 'Offline';
  }

  window.addEventListener('online',  updateOnline);
  window.addEventListener('offline', updateOnline);
  syncBtn.addEventListener('click',  updateOnline);
  updateOnline();

  // ── Date navigation ────────────────────────────────────────────────────────

  function updateDateUI() {
    dateKeyEl.textContent   = currentDate;
    dateLabelEl.textContent = formatDateLabel(currentDate);
    var today  = todayKey();
    var isPast = keyToDate(currentDate) < keyToDate(today);
    carryBtn.classList.toggle('hidden', !isPast || currentDate === today);
    todayBtnEl.style.fontWeight = (currentDate === today) ? '800' : '600';
  }

  prevBtn.addEventListener('click', function () {
    currentDate = shiftKey(currentDate, -1);
    updateDateUI();
    render();
  });

  nextBtn.addEventListener('click', function () {
    currentDate = shiftKey(currentDate, 1);
    updateDateUI();
    render();
  });

  todayBtnEl.addEventListener('click', function () {
    currentDate = todayKey();
    updateDateUI();
    render();
  });

  carryBtn.addEventListener('click', function () {
    var srcDate = currentDate;
    var tgt     = todayKey();
    if (srcDate === tgt) return;

    DB.getAllTodos().then(function (all) {
      var incomplete = all.filter(function (t) {
        return t.listDate === srcDate && !t.completed;
      });
      if (!incomplete.length) return;
      var todaySet = new Set(
        all.filter(function (t) { return t.listDate === tgt; })
           .map(function (t) { return t.panel + '|' + t.text.trim().toLowerCase(); })
      );
      var carried = 0;
      var ops = [];
      incomplete.forEach(function (t) {
        var key = t.panel + '|' + t.text.trim().toLowerCase();
        if (todaySet.has(key)) {
          ops.push(DB.deleteTodo(t.id));
          return;
        }
        var copy = Object.assign({}, t, {
          id:        makeId(),
          listDate:  tgt,
          completed: false,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          sortOrder: Date.now() + carried,
        });
        ops.push(DB.putTodo(copy));
        ops.push(DB.deleteTodo(t.id));
        carried++;
      });
      if (!ops.length) return;
      return Promise.all(ops).then(function () {
        currentDate = tgt;
        updateDateUI();
        render();
      });
    });
  });

  // ── Day split ──────────────────────────────────────────────────────────────

  function updateDaySplit() {
    var splitTime = settings.splitTime || '12:00';
    var parts     = splitTime.split(':');
    var sh = +parts[0];
    var sm = +parts[1];
    var now       = new Date();
    var pastSplit = now.getHours() > sh || (now.getHours() === sh && now.getMinutes() >= sm);
    var flipped   = settings.splitFlipped ? !pastSplit : pastSplit;

    panelsEl.classList.toggle('flipped', flipped);
    dsToggleBtn.setAttribute('aria-pressed', String(flipped));

    var ln = settings.nameLeft  || 'Panel 1';
    var rn = settings.nameRight || 'Panel 2';
    dsLeftName.textContent  = flipped ? rn : ln;
    dsRightName.textContent = flipped ? ln : rn;

    var active = flipped ? 'right' : 'left';
    el('banner-left').textContent  = active === 'left'  ? '▶ NOW FOCUSING' : '';
    el('banner-right').textContent = active === 'right' ? '▶ NOW FOCUSING' : '';
  }

  dsToggleBtn.addEventListener('click', function () {
    settings.splitFlipped = !settings.splitFlipped;
    DB.setSetting('splitFlipped', settings.splitFlipped);
    updateDaySplit();
  });

  setInterval(updateDaySplit, 60000);

  // ── Settings drawer ────────────────────────────────────────────────────────

  function openSettings() {
    el('set-name-left').value  = settings.nameLeft  || '';
    el('set-name-right').value = settings.nameRight || '';
    el('set-split-time').value = settings.splitTime || '12:00';
    el('set-theme').value      = settings.theme     || 'system';
    updateSplitPreview();
    show(settingsOvl);
    show(settingsDrw);
  }

  function closeSettingsFn() {
    hide(settingsOvl);
    hide(settingsDrw);
  }

  function updateSplitPreview() {
    var val = el('set-split-time').value || '12:00';
    el('split-preview').textContent = to12h(val);
  }

  el('set-split-time').addEventListener('input', updateSplitPreview);

  settingsBtn.addEventListener('click', openSettings);
  closeSettings.addEventListener('click', closeSettingsFn);
  settingsOvl.addEventListener('click', closeSettingsFn);

  saveSettings.addEventListener('click', function () {
    settings.nameLeft    = el('set-name-left').value.trim()  || 'Panel 1';
    settings.nameRight   = el('set-name-right').value.trim() || 'Panel 2';
    settings.splitTime   = el('set-split-time').value || '12:00';
    settings.theme       = el('set-theme').value;

    DB.setSetting('nameLeft',  settings.nameLeft);
    DB.setSetting('nameRight', settings.nameRight);
    DB.setSetting('splitTime', settings.splitTime);
    DB.setSetting('theme',     settings.theme);

    applySettings();
    closeSettingsFn();
  });

  function applySettings() {
    var ln = settings.nameLeft  || 'Panel 1';
    var rn = settings.nameRight || 'Panel 2';
    el('title-left').textContent  = ln;
    el('title-right').textContent = rn;
    dsLeftName.textContent  = ln;
    dsRightName.textContent = rn;

    var st = settings.splitTime || '12:00';
    dsSwitchTime.textContent = '(switches ' + to12h(st) + ')';

    document.documentElement.dataset.theme = settings.theme || 'system';
    updateDaySplit();
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  function render() {
    return DB.getTodosByDate(currentDate).then(function (todos) {
      todos.sort(function (a, b) {
        return (b.sortOrder || b.createdAt || 0) - (a.sortOrder || a.createdAt || 0);
      });

      ['left', 'right'].forEach(function (side) {
        var activeList = el('list-' + side);
        var doneList   = el('done-list-' + side);
        var countEl    = el('done-count-' + side);
        var detEl      = el('done-' + side);

        activeList.innerHTML = '';
        doneList.innerHTML   = '';

        var sideTodos    = todos.filter(function (t) { return t.panel === side; });
        var activeTodos  = sideTodos.filter(function (t) { return !t.completed; });
        var doneTodos    = sideTodos.filter(function (t) { return  t.completed; });

        detEl.open = doneOpen[side];

        activeTodos.forEach(function (t) { activeList.appendChild(buildItem(t)); });
        doneTodos.forEach(function (t)   { doneList.appendChild(buildItem(t)); });
        countEl.textContent = doneTodos.length;
      });

      updateSelectToolbar();
      checkPendingCarry();
    });
  }

  function buildItem(todo) {
    var node = itemTpl.content.firstElementChild.cloneNode(true);
    node.dataset.id = todo.id;

    var selChk   = node.querySelector('.sel-chk');
    var textEl   = node.querySelector('.item-text');
    var priEl    = node.querySelector('.item-priority');
    var dueEl    = node.querySelector('.item-due');
    var stEl     = node.querySelector('.item-status');
    var linksEl  = node.querySelector('.item-links');
    var notesEl  = node.querySelector('.item-notes');
    var editBtn  = node.querySelector('.edit-btn');
    var delBtn   = node.querySelector('.del-btn');
    var doneChk  = node.querySelector('.done-chk');

    // Text
    textEl.textContent = todo.text;

    // Done checkbox
    doneChk.checked = !!todo.completed;
    doneChk.addEventListener('change', function () {
      snapshotForUndo().then(function () {
        todo.completed = doneChk.checked;
        todo.updatedAt = Date.now();
        return DB.putTodo(todo);
      }).then(render);
    });

    // Priority badge
    if (todo.priority) {
      priEl.textContent      = todo.priority;
      priEl.dataset.priority = todo.priority;
      show(priEl);
    }

    // Due date
    if (todo.dueDate) {
      dueEl.textContent = todo.dueDate;
      if (isOverdue(todo.dueDate) && !todo.completed) dueEl.classList.add('overdue');
      show(dueEl);
    }

    // Status badge
    if (todo.status) {
      stEl.textContent     = todo.status.replace('-', ' ');
      stEl.dataset.status  = todo.status;
      show(stEl);
    }

    // Links
    if (todo.links) {
      var urls = todo.links.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
      urls.forEach(function (url, i) {
        var a = document.createElement('a');
        a.href   = url;
        a.target = '_blank';
        a.rel    = 'noopener noreferrer';
        a.textContent = '[' + (i + 1) + ']';
        linksEl.appendChild(a);
      });
      show(linksEl);
    }

    // Notes icon
    if (todo.notes) {
      notesEl.title = todo.notes;
      show(notesEl);
    }

    // Selection — checkbox only visible in select mode
    selChk.checked = selectedIds.has(todo.id);
    node.classList.toggle('selected', selChk.checked);
    if (selectMode) selChk.classList.remove('hidden');
    selChk.addEventListener('change', function () {
      if (selChk.checked) selectedIds.add(todo.id);
      else selectedIds.delete(todo.id);
      node.classList.toggle('selected', selChk.checked);
      updateSelectToolbar();
    });

    // Edit
    editBtn.addEventListener('click', function () { openModal(todo); });
    textEl.addEventListener('dblclick', function () { openModal(todo); });

    // Delete (soft)
    delBtn.addEventListener('click', function () {
      snapshotForUndo().then(function () {
        return Promise.all([DB.addToTrash(todo), DB.deleteTodo(todo.id)]);
      }).then(function () {
        selectedIds.delete(todo.id);
        updateSelectToolbar();
        render();
      });
    });

    // Drag-and-drop
    node.addEventListener('dragstart', function (e) {
      dragSrcId = todo.id;
      node.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(todo.id));
    });
    node.addEventListener('dragend', function () {
      node.classList.remove('dragging');
      document.querySelectorAll('.drag-over, .panel-drop-target').forEach(function (x) {
        x.classList.remove('drag-over', 'panel-drop-target');
      });
    });
    node.addEventListener('dragover', function (e) {
      e.preventDefault();
      if (String(todo.id) !== String(dragSrcId)) node.classList.add('drag-over');
    });
    node.addEventListener('dragleave', function () {
      node.classList.remove('drag-over');
    });
    node.addEventListener('drop', function (e) {
      e.stopPropagation();
      e.preventDefault();
      node.classList.remove('drag-over');
      var srcId = e.dataTransfer.getData('text/plain');
      if (!srcId || srcId === String(todo.id)) return;

      DB.getAllTodos().then(function (all) {
        var src = all.find(function (t) { return String(t.id) === srcId; });
        if (!src) return;
        return snapshotForUndo().then(function () {
          if (src.panel !== todo.panel) {
            src.panel     = todo.panel;
            src.sortOrder = (todo.sortOrder || todo.createdAt || 0) - 0.5;
            src.updatedAt = Date.now();
            return DB.putTodo(src);
          } else {
            return swapOrder(src, todo, all);
          }
        }).then(render);
      });
    });

    return node;
  }

  function swapOrder(src, dst, all) {
    var s = src.sortOrder || src.createdAt || 0;
    var d = dst.sortOrder || dst.createdAt || 0;
    src.sortOrder = d;
    dst.sortOrder = s;
    src.updatedAt = dst.updatedAt = Date.now();
    return Promise.all([DB.putTodo(src), DB.putTodo(dst)]);
  }

  // Panel drop zones (drop onto panel background moves to end)
  ['left', 'right'].forEach(function (side) {
    var panel = el('panel-' + side);
    panel.addEventListener('dragover', function (e) {
      e.preventDefault();
      panel.classList.add('panel-drop-target');
    });
    panel.addEventListener('dragleave', function (e) {
      if (!panel.contains(e.relatedTarget)) panel.classList.remove('panel-drop-target');
    });
    panel.addEventListener('drop', function (e) {
      e.preventDefault();
      panel.classList.remove('panel-drop-target');
      var srcId = e.dataTransfer.getData('text/plain');
      if (!srcId) return;

      DB.getAllTodos().then(function (all) {
        var src = all.find(function (t) { return String(t.id) === srcId; });
        if (!src || src.panel === side) return;
        var panelItems = all.filter(function (t) {
          return t.panel === side && t.listDate === currentDate;
        });
        var maxOrder = panelItems.reduce(function (m, t) {
          return Math.max(m, t.sortOrder || t.createdAt || 0);
        }, 0);
        return snapshotForUndo().then(function () {
          src.panel     = side;
          src.sortOrder = maxOrder + 1;
          src.updatedAt = Date.now();
          return DB.putTodo(src);
        }).then(render);
      });
    });
  });

  // ── Add item ───────────────────────────────────────────────────────────────

  function addItem(panel, text) {
    var now  = Date.now();
    var todo = {
      id:        makeId(),
      text:      text,
      panel:     panel,
      listDate:  currentDate,
      completed: false,
      priority:  '',
      dueDate:   '',
      status:    '',
      links:     '',
      notes:     '',
      createdAt: now,
      updatedAt: now,
      sortOrder: now,
    };
    return snapshotForUndo().then(function () {
      return DB.putTodo(todo);
    }).then(render);
  }

  el('form-left').addEventListener('submit', function (e) {
    e.preventDefault();
    var text = e.target.text.value.trim();
    if (!text) return;
    e.target.reset();
    addItem('left', text);
  });

  el('form-right').addEventListener('submit', function (e) {
    e.preventDefault();
    var text = e.target.text.value.trim();
    if (!text) return;
    e.target.reset();
    addItem('right', text);
  });

  // ── Edit modal ─────────────────────────────────────────────────────────────

  function openModal(todo) {
    editingId = todo.id;
    el('m-text').value     = todo.text     || '';
    el('m-priority').value = todo.priority || '';
    el('m-due').value      = todo.dueDate  || '';
    el('m-status').value   = todo.status   || '';
    el('m-links').value    = todo.links    || '';
    el('m-notes').value    = todo.notes    || '';
    show(modalOvl);
    show(itemModal);
    el('m-text').focus();
  }

  function closeModalFn() {
    editingId = null;
    hide(modalOvl);
    hide(itemModal);
  }

  closeModal.addEventListener('click',  closeModalFn);
  modalCancel.addEventListener('click', closeModalFn);
  modalOvl.addEventListener('click',    closeModalFn);

  el('m-text').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); modalSave.click(); }
  });

  modalSave.addEventListener('click', function () {
    if (!editingId) return;
    DB.getAllTodos().then(function (all) {
      var todo = all.find(function (t) { return t.id === editingId; });
      if (!todo) return;
      return snapshotForUndo().then(function () {
        todo.text      = el('m-text').value.trim() || todo.text;
        todo.priority  = el('m-priority').value;
        todo.dueDate   = el('m-due').value;
        todo.status    = el('m-status').value;
        todo.links     = el('m-links').value.trim();
        todo.notes     = el('m-notes').value.trim();
        todo.updatedAt = Date.now();
        return DB.putTodo(todo);
      }).then(function () {
        closeModalFn();
        render();
      });
    });
  });

  // ── Multi-select toolbar ───────────────────────────────────────────────────

  function updateSelectToolbar() {
    var count = selectedIds.size;
    selectToolbar.classList.toggle('hidden', count === 0);
    selectCountEl.textContent = count + ' selected';
  }

  deselectBtn.addEventListener('click', function () {
    setSelectMode(false);
    render();
  });

  copyPlainBtn.addEventListener('click', function () {
    DB.getAllTodos().then(function (all) {
      var lines = all
        .filter(function (t) { return selectedIds.has(t.id); })
        .map(function (t) {
          var parts = [t.text];
          if (t.priority) parts.push('[' + t.priority + ']');
          if (t.dueDate)  parts.push('due:' + t.dueDate);
          if (t.status)   parts.push('(' + t.status + ')');
          if (t.notes)    parts.push('— ' + t.notes);
          return parts.join('  ');
        });
      navigator.clipboard.writeText(lines.join('\n')).catch(function () {
        alert('Copy failed — clipboard not available in this context.');
      });
    });
  });

  exportSelBtn.addEventListener('click', function () {
    DB.getAllTodos().then(function (all) {
      var data = all.filter(function (t) { return selectedIds.has(t.id); });
      downloadJson(data, 'focusapp-selected.json');
    });
  });

  carrySelBtn.addEventListener('click', function () {
    var tgt = todayKey();
    DB.getAllTodos().then(function (all) {
      var todaySet = new Set(
        all.filter(function (t) { return t.listDate === tgt; })
           .map(function (t) { return t.panel + '|' + t.text.trim().toLowerCase(); })
      );
      var ops = [];
      var carried = 0;
      all.filter(function (t) { return selectedIds.has(t.id); }).forEach(function (t) {
        var key = t.panel + '|' + t.text.trim().toLowerCase();
        if (todaySet.has(key)) {
          ops.push(DB.deleteTodo(t.id));
          return;
        }
        var now = Date.now();
        var copy = Object.assign({}, t, {
          id:        makeId(),
          listDate:  tgt,
          completed: false,
          createdAt: now,
          updatedAt: now,
          sortOrder: now + carried,
        });
        ops.push(DB.putTodo(copy));
        ops.push(DB.deleteTodo(t.id));
        carried++;
      });
      if (!ops.length) return;
      return Promise.all(ops).then(function () {
        setSelectMode(false);
        currentDate = tgt;
        updateDateUI();
        render();
      });
    });
  });

  deleteSelBtn.addEventListener('click', function () {
    DB.getAllTodos().then(function (all) {
      return snapshotForUndo().then(function () {
        var ops = [];
        selectedIds.forEach(function (id) {
          var todo = all.find(function (t) { return t.id === id; });
          if (todo) ops.push(DB.addToTrash(todo));
          ops.push(DB.deleteTodo(id));
        });
        return Promise.all(ops);
      });
    }).then(function () {
      selectedIds.clear();
      updateSelectToolbar();
      render();
    });
  });

  // ── Export / Import ────────────────────────────────────────────────────────

  function downloadJson(data, filename) {
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    var url  = URL.createObjectURL(blob);
    var a    = document.createElement('a');
    a.href     = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  exportAllBtn.addEventListener('click', function () {
    DB.getAllTodos().then(function (all) {
      downloadJson(all, 'focusapp-export-' + todayKey() + '.json');
    });
  });

  importBtn.addEventListener('click', function () { importFile.click(); });

  importFile.addEventListener('change', function () {
    var file = importFile.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function (e) {
      try {
        var items = JSON.parse(e.target.result);
        if (!Array.isArray(items)) throw new Error('Expected JSON array');
        var ops = items
          .filter(function (item) { return item.id && item.text; })
          .map(function (item)   { return DB.putTodo(item); });
        Promise.all(ops).then(function () {
          importFile.value = '';
          closeSettingsFn();
          render();
        });
      } catch (err) {
        alert('Import failed: ' + err.message);
      }
    };
    reader.readAsText(file);
  });

  // ── Trash drawer ───────────────────────────────────────────────────────────

  function openTrashDrawer() {
    renderTrash();
    show(trashOvl);
    show(trashDrw);
  }

  function closeTrashDrawer() {
    hide(trashOvl);
    hide(trashDrw);
  }

  trashBtn.addEventListener('click', openTrashDrawer);
  closeTrash.addEventListener('click', closeTrashDrawer);
  trashOvl.addEventListener('click', closeTrashDrawer);

  function renderTrash() {
    DB.getAllTrash().then(function (items) {
      trashList.innerHTML = '';
      if (!items.length) {
        trashList.innerHTML = '<li class="trash-empty">Trash is empty.</li>';
        return;
      }
      items.sort(function (a, b) { return (b.deletedAt || 0) - (a.deletedAt || 0); });
      items.forEach(function (item) {
        var li = document.createElement('li');
        li.className = 'trash-item';

        var info = document.createElement('div');
        info.className = 'trash-info';

        var nameEl = document.createElement('span');
        nameEl.className   = 'trash-text';
        nameEl.textContent = item.text;

        var metaEl = document.createElement('span');
        metaEl.className   = 'trash-meta';
        var panelName = item.panel === 'left'
          ? (settings.nameLeft  || 'Panel 1')
          : (settings.nameRight || 'Panel 2');
        var delDate = item.deletedAt ? new Date(item.deletedAt).toLocaleString() : '';
        metaEl.textContent = item.listDate + ' · ' + panelName + ' · archived ' + delDate;

        info.appendChild(nameEl);
        info.appendChild(metaEl);

        var acts = document.createElement('div');
        acts.className = 'trash-actions';

        var restoreBtn = document.createElement('button');
        restoreBtn.className   = 'setting-btn';
        restoreBtn.textContent = 'Restore';
        restoreBtn.addEventListener('click', function () {
          var restored = Object.assign({}, item);
          delete restored.deletedAt;
          DB.putTodo(restored).then(function () {
            return DB.deleteFromTrash(item.id);
          }).then(function () {
            renderTrash();
            render();
          });
        });

        var permBtn = document.createElement('button');
        permBtn.className   = 'setting-btn danger-btn';
        permBtn.textContent = 'Delete forever';
        permBtn.addEventListener('click', function () {
          DB.deleteFromTrash(item.id).then(renderTrash);
        });

        acts.appendChild(restoreBtn);
        acts.appendChild(permBtn);
        li.appendChild(info);
        li.appendChild(acts);
        trashList.appendChild(li);
      });
    });
  }

  emptyTrash.addEventListener('click', function () {
    DB.getAllTrash().then(function (items) {
      if (!items.length) return;
      DB.clearTrash().then(renderTrash);
    });
  });

  // ── Completed section toggles ──────────────────────────────────────────────

  ['left', 'right'].forEach(function (side) {
    var det = el('done-' + side);
    det.addEventListener('toggle', function () {
      doneOpen[side] = det.open;
      var key = side === 'left' ? 'doneOpenLeft' : 'doneOpenRight';
      DB.setSetting(key, det.open);
    });
  });

  // ── Pending carry banner ───────────────────────────────────────────────────

  function checkPendingCarry() {
    // Only show when viewing today
    if (currentDate !== todayKey()) {
      hide(carryBanner);
      return;
    }
    DB.getAllTodos().then(function (all) {
      var today = todayKey();
      var todaySet = new Set(
        all.filter(function (t) { return t.listDate === today; })
           .map(function (t) { return t.panel + '|' + t.text.trim().toLowerCase(); })
      );
      // Past incomplete items not already on today
      var pending = all.filter(function (t) {
        return !t.completed &&
               t.listDate !== today &&
               keyToDate(t.listDate) < keyToDate(today) &&
               !todaySet.has(t.panel + '|' + t.text.trim().toLowerCase());
      });
      if (!pending.length) {
        hide(carryBanner);
        return;
      }
      // Group by date to build a readable summary
      var dates = {};
      pending.forEach(function (t) {
        dates[t.listDate] = (dates[t.listDate] || 0) + 1;
      });
      var parts = Object.keys(dates).sort().map(function (d) {
        return dates[d] + ' from ' + d;
      });
      carryBannerMsg.textContent =
        pending.length + ' incomplete item' + (pending.length !== 1 ? 's' : '') +
        ' from past dates (' + parts.join(', ') + ')';
      show(carryBanner);
    });
  }

  carryBannerBtn.addEventListener('click', function () {
    var tgt = todayKey();
    DB.getAllTodos().then(function (all) {
      var todaySet = new Set(
        all.filter(function (t) { return t.listDate === tgt; })
           .map(function (t) { return t.panel + '|' + t.text.trim().toLowerCase(); })
      );
      var ops = [];
      var carried = 0;
      all.filter(function (t) {
        return !t.completed &&
               t.listDate !== tgt &&
               keyToDate(t.listDate) < keyToDate(tgt);
      }).forEach(function (t) {
        var key = t.panel + '|' + t.text.trim().toLowerCase();
        if (todaySet.has(key)) {
          ops.push(DB.deleteTodo(t.id));
          return;
        }
        var now = Date.now();
        var copy = Object.assign({}, t, {
          id:        makeId(),
          listDate:  tgt,
          completed: false,
          createdAt: now,
          updatedAt: now,
          sortOrder: now + carried,
        });
        ops.push(DB.putTodo(copy));
        ops.push(DB.deleteTodo(t.id));
        carried++;
      });
      return Promise.all(ops);
    }).then(function () {
      hide(carryBanner);
      render();
    });
  });

  carryBannerDismiss.addEventListener('click', function () {
    hide(carryBanner);
  });

  // ── Init ───────────────────────────────────────────────────────────────────

  DB.open().then(function () {
    return DB.getAllSettings();
  }).then(function (s) {
    settings = s;

    // Restore completed-section open state
    doneOpen.left  = settings.doneOpenLeft  !== false;
    doneOpen.right = settings.doneOpenRight !== false;

    applySettings();
    updateDateUI();
    return render();
  }).then(function () {
    refreshUndoButtons();
  }).catch(function (err) {
    console.error('FocusApp init error:', err);
    alert('Failed to open database: ' + err.message + '\n\nTry opening the app over a local server instead of a file:// URL, or check browser permissions.');
  });

}());
