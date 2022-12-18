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

/* exported init, fillPreferencesWindow, buildPrefsWidget */

const {Gdk, Gio, Gtk} = imports.gi;
const gtkVersion = Gtk.get_major_version();
const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Config = Me.imports.lib.config;
const _ = Config.Domain.gettext;

function init() {
    ExtensionUtils.initTranslations();
}

function fillPreferencesWindow(window) {
    const Adw = imports.gi.Adw;
    const configHandler = new Config.ConfigHandler();
    let page = new Adw.PreferencesPage({title: 'General', icon_name: 'preferences-system-symbolic'});
    window.add(page);

    let group = new Adw.PreferencesGroup({title: _('General')});
    page.add(group);

    let choices = new Gtk.StringList();
    choices.append(_('Left edge'));
    choices.append(_('Left'));
    choices.append(_('Center'));
    choices.append(_('Right'));
    choices.append(_('Right edge'));
    addComboRow(_('Position in panel'), choices, 'positionInPanel', group, configHandler);
    addColorRow(_('Meter color'), 'meterFGColor', group, configHandler);
    addActionRow(_('Show icons beside monitors'), 'show-icons', group, configHandler);
    addActionRow(_('Show animations'), 'show-animations', group, configHandler);

    group = new Adw.PreferencesGroup({title: _('Processor')});
    addActionRow(_('Show the CPU monitor'), 'show-cpu', group, configHandler);
    addActionRow(_('Show each core'), 'cpu-show-cores', group, configHandler);
    page.add(group);

    group = new Adw.PreferencesGroup({title: _('Memory')});
    addActionRow(_('Show the memory monitor'), 'show-mem', group, configHandler);
    page.add(group);

    group = new Adw.PreferencesGroup({title: _('Network')});
    addActionRow(_('Show the network monitor'), 'show-net', group, configHandler);
    choices = new Gtk.StringList();
    choices.append(_('Bytes'));
    choices.append(_('Bits'));
    addComboRow(_('Measurement unit'), choices, 'networkUnit', group, configHandler);
    page.add(group);

    group = new Adw.PreferencesGroup({title: _('Battery')});
    addActionRow(_('Show the battery monitor'), 'show-bat', group, configHandler);
    page.add(group);
    // window.set_default_size(300, 600);
}

function addActionRow(label, setting, group, configHandler) {
    const Adw = imports.gi.Adw;

    const row = new Adw.ActionRow({title: label});
    group.add(row);

    let toggle = new Gtk.Switch({
        active: configHandler.settings.get_boolean(setting),
        valign: Gtk.Align.CENTER,
    });
    configHandler.settings.bind(setting, toggle, 'active', Gio.SettingsBindFlags.DEFAULT);

    row.add_suffix(toggle);
    row.activatable_widget = toggle;
}

function addColorRow(label, setting, group, configHandler) {
    const Adw = imports.gi.Adw;

    const row = new Adw.ActionRow({title: label});
    group.add(row);

    const button = new Gtk.ColorButton();
    const rgba = new Gdk.RGBA();
    rgba.parse(configHandler[setting]);
    button.set_rgba(rgba);
    button.connect('color-set', widget => {
        configHandler[setting] = widget.get_rgba().to_string();
    });

    row.add_suffix(button);
    row.activatable_widget = button;
}

function addComboRow(label, choices, setting, group, configHandler) {
    const Adw = imports.gi.Adw;
    let row = new Adw.ComboRow({title: label, model: choices, selected: configHandler[setting]});

    row.connect('notify::selected', widget => {
        configHandler[setting] = widget.selected;
    });

    group.add(row);
}

// GTK versions for backwards-compatibility

function buildPrefsWidget() {
    // log(`[TopHat] GtkVersion: ${gtkVersion}`);
    if (gtkVersion === 3) {
        return buildPrefsWidget3();
    } else {
        return buildPrefsWidget4();
    }
}

