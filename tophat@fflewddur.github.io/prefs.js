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

import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences, gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import * as Config from './lib/config.js';
import * as Shared from './lib/shared.js';

export default class TopHatPrefs extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const configHandler = new Config.ConfigHandler(this.getSettings(), this.metadata);
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
        this.addComboRow(_('Position in panel'), choices, 'positionInPanel', group, configHandler);
        choices = new Gtk.StringList();
        choices.append(_('Slow'));
        choices.append(_('Medium'));
        choices.append(_('Fast'));
        this.addComboRow(_('Refresh speed'), choices, 'refreshRate', group, configHandler);
        this.addColorRow(_('Meter color'), 'meterFGColor', group, configHandler);
        this.addColorRow(_('Meter secondary color'), 'meterFGSecondayColor', group, configHandler);
        this.addActionRow(_('Show icons beside monitors'), 'show-icons', group, configHandler);
        this.addActionRow(_("Use adwaita's built-in icons"), 'use-adwaita-icon', group, configHandler);
        this.addActionRow(_('Show animations'), 'show-animations', group, configHandler);

        group = new Adw.PreferencesGroup({title: _('Processor')});
        this.addActionRow(_('Show the CPU monitor'), 'show-cpu', group, configHandler);
        choices = new Gtk.StringList();
        choices.append(_('Usage meter'));
        choices.append(_('Numeric value'));
        choices.append(_('Both meter and value'));
        this.addComboRow(_('Show as'), choices, 'cpuDisplay', group, configHandler);
        this.addActionRow(_('Show each core'), 'cpu-show-cores', group, configHandler);
        page.add(group);

        group = new Adw.PreferencesGroup({title: _('Memory')});
        this.addActionRow(_('Show the memory monitor'), 'show-mem', group, configHandler);
        choices = new Gtk.StringList();
        choices.append(_('Usage meter'));
        choices.append(_('Numeric value'));
        choices.append(_('Both meter and value'));
        this.addComboRow(_('Show as'), choices, 'memDisplay', group, configHandler);
        page.add(group);

        group = new Adw.PreferencesGroup({title: _('Disk')});
        this.addActionRow(_('Show the disk monitor'), 'show-disk', group, configHandler);
        choices = new Gtk.StringList();
        choices.append(_('Available storage'));
        choices.append(_('Disk activity'));
        choices.append(_('Storage and activity'));
        this.addComboRow(_('Monitor shows'), choices, 'diskMonitorMode', group, configHandler);
        choices = new Gtk.StringList();
        choices.append(_('Usage meter'));
        choices.append(_('Numeric value'));
        choices.append(_('Both meter and value'));
        this.addComboRow(_('Show available storage as'), choices, 'diskDisplay', group, configHandler);
        choices = new Gtk.StringList();
        let parts = Shared.getPartitions();
        parts.forEach(p => {
            choices.append(p);
        });
        configHandler.setPartitions(choices);
        this.addComboRow(_('Filesystem to monitor'), choices, 'mountToMonitor', group, configHandler);
        page.add(group);

        group = new Adw.PreferencesGroup({title: _('Network')});
        this.addActionRow(_('Show the network monitor'), 'show-net', group, configHandler);
        choices = new Gtk.StringList();
        choices.append(_('Bytes'));
        choices.append(_('Bits'));
        this.addComboRow(_('Measurement unit'), choices, 'networkUnit', group, configHandler);
        page.add(group);

        group = new Adw.PreferencesGroup({ title: _('Battery') });
        this.addActionRow(_('Show the battery monitor'), 'show-bat', group, configHandler);
        page.add(group);

        window.set_default_size(400, 0);
    }

    addActionRow(label, setting, group, configHandler) {
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

    addColorRow(label, setting, group, configHandler) {
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

    addComboRow(label, choices, setting, group, configHandler) {
        let row = new Adw.ComboRow({title: label, model: choices, selected: configHandler[setting]});

        row.connect('notify::selected', widget => {
            configHandler[setting] = widget.selected;
        });

        group.add(row);
    }
}
