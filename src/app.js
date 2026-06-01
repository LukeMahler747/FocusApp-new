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

  var currentDate       = todayKey();
  var settings          = {};
  var selectedIds       = new Set();
  var editingId         = null;
  var dragSrcId         = null;
  var undoStack         = [];
  var redoStack         = [];
  var selectMode        = false;
  var doneOpen          = { left: true, right: true };
  var morningExpanded   = false;
  var syncDirHandle     = null;   // FileSystemDirectoryHandle for folder sync
  var syncDirty         = false;  // true when data changed since last folder write
  var lastSyncedJson    = null;   // last JSON written, to detect changes

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

  var morningBanner     = el('morning-banner');
  var morningBar        = el('morning-bar');
  var morningBarLabel   = el('morning-bar-label');
  var morningBarProgress = el('morning-bar-progress');
  var morningBarToggle  = el('morning-bar-toggle');
  var morningBody       = el('morning-body');
  var morningList       = el('morning-list');

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

  window.addEventListener('online', function () {
    updateOnline();
    // Push any changes that accumulated while offline
    gistPush();
  });
  window.addEventListener('offline', updateOnline);
  syncBtn.addEventListener('click', function () {
    updateOnline();
    gistPush();
    folderSync();
  });
  updateOnline();

  // ── Date navigation ────────────────────────────────────────────────────────

  function updateDateUI() {
    dateKeyEl.textContent   = currentDate;
    dateLabelEl.textContent = formatDateLabel(currentDate);
    var today  = todayKey();
    var isPast = keyToDate(currentDate) < keyToDate(today);
    todayBtnEl.style.fontWeight = (currentDate === today) ? '800' : '600';
    if (!isPast || currentDate === today) {
      hide(carryBtn);
    } else {
      DB.getTodosByDate(currentDate).then(function (todos) {
        var hasIncomplete = todos.some(function (t) { return !t.completed; });
        carryBtn.classList.toggle('hidden', !hasIncomplete);
      });
    }
  }

  prevBtn.addEventListener('click', function () {
    currentDate = shiftKey(currentDate, -1);
    updateDateUI();
    render();
    renderMorning();
    renderAllClBanners();
  });

  nextBtn.addEventListener('click', function () {
    currentDate = shiftKey(currentDate, 1);
    updateDateUI();
    render();
    renderMorning();
    renderAllClBanners();
  });

  todayBtnEl.addEventListener('click', function () {
    currentDate = todayKey();
    updateDateUI();
    render();
    renderMorning();
    renderAllClBanners();
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

  function renderMorningTemplate() {
    var list = el('mp-template-list');
    list.innerHTML = '';
    getMorningTemplate().forEach(function (text) {
      var li   = document.createElement('li');
      li.className = 'mp-template-item';

      var span = document.createElement('span');
      span.className   = 'mp-template-item-text';
      span.textContent = text;

      var del = document.createElement('button');
      del.className   = 'mp-template-remove';
      del.type        = 'button';
      del.title       = 'Remove';
      del.textContent = '✕';
      del.addEventListener('click', function () {
        var items = getMorningTemplate().filter(function (t) { return t !== text; });
        settings.morningTemplate = items.join('\n');
        DB.setSetting('morningTemplate', settings.morningTemplate);
        renderMorningTemplate();
        renderMorning();
      });

      li.appendChild(span);
      li.appendChild(del);
      list.appendChild(li);
    });
  }

  el('mp-template-add-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var input = el('mp-template-new');
    var text  = input.value.trim();
    if (!text) return;
    var items = getMorningTemplate();
    if (items.indexOf(text) === -1) {
      items.push(text);
      settings.morningTemplate = items.join('\n');
      DB.setSetting('morningTemplate', settings.morningTemplate);
      renderMorningTemplate();
      renderMorning();
    }
    input.value = '';
    input.focus();
  });

  function openSettings() {
    el('set-name-left').value  = settings.nameLeft  || '';
    el('set-name-right').value = settings.nameRight || '';
    el('set-split-time').value = settings.splitTime || '12:00';
    el('set-theme').value      = settings.theme     || 'system';
    el('set-gist-token').value = settings.gistToken || '';
    el('set-gist-id').value    = settings.gistId    || '';
    renderClList();
    updateSyncUI();
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

  function saveSetting(key, value) {
    settings[key] = value;
    DB.setSetting(key, value);
  }

  el('set-name-left').addEventListener('change', function () {
    saveSetting('nameLeft', this.value.trim() || 'Panel 1');
    applySettings();
  });
  el('set-name-right').addEventListener('change', function () {
    saveSetting('nameRight', this.value.trim() || 'Panel 2');
    applySettings();
  });
  el('set-split-time').addEventListener('input', function () {
    updateSplitPreview();
    saveSetting('splitTime', this.value || '12:00');
    applySettings();
  });
  el('set-theme').addEventListener('change', function () {
    saveSetting('theme', this.value);
    applySettings();
  });
  el('set-gist-token').addEventListener('change', function () {
    saveSetting('gistToken', this.value.trim());
  });
  el('set-gist-id').addEventListener('change', function () {
    saveSetting('gistId', this.value.trim());
  });

  settingsBtn.addEventListener('click', openSettings);
  closeSettings.addEventListener('click', closeSettingsFn);
  settingsOvl.addEventListener('click', closeSettingsFn);

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
      updatePanelTimestamps(todos);
      checkPendingCarry();
      updateDateUI();
      autoSync();
      gistPush();
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

    // Inline text edit on single click
    textEl.addEventListener('click', function (e) {
      if (selectMode) return;
      e.stopPropagation();
      var input = document.createElement('input');
      input.type      = 'text';
      input.value     = todo.text;
      input.className = 'inline-edit-input';
      textEl.replaceWith(input);
      input.focus();
      input.select();

      function commit() {
        var raw = input.value;
        var val = raw.trim() || raw;
        if (val && val !== todo.text) {
          snapshotForUndo().then(function () {
            todo.text      = val;
            todo.updatedAt = Date.now();
            return DB.putTodo(todo);
          }).then(render);
        } else {
          input.replaceWith(textEl);
        }
      }
      input.addEventListener('blur', commit);
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
        if (e.key === 'Escape') { input.removeEventListener('blur', commit); input.replaceWith(textEl); }
      });
    });

    // Edit modal on edit button only
    editBtn.addEventListener('click', function () { openModal(todo); });

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
    var raw  = e.target.text.value;
    var text = raw.trim() || raw;
    if (!text) return;
    e.target.reset();
    addItem('left', text);
  });

  el('form-right').addEventListener('submit', function (e) {
    e.preventDefault();
    var raw  = e.target.text.value;
    var text = raw.trim() || raw;
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
      DB.getAllSettings().then(function (s) {
        downloadJson({ todos: all, settings: s }, 'focusapp-export-' + todayKey() + '.json');
      });
    });
  });

  importBtn.addEventListener('click', function () { importFile.click(); });

  importFile.addEventListener('change', function () {
    var file = importFile.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function (e) {
      try {
        var payload = JSON.parse(e.target.result);
        var todos        = Array.isArray(payload) ? payload : (payload.todos || []);
        var savedSettings = Array.isArray(payload) ? {} : (payload.settings || {});

        var ops = todos
          .filter(function (item) { return item.id && item.text; })
          .map(function (item)   { return DB.putTodo(item); });

        Object.keys(savedSettings).forEach(function (key) {
          if (key === 'gistToken' || key === 'gistId') return;
          settings[key] = savedSettings[key];
          ops.push(DB.setSetting(key, savedSettings[key]));
        });

        Promise.all(ops).then(function () {
          importFile.value = '';
          applySettings();
          renderClList();
          closeSettingsFn();
          render();
          renderMorning();
          renderAllClBanners();
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

  // ── Toast ──────────────────────────────────────────────────────────────────

  var toastTimer = null;
  function showToast(msg, duration) {
    var t = el('toast');
    t.textContent = msg;
    t.classList.remove('hidden');
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      t.classList.remove('show');
      setTimeout(function () { t.classList.add('hidden'); }, 220);
    }, duration || 3000);
  }

  // ── Midnight auto-switch ───────────────────────────────────────────────────

  function scheduleMidnight() {
    var now  = new Date();
    var next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 5);
    var ms   = next - now;
    setTimeout(function () {
      currentDate = todayKey();
      updateDateUI();
      render();
      showToast('New day — switched to Today');
      scheduleMidnight();
    }, ms);
  }

  // ── Panel last-edited timestamps ───────────────────────────────────────────

  function updatePanelTimestamps(todos) {
    ['left', 'right'].forEach(function (side) {
      var el2   = el('edited-' + side);
      var items = todos.filter(function (t) { return t.panel === side; });
      if (!items.length) { el2.textContent = ''; return; }
      var latest = items.reduce(function (max, t) {
        return (t.updatedAt || 0) > (max.updatedAt || 0) ? t : max;
      }, items[0]);
      if (!latest.updatedAt) { el2.textContent = ''; return; }
      var d   = new Date(latest.updatedAt);
      var now = new Date();
      var sameDay = d.toDateString() === now.toDateString();
      var time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
      el2.textContent = sameDay
        ? 'edited ' + time
        : 'edited ' + d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' + time;
    });
  }

  // ── Local folder sync (every 5 min if dirty) ──────────────────────────────

  function updateSyncUI() {
    var hint      = el('sync-folder-hint');
    var linkBtn   = el('sync-folder-btn');
    var unlinkBtn = el('sync-folder-unlink');
    if (syncDirHandle) {
      hint.textContent    = 'Linked: ' + syncDirHandle.name + ' — writes focusapp-data.json every 5 min when changed.';
      linkBtn.textContent = 'Re-link folder…';
      show(unlinkBtn);
    } else {
      hint.textContent    = 'Not linked. Writes focusapp-data.json every 5 min when data changes.';
      linkBtn.textContent = 'Link folder…';
      hide(unlinkBtn);
    }
  }

  function autoSync() {
    syncDirty = true; // folder sync picks this up on next 5-min tick
  }

  function folderSync() {
    if (!syncDirHandle || !syncDirty) return;
    DB.getAllTodos().then(function (all) {
      var json = JSON.stringify(all, null, 2);
      if (json === lastSyncedJson) { syncDirty = false; return; }
      syncDirHandle.getFileHandle('focusapp-data.json', { create: true })
        .then(function (fh) { return fh.createWritable(); })
        .then(function (writable) {
          return writable.write(json).then(function () { return writable.close(); });
        })
        .then(function () {
          lastSyncedJson = json;
          syncDirty = false;
        })
        .catch(function (err) { console.warn('Folder sync failed:', err); });
    });
  }

  // Run folder sync every 5 minutes
  setInterval(folderSync, 5 * 60 * 1000);

  el('sync-folder-btn').addEventListener('click', function () {
    if (!window.showDirectoryPicker) {
      showToast('Directory picker not supported in this browser');
      return;
    }
    window.showDirectoryPicker({ mode: 'readwrite' })
      .then(function (handle) {
        syncDirHandle = handle;
        syncDirty = true;
        updateSyncUI();
        folderSync();
      })
      .catch(function () { /* user cancelled */ });
  });

  el('sync-folder-unlink').addEventListener('click', function () {
    syncDirHandle = null;
    syncDirty     = false;
    updateSyncUI();
  });

  // ── GitHub Gist sync ───────────────────────────────────────────────────────

  function gistPush() {
    var token = settings.gistToken;
    var gistId = settings.gistId;
    if (!token || !gistId) return;
    DB.getAllTodos().then(function (all) {
      return DB.getAllSettings().then(function (s) {
        // Strip credentials from the saved settings copy
        var savedSettings = Object.assign({}, s);
        delete savedSettings.gistToken;
        return { todos: all, settings: savedSettings };
      });
    }).then(function (payload) {
      var body = JSON.stringify({
        files: { 'focusapp-data.json': { content: JSON.stringify(payload, null, 2) } }
      });
      fetch('https://api.github.com/gists/' + gistId, {
        method: 'PATCH',
        headers: {
          'Authorization': 'token ' + token,
          'Content-Type': 'application/json'
        },
        body: body
      }).then(function (r) {
        var statusEl = el('gist-status');
        if (!statusEl) return;
        if (r.ok) {
          statusEl.textContent = 'Saved ✓';
          statusEl.className = 'gist-status ok';
          clearTimeout(statusEl._t);
          statusEl._t = setTimeout(function () { statusEl.textContent = ''; statusEl.className = 'gist-status'; }, 3000);
        } else {
          statusEl.textContent = 'Sync error ' + r.status;
          statusEl.className = 'gist-status err';
        }
      }).catch(function () {
        var statusEl = el('gist-status');
        if (statusEl) { statusEl.textContent = 'Offline'; statusEl.className = 'gist-status err'; }
      });
    });
  }

  function gistRestore() {
    var token = settings.gistToken;
    var gistId = settings.gistId;
    if (!token || !gistId) { showToast('Enter a token and Gist ID first'); return; }
    fetch('https://api.github.com/gists/' + gistId, {
      headers: { 'Authorization': 'token ' + token }
    }).then(function (r) {
      if (!r.ok) throw new Error('Status ' + r.status);
      return r.json();
    }).then(function (data) {
      var file = data.files && data.files['focusapp-data.json'];
      if (!file) throw new Error('focusapp-data.json not found in Gist');
      var payload = JSON.parse(file.content);

      // Support both old format (plain array) and new format ({ todos, settings })
      var todos    = Array.isArray(payload) ? payload : (payload.todos || []);
      var savedSettings = Array.isArray(payload) ? {} : (payload.settings || {});

      var ops = todos
        .filter(function (item) { return item.id && item.text; })
        .map(function (item) { return DB.putTodo(item); });

      // Restore settings (skip credentials — keep current token/gistId)
      Object.keys(savedSettings).forEach(function (key) {
        if (key === 'gistToken' || key === 'gistId') return;
        settings[key] = savedSettings[key];
        ops.push(DB.setSetting(key, savedSettings[key]));
      });

      return Promise.all(ops);
    }).then(function () {
      applySettings();
      renderClList();
      render();
      renderMorning();
      renderAllClBanners();
      showToast('Restored from Gist');
    }).catch(function (err) {
      showToast('Restore failed: ' + err.message, 5000);
    });
  }

  el('gist-restore-btn').addEventListener('click', gistRestore);

  // ── Morning Process ────────────────────────────────────────────────────────

  function getMorningTemplate() {
    var raw = (settings.morningTemplate || '').trim();
    if (!raw) return [];
    return raw.split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
  }

  function setMorningExpanded(expanded) {
    morningExpanded = expanded;
    morningBanner.classList.toggle('expanded', expanded);
    morningBody.classList.toggle('hidden', !expanded);
  }

  morningBar.addEventListener('click', function () {
    setMorningExpanded(!morningExpanded);
  });

  function renderMorning() {
    var today = todayKey();
    var template = getMorningTemplate();

    if (!template.length) {
      morningBanner.classList.add('hidden');
      return;
    }
    morningBanner.classList.remove('hidden');

    DB.getMorningDay(today).then(function (record) {
      if (!record) {
        record = {
          dateKey: today,
          items: template.map(function (text) { return { text: text, done: false }; }),
        };
        DB.putMorningDay(record);
      } else {
        // Sync template additions/removals into today's record
        var existingTexts = record.items.map(function (i) { return i.text; });
        template.forEach(function (text) {
          if (existingTexts.indexOf(text) === -1) {
            record.items.push({ text: text, done: false });
          }
        });
        record.items = record.items.filter(function (i) {
          return template.indexOf(i.text) !== -1;
        });
        // Re-order to match template order
        record.items.sort(function (a, b) {
          return template.indexOf(a.text) - template.indexOf(b.text);
        });
      }

      var total = record.items.length;
      var done  = record.items.filter(function (i) { return i.done; }).length;
      var complete = done === total && total > 0;

      morningBanner.classList.toggle('complete', complete);
      morningBarProgress.textContent = complete ? '✓ DONE' : done + ' / ' + total;

      morningList.innerHTML = '';
      record.items.forEach(function (item, idx) {
        var li  = document.createElement('li');
        li.className = 'morning-item' + (item.done ? ' done' : '');

        var chk = document.createElement('input');
        chk.type    = 'checkbox';
        chk.checked = item.done;
        chk.addEventListener('change', function () {
          record.items[idx].done = chk.checked;
          DB.putMorningDay(record).then(function () {
            var allDone = record.items.every(function (i) { return i.done; });
            if (allDone) setMorningExpanded(false);
            renderMorning();
          });
        });

        var span = document.createElement('span');
        span.className   = 'morning-item-text';
        span.textContent = item.text;
        span.addEventListener('click', function () { chk.click(); });

        li.appendChild(chk);
        li.appendChild(span);
        morningList.appendChild(li);
      });
    });
  }

  // ── Scheduled Checklists ──────────────────────────────────────────────────

  // Checklists are stored as a JSON array in settings key 'checklists'.
  // Each entry: { id, name, color, persist, schedule, startDate, items[] }
  // Per-day state in DB.checklistDays, keyed by listId + '_' + dateKey:
  //   { stateKey, listId, dateKey, items[{text,done}], carriedFrom }

  var clEditingId = null;   // id of checklist being edited (null = new)
  var clModalItems = [];    // working copy of items in the editor

  function getChecklists() {
    return settings.checklists || [];
  }

  function saveChecklists(arr) {
    settings.checklists = arr;
    DB.setSetting('checklists', arr);
  }

  // ── Schedule matching ──────────────────────────────────────────────────────

  function checklistAppliesToDate(cl, dateKey) {
    var d = keyToDate(dateKey);
    var today = keyToDate(todayKey());

    // Respect start date
    if (cl.startDate) {
      var start = new Date(cl.startDate + 'T00:00:00');
      if (d < start) return false;
    }

    var sched = cl.schedule || {};
    var type  = sched.type || 'daily';
    var dow   = d.getDay();        // 0=Sun … 6=Sat
    var date  = d.getDate();
    var month = d.getMonth();

    switch (type) {
      case 'daily':
        return true;

      case 'weekdays':
        return dow >= 1 && dow <= 5;

      case 'weekends':
        return dow === 0 || dow === 6;

      case 'dow': {
        var days = sched.days || [];
        return days.indexOf(dow) !== -1;
      }

      case 'every-n-days': {
        var n = sched.n || 7;
        var start2 = cl.startDate ? new Date(cl.startDate + 'T00:00:00') : today;
        start2.setHours(0, 0, 0, 0);
        var diff = Math.round((d - start2) / 86400000);
        return diff >= 0 && diff % n === 0;
      }

      case 'biweekly':
        sched = Object.assign({}, sched, { type: 'weekly', n: 2 });
        // fall through
      case 'weekly': {
        var targetDow = sched.day !== undefined ? +sched.day : 1;
        if (dow !== targetDow) return false;
        var wn = sched.n || 1;
        if (wn <= 1) return true;
        var start3 = cl.startDate ? new Date(cl.startDate + 'T00:00:00') : today;
        start3.setHours(0, 0, 0, 0);
        var weekDiff = Math.round((d - start3) / 604800000);
        return weekDiff >= 0 && weekDiff % wn === 0;
      }

      case 'monthly-date': {
        var md = sched.date;
        if (md === 'last') {
          var last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
          return date === last;
        }
        return date === +md;
      }

      case 'monthly-weekday': {
        var pos = +sched.pos;   // 1..4 or -1 (last)
        var wd  = +sched.day;
        if (dow !== wd) return false;
        if (pos === -1) {
          var nextMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0);
          var lastMatch = nextMonth.getDate() - ((nextMonth.getDay() - wd + 7) % 7);
          return date === lastMatch;
        }
        return Math.ceil(date / 7) === pos;
      }

      case 'monthly-first-weekday': {
        var first = new Date(d.getFullYear(), d.getMonth(), 1);
        var fd = first.getDay();
        var offset = (fd === 0 || fd === 6)
          ? (8 - fd) % 7 || 1
          : 0;
        return date === 1 + offset;
      }

      case 'monthly-last-weekday': {
        var lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0);
        var ld = lastDay.getDay();
        var sub = (ld === 0) ? 2 : (ld === 6) ? 1 : 0;
        return date === lastDay.getDate() - sub;
      }

      case 'quarterly': {
        var qm = +sched.month || 0;
        var qd = +sched.day   || 1;
        var monthOffset = (month - qm + 12) % 12;
        return monthOffset % 3 === 0 && date === qd;
      }

      case 'yearly': {
        return month === +sched.month && date === +sched.day;
      }

      case 'once': {
        if (!sched.date) return false;
        var od = new Date(sched.date + 'T00:00:00');
        return d.getFullYear() === od.getFullYear() &&
               d.getMonth()    === od.getMonth()    &&
               d.getDate()     === od.getDate();
      }

      default:
        return false;
    }
  }

  function scheduleLabel(cl) {
    var sched = cl.schedule || {};
    var DAYS  = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    var MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    switch (sched.type) {
      case 'daily':                    return 'Daily';
      case 'weekdays':                 return 'Weekdays';
      case 'weekends':                 return 'Weekends';
      case 'dow':                      return (sched.days||[]).map(function(d){return DAYS[d];}).join(', ');
      case 'every-n-days':             return 'Every ' + (sched.n||7) + ' days';
      case 'weekly':                   return 'Every ' + (sched.n||1) + 'w on ' + DAYS[sched.day||1];
      case 'biweekly':                 return 'Bi-weekly on ' + DAYS[sched.day||1];
      case 'monthly-date':             return 'Monthly on ' + (sched.date==='last'?'last day':sched.date+'th');
      case 'monthly-weekday': {
        var pos = +sched.pos;
        var posLabel = pos === -1 ? 'Last' : ['','1st','2nd','3rd','4th'][pos] || pos+'th';
        return 'Monthly — ' + posLabel + ' ' + DAYS[sched.day||1];
      }
      case 'monthly-first-weekday':    return 'First weekday/month';
      case 'monthly-last-weekday':     return 'Last weekday/month';
      case 'quarterly':                return 'Quarterly';
      case 'yearly':                   return 'Yearly ' + MONTHS[sched.month||0] + ' ' + (sched.day||1);
      case 'once':                     return 'Once: ' + (sched.date||'');
      default:                         return '';
    }
  }

  // ── Settings UI — checklist list ──────────────────────────────────────────

  function renderClList() {
    var ul = el('cl-list');
    ul.innerHTML = '';
    getChecklists().forEach(function (cl) {
      var li = document.createElement('li');
      li.className = 'cl-list-item';

      var swatch = document.createElement('span');
      swatch.className = 'cl-list-swatch';
      swatch.style.background = cl.color || '#2980b9';

      var name = document.createElement('span');
      name.className   = 'cl-list-name';
      name.textContent = cl.name || '(unnamed)';

      var schedEl = document.createElement('span');
      schedEl.className   = 'cl-list-sched';
      schedEl.textContent = scheduleLabel(cl);

      var editBtn = document.createElement('button');
      editBtn.className   = 'cl-list-edit';
      editBtn.title       = 'Edit';
      editBtn.textContent = '✎';
      editBtn.addEventListener('click', function () { openClModal(cl.id); });

      var delBtn = document.createElement('button');
      delBtn.className   = 'cl-list-del';
      delBtn.title       = 'Delete';
      delBtn.textContent = '✕';
      delBtn.addEventListener('click', function () { deleteChecklist(cl.id); });

      li.appendChild(swatch);
      li.appendChild(name);
      li.appendChild(schedEl);
      li.appendChild(editBtn);
      li.appendChild(delBtn);
      ul.appendChild(li);
    });
  }

  function deleteChecklist(id) {
    var lists = getChecklists().filter(function (c) { return c.id !== id; });
    saveChecklists(lists);
    renderClList();
    renderAllClBanners();
  }

  // ── Checklist editor modal ────────────────────────────────────────────────

  var clSchedSubIds = [
    'cl-sub-dow', 'cl-sub-every-n', 'cl-sub-weekly', 'cl-sub-biweekly',
    'cl-sub-monthly-date', 'cl-sub-monthly-weekday', 'cl-sub-quarterly',
    'cl-sub-yearly', 'cl-sub-once'
  ];
  var clSchedTypeMap = {
    'dow': 'cl-sub-dow',
    'every-n-days': 'cl-sub-every-n',
    'weekly': 'cl-sub-weekly',
    'biweekly': 'cl-sub-biweekly',
    'monthly-date': 'cl-sub-monthly-date',
    'monthly-weekday': 'cl-sub-monthly-weekday',
    'quarterly': 'cl-sub-quarterly',
    'yearly': 'cl-sub-yearly',
    'once': 'cl-sub-once',
  };

  function showClSchedSub(type) {
    clSchedSubIds.forEach(function (id) { hide(el(id)); });
    var target = clSchedTypeMap[type];
    if (target) show(el(target));
  }

  el('cl-sched-type').addEventListener('change', function () {
    showClSchedSub(this.value);
  });

  function renderClItemsList() {
    var ul = el('cl-items-list');
    ul.innerHTML = '';
    clModalItems.forEach(function (text, idx) {
      var li = document.createElement('li');
      li.className = 'cl-item-row';

      var span = document.createElement('span');
      span.className   = 'cl-item-text';
      span.textContent = text;

      var del = document.createElement('button');
      del.className   = 'cl-item-del';
      del.type        = 'button';
      del.title       = 'Remove';
      del.textContent = '✕';
      del.addEventListener('click', function () {
        clModalItems.splice(idx, 1);
        renderClItemsList();
      });

      li.appendChild(span);
      li.appendChild(del);
      ul.appendChild(li);
    });
  }

  el('cl-item-add-btn').addEventListener('click', function () {
    var inp = el('cl-item-new');
    var raw = inp.value;
    var val = raw.trim() || raw;
    if (!val) return;
    clModalItems.push(val);
    renderClItemsList();
    inp.value = '';
    inp.focus();
  });

  el('cl-item-new').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); el('cl-item-add-btn').click(); }
  });

  function openClModal(id) {
    var cl = id ? getChecklists().find(function (c) { return c.id === id; }) : null;
    clEditingId  = id || null;
    clModalItems = cl ? cl.items.slice() : [];

    el('cl-modal-title').textContent = cl ? 'Edit Checklist' : 'New Checklist';
    el('cl-name').value        = cl ? cl.name       : '';
    el('cl-color').value       = cl ? (cl.color     || '#2980b9') : '#2980b9';
    el('cl-persist').value     = cl ? (cl.persist   || 'reset')   : 'reset';
    el('cl-start-date').value  = cl ? (cl.startDate || '')        : '';

    var sched = cl ? (cl.schedule || {}) : { type: 'daily' };
    el('cl-sched-type').value = sched.type || 'daily';
    showClSchedSub(sched.type || 'daily');

    // Restore sub-option values
    if (sched.type === 'dow') {
      el('cl-sub-dow').querySelectorAll('input[type=checkbox]').forEach(function (cb) {
        cb.checked = (sched.days || []).indexOf(+cb.value) !== -1;
      });
    }
    if (sched.type === 'every-n-days') el('cl-every-n').value = sched.n || 7;
    if (sched.type === 'weekly') {
      el('cl-weekly-n').value   = sched.n   || 1;
      el('cl-weekly-day').value = sched.day !== undefined ? sched.day : 1;
    }
    if (sched.type === 'biweekly') {
      el('cl-biweekly-day').value = sched.day !== undefined ? sched.day : 1;
    }
    if (sched.type === 'monthly-date')    el('cl-monthly-date').value = sched.date || 1;
    if (sched.type === 'monthly-weekday') {
      el('cl-mwd-pos').value = sched.pos !== undefined ? sched.pos : 1;
      el('cl-mwd-day').value = sched.day !== undefined ? sched.day : 1;
    }
    if (sched.type === 'quarterly') {
      el('cl-quarterly-month').value = sched.month || 0;
      el('cl-quarterly-day').value   = sched.day   || 1;
    }
    if (sched.type === 'yearly') {
      el('cl-yearly-month').value = sched.month || 0;
      el('cl-yearly-day').value   = sched.day   || 1;
    }
    if (sched.type === 'once') el('cl-once-date').value = sched.date || '';

    renderClItemsList();
    show(el('cl-modal-overlay'));
    show(el('cl-modal'));
    el('cl-name').focus();
  }

  function closeClModal() {
    hide(el('cl-modal-overlay'));
    hide(el('cl-modal'));
    clEditingId  = null;
    clModalItems = [];
  }

  function readClSchedule() {
    var type = el('cl-sched-type').value;
    var sched = { type: type };
    switch (type) {
      case 'dow':
        sched.days = [];
        el('cl-sub-dow').querySelectorAll('input[type=checkbox]:checked').forEach(function (cb) {
          sched.days.push(+cb.value);
        });
        break;
      case 'every-n-days':
        sched.n = +el('cl-every-n').value || 7;
        break;
      case 'weekly':
        sched.n   = +el('cl-weekly-n').value   || 1;
        sched.day = +el('cl-weekly-day').value;
        break;
      case 'biweekly':
        sched.day = +el('cl-biweekly-day').value;
        break;
      case 'monthly-date':
        sched.date = el('cl-monthly-date').value;
        break;
      case 'monthly-weekday':
        sched.pos = +el('cl-mwd-pos').value;
        sched.day = +el('cl-mwd-day').value;
        break;
      case 'quarterly':
        sched.month = +el('cl-quarterly-month').value;
        sched.day   = +el('cl-quarterly-day').value || 1;
        break;
      case 'yearly':
        sched.month = +el('cl-yearly-month').value;
        sched.day   = +el('cl-yearly-day').value || 1;
        break;
      case 'once':
        sched.date = el('cl-once-date').value;
        break;
    }
    return sched;
  }

  el('cl-modal-save').addEventListener('click', function () {
    var name = el('cl-name').value.trim();
    if (!name) { el('cl-name').focus(); return; }

    var lists = getChecklists();
    var existing = clEditingId ? lists.find(function (c) { return c.id === clEditingId; }) : null;

    var cl = {
      id:        clEditingId || makeId(),
      name:      name,
      color:     el('cl-color').value,
      persist:   el('cl-persist').value,
      schedule:  readClSchedule(),
      startDate: el('cl-start-date').value,
      items:     clModalItems.slice(),
    };

    if (existing) {
      var idx = lists.indexOf(existing);
      lists[idx] = cl;
    } else {
      lists.push(cl);
    }

    saveChecklists(lists);
    renderClList();
    renderAllClBanners();
    closeClModal();
  });

  el('cl-modal-cancel').addEventListener('click', closeClModal);
  el('cl-modal-close').addEventListener('click',  closeClModal);
  el('cl-modal-overlay').addEventListener('click', closeClModal);
  el('cl-add-btn').addEventListener('click', function () { openClModal(null); });

  // ── Checklist banners ─────────────────────────────────────────────────────

  var clBannerExpanded = {};   // listId → boolean

  function renderAllClBanners() {
    // Remove existing custom banners
    document.querySelectorAll('.cl-banner').forEach(function (b) { b.remove(); });

    var morningEl = el('morning-banner');
    var lists = getChecklists();

    // Determine which lists apply to currentDate
    // Also check for carried state (persist=persist lists that have an active carry)
    var dateKey = currentDate;
    var toShow  = [];

    var promises = lists.map(function (cl) {
      if (!cl.items || !cl.items.length) return Promise.resolve();
      var stateKey = cl.id + '_' + dateKey;
      return DB.getChecklistDay(stateKey).then(function (state) {
        var applies = checklistAppliesToDate(cl, dateKey);

        if (!applies && cl.persist === 'persist') {
          // Check if it was carried from a prior day
          if (state && state.carriedFrom) applies = true;
        }

        if (!applies && !state) return;

        // If it applies and no state yet, create fresh state
        if (!state) {
          state = {
            stateKey:    stateKey,
            listId:      cl.id,
            dateKey:     dateKey,
            items:       cl.items.map(function (t) { return { text: t, done: false }; }),
            carriedFrom: null,
          };
          DB.putChecklistDay(state);
        } else {
          // Sync template changes
          var existing2 = state.items.map(function (i) { return i.text; });
          cl.items.forEach(function (t) {
            if (existing2.indexOf(t) === -1) state.items.push({ text: t, done: false });
          });
          state.items = state.items.filter(function (i) {
            return cl.items.indexOf(i.text) !== -1;
          });
          state.items.sort(function (a, b) {
            return cl.items.indexOf(a.text) - cl.items.indexOf(b.text);
          });
          DB.putChecklistDay(state);
        }

        toShow.push({ cl: cl, state: state, applies: applies });
      });
    });

    Promise.all(promises).then(function () {
      var anchor = morningEl;
      toShow.forEach(function (entry) {
        var banner = buildClBanner(entry.cl, entry.state);
        anchor.insertAdjacentElement('afterend', banner);
        anchor = banner;
      });
    });
  }

  function buildClBanner(cl, state) {
    var banner = document.createElement('div');
    banner.className = 'cl-banner';
    banner.dataset.clId = cl.id;

    var total     = state.items.length;
    var doneCount = state.items.filter(function (i) { return i.done; }).length;
    var complete  = doneCount === total && total > 0;
    if (complete) banner.classList.add('complete');

    var expanded = clBannerExpanded[cl.id] !== undefined
      ? clBannerExpanded[cl.id]
      : false;
    if (expanded) banner.classList.add('expanded');

    // Bar
    var bar = document.createElement('div');
    bar.className = 'cl-bar';
    bar.style.background = cl.color || '#2980b9';

    var labelEl = document.createElement('span');
    labelEl.className   = 'cl-bar-label';
    labelEl.textContent = cl.name;

    var progressEl = document.createElement('span');
    progressEl.className   = 'cl-bar-progress';
    progressEl.textContent = complete ? '✓ DONE' : doneCount + ' / ' + total;

    // Carry button (only on today view, for persist lists not yet complete and not already on today)
    var isToday = currentDate === todayKey();
    if (cl.persist === 'persist' && !complete && !isToday && !state.carriedFrom) {
      // Don't add carry button on past days; it shows "pull to today"
    }
    if (cl.persist === 'persist' && !complete && !isToday) {
      var carryBtn2 = document.createElement('button');
      carryBtn2.className   = 'cl-bar-carry';
      carryBtn2.textContent = '⤴ Pull to today';
      carryBtn2.addEventListener('click', function (e) {
        e.stopPropagation();
        pullClToToday(cl, state);
      });
      bar.appendChild(labelEl);
      bar.appendChild(progressEl);
      bar.appendChild(carryBtn2);
    } else {
      bar.appendChild(labelEl);
      bar.appendChild(progressEl);
    }

    var toggleBtn = document.createElement('button');
    toggleBtn.className   = 'cl-bar-toggle icon-btn';
    toggleBtn.title       = 'Expand / collapse';
    toggleBtn.textContent = '▾';
    bar.appendChild(toggleBtn);

    // Body
    var body = document.createElement('div');
    body.className = 'cl-body' + (expanded ? '' : ' hidden');

    var ul = document.createElement('ul');
    ul.className = 'cl-item-list';

    state.items.forEach(function (item, idx) {
      var li = document.createElement('li');
      li.className = 'cl-check-item' + (item.done ? ' done' : '');

      var chk = document.createElement('input');
      chk.type    = 'checkbox';
      chk.checked = item.done;
      chk.addEventListener('change', function () {
        state.items[idx].done = chk.checked;
        DB.putChecklistDay(state).then(function () {
          var allDone = state.items.every(function (i) { return i.done; });
          if (allDone) clBannerExpanded[cl.id] = false;
          renderAllClBanners();
        });
      });

      var span = document.createElement('span');
      span.className   = 'cl-check-item-text';
      span.textContent = item.text;
      span.addEventListener('click', function () { chk.click(); });

      li.appendChild(chk);
      li.appendChild(span);
      ul.appendChild(li);
    });

    body.appendChild(ul);

    bar.addEventListener('click', function () {
      clBannerExpanded[cl.id] = !clBannerExpanded[cl.id];
      banner.classList.toggle('expanded', clBannerExpanded[cl.id]);
      body.classList.toggle('hidden',    !clBannerExpanded[cl.id]);
    });

    banner.appendChild(bar);
    banner.appendChild(body);
    return banner;
  }

  function pullClToToday(cl, sourceState) {
    var today    = todayKey();
    var stateKey = cl.id + '_' + today;
    DB.getChecklistDay(stateKey).then(function (existing) {
      if (existing && !existing.items.every(function (i) { return i.done; })) {
        // Already on today and incomplete — just navigate
        currentDate = today;
        updateDateUI();
        render();
        renderAllClBanners();
        return;
      }
      var newState = {
        stateKey:    stateKey,
        listId:      cl.id,
        dateKey:     today,
        items:       cl.items.map(function (t) { return { text: t, done: false }; }),
        carriedFrom: sourceState.dateKey,
      };
      DB.putChecklistDay(newState).then(function () {
        currentDate = today;
        updateDateUI();
        render();
        renderAllClBanners();
        showToast(cl.name + ' pulled to today');
      });
    });
  }

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
    renderMorning();
    renderAllClBanners();
    scheduleMidnight();
    return render();
  }).then(function () {
    refreshUndoButtons();
  }).catch(function (err) {
    console.error('FocusApp init error:', err);
    alert('Failed to open database: ' + err.message + '\n\nTry opening the app over a local server instead of a file:// URL, or check browser permissions.');
  });

}());
