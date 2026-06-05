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
    return mm + '/' + dd + '/' + d.getFullYear();
  }

  function keyToDate(key) {
    var sep   = key.indexOf('/') !== -1 ? '/' : '.';
    var parts = key.split(sep);
    return new Date(+parts[2], +parts[0] - 1, +parts[1]);
  }

  function shiftKey(key, delta) {
    var d = keyToDate(key);
    d.setDate(d.getDate() + delta);
    var mm = String(d.getMonth() + 1).padStart(2, '0');
    var dd = String(d.getDate()).padStart(2, '0');
    return mm + '/' + dd + '/' + d.getFullYear();
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

  function normalizeTodo(item) {
    if (item.listDate && item.listDate.indexOf('.') !== -1) {
      item.listDate = item.listDate.replace(/\./g, '/');
    }
    return item;
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
  var syncDirHandle     = null;   // FileSystemDirectoryHandle for folder sync
  var syncDirty         = false;  // true when data changed since last folder write
  var lastSyncedJson    = null;   // last JSON written, to detect changes

  // ── DOM refs (all assigned after DOM is ready) ─────────────────────────────

  var undoBtn       = el('undo-btn');
  var redoBtn       = el('redo-btn');
  var trashBtn      = el('trash-btn');
  var syncPushBtn   = el('sync-push-btn');
  var syncPullBtn   = el('sync-pull-btn');
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
    // Pull remote first, then push merged result up
    gistPull(true).then(function () { gistPush(); });
  });
  window.addEventListener('offline', updateOnline);

  // Auto-pull from Gist every 60 seconds when online
  setInterval(function () {
    if (navigator.onLine && settings.gistToken && settings.gistId) {
      gistPull(true);
    }
  }, 60 * 1000);
  syncPushBtn.addEventListener('click', function () {
    updateOnline();
    folderSync();
    if (navigator.onLine && settings.gistToken && settings.gistId) {
      showToast('Pushing…');
      gistSetStatus('Pushing…', '', false);
      _doPush(settings.gistToken, settings.gistId).then(function () {
        showToast('Pushed ✓');
        gistSetStatus('Pushed ✓', 'ok', true);
      }).catch(function (err) {
        var msg = 'Push error: ' + (err && err.message || err);
        showToast(msg, 5000);
        gistSetStatus(msg, 'err', false);
      });
    } else if (!navigator.onLine) {
      showToast('Offline — push skipped');
    } else if (!settings.gistToken || !settings.gistId) {
      showToast('No Gist configured — open Settings to set up sync');
    }
  });

  syncPullBtn.addEventListener('click', function () {
    updateOnline();
    if (navigator.onLine && settings.gistToken && settings.gistId) {
      showToast('Pulling…');
      gistSetStatus('Pulling…', '', false);
      gistPull(false).then(function () {
        showToast('Pulled ✓');
      }).catch(function (err) {
        var msg = 'Pull error: ' + (err && err.message || err);
        showToast(msg, 5000);
        gistSetStatus(msg, 'err', false);
      });
    } else if (!navigator.onLine) {
      showToast('Offline — pull skipped');
    } else if (!settings.gistToken || !settings.gistId) {
      showToast('No Gist configured — open Settings to set up sync');
    }
  });
  updateOnline();

  // Click date-key to copy to clipboard
  dateKeyEl.style.cursor = 'pointer';
  dateKeyEl.title = 'Click to copy date';
  dateKeyEl.addEventListener('click', function () {
    navigator.clipboard.writeText(currentDate).then(function () {
      showToast('Date copied: ' + currentDate);
    }).catch(function () {
      showToast('Copy failed');
    });
  });

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

  // ── Settings drawer resize ─────────────────────────────────────────────────

  var _drawerDefaultWidth = 320;

  (function () {
    var handle = el('settings-resize-handle');
    if (!handle) return;
    var startX, startWidth;

    handle.addEventListener('mousedown', function (e) {
      e.preventDefault();
      startX     = e.clientX;
      startWidth = settingsDrw.getBoundingClientRect().width;
      handle.classList.add('dragging');

      function onMove(ev) {
        var dx      = startX - ev.clientX; // dragging left = wider
        var newW    = Math.min(Math.max(startWidth + dx, 240), Math.round(window.innerWidth * 0.85));
        settingsDrw.style.setProperty('--drawer-width', newW + 'px');
      }

      function onUp() {
        handle.classList.remove('dragging');
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup',   onUp);
      }

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup',   onUp);
    });
  }());

  // ── Settings drawer ────────────────────────────────────────────────────────

  function openSettings() {
    el('set-name-left').value  = settings.nameLeft  || '';
    el('set-name-right').value = settings.nameRight || '';
    el('set-split-time').value = settings.splitTime || '12:00';
    el('set-theme').value      = settings.theme     || 'system';
    el('set-gist-token').value = settings.gistToken || '';
    el('set-gist-id').value    = settings.gistId    || '';
    // Always open at default width; user may resize after opening
    settingsDrw.style.setProperty('--drawer-width', _drawerDefaultWidth + 'px');
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
    // Bump the settings timestamp so remote merge knows this side is newer
    var ts = Date.now();
    settings.settingsUpdatedAt = ts;
    DB.setSetting('settingsUpdatedAt', ts);
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
    updateSyncUI();
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
      renderChecklists();
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
          .map(function (item)   { return DB.putTodo(normalizeTodo(item)); });

        Object.keys(savedSettings).forEach(function (key) {
          if (key === 'gistToken' || key === 'gistId') return;
          settings[key] = savedSettings[key];
          ops.push(DB.setSetting(key, savedSettings[key]));
        });

        Promise.all(ops).then(function () {
          importFile.value = '';
          applySettings();
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
    var openGist  = el('gist-open-btn');
    var gistId    = (el('set-gist-id').value || '').trim() || settings.gistId || '';
    if (gistId) {
      openGist.href = 'https://gist.github.com/' + gistId;
      show(openGist);
    } else {
      hide(openGist);
    }
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

  var _gistPushTimer  = null;  // debounce handle
  var _gistPulling    = false; // guard against concurrent pulls
  var _gistPushPending = false; // a push is queued

  function gistSetStatus(text, cls, autoClear) {
    var statusEl = el('gist-status');
    if (!statusEl) return;
    statusEl.textContent = text;
    statusEl.className   = 'gist-status' + (cls ? ' ' + cls : '');
    clearTimeout(statusEl._t);
    if (autoClear) {
      statusEl._t = setTimeout(function () {
        statusEl.textContent = '';
        statusEl.className   = 'gist-status';
      }, 3000);
    }
  }

  function gistPush() {
    var token  = settings.gistToken;
    var gistId = settings.gistId;
    if (!token || !gistId || !navigator.onLine) return;

    // Debounce: coalesce rapid successive pushes into one
    clearTimeout(_gistPushTimer);
    _gistPushTimer = setTimeout(function () {
      _doPush(token, gistId).then(function () {
        gistSetStatus('Saved ✓', 'ok', true);
      }).catch(function (err) {
        gistSetStatus((err && err.message) || 'Sync error', 'err', false);
      });
    }, 15000);
  }

  function _doPush(token, gistId) {
    return DB.getAllTodos().then(function (all) {
      return DB.getAllSettings().then(function (s) {
        var savedSettings = Object.assign({}, s);
        delete savedSettings.gistToken;
        savedSettings.settingsUpdatedAt = Date.now();
        return { todos: all, settings: savedSettings };
      });
    }).then(function (payload) {
      var body = JSON.stringify({
        files: { 'focusapp-data.json': { content: JSON.stringify(payload, null, 2) } }
      });
      return fetch('https://api.github.com/gists/' + gistId, {
        method: 'PATCH',
        headers: { 'Authorization': 'token ' + token, 'Content-Type': 'application/json' },
        body: body
      });
    }).then(function (r) {
      if (r.ok) {
        DB.setSetting('gistLastPushedAt', Date.now());
      } else {
        throw new Error('Push failed ' + r.status);
      }
    });
  }

  // ── Gist pull + merge ──────────────────────────────────────────────────────

  function gistPull(silent) {
    var token  = settings.gistToken;
    var gistId = settings.gistId;
    if (!token || !gistId || !navigator.onLine) return Promise.resolve();
    if (_gistPulling) return Promise.resolve();
    _gistPulling = true;

    if (!silent) gistSetStatus('Syncing…', '', false);

    return fetch('https://api.github.com/gists/' + gistId, {
      headers: { 'Authorization': 'token ' + token }
    }).then(function (r) {
      if (!r.ok) throw new Error('Status ' + r.status);
      return r.json();
    }).then(function (data) {
      var file = data.files && data.files['focusapp-data.json'];
      if (!file) throw new Error('focusapp-data.json not found in Gist');
      var payload = JSON.parse(file.content);

      var remoteTodos    = Array.isArray(payload) ? payload : (payload.todos    || []);
      var remoteSettings = Array.isArray(payload) ? {}      : (payload.settings || {});

      return _mergeFromRemote(remoteTodos, remoteSettings);
    }).then(function (changed) {
      _gistPulling = false;
      if (changed) {
        applySettings();
        render();
        if (!silent) gistSetStatus('Pulled ✓', 'ok', true);
      } else {
        if (!silent) gistSetStatus('Up to date ✓', 'ok', true);
      }
    }).catch(function (err) {
      _gistPulling = false;
      if (!silent) gistSetStatus('Pull error: ' + err.message, 'err', false);
    });
  }

  function _mergeFromRemote(remoteTodos, remoteSettings) {
    return DB.getAllTodos().then(function (localTodos) {
      return DB.getAllTrash().then(function (trash) {
        return DB.getAllSettings().then(function (localSettings) {
          var ops = [];
          var changed = false;

          // ── Merge todos by ID ──────────────────────────────────────────────
          var trashIds = new Set(trash.map(function (t) { return t.id; }));
          var localMap = {};
          localTodos.forEach(function (t) { localMap[t.id] = t; });

          remoteTodos.forEach(function (remote) {
            if (!remote.id || !remote.text) return;
            if (trashIds.has(remote.id)) return; // deleted locally — don't resurrect

            var local = localMap[remote.id];
            if (!local) {
              // New item from remote — add it
              ops.push(DB.putTodo(normalizeTodo(remote)));
              changed = true;
            } else {
              // Both have it — keep whichever is newer
              var remoteTs = remote.updatedAt || remote.createdAt || 0;
              var localTs  = local.updatedAt  || local.createdAt  || 0;
              if (remoteTs > localTs) {
                ops.push(DB.putTodo(normalizeTodo(remote)));
                changed = true;
              }
            }
          });

          // ── Merge settings ─────────────────────────────────────────────────
          var remoteSettingsTs = remoteSettings.settingsUpdatedAt || 0;
          var localSettingsTs  = localSettings.settingsUpdatedAt  || 0;

          Object.keys(remoteSettings).forEach(function (key) {
            if (key === 'gistToken' || key === 'gistId') return; // never overwrite credentials

            if (key.indexOf('cl_state_') === 0) {
              // Per-day checklist state — merge by per-key timestamp
              var remoteState = null;
              try { remoteState = JSON.parse(remoteSettings[key]); } catch(e) {}
              if (!remoteState) return;

              var localStateRaw = localSettings[key];
              var localState = null;
              try { localState = localStateRaw ? JSON.parse(localStateRaw) : null; } catch(e) {}

              if (!localState) {
                // Remote has state we don't have locally
                settings[key] = remoteSettings[key];
                ops.push(DB.setSetting(key, remoteSettings[key]));
                changed = true;
              } else {
                var remoteStateTs = remoteState.updatedAt || 0;
                var localStateTs  = localState.updatedAt  || 0;
                if (remoteStateTs > localStateTs) {
                  settings[key] = remoteSettings[key];
                  ops.push(DB.setSetting(key, remoteSettings[key]));
                  changed = true;
                }
              }
            } else {
              // Regular setting — remote wins if it's newer overall
              if (remoteSettingsTs > localSettingsTs) {
                if (localSettings[key] !== remoteSettings[key]) {
                  settings[key] = remoteSettings[key];
                  ops.push(DB.setSetting(key, remoteSettings[key]));
                  changed = true;
                }
              }
            }
          });

          if (remoteSettingsTs > localSettingsTs) {
            DB.setSetting('settingsUpdatedAt', remoteSettingsTs);
          }

          return Promise.all(ops).then(function () { return changed; });
        });
      });
    });
  }

  // ── Gist restore (full overwrite, used by Restore button) ─────────────────

  function gistRestore() {
    var token  = settings.gistToken;
    var gistId = settings.gistId;
    if (!token || !gistId) { showToast('Enter a token and Gist ID first'); return; }

    gistSetStatus('Restoring…', '', false);
    fetch('https://api.github.com/gists/' + gistId, {
      headers: { 'Authorization': 'token ' + token }
    }).then(function (r) {
      if (!r.ok) throw new Error('Status ' + r.status);
      return r.json();
    }).then(function (data) {
      var file = data.files && data.files['focusapp-data.json'];
      if (!file) throw new Error('focusapp-data.json not found in Gist');
      var payload = JSON.parse(file.content);

      var todos         = Array.isArray(payload) ? payload : (payload.todos    || []);
      var savedSettings = Array.isArray(payload) ? {}      : (payload.settings || {});

      var ops = todos
        .filter(function (item) { return item.id && item.text; })
        .map(function (item)    { return DB.putTodo(normalizeTodo(item)); });

      Object.keys(savedSettings).forEach(function (key) {
        if (key === 'gistToken' || key === 'gistId') return;
        settings[key] = savedSettings[key];
        ops.push(DB.setSetting(key, savedSettings[key]));
      });

      return Promise.all(ops);
    }).then(function () {
      applySettings();
      render();
      gistSetStatus('Restored ✓', 'ok', true);
      showToast('Restored from Gist');
    }).catch(function (err) {
      gistSetStatus('Restore failed', 'err', false);
      showToast('Restore failed: ' + err.message, 5000);
    });
  }

  el('gist-restore-btn').addEventListener('click', gistRestore);

  // ── Scheduled Checklists ──────────────────────────────────────────────────

  function getChecklists() {
    try { return JSON.parse(settings.checklists || '[]'); } catch (e) { return []; }
  }

  function saveChecklists(arr) {
    settings.checklists = JSON.stringify(arr);
    DB.setSetting('checklists', settings.checklists);
  }

  // Returns true if checklist `cl` should appear on the day given by `dateKey`
  function clAppliesToDay(cl, dateKey) {
    var d   = keyToDate(dateKey);
    var dow = d.getDay(); // 0=Sun,6=Sat
    var dom = d.getDate();
    var mon = d.getMonth(); // 0-indexed
    var s   = cl.schedule;

    switch (s.type) {
      case 'daily':
        return true;
      case 'weekdays':
        return dow >= 1 && dow <= 5;
      case 'weekends':
        return dow === 0 || dow === 6;
      case 'days-of-week':
        return (s.days || []).indexOf(dow) !== -1;
      case 'weekly': {
        if (dow !== +s.day) return false;
        if (!s.start) return true;
        var diff = Math.round((d - keyToDate(s.start)) / 86400000);
        return diff >= 0 && diff % (7 * (+s.n || 1)) === 0;
      }
      case 'biweekly': {
        if (!s.start) return false;
        var diff2 = Math.round((d - keyToDate(s.start)) / 86400000);
        return diff2 >= 0 && diff2 % 14 === 0;
      }
      case 'nth-weekday': {
        var n = +s.n;
        var targetDow = +s.day;
        if (dow !== targetDow) return false;
        if (n === -1) {
          // last occurrence — check if adding 7 days overflows the month
          var next = new Date(d); next.setDate(dom + 7);
          return next.getMonth() !== mon;
        }
        // nth occurrence: count how many of this weekday have occurred including today
        var count = Math.floor((dom - 1) / 7) + 1;
        return count === n;
      }
      case 'nth-weekend-day': {
        var nWe  = +s.n;
        var tDow = +s.day; // 0=Sun or 6=Sat
        if (dow !== tDow) return false;
        // count occurrences of this weekend day in the month up to today
        var cnt = 0;
        for (var dd = 1; dd <= dom; dd++) {
          var tmp = new Date(d.getFullYear(), mon, dd);
          if (tmp.getDay() === tDow) cnt++;
        }
        return cnt === nWe;
      }
      case 'monthly-date':
        return dom === +s.date;
      case 'first-last-weekday': {
        if (dow === 0 || dow === 6) return false; // not a weekday
        if (s.which === 'first') {
          // first weekday: check no earlier weekday this month
          for (var d2 = 1; d2 < dom; d2++) {
            var t2 = new Date(d.getFullYear(), mon, d2);
            if (t2.getDay() !== 0 && t2.getDay() !== 6) return false;
          }
          return true;
        } else {
          // last weekday: check no later weekday this month
          var daysInMonth = new Date(d.getFullYear(), mon + 1, 0).getDate();
          for (var d3 = dom + 1; d3 <= daysInMonth; d3++) {
            var t3 = new Date(d.getFullYear(), mon, d3);
            if (t3.getDay() !== 0 && t3.getDay() !== 6) return false;
          }
          return true;
        }
      }
      case 'quarterly': {
        // 1st day of Jan, Apr, Jul, Oct
        return dom === 1 && (mon === 0 || mon === 3 || mon === 6 || mon === 9);
      }
      case 'yearly':
        if (!s.date) return false;
        var parts = s.date.split('-');
        return +parts[0] - 1 === mon && +parts[1] === dom;
      case 'every-n-days': {
        if (!s.start) return false;
        var diffN = Math.round((d - keyToDate(s.start)) / 86400000);
        return diffN >= 0 && diffN % (+s.n || 1) === 0;
      }
      case 'one-time':
        return s.date === dateKey;
      default:
        return false;
    }
  }

  // ── Checklist settings list ────────────────────────────────────────────────

  function renderClList() {
    var list = el('cl-list');
    list.innerHTML = '';
    var cls = getChecklists();
    if (!cls.length) {
      var empty = document.createElement('li');
      empty.className   = 'cl-list-empty';
      empty.textContent = 'No checklists yet.';
      list.appendChild(empty);
      return;
    }
    cls.forEach(function (cl) {
      var li = document.createElement('li');
      li.className = 'cl-list-item';

      var nameSpan = document.createElement('span');
      nameSpan.className   = 'cl-list-name';
      nameSpan.textContent = cl.name;

      var schedSpan = document.createElement('span');
      schedSpan.className   = 'cl-list-sched';
      schedSpan.textContent = clSchedLabel(cl.schedule);

      var editBtn = document.createElement('button');
      editBtn.className   = 'setting-btn';
      editBtn.textContent = 'Edit';
      editBtn.addEventListener('click', function () { openClModal(cl.id); });

      li.appendChild(nameSpan);
      li.appendChild(schedSpan);
      li.appendChild(editBtn);
      list.appendChild(li);
    });
  }

  function clSchedLabel(s) {
    var dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    var ordinals = ['','1st','2nd','3rd','4th','Last'];
    switch (s.type) {
      case 'daily':             return 'Daily';
      case 'weekdays':          return 'Weekdays';
      case 'weekends':          return 'Weekends';
      case 'days-of-week':      return (s.days||[]).map(function(d){return dayNames[d];}).join(', ');
      case 'weekly':            return 'Every ' + (s.n||1) + 'w on ' + dayNames[s.day||1];
      case 'biweekly':          return 'Bi-weekly';
      case 'nth-weekday':       return (s.n===-1?'Last':ordinals[s.n]||s.n+'th') + ' ' + dayNames[s.day||1] + ' of month';
      case 'nth-weekend-day':   return (ordinals[s.n]||s.n+'th') + ' ' + dayNames[s.day||6] + ' of month';
      case 'monthly-date':      return 'Monthly on the ' + s.date + (s.date===1?'st':s.date===2?'nd':s.date===3?'rd':'th');
      case 'first-last-weekday':return (s.which==='first'?'First':'Last') + ' weekday of month';
      case 'quarterly':         return 'Quarterly';
      case 'yearly':            return 'Yearly on ' + (s.date||'');
      case 'every-n-days':      return 'Every ' + (s.n||1) + ' days';
      case 'one-time':          return 'Once on ' + (s.date||'');
      default:                  return s.type||'';
    }
  }

  // ── Checklist editor modal ─────────────────────────────────────────────────
  // All listeners attached lazily inside openClModal — never at script load time

  var _clModalBound = false;
  var _clEditingId  = null;
  var _clModalItems = []; // working copy of items for current edit session

  function openClModal(clId) {
    var cls = getChecklists();
    var cl  = clId ? cls.find(function (c) { return c.id === clId; }) : null;
    _clEditingId  = clId || null;
    _clModalItems = cl ? cl.items.slice() : [];

    // Populate fields
    el('cl-modal-title').textContent  = cl ? 'Edit Checklist' : 'New Checklist';
    el('cl-name').value               = cl ? cl.name : '';

    var s = cl ? cl.schedule : { type: 'daily' };
    el('cl-sched-type').value = s.type || 'daily';

    // Populate schedule-specific fields
    el('cl-weekly-n').value        = s.n    || 1;
    el('cl-weekly-day').value      = s.day  != null ? s.day : 1;
    el('cl-biweekly-start').value  = s.start || '';
    el('cl-nth-wd-n').value        = s.n    != null ? s.n : 1;
    el('cl-nth-wd-day').value      = s.day  != null ? s.day : 1;
    el('cl-nth-we-n').value        = s.n    != null ? s.n : 1;
    el('cl-nth-we-day').value      = s.day  != null ? s.day : 6;
    el('cl-monthly-date').value    = s.date || 1;
    el('cl-flw-which').value       = s.which || 'first';
    el('cl-yearly-date').value     = s.date || '';
    el('cl-every-n').value         = s.n    || 7;
    el('cl-every-n-start').value   = s.start || '';
    el('cl-one-time-date').value   = s.date || '';

    // Days-of-week checkboxes
    var dowCbs = document.querySelectorAll('.cl-dow');
    dowCbs.forEach(function (cb) {
      cb.checked = (s.days || []).indexOf(+cb.value) !== -1;
    });

    clShowSchedOpts(s.type);
    renderClModalItems();

    // Show/hide delete button
    if (_clEditingId) { show(el('cl-modal-delete')); }
    else              { hide(el('cl-modal-delete')); }

    show(el('cl-modal-overlay'));
    show(el('cl-modal'));
    el('cl-name').focus();

    // Bind listeners only once
    if (!_clModalBound) {
      _clModalBound = true;

      el('cl-sched-type').addEventListener('change', function () {
        clShowSchedOpts(this.value);
      });

      el('cl-item-add-btn').addEventListener('click', function () {
        var inp   = el('cl-item-new');
        var txt   = inp.value.trim();
        if (!txt) return;
        _clModalItems.push({
          id:    makeId(),
          text:  txt,
          links: el('cl-item-new-links').value.trim(),
          notes: el('cl-item-new-notes').value.trim(),
        });
        inp.value = '';
        el('cl-item-new-links').value = '';
        el('cl-item-new-notes').value = '';
        inp.focus();
        renderClModalItems();
      });

      el('cl-item-new').addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); el('cl-item-add-btn').click(); }
      });

      el('cl-modal-close').addEventListener('click',  closeClModal);
      el('cl-modal-cancel').addEventListener('click', closeClModal);
      el('cl-modal-overlay').addEventListener('click', closeClModal);

      el('cl-modal-save').addEventListener('click', saveClModal);

      el('cl-modal-delete').addEventListener('click', function () {
        if (!_clEditingId) return;
        var cls2 = getChecklists().filter(function (c) { return c.id !== _clEditingId; });
        saveChecklists(cls2);
        closeClModal();
        renderClList();
        renderChecklists();
      });
    }
  }

  function closeClModal() {
    hide(el('cl-modal-overlay'));
    hide(el('cl-modal'));
    _clEditingId  = null;
    _clModalItems = [];
  }

  function clShowSchedOpts(type) {
    document.querySelectorAll('.cl-opt').forEach(function (el2) { el2.classList.add('hidden'); });
    var map = {
      'days-of-week':      'cl-opt-days-of-week',
      'weekly':            'cl-opt-weekly',
      'biweekly':          'cl-opt-biweekly',
      'nth-weekday':       'cl-opt-nth-weekday',
      'nth-weekend-day':   'cl-opt-nth-weekend-day',
      'monthly-date':      'cl-opt-monthly-date',
      'first-last-weekday':'cl-opt-first-last-weekday',
      'yearly':            'cl-opt-yearly',
      'every-n-days':      'cl-opt-every-n-days',
      'one-time':          'cl-opt-one-time',
    };
    if (map[type]) el(map[type]).classList.remove('hidden');
  }

  var _clDragSrcIdx = null;

  function renderClModalItems() {
    var list = el('cl-items-list');
    list.innerHTML = '';
    _clModalItems.forEach(function (item, idx) {
      var li = document.createElement('li');
      li.className  = 'mp-template-item cl-modal-item';
      li.draggable  = true;
      li.dataset.idx = idx;

      var handle = document.createElement('span');
      handle.className   = 'drag-handle cl-item-handle';
      handle.textContent = '⠿';

      var itemBody = document.createElement('div');
      itemBody.style.cssText = 'flex:1;min-width:0;display:flex;flex-direction:column;gap:3px;';

      var input = document.createElement('input');
      input.type      = 'text';
      input.className = 'cl-item-edit-input';
      input.value     = item.text;
      input.addEventListener('change', function () {
        var val = input.value.trim();
        if (val) _clModalItems[idx].text = val;
        else input.value = _clModalItems[idx].text;
      });
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
      });

      var linksInput = document.createElement('input');
      linksInput.type        = 'text';
      linksInput.className   = 'cl-item-edit-input';
      linksInput.placeholder = 'Links (comma-separated)';
      linksInput.value       = item.links || '';
      linksInput.style.fontSize = '.78rem';
      linksInput.addEventListener('change', function () {
        _clModalItems[idx].links = linksInput.value.trim();
      });

      var notesInput = document.createElement('textarea');
      notesInput.className   = 'cl-item-edit-input';
      notesInput.placeholder = 'Notes';
      notesInput.value       = item.notes || '';
      notesInput.rows        = 1;
      notesInput.style.cssText = 'font-size:.78rem;resize:vertical;';
      notesInput.addEventListener('change', function () {
        _clModalItems[idx].notes = notesInput.value.trim();
      });

      itemBody.appendChild(input);
      itemBody.appendChild(linksInput);
      itemBody.appendChild(notesInput);

      var del = document.createElement('button');
      del.type        = 'button';
      del.className   = 'mp-template-remove';
      del.title       = 'Remove';
      del.textContent = '✕';
      del.addEventListener('click', function () {
        _clModalItems.splice(idx, 1);
        renderClModalItems();
      });

      // Drag-to-reorder
      li.addEventListener('dragstart', function (e) {
        _clDragSrcIdx = idx;
        li.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
      });
      li.addEventListener('dragend', function () {
        li.classList.remove('dragging');
        document.querySelectorAll('.cl-modal-item').forEach(function (el2) {
          el2.classList.remove('drag-over');
        });
      });
      li.addEventListener('dragover', function (e) {
        e.preventDefault();
        if (_clDragSrcIdx !== idx) li.classList.add('drag-over');
      });
      li.addEventListener('dragleave', function () {
        li.classList.remove('drag-over');
      });
      li.addEventListener('drop', function (e) {
        e.preventDefault();
        li.classList.remove('drag-over');
        if (_clDragSrcIdx === null || _clDragSrcIdx === idx) return;
        var moved = _clModalItems.splice(_clDragSrcIdx, 1)[0];
        _clModalItems.splice(idx, 0, moved);
        _clDragSrcIdx = null;
        renderClModalItems();
      });

      li.appendChild(handle);
      li.appendChild(itemBody);
      li.appendChild(del);
      list.appendChild(li);
    });
  }

  function saveClModal() {
    var name = el('cl-name').value.trim();
    if (!name) { el('cl-name').focus(); return; }

    var type = el('cl-sched-type').value;
    var schedule = { type: type };

    switch (type) {
      case 'days-of-week':
        schedule.days = Array.from(document.querySelectorAll('.cl-dow:checked')).map(function (cb) { return +cb.value; });
        break;
      case 'weekly':
        schedule.n   = +el('cl-weekly-n').value || 1;
        schedule.day = +el('cl-weekly-day').value;
        break;
      case 'biweekly':
        schedule.start = el('cl-biweekly-start').value;
        break;
      case 'nth-weekday':
        schedule.n   = +el('cl-nth-wd-n').value;
        schedule.day = +el('cl-nth-wd-day').value;
        break;
      case 'nth-weekend-day':
        schedule.n   = +el('cl-nth-we-n').value;
        schedule.day = +el('cl-nth-we-day').value;
        break;
      case 'monthly-date':
        schedule.date = +el('cl-monthly-date').value;
        break;
      case 'first-last-weekday':
        schedule.which = el('cl-flw-which').value;
        break;
      case 'yearly':
        schedule.date = el('cl-yearly-date').value;
        break;
      case 'every-n-days':
        schedule.n     = +el('cl-every-n').value || 7;
        schedule.start = el('cl-every-n-start').value;
        break;
      case 'one-time':
        schedule.date = el('cl-one-time-date').value;
        break;
    }

    var cls = getChecklists();
    if (_clEditingId) {
      var idx2 = cls.findIndex(function (c) { return c.id === _clEditingId; });
      if (idx2 !== -1) {
        cls[idx2].name     = name;
        cls[idx2].schedule = schedule;
        cls[idx2].items    = _clModalItems;
      }
    } else {
      cls.push({
        id:       makeId(),
        name:     name,
        schedule: schedule,
        items:    _clModalItems,
      });
    }

    saveChecklists(cls);
    closeClModal();
    renderClList();
    renderChecklists();
  }

  // ── Checklist banners (rendered below Morning Process) ─────────────────────

  var _clExpanded = {}; // tracks expanded state by cl.id across re-renders

  function renderChecklists() {
    var container = el('cl-banners');
    container.innerHTML = '';

    var cls = getChecklists();
    if (!cls.length) return;

    var today    = todayKey();
    var isToday  = currentDate === today;

    cls.forEach(function (cl) {
      // Determine which date's state to show for this checklist:
      // 1. If scheduled for the viewed date, use that date.
      // 2. If viewing today and not scheduled today, look back up to 30 days for the
      //    most recent scheduled day that has an incomplete state (carry-forward).
      var displayDate = null;

      if (clAppliesToDay(cl, currentDate)) {
        displayDate = currentDate;
      } else if (isToday) {
        // Scan backwards for an incomplete carried-over occurrence
        for (var i = 1; i <= 30; i++) {
          var pastKey = shiftKey(today, -i);
          if (clAppliesToDay(cl, pastKey)) {
            displayDate = pastKey;
            break; // take the most recent past scheduled day
          }
        }
      }

      if (!displayDate) return;

      // When carrying forward, we use the past day's stateKey but render on today
      var stateKey    = 'cl_state_' + cl.id + '_' + displayDate;
      var carriedOver = displayDate !== currentDate;

      DB.getSetting(stateKey).then(function (stateJson) {
        var state;
        if (stateJson) {
          try { state = JSON.parse(stateJson); } catch(e) { state = null; }
        }

        if (!state) {
          if (carriedOver) return; // past day has no state — nothing to carry forward
          // First time viewing this checklist on this date — create fresh state
          state = {
            items: cl.items.map(function (item) { return { id: item.id, text: item.text, links: item.links || '', notes: item.notes || '', done: false }; }),
            updatedAt: Date.now(),
          };
          DB.setSetting(stateKey, JSON.stringify(state));
        } else {
          // If carrying forward, only show if not fully complete
          if (carriedOver) {
            var allDoneAlready = state.items.length > 0 && state.items.every(function (i) { return i.done; });
            if (allDoneAlready) return;
          }

          // Sync template changes — add new items, remove deleted ones, keep done flags
          var stateMap = {};
          state.items.forEach(function (i) { stateMap[i.id] = i; });
          var synced = cl.items.map(function (item) {
            return stateMap[item.id]
              ? { id: item.id, text: item.text, links: item.links || '', notes: item.notes || '', done: stateMap[item.id].done }
              : { id: item.id, text: item.text, links: item.links || '', notes: item.notes || '', done: false };
          });
          var changed = JSON.stringify(synced) !== JSON.stringify(state.items);
          state.items = synced;
          if (changed) {
            state.updatedAt = Date.now();
            DB.setSetting(stateKey, JSON.stringify(state));
          }
        }

        renderClBanner(container, cl, state, stateKey, carriedOver ? displayDate : null);
      });
    });
  }

  function renderClBanner(container, cl, state, stateKey, carriedFromDate) {
    var doneCount = state.items.filter(function (i) { return i.done; }).length;
    var total     = state.items.length;

    var wrapper = document.createElement('div');
    wrapper.className = 'morning-banner cl-banner';
    wrapper.dataset.clId = cl.id;

    var bar = document.createElement('div');
    bar.className = 'morning-bar';
    var allDone = doneCount === total && total > 0;
    bar.style.setProperty('--morning-bar-bg', allDone ? '#274D77' : '#c0392b');

    var labelSpan = document.createElement('span');
    labelSpan.className   = 'morning-bar-label';
    labelSpan.textContent = cl.name;

    var progSpan = document.createElement('span');
    progSpan.className   = 'morning-bar-progress';
    progSpan.textContent = (total > 0 && doneCount === total) ? '✓ done' : (doneCount + ' / ' + total);

    var schedSpan = document.createElement('span');
    schedSpan.className   = 'cl-banner-sched';
    schedSpan.textContent = carriedFromDate
      ? 'from ' + carriedFromDate + ' · ' + clSchedLabel(cl.schedule)
      : clSchedLabel(cl.schedule);

    var toggleBtn = document.createElement('button');
    toggleBtn.className   = 'morning-bar-toggle icon-btn';
    toggleBtn.title       = 'Expand / collapse';
    toggleBtn.textContent = '▾';

    bar.appendChild(labelSpan);
    bar.appendChild(progSpan);
    bar.appendChild(schedSpan);
    bar.appendChild(toggleBtn);

    var body = document.createElement('div');
    body.className = 'morning-body hidden';

    var ul = document.createElement('ul');
    ul.className = 'morning-list';

    state.items.forEach(function (item, idx) {
      var li = document.createElement('li');
      li.className = 'morning-item' + (item.done ? ' done' : '');

      var chk = document.createElement('input');
      chk.type    = 'checkbox';
      chk.checked = item.done;
      chk.addEventListener('change', function () {
        state.items[idx].done = chk.checked;
        state.updatedAt = Date.now();
        DB.setSetting(stateKey, JSON.stringify(state)).then(function () {
          renderChecklists();
        });
      });

      var itemContent = document.createElement('span');
      itemContent.style.cssText = 'flex:1;min-width:0;display:flex;flex-wrap:wrap;align-items:baseline;gap:4px;';

      var span = document.createElement('span');
      span.className   = 'morning-item-text';
      span.textContent = item.text;
      span.addEventListener('click', function () { chk.click(); });
      itemContent.appendChild(span);

      if (item.links) {
        item.links.split(',').map(function (s) { return s.trim(); }).filter(Boolean).forEach(function (url, i) {
          var a = document.createElement('a');
          a.href      = url;
          a.target    = '_blank';
          a.rel       = 'noopener noreferrer';
          a.textContent = '[' + (i + 1) + ']';
          a.className = 'cl-item-link';
          itemContent.appendChild(a);
        });
      }

      if (item.notes) {
        var notesIcon = document.createElement('span');
        notesIcon.className = 'item-notes';
        notesIcon.title     = item.notes;
        notesIcon.textContent = '📝';
        itemContent.appendChild(notesIcon);
      }

      li.appendChild(chk);
      li.appendChild(itemContent);
      ul.appendChild(li);
    });

    var footer = document.createElement('div');
    footer.className = 'cl-banner-footer';

    var completeBtn = document.createElement('button');
    completeBtn.className   = 'setting-btn cl-complete-btn';
    completeBtn.textContent = '✓ Check all items';
    completeBtn.addEventListener('click', function () {
      state.items.forEach(function (item) { item.done = true; });
      state.updatedAt = Date.now();
      DB.setSetting(stateKey, JSON.stringify(state)).then(function () {
        renderChecklists();
      });
    });

    footer.appendChild(completeBtn);
    body.appendChild(ul);
    body.appendChild(footer);
    wrapper.appendChild(bar);
    wrapper.appendChild(body);
    container.appendChild(wrapper);

    // Restore expanded state; auto-collapse only when all done
    var expanded = allDone ? false : !!_clExpanded[cl.id];
    wrapper.classList.toggle('expanded', expanded);
    body.classList.toggle('hidden', !expanded);

    bar.addEventListener('click', function () {
      var nowExpanded = wrapper.classList.toggle('expanded');
      body.classList.toggle('hidden', !nowExpanded);
      _clExpanded[cl.id] = nowExpanded;
    });
  }

  el('cl-new-btn').addEventListener('click', function () { openClModal(null); });


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
    scheduleMidnight();
    return render();
  }).then(function () {
    refreshUndoButtons();
  }).catch(function (err) {
    console.error('FocusApp init error:', err);
    alert('Failed to open database: ' + err.message + '\n\nTry opening the app over a local server instead of a file:// URL, or check browser permissions.');
  });

}());
