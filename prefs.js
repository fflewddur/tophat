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

let Adw;
try {
    Adw = imports.gi.Adw;
} catch (e) {
    log('[TopHat] Fallback to GTK for preferences');
}
const {Gio, Gtk} = imports.gi;
const gtkVersion = Gtk.get_major_version();
const ExtensionUtils = imports.misc.extensionUtils;

// eslint-disable-next-line no-unused-vars
function init() {
}

// eslint-disable-next-line no-unused-vars
function fillPreferencesWindow(window) {
    // Create a preferences page and group
    const settings = ExtensionUtils.getSettings('org.gnome.shell.extensions.tophat');
    const page = new Adw.PreferencesPage();

    let group = new Adw.PreferencesGroup();
    page.add(group);
    addRow('Show CPU monitor', 'show-cpu', group, settings);
    addRow('Show memory monitor', 'show-mem', group, settings);
    addRow('Show network monitor', 'show-net', group, settings);

    group = new Adw.PreferencesGroup();
    page.add(group);
    addRow('Show icons beside monitors', 'show-icons', group, settings);

    // Add our page to the window
    window.add(page);
    window.set_default_size(600, 360);
}

function addRow(label, setting, group, settings) {
    const row = new Adw.ActionRow({ title: label });
    group.add(row);

    let toggle = new Gtk.Switch({
        active: settings.get_boolean('show-icons'),
        valign: Gtk.Align.CENTER,
    });
    settings.bind(setting, toggle, 'active', Gio.SettingsBindFlags.DEFAULT);

    row.add_suffix(toggle);
    row.activatable_widget = toggle;
}

// GTK versions for backwards-compatibility

// eslint-disable-next-line no-unused-vars
function buildPrefsWidget() {
    log(`[TopHat] GtkVersion: ${gtkVersion}`);
    if (gtkVersion === 3) {
        return buildPrefsWidget3();
    } else {
        return buildPrefsWidget4();
    }
}

function buildPrefsWidget3() {
    const settings = ExtensionUtils.getSettings('org.gnome.shell.extensions.tophat');

    let frame = new Gtk.Box({
        orientation: Gtk.Orientation.VERTICAL,
        spacing: 12,
        border_width: 12,
    });

    addPref3(buildSwitch3('show-cpu', 'Show the CPU monitor', settings), frame);
    addPref3(buildSwitch3('show-mem', 'Show the memory monitor', settings), frame);
    addPref3(buildSwitch3('show-net', 'Show the network monitor', settings), frame);

    addPref3(buildSwitch3('show-icons', 'Show icons beside monitors', settings), frame);

    frame.connect('realize', () => {
        let window = frame.get_toplevel();
        window.resize(300, 200);
    });

    frame.show_all();

    return frame;
}

function buildPrefsWidget4() {
    const settings = ExtensionUtils.getSettings('org.gnome.shell.extensions.tophat');

    let frame = new Gtk.Box({
        orientation: Gtk.Orientation.VERTICAL,
        spacing: 12,
        margin_top: 12,
        margin_bottom: 12,
        margin_start: 12,
        margin_end: 12,
    });

    addPref4(buildSwitch4('show-cpu', 'Show the CPU monitor', settings), frame);
    addPref4(buildSwitch4('show-mem', 'Show the memory monitor', settings), frame);
    addPref4(buildSwitch4('show-net', 'Show the network monitor', settings), frame);

    addPref4(buildSwitch4('show-icons', 'Show icons beside monitors', settings), frame);

    frame.connect('realize', () => {
        let window = frame.get_root();
        window.default_width = 300;
        window.default_height = 200;
    });

    return frame;
}

function buildSwitch3(key, text, settings) {
    let hbox = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 12 });
    let label = new Gtk.Label({ label: text, xalign: 0 });
    let toggle = new Gtk.Switch({ active: settings.get_boolean(key) });

    toggle.connect('notify::active', function (widget) {
        settings.set_boolean(key, widget.active);
    });

    hbox.pack_start(label, true, true, 0);
    hbox.add(toggle);

    return hbox;
}

function buildSwitch4(key, text, settings) {
    let hbox = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 12 });
    let label = new Gtk.Label({ label: text, xalign: 0, hexpand: 1 });
    let toggle = new Gtk.Switch({ active: settings.get_boolean(key) });

    toggle.connect('notify::active', function (widget) {
        settings.set_boolean(key, widget.active);
    });

    hbox.append(label);
    hbox.append(toggle);

    return hbox;
}

function addPref3(widget, frame) {
    frame.add(widget);
}

function addPref4(widget, frame) {
    frame.append(widget);
}
