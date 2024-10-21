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

import Gtk from 'gi://Gtk';
import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import {
  ExtensionPreferences,
  gettext as _,
} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class TopHatPrefs extends ExtensionPreferences {
  private gsettings?: Gio.Settings;

  fillPreferencesWindow(window: Adw.PreferencesWindow) {
    this.gsettings = this.getSettings();

    const page = new Adw.PreferencesPage({
      title: _('General'),
      iconName: 'dialog-information-symbolic',
    });

    const group = new Adw.PreferencesGroup({ title: _('General') });
    page.add(group);

    const choices = new Gtk.StringList();
    choices.append(_('Left edge'));
    choices.append(_('Left'));
    choices.append(_('Center'));
    choices.append(_('Right'));
    choices.append(_('Right edge'));
    this.addComboRow(
      _('Position in panel'),
      choices,
      'position-in-panel',
      group
    );

    this.addActionRow(_('Show icons beside monitors'), 'show-icons', group);

    window.add(page);
  }

  private addActionRow(
    label: string,
    setting: string,
    group: Adw.PreferencesGroup
  ) {
    const row = new Adw.ActionRow({ title: label });
    group.add(row);

    const toggle = new Gtk.Switch({
      active: this.gsettings?.get_boolean(setting),
      valign: Gtk.Align.CENTER,
    });
    this.gsettings?.bind(
      setting,
      toggle,
      'active',
      Gio.SettingsBindFlags.DEFAULT
    );
    row.add_suffix(toggle);
    row.activatable_widget = toggle;
  }

  private addComboRow(
    label: string,
    choices: Gtk.StringList,
    setting: string,
    group: Adw.PreferencesGroup
  ) {
    const selected = this.gsettings?.get_enum(setting);
    const row = new Adw.ComboRow({
      title: label,
      model: choices,
      selected: selected,
    });

    row.connect('notify::selected', (widget) => {
      this.gsettings?.set_enum(setting, widget.selected);
    });

    group.add(row);
  }
}
