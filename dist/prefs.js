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
import NM from 'gi://NM';
import { ExtensionPreferences, gettext as _, } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
// @ts-expect-error "Module exists"
import * as Config from 'resource:///org/gnome/Shell/Extensions/js/misc/config.js';
import { readFileSystems } from './helpers.js';
const GnomeMajorVer = parseInt(Config.PACKAGE_VERSION.split('.')[0]);
export default class TopHatPrefs extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        return new Promise((resolve) => {
            this.loadIconTheme();
            window.add(this.buildGeneralPage());
            window.add(this.buildCpuPage());
            window.add(this.buildMemPage());
            window.add(this.buildDiskPage());
            window.add(this.buildNetPage());
            window.set_default_size(750, 475);
            resolve();
        });
    }
    loadIconTheme() {
        const display = Gdk.Display.get_default();
        if (!display) {
            console.error('[TopHat] Could not connect to default Gdk.Display');
            return;
        }
        const iconTheme = Gtk.IconTheme.get_for_display(display);
        const path = `${this.metadata.dir.get_path()}/icons`;
        if (!iconTheme.get_search_path()?.includes(path)) {
            iconTheme.add_search_path(path);
        }
    }
    buildGeneralPage() {
        const page = new Adw.PreferencesPage({
            title: _('General'),
            iconName: 'preferences-system-symbolic',
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
        this.addComboRow(_('Position in panel'), choices, 'position-in-panel', group);
        // Refresh speed
        choices = new Gtk.StringList();
        choices.append(_('Slow'));
        choices.append(_('Medium'));
        choices.append(_('Fast'));
        this.addComboRow(_('Refresh speed'), choices, 'refresh-rate', group);
        // Meter color
        let control;
        control = null;
        if (GnomeMajorVer >= 47) {
            const accentRow = this.addActionRow(_('Use system accent color'), 'use-system-accent', group);
            control = accentRow.get_activatable_widget();
        }
        this.addColorRow(_('Meter color'), 'meter-fg-color', group, control);
        // Show icons
        this.addActionRow(_('Show icons beside monitors'), 'show-icons', group);
        // Show action buttons in menus
        this.addActionRow(_('Show action buttons in menus'), 'show-menu-actions', group);
        // Group top processes by name
        this.addActionRow(_('Group top processes by command'), 'group-procs', group);
        return page;
    }
    buildCpuPage() {
        const page = new Adw.PreferencesPage({
            title: _('CPU'),
            iconName: 'cpu-icon-symbolic',
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
        // Sort cores by usage
        this.addActionRow(_('Sort cores by usage'), 'cpu-sort-cores', group);
        // Normalize process CPU usage
        this.addActionRow(_('Normalize per-process CPU usage by CPU cores'), 'cpu-normalize-proc-use', group);
        return page;
    }
    buildMemPage() {
        const page = new Adw.PreferencesPage({
            title: _('Memory'),
            iconName: 'mem-icon-symbolic',
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
        // Absolute units
        this.addActionRow(_('Show usage in GB'), 'mem-abs-units', group);
        return page;
    }
    buildDiskPage() {
        const page = new Adw.PreferencesPage({
            title: _('Disk'),
            iconName: 'disk-icon-symbolic',
        });
        let group = new Adw.PreferencesGroup({ title: _('Disk activity') });
        page.add(group);
        // Enable
        this.addActionRow(_('Show the disk activity monitor'), 'show-disk', group);
        group = new Adw.PreferencesGroup({ title: _('Filesystem usage') });
        page.add(group);
        // Enable
        this.addActionRow(_('Show the filesystem monitor'), 'show-fs', group);
        // Visualization
        const choices = new Gtk.StringList();
        choices.append(_('Usage meter'));
        choices.append(_('Numeric value'));
        choices.append(_('Both meter and value'));
        this.addComboRow(_('Show as'), choices, 'fs-display', group);
        // Filesystem mount to monitor in the topbar
        const fsMountChoices = new Gtk.StringList();
        const monitorMountRow = this.addComboRow(_('Filesystem to monitor in topbar'), fsMountChoices, 'mount-to-monitor', group, false);
        // Filesystem mounts to monitor in the menu
        const row = new Adw.ExpanderRow({
            title: _('Filesystems to show in menu'),
        });
        group.add(row);
        // Find available filesystems and add them to our widgets
        readFileSystems()
            .then((filesystems) => {
            const settings = this.getSettings();
            const toHide = settings
                .get_string('fs-hide-in-menu')
                .split(';')
                .filter((s) => {
                return s.length > 0;
            });
            const mountToMonitor = settings.get_string('mount-to-monitor');
            fsMountChoices.append(_('Automatic'));
            let i = 1;
            for (const fs of filesystems) {
                fsMountChoices.append(fs.mount);
                if (mountToMonitor === fs.mount) {
                    monitorMountRow.set_selected(i);
                }
                const fsRow = new Adw.ActionRow({ title: fs.mount });
                const toggle = new Gtk.Switch({
                    active: !toHide.includes(fs.mount),
                    valign: Gtk.Align.CENTER,
                });
                //@ts-expect-error does not exist
                toggle.fs = fs.mount;
                toggle.connect('notify::active', (w) => {
                    const toHide = settings
                        .get_string('fs-hide-in-menu')
                        .split(';')
                        .filter((s) => {
                        return s.length > 0;
                    });
                    if (w.get_active() && toHide.includes(w.fs)) {
                        const i = toHide.indexOf(w.fs);
                        if (i > -1) {
                            toHide.splice(i, 1);
                        }
                    }
                    else if (!w.get_active() && !toHide.includes(w.fs)) {
                        toHide.push(w.fs);
                    }
                    settings.set_string('fs-hide-in-menu', toHide
                        .filter((s) => {
                        return s.length > 0;
                    })
                        .join(';'));
                });
                fsRow.add_suffix(toggle);
                row.add_row(fsRow);
                i++;
            }
        })
            .catch((err) => {
            console.error(`[TopHat] Error building filesystem preference page: ${err}`);
        });
        return page;
    }
    buildNetPage() {
        const page = new Adw.PreferencesPage({
            title: _('Network'),
            iconName: 'net-icon-symbolic',
        });
        const group = new Adw.PreferencesGroup({ title: _('Network') });
        page.add(group);
        // Enable network monitor
        this.addActionRow(_('Show the network monitor'), 'show-net', group);
        // Select network device
        const netDevChoices = new Gtk.StringList();
        netDevChoices.append(_('Automatic'));
        NM.Client.new_async(null, (obj, result) => {
            if (!obj) {
                console.error('[TopHat] obj is null');
                return;
            }
            const client = NM.Client.new_finish(result);
            if (!client) {
                console.error('[TopHat] client is null');
                return;
            }
            const devices = client.get_devices();
            for (const d of devices) {
                const iface = d.get_iface();
                const dt = d.get_device_type();
                if (dt !== NM.DeviceType.LOOPBACK) {
                    netDevChoices.append(iface);
                }
            }
            this.addComboRow(_('Network device'), netDevChoices, 'network-device', group, false);
        });
        // Bits or bytes?
        const choices = new Gtk.StringList();
        choices.append(_('Bytes'));
        choices.append(_('Bits'));
        this.addComboRow(_('Measurement unit'), choices, 'network-usage-unit', group);
        return page;
    }
    addActionRow(label, setting, group) {
        const settings = this.getSettings();
        const row = new Adw.ActionRow({ title: label });
        group.add(row);
        const toggle = new Gtk.Switch({
            active: settings.get_boolean(setting),
            valign: Gtk.Align.CENTER,
        });
        settings.bind(setting, toggle, 'active', Gio.SettingsBindFlags.DEFAULT);
        row.add_suffix(toggle);
        row.activatable_widget = toggle;
        return row;
    }
    addColorRow(label, setting, group, control) {
        const settings = this.getSettings();
        const row = new Adw.ActionRow({ title: label });
        group.add(row);
        const button = new Gtk.ColorButton();
        const color = settings.get_string(setting);
        if (color) {
            const rgba = new Gdk.RGBA();
            rgba.parse(color);
            button.set_rgba(rgba);
        }
        button.connect('color-set', (w) => {
            settings.set_string('meter-fg-color', w.get_rgba().to_string());
        });
        if (control) {
            row.set_sensitive(!control.active);
            control.connect('notify::active', (w) => {
                row.set_sensitive(!w.active);
            });
        }
        row.add_suffix(button);
        row.activatable_widget = button;
    }
    addComboRow(label, choices, setting, group, settingIsEnum = true) {
        const settings = this.getSettings();
        let selected = 0;
        if (settingIsEnum) {
            selected = settings.get_enum(setting);
        }
        else {
            const selectedVal = settings.get_string(setting);
            for (let i = 0; choices && i < choices.get_n_items(); i++) {
                if (selectedVal === choices.get_string(i)) {
                    selected = i;
                }
            }
        }
        const row = new Adw.ComboRow({
            title: label,
            model: choices,
            selected: selected,
        });
        row.connect('notify::selected', (widget) => {
            if (settingIsEnum) {
                settings.set_enum(setting, widget.selected);
            }
            else {
                const item = widget.selectedItem;
                settings.set_string(setting, item.string);
            }
        });
        group.add(row);
        return row;
    }
}
