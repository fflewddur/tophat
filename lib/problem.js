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

/* exported TopHatProblemReporter */

const Gio = imports.gi.Gio;
const GObject = imports.gi.GObject;
const St = imports.gi.St;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;
const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

var TopHatProblemReporter = GObject.registerClass(
    class TopHatProblemReporter extends PanelMenu.Button {
        _init() {
            super._init(0.0, `${Me.metadata.name} Problem Reporter`, false);

            let icon = new St.Icon({
                gicon: new Gio.ThemedIcon({ name: 'dialog-error-symbolic' }),
                style_class: 'system-status-icon',
            });
            this.add_child(icon);

            let statusMenu = new PopupMenu.PopupMenuSection();
            let label = new St.Label({
                text: 'Something went wrong while starting TopHat',
                style_class: 'problem-header',
            });
            label.clutter_text.line_wrap = true;
            statusMenu.box.add_child(label);

            this.msg = new St.Label({
                text: '',
                style_class: 'problem-msg',
            });
            this.msg.clutter_text.line_wrap = true;
            statusMenu.box.add_child(this.msg);

            label = new St.Label({
                text: 'Error details',
                style_class: 'problem-details-header',
            });
            statusMenu.box.add_child(label);

            this.details = new St.Label({
                text: '',
                style_class: 'problem-details',
            });
            this.details.clutter_text.line_wrap = true;
            statusMenu.box.add_child(this.details);

            this.menu.addMenuItem(statusMenu);
        }

        setMessage(msg) {
            this.msg.text = msg;
        }

        setDetails(details) {
            this.details.text = details;
        }

        destroy() {
            super.destroy();
        }
    });
