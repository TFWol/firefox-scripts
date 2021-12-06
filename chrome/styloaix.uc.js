// ==UserScript==
// @name            StyloaiX
// @author          xiaoxiaoflood
// @include         *
// @startup         UC.styloaix.exec(win);
// @shutdown        UC.styloaix.destroy();
// @onlyonce
// ==/UserScript==

// inspired by legacy Stylish and https://github.com/Endor8/userChrome.js/blob/master/Updates%202019/UserCSSLoader.uc.js
// editor forked from Stylish - minor changes to edit.xhtml, but edit.js almost completely rewritten, with improvements and bug fixes.
// icon from old Stylish

// search for "userChromeJS.styloaix" in about:config to change settings.

(function () {

  UC.styloaix = {
    exec: function (win) {
      if (win.location.href !== _uc.BROWSERCHROME)
        return;

      const { AppConstants, CustomizableUI, document, Services } = win;
      if (AppConstants.MOZ_APP_NAME !== 'thunderbird') {
        if (!CustomizableUI.getPlacementOfWidget('styloaix-button')) {
          CustomizableUI.createWidget({
            id: 'styloaix-button',
            type: 'custom',
            defaultArea: CustomizableUI.AREA_NAVBAR,
            onBuild: (doc) => {
              return this.createButton(doc);
            }
          });
        }
      } else {
        const btn = this.createButton(document);
        btn.setAttribute('removable', true);
        const toolbar = document.querySelector('toolbar[customizable=true].chromeclass-toolbar');
        if (toolbar.parentElement.palette)
          toolbar.parentElement.palette.appendChild(btn);
        else
          toolbar.appendChild(btn);

        if (xPref.get(this.PREF_FIRSTRUN)) {
          xPref.set(this.PREF_FIRSTRUN, false);
          if (!toolbar.getAttribute('currentset').split(',').includes(btn.id)) {
            toolbar.appendChild(btn);
            toolbar.setAttribute('currentset', toolbar.currentSet);
            Services.xulStore.persist(toolbar, 'currentset');
          }
        } else {
          toolbar.currentSet = Services.xulStore.getValue(win.location.href, toolbar.id, 'currentset');
          toolbar.setAttribute('currentset', toolbar.currentSet);
        }

        this.tbButtons.push(btn);
      }
    },

    init: function () {
      xPref.lock(this.PREF_MOZDOCUMENT, true);
      xPref.set(this.PREF_FIRSTRUN, true, true);
      xPref.set(this.PREF_DISABLED, false, true);
      xPref.set(this.PREF_STYLESDISABLED, '[]', true);
      xPref.set(this.PREF_INSTANTCHECK, true, true);
      xPref.set(this.PREF_INSTANTPREVIEW, true, true);
      xPref.set(this.PREF_INSTANTINTERVAL, 500, true);
      xPref.set(this.PREF_LINEWRAPPING, true, true);
      xPref.set(this.PREF_OPENINWINDOW, true, true);

      this.prefListener = xPref.addListener(this.PREF_STYLESDISABLED, (sDisabled) => {
        let newSet;
        try {
          newSet = new Set(JSON.parse(sDisabled));
        } catch {
          xPref.set(this.PREF_STYLESDISABLED, JSON.stringify([...this.disabledStyles]));
          return;
        }

        this.styles.forEach(style => {
          if ((style.enabled && newSet.has(style.fullName)) ||
              (!style.enabled && !newSet.has(style.fullName)))
            this.toggleStyle(style);
        });
      });
      this.prefListenerAll = xPref.addListener(this.PREF_DISABLED, (disabled) => {
        this.toggleAll({disable: disabled});
        this.btnClasses.reverse();
        _uc.windows((doc) => {
          let enabledBtn = doc.getElementById('styloaix-enabled');
          enabledBtn.label = disabled ? 'Disabled' : 'Enabled';
          enabledBtn.setAttribute('checked', !disabled);
          doc.getElementById('styloaix-button').classList.replace(...this.btnClasses);
          doc.getElementById('styloaix-reload-all').disabled = disabled;
        });
      });

      this.disabledStyles = new DisabledSet(JSON.parse(xPref.get(this.PREF_STYLESDISABLED)).sort((a, b) => a[0].localeCompare(b[0])));

      this.UserStyle = UserStyle;

      if (!this.enabled)
        this.btnClasses.reverse();

      this.loadStyles();

      _uc.sss.loadAndRegisterSheet(this.STYLE.url, this.STYLE.type);
    },

    createButton (doc) {
      let btn = _uc.createElement(doc, 'toolbarbutton', {
        id: 'styloaix-button',
        label: 'StyloaiX',
        tooltiptext: 'StyloaiX',
        type: 'menu',
        class: 'toolbarbutton-1 chromeclass-toolbar-additional ' + this.btnClasses[1],
        onclick: 'if (event.button === 1 && event.target.id == this.id) UC.styloaix.enabled = !UC.styloaix.enabled;'
      });

      let popup = _uc.createElement(doc, 'menupopup', {id: 'styloaix-popup'});
      btn.appendChild(popup);
      btn.addEventListener('popupshowing', this.populateMenu);

      let disabled = xPref.get(this.PREF_DISABLED);
      let toggleBtn = _uc.createElement(doc, 'menuitem', {
        id: 'styloaix-enabled',
        label: disabled ? 'Disabled' : 'Enabled',
        type: 'checkbox',
        checked: !disabled,
        oncommand: 'UC.styloaix.enabled = !UC.styloaix.enabled;'
      });
      popup.appendChild(toggleBtn);
      
      let menuseparator = _uc.createElement(doc, 'menuseparator');
      popup.appendChild(menuseparator);

      let reloadAllBtn = _uc.createElement(doc, 'menuitem', {
        id: 'styloaix-reload-all',
        label: 'Reload All Styles',
        disabled: !this.enabled,
        oncommand: 'UC.styloaix.toggleAll({reload: true});'
      });
      popup.appendChild(reloadAllBtn);

      let openFolderBtn = _uc.createElement(doc, 'menuitem', {
        id: 'styloaix-open-folder',
        label: 'Open folder',
        oncommand: 'UC.styloaix.CSSDIR.launch();'
      });
      popup.appendChild(openFolderBtn);

      let newStyleMenu = _uc.createElement(doc, 'menu', {
        id: 'styloaix-new-style',
        label: 'New Style'
      });

      let newStylePopup = _uc.createElement(doc, 'menupopup', {id: 'styloaix-newstyle-popup'});

      let newPageStyleBtn = _uc.createElement(doc, 'menuitem', {
        label: 'For this page',
        oncommand: 'UC.styloaix.openEditor({url: gBrowser.currentURI.specIgnoringRef, type: "url"});'
      });
      newStylePopup.appendChild(newPageStyleBtn);

      let newSiteStyleBtn = _uc.createElement(doc, 'menuitem', {
        label: 'For this site',
        oncommand: 'let host = gBrowser.currentURI.asciiHost; UC.styloaix.openEditor({url: host || gBrowser.currentURI.specIgnoringRef, type: host ? "domain" : "url"});'
      });
      newStylePopup.appendChild(newSiteStyleBtn);

      let newStyle = _uc.createElement(doc, 'menuitem', {
        label: 'Blank Style',
        oncommand: 'UC.styloaix.openEditor();'
      });
      newStylePopup.appendChild(newStyle);

      newStyleMenu.appendChild(newStylePopup);
      popup.appendChild(newStyleMenu);

      let separatorBeforeStyles = _uc.createElement(doc, 'menuseparator', {id: 'styloaix-separator'});
      separatorBeforeStyles.hidden = !this.styles.size;
      popup.appendChild(separatorBeforeStyles);
      btn._separator = separatorBeforeStyles;

      let stylePopup = _uc.createElement(doc, 'menupopup', {id: 'styloaix-style-context'});

      let styleEdit = _uc.createElement(doc, 'menuitem', {
        id: 'styloaix-style-edit',
        label: 'Edit',
        oncommand: 'UC.styloaix.openEditor({id: this.parentNode.triggerNode._style.fullName})'
      });
      stylePopup.appendChild(styleEdit);

      let styleReload = _uc.createElement(doc, 'menuitem', {
        id: 'styloaix-style-reload',
        label: 'Reload',
        oncommand: 'this.parentNode.triggerNode._style.reload()'
      });
      stylePopup.appendChild(styleReload);

      let styleDelete = _uc.createElement(doc, 'menuitem', {
        id: 'styloaix-style-delete',
        label: 'Delete',
        oncommand: 'this.parentNode.triggerNode._style.delete()'
      });
      stylePopup.appendChild(styleDelete);

      doc.getElementById('mainPopupSet').appendChild(stylePopup);
      
      return btn;
    },

    get enabled () {
      return !xPref.get(this.PREF_DISABLED);
    },

    set enabled (val) {
      xPref.set(this.PREF_DISABLED, !val);
    },

    loadStyles: function() {
      let files = this.CSSDIR.directoryEntries.QueryInterface(Ci.nsISimpleEnumerator);
      while (files.hasMoreElements()) {
        let file = files.getNext().QueryInterface(Ci.nsIFile);
        if (file.leafName.endsWith('.css')) {
          let style = new UserStyle(file);
        }
      }

      if (this.enabled)
        this.toggleAll({disable: false});
    },

    toggleAll: function ({disable = this.enabled, reload = false} = {}) {
      this.styles.forEach(style => {
        if (style.enabled)
          this.toggleStyle(style, {aStatus: !disable, changeStatus: false, forced: true});
      });
      if (reload) {
        this.styles = new Map();
        this.loadStyles();
      }
    },

    toggleStyle: function (style, {aStatus = !style.enabled, changeStatus = true, forced = false} = {}) {
      if (this.enabled || forced) {
        if (aStatus)
          style.register();
        else
          style.unregister();
      }
      if (changeStatus) {
        this.changeStatus(style, aStatus);
      }
    },

    changeStatus: function (style, aStatus) {
      style.enabled = aStatus;
      _uc.windows((doc) => {
        let menuitem = doc.getElementById('styloaix-popup').getElementsByAttribute('styleid', style.fullName)[0];
        menuitem.setAttribute('checked', aStatus);
      });
      if (aStatus) {
        this.disabledStyles.delete(style.fullName);
      } else {
        this.disabledStyles.add(style.fullName);
      }
    },

    addStyleInMenu (style, popup) {
      let menuitem = _uc.createElement(popup.ownerDocument, 'menuitem', {
        label: style.name,
        type: 'checkbox',
        class: 'styloaix-style' + (style.type == _uc.sss.AUTHOR_SHEET ?
                                     '' :
                                     ' styloaix-' + (style.type == _uc.sss.USER_SHEET ?
                                       'user' :
                                       'agent') + 'sheet'),
        checked: style.enabled,
        context: 'styloaix-style-context',
        oncommand: 'UC.styloaix.toggleStyle(this._style);',
        onmouseup: 'UC.styloaix.shouldPreventHide(event, this._style);',
        styleid: style.fullName
      });
      popup.appendChild(menuitem);
      menuitem._style = style;      
    },

    shouldPreventHide: function (event, style) {
      const menuitem = event.target;
      if (event.button == 1 && !event.ctrlKey) {
        menuitem.setAttribute('closemenu', 'none');
        menuitem.parentNode.addEventListener('popuphidden', () => {
          menuitem.removeAttribute('closemenu');
        }, { once: true });
      } else {
        menuitem.removeAttribute('closemenu');
      }
    },

    populateMenu (e) {
      const popup = e.target;

      if (popup.id !== 'styloaix-popup')
        return;

      const doc = e.view.document;

      const stylesSeparator = popup.querySelector('#styloaix-separator');
      while (stylesSeparator.nextSibling)
        stylesSeparator.nextSibling.remove();

      const sortedMap = new Map([...UC.styloaix.styles.entries()].sort((a, b) => a[0].localeCompare(b[0])));
      sortedMap.forEach(style => {
        UC.styloaix.addStyleInMenu(style, popup);
      });
    },

    openEditor ({id, url, type} = {}) {
      let win = Services.wm.getMostRecentBrowserWindow();
      if (xPref.get(this.PREF_OPENINWINDOW)) {
        win.openDialog(this.EDITOR_URI, (id || win.Math.random()) + ' - StyloaiX Editor', 'centerscreen,chrome,resizable,dialog=no', {id, url, type});
      } else {
        let appendUrl = '';
        if (id != undefined)
          appendUrl = '?id=' + id;
        else if (url)
          appendUrl = '?url=' + encodeURIComponent(url) + '&type=' + type;
        win.switchToTabHavingURI(this.EDITOR_URI + appendUrl, true);
      }
    },

    get CSSDIR () {
      let cssFolder = _uc.chromedir.clone();
      cssFolder.append('UserStyles');
      if (!cssFolder.exists() || !cssFolder.isDirectory())
        cssFolder.create(Ci.nsIFile.DIRECTORY_TYPE, 0664);
      Object.defineProperty(this, 'CSSDIR', { value: cssFolder });
      return cssFolder;
    },

    btnClasses: ['icon-white', 'icon-colored'],

    PREF_FIRSTRUN: 'userChromeJS.styloaix.firstRun',
    PREF_DISABLED: 'userChromeJS.styloaix.allDisabled',
    PREF_STYLESDISABLED: 'userChromeJS.styloaix.stylesDisabled',
    PREF_INSTANTCHECK: 'userChromeJS.styloaix.instantCheck',
    PREF_INSTANTPREVIEW: 'userChromeJS.styloaix.instantPreview',
    PREF_INSTANTINTERVAL: 'userChromeJS.styloaix.instantInterval',
    PREF_OPENINWINDOW: 'userChromeJS.styloaix.openInWindow',
    PREF_LINEWRAPPING: 'userChromeJS.styloaix.lineWrapping',
    PREF_MOZDOCUMENT: 'layout.css.moz-document.content.enabled',
    EDITOR_URI: 'chrome://userchromejs/content/styloaix/edit.xhtml',
    STYLESDIR: 'resource://userchromejs/' + (_uc.scriptsDir ? _uc.scriptsDir + '/' : '') + 'UserStyles/',

    STYLE: {
      url: Services.io.newURI('data:text/css;charset=UTF-8,' + encodeURIComponent(`
        @-moz-document url('${_uc.BROWSERCHROME}'), url('chrome://messenger/content/customizeToolbar.xhtml') {
          #styloaix-button.icon-white {
            list-style-image: url('chrome://userchromejs/content/styloaix/16w.png');
          }
          #styloaix-button.icon-colored {
            list-style-image: url('chrome://userchromejs/content/styloaix/16.png');
          }
        }
        @-moz-document url('${_uc.BROWSERCHROME}') {
          .styloaix-usersheet label:after {
            content:"US";
            color: blue;
          }
          .styloaix-agentsheet label:after {
            content:"AG";
            color: green;
          }
        }
      `)),
      type: _uc.sss.AUTHOR_SHEET
    },

    styles: new Map(),

    tbButtons: [],

    destroy: function () {
      xPref.unlock(this.PREF_MOZDOCUMENT);
      xPref.removeListener(this.prefListener);
      xPref.removeListener(this.prefListenerAll);
      CustomizableUI.destroyWidget('styloaix-button');
      this.tbButtons.forEach(b => b.remove());
      _uc.sss.unregisterSheet(this.STYLE.url, this.STYLE.type);
      this.toggleAll({disable: true});
      delete UC.styloaix;
    }
  }

  class DisabledSet extends Set {
    constructor (iterable) {
      super(iterable);
    }

    add (item) {
      let cache_add = Set.prototype.add.call(this, item);
      xPref.set(UC.styloaix.PREF_STYLESDISABLED, JSON.stringify([...this]));
      return cache_add;
    }

    delete (item) {
      let cache_delete = Set.prototype.delete.call(this, item);
      xPref.set(UC.styloaix.PREF_STYLESDISABLED, JSON.stringify([...this]));
      return cache_delete;
    }
  }

  class UserStyle {
    constructor(file) {
      this.type = file.leafName.endsWith('us.css') ?
                    _uc.sss.USER_SHEET :
                  file.leafName.endsWith('as.css') ?
                    _uc.sss.AGENT_SHEET :
                    _uc.sss.AUTHOR_SHEET;
      this.file = file;
      this.fullName = file.leafName;
      this.name = file.leafName.replace(/(?:\.(?:user|as|us))?\.css$/, '');
      this.url = Services.io.newURI(UC.styloaix.STYLESDIR + file.leafName);
      this.enabled = !UC.styloaix.disabledStyles.has(this.fullName);
      UC.styloaix.styles.set(this.fullName, this);
    }
    register () {
      _uc.sss.loadAndRegisterSheet(this.url, this.type);
      if (AppConstants.MOZ_APP_NAME === 'thunderbird') { // https://bugzilla.mozilla.org/show_bug.cgi?id=1702947
        this.unregister();
        _uc.sss.loadAndRegisterSheet(this.url, this.type);
      }
    }
    unregister () {
      _uc.sss.unregisterSheet(this.url, this.type);
    }
    reload () {
      if (this.enabled)
        this.unregister();
      UC.styloaix.toggleStyle(this, {aStatus: true});
    }
    delete () {
      if (Services.prompt.confirm(null, 'StyloaiX', 'Delete "' + this.fullName + '" permanently?')) {
        UC.styloaix.styles.delete(this.fullName);
        if (this.enabled)
          this.unregister();
        else
          UC.styloaix.disabledStyles.delete(this.fullName);
        this.file.remove(false);
      }
    }
  }

  UC.styloaix.init();

})()
