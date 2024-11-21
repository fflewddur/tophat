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

import Gdk from 'gi://Gdk';
import Gtk from 'gi://Gtk';
import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import {
  ExtensionPreferences,
  gettext as _,
} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
// @ts-expect-error "Module exists"
import * as Config from 'resource:///org/gnome/Shell/Extensions/js/misc/config.js';
const GnomeMajorVer = parseInt(Config.PACKAGE_VERSION.split('.')[0]);

export default class TopHatPrefs extends ExtensionPreferences {
  private gsettings?: Gio.Settings;

  fillPreferencesWindow(window: Adw.PreferencesWindow) {
    return new Promise<void>((resolve) => {
      this.gsettings = this.getSettings();

      window.add(this.buildGeneralPage());
      window.add(this.buildCpuPage());
      window.add(this.buildMemPage());
      window.add(this.buildDiskPage());
      window.add(this.buildNetPage());

      resolve();
    });
  }

  private buildGeneralPage() {
    const page = new Adw.PreferencesPage({
      title: _('General'),
      // iconName: 'dialog-information-symbolic',
    });

    const group = new Adw.PreferencesGroup({ title: _('General') });
    page.add(group);

    // Position in panel
    let choices = new Gtk.StringList();
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

    // Refresh speed
    choices = new Gtk.StringList();
    choices.append(_('Slow'));
    choices.append(_('Medium'));
    choices.append(_('Fast'));
    this.addComboRow(_('Refresh speed'), choices, 'refresh-rate', group);

    // Meter color
    let control: Gtk.Switch | null;
    control = null;

    if (GnomeMajorVer >= 47) {
      const accentRow = this.addActionRow(
        _('Use system accent color'),
        'use-system-accent',
        group
      );
      control = accentRow.get_activatable_widget() as Gtk.Switch;
    }
    this.addColorRow(_('Meter color'), 'meter-fg-color', group, control);

    // Show icons
    this.addActionRow(_('Show icons beside monitors'), 'show-icons', group);

    return page;
  }

  private buildCpuPage() {
    const page = new Adw.PreferencesPage({
      title: _('CPU'),
    });

    const group = new Adw.PreferencesGroup({ title: _('CPU') });
    page.add(group);

    // Enable
    this.addActionRow(_('Show the CPU monitor'), 'show-cpu', group);

    // Visualization
    const choices = new Gtk.StringList();
    choices.append(_('Usage meter'));
    choices.append(_('Numeric value'));
    choices.append(_('Both meter and value'));
    this.addComboRow(_('Show as'), choices, 'cpu-display', group);

    // Show each core
    this.addActionRow(_('Show each core'), 'cpu-show-cores', group);

    return page;
  }

  private buildMemPage() {
    const page = new Adw.PreferencesPage({
      title: _('Memory'),
    });

    const group = new Adw.PreferencesGroup({ title: _('Memory') });
    page.add(group);

    // Enable
    this.addActionRow(_('Show the memory monitor'), 'show-mem', group);

    // Visualization
    const choices = new Gtk.StringList();
    choices.append(_('Usage meter'));
    choices.append(_('Numeric value'));
    choices.append(_('Both meter and value'));
    this.addComboRow(_('Show as'), choices, 'mem-display', group);

    return page;
  }

  private buildDiskPage() {
    const page = new Adw.PreferencesPage({
      title: _('Disk'),
    });

    const group = new Adw.PreferencesGroup({ title: _('Disk') });
    page.add(group);

    // Enable
    this.addActionRow(_('Show the disk monitor'), 'show-disk', group);

    return page;
  }

  private buildNetPage() {
    const page = new Adw.PreferencesPage({
      title: _('Network'),
    });

    const group = new Adw.PreferencesGroup({ title: _('Network') });
    page.add(group);

    // Enable
    this.addActionRow(_('Show the network monitor'), 'show-net', group);

    // Bits or bytes?
    const choices = new Gtk.StringList();
    choices.append(_('Bytes'));
    choices.append(_('Bits'));
    this.addComboRow(
      _('Measurement unit'),
      choices,
      'network-usage-unit',
      group
    );

    return page;
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
    return row;
  }

  private addColorRow(
    label: string,
    setting: string,
    group: Adw.PreferencesGroup,
    control: Gtk.Switch | null
  ) {
    const row = new Adw.ActionRow({ title: label });
    group.add(row);

    const button = new Gtk.ColorButton();
    const color = this.gsettings?.get_string(setting);
    if (color) {
      const rgba = new Gdk.RGBA();
      rgba.parse(color);
      button.set_rgba(rgba);
    }

    if (control) {
      row.set_sensitive(!control.active);
      control.connect('notify::active', (w: Gtk.Switch) => {
        row.set_sensitive(!w.active);
        console.log(`notify::active w.active: ${w.active}`);
      });
    }

    row.add_suffix(button);
    row.activatable_widget = button;
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