function buildPrefsWidget3() {
    const configHandler = new Config.ConfigHandler();

    let frame = new Gtk.Box({
        orientation: Gtk.Orientation.VERTICAL,
        spacing: 24,
        border_width: 24,
    });

    let group = new Gtk.Box({
        orientation: Gtk.Orientation.VERTICAL,
        spacing: 12,
    });
    addPref3(buildHeader3(_('General')), group);
    let choices = [];
    choices.push(_('Left edge'));
    choices.push(_('Left'));
    choices.push(_('Center'));
    choices.push(_('Right'));
    choices.push(_('Right edge'));
    addPref3(buildDropDown3('positionInPanel', _('Position in panel'), choices, configHandler), group);
    addPref3(buildColorButton3('meterFGColor', _('Meter color'), configHandler), group);
    addPref3(buildSwitch3('show-icons', _('Show icons beside monitors'), configHandler.settings), group);
    addPref3(buildSwitch3('show-animations', _('Show animations'), configHandler.settings), group);
    frame.add(group);

    group = new Gtk.Box({
        orientation: Gtk.Orientation.VERTICAL,
        spacing: 12,
    });
    addPref3(buildHeader3(_('Processor')), group);
    addPref3(buildSwitch3('show-cpu', _('Show the CPU monitor'), configHandler.settings), group);
    addPref3(buildSwitch3('cpu-show-cores', _('Show each core'), configHandler.settings), group);
    frame.add(group);

    group = new Gtk.Box({
        orientation: Gtk.Orientation.VERTICAL,
        spacing: 12,
    });
    addPref3(buildHeader3(_('Memory')), group);
    addPref3(buildSwitch3('show-mem', _('Show the memory monitor'), configHandler.settings), group);
    frame.add(group);

    group = new Gtk.Box({
        orientation: Gtk.Orientation.VERTICAL,
        spacing: 12,
    });
    addPref3(buildHeader3(_('Network')), group);
    addPref3(buildSwitch3('show-net', _('Show the network monitor'), configHandler.settings), group);
    choices = [];
    choices.push(_('Bytes'));
    choices.push(_('Bits'));
    addPref3(buildDropDown3('networkUnit', _('Measurement unit'), choices, configHandler), group);
    frame.add(group);

    frame.connect('realize', () => {
        let window = frame.get_toplevel();
        window.resize(300, 200);
    });

    frame.show_all();

    return frame;
}

function buildSwitch3(key, text, settings) {
    let hbox = new Gtk.Box({orientation: Gtk.Orientation.HORIZONTAL, spacing: 12, margin_start: 12});
    let label = new Gtk.Label({label: text, xalign: 0});
    let toggle = new Gtk.Switch({active: settings.get_boolean(key)});

    toggle.connect('notify::active', function (widget) {
        settings.set_boolean(key, widget.active);
    });

    hbox.pack_start(label, true, true, 0);
    hbox.add(toggle);

    return hbox;
}

function buildColorButton3(key, text, configHandler) {
    const hbox = new Gtk.Box({orientation: Gtk.Orientation.HORIZONTAL, spacing: 12, margin_start: 12});
    const label = new Gtk.Label({label: text, xalign: 0});
    const button = new Gtk.ColorButton();
    const rgba = new Gdk.RGBA();
    rgba.parse(configHandler[key]);
    button.set_rgba(rgba);
    button.connect('color-set', widget => {
        configHandler[key] = widget.get_rgba().to_string();
    });

    hbox.pack_start(label, true, true, 0);
    hbox.add(button);

    return hbox;
}

function buildDropDown3(key, text, choices, configHandler) {
    let hbox = new Gtk.Box({orientation: Gtk.Orientation.HORIZONTAL, spacing: 12, margin_start: 12});
    let label = new Gtk.Label({label: text, xalign: 0});
    let dropdown = new Gtk.ComboBoxText();
    choices.forEach(choice => {
        dropdown.append_text(choice);
    });

    dropdown.set_active(configHandler[key]);
    dropdown.connect('changed', widget => {
        configHandler[key] = widget.active;
    });
    hbox.pack_start(label, true, true, 0);
    hbox.add(dropdown);

    return hbox;
}

function buildHeader3(text) {
    const label = new Gtk.Label({label: text, xalign: 0});
    return label;
}

function addPref3(widget, frame) {
    frame.add(widget);
}

