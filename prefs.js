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

const { Adw, Gio, Gtk } = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;

// eslint-disable-next-line no-unused-vars
function init() {
}

// eslint-disable-next-line no-unused-vars
function fillPreferencesWindow(window) {
    // Create a preferences page and group
    const page = new Adw.PreferencesPage();

    let group = new Adw.PreferencesGroup();
    page.add(group);
    addRow('Show CPU monitor', 'show-cpu', group);
    addRow('Show memory monitor', 'show-mem', group);
    addRow('Show network monitor', 'show-net', group);

    group = new Adw.PreferencesGroup();
    page.add(group);
    addRow('Show icons beside monitors', 'show-icons', group);

    // Add our page to the window
    window.add(page);
}

function addRow(label, setting, group) {
    const settings = ExtensionUtils.getSettings('org.gnome.shell.extensions.tophat');
    const row = new Adw.ActionRow({ title: label });
    group.add(row);

    let toggle = new Gtk.Switch({
        active: settings.get_boolean('show-icons'),
        valign: Gtk.Align.CENTER,
    });
    settings.bind(
        setting,
        toggle,
        'active',
        Gio.SettingsBindFlags.DEFAULT
    );

    row.add_suffix(toggle);
    row.activatable_widget = toggle;
}
