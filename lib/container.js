'use strict';

// Copyright (C) 2022 Todd Kulesza <todd@dropline.net>

// This file is part of TopHat.

// TopHat is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

// TopHat is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU General Public License for more details.

// You should have received a copy of the GNU General Public License
// along with TopHat. If not, see <https://www.gnu.org/licenses/>.

/* exported TopHatContainer */

const {GObject, St} = imports.gi;
const PanelMenu = imports.ui.panelMenu;
const Main = imports.ui.main;
const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Config = Me.imports.lib.config;
const _ = Config.Domain.gettext;

var TopHatContainer = GObject.registerClass({
    Signals: {'menu-set': {}},
}, class TopHatContainer extends PanelMenu.Button {
    _init(menuAlignment, nameText, dontCreateMenu) {
        super._init({
            menuAlignment,
            nameText,
            dontCreateMenu,
            reactive: true,
            can_focus: true,
            track_hover: true,
        });
        this.monitors = [];
        this.box = new St.BoxLayout();
        this.add_child(this.box);
        this.remove_style_class_name('panel-button');
    }

    addMonitor(monitor) {
        // log(`TopHat addMonitor(${monitor.name})`);
        this.monitors.push(monitor);
        this.box.add_child(monitor);
    }

    setMenu(menu) {
        if (this.menu) {
            this.menu.destroy();
        }

        this.menu = menu;
        if (this.menu) {
            this.menu.actor.add_style_class_name('panel-menu');
            this.menu.connect('open-state-changed', this._onOpenStateChanged.bind(this));
            this.menu.actor.connect('key-press-event', this._onMenuKeyPress.bind(this));

            Main.uiGroup.add_actor(this.menu.actor);
            this.menu.actor.hide();
        }
        this.emit('menu-set');
    }

    _onDestroy() {
        this.monitors.forEach(monitor => {
            monitor.destroy();
        });
        super._onDestroy();
    }
});