function buildPrefsWidget4() {
    const configHandler = new Config.ConfigHandler();

    let frame = new Gtk.Box({
        orientation: Gtk.Orientation.VERTICAL,
        spacing: 24,
        margin_top: 24, margin_bottom: 24, margin_start: 24, margin_end: 24,
    });

    let group = new Gtk.Box({
        orientation: Gtk.Orientation.VERTICAL,
        spacing: 12,
    });
    addPref4(buildHeader4(_('General')), group);
    let choices = new Gtk.StringList();
    choices.append(_('Left edge'));
    choices.append(_('Left'));
    choices.append(_('Center'));
    choices.append(_('Right'));
    choices.append(_('Right edge'));
    addPref4(buildDropDown4('positionInPanel', _('Position in panel'), choices, configHandler), group);
    addPref4(buildColorButton4('meterFGColor', _('Meter color'), configHandler), group);
    addPref4(buildSwitch4('show-icons', _('Show icons beside monitors'), configHandler.settings), group);
    addPref4(buildSwitch4('show-animations', _('Show animations'), configHandler.settings), group);
    frame.append(group);

    group = new Gtk.Box({
        orientation: Gtk.Orientation.VERTICAL,
        spacing: 12,
    });
    addPref4(buildHeader4(_('Processor')), group);
    addPref4(buildSwitch4('show-cpu', _('Show the CPU monitor'), configHandler.settings), group);
    addPref4(buildSwitch4('cpu-show-cores', _('Show each core'), configHandler.settings), group);
    frame.append(group);

    group = new Gtk.Box({
        orientation: Gtk.Orientation.VERTICAL,
        spacing: 12,
    });
    addPref4(buildHeader4(_('Memory')), group);
    addPref4(buildSwitch4('show-mem', _('Show the memory monitor'), configHandler.settings), group);
    frame.append(group);

    group = new Gtk.Box({
        orientation: Gtk.Orientation.VERTICAL,
        spacing: 12,
    });
    addPref4(buildHeader4(_('Network')), group);
    addPref4(buildSwitch4('show-net', _('Show the network monitor'), configHandler.settings), group);
    choices = new Gtk.StringList();
    choices.append(_('Bytes'));
    choices.append(_('Bits'));
    addPref4(buildDropDown4('networkUnit', _('Measurement unit'), choices, configHandler), group);
    frame.append(group);

    frame.connect('realize', () => {
        let window = frame.get_root();
        window.default_width = 300;
        window.default_height = 200;
    });

    return frame;
}

function buildSwitch4(key, text, settings) {
    let hbox = new Gtk.Box({orientation: Gtk.Orientation.HORIZONTAL, spacing: 12, margin_start: 12});
    let label = new Gtk.Label({label: text, xalign: 0, hexpand: 1});
    let toggle = new Gtk.Switch({active: settings.get_boolean(key)});

    toggle.connect('notify::active', function (widget) {
        settings.set_boolean(key, widget.active);
    });

    hbox.append(label);
    hbox.append(toggle);

    return hbox;
}

function buildColorButton4(key, text, configHandler) {
    const hbox = new Gtk.Box({orientation: Gtk.Orientation.HORIZONTAL, spacing: 12, margin_start: 12});
    const label = new Gtk.Label({label: text, xalign: 0, hexpand: 1});
    const button = new Gtk.ColorButton();
    const rgba = new Gdk.RGBA();
    rgba.parse(configHandler[key]);
    button.set_rgba(rgba);
    button.connect('color-set', widget => {
        configHandler[key] = widget.get_rgba().to_string();
    });

    hbox.append(label);
    hbox.append(button);

    return hbox;
}

function buildDropDown4(key, text, choices, configHandler) {
    let hbox = new Gtk.Box({orientation: Gtk.Orientation.HORIZONTAL, spacing: 12, margin_start: 12});
    let label = new Gtk.Label({label: text, xalign: 0, hexpand: 1});
    let dropdown = new Gtk.DropDown({model: choices});

    dropdown.set_selected(configHandler[key]);
    dropdown.connect('notify::selected', widget => {
        configHandler[key] = widget.selected;
    });
    hbox.append(label);
    hbox.append(dropdown);

    return hbox;
}

function buildHeader4(text) {
    const label = new Gtk.Label({label: text, xalign: 0, hexpand: 1});
    return label;
}

function addPref4(widget, frame) {
    frame.append(widget);
}
