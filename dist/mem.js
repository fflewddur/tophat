// Copyright (C) 2024 Todd Kulesza <todd@dropline.net>
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
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import St from 'gi://St';
import { gettext as _, } from 'resource:///org/gnome/shell/extensions/extension.js';
import { CapacityBar } from './capacity.js';
import { bytesToHumanString, DisplayType, GBytesToHumanString, getDisplayTypeSetting, } from './helpers.js';
import { HistoryChart } from './history.js';
import { Orientation } from './meter.js';
import { TopHatMonitor, MeterNoVal, NumTopProcs, TopProc } from './monitor.js';
export const MemMonitor = GObject.registerClass(class MemMonitor extends TopHatMonitor {
    usage;
    menuMemUsage;
    menuMemCap;
    menuMemSize;
    menuSwapUsage;
    menuSwapCap;
    menuSwapSize;
    topProcs;
    displayType;
    absUnits;
    constructor(metadata, gsettings) {
        super('Memory Monitor', metadata, gsettings);
        const gicon = Gio.icon_new_for_string(`${this.metadata.path}/icons/hicolor/scalable/actions/mem-icon-symbolic.svg`);
        this.icon.set_gicon(gicon);
        this.usage = new St.Label({
            text: MeterNoVal,
            style_class: 'tophat-panel-usage',
            y_align: Clutter.ActorAlign.CENTER,
        });
        this.add_child(this.usage);
        this.meter.setNumBars(1);
        this.meter.setOrientation(Orientation.Vertical);
        this.add_child(this.meter);
        this.menuMemUsage = new St.Label();
        this.menuMemCap = new CapacityBar();
        this.menuMemSize = new St.Label();
        this.menuSwapUsage = new St.Label();
        this.menuSwapCap = new CapacityBar();
        this.menuSwapSize = new St.Label();
        this.historyChart = new HistoryChart();
        this.topProcs = new Array(NumTopProcs);
        for (let i = 0; i < NumTopProcs; i++) {
            this.topProcs[i] = new TopProc();
        }
        this.displayType = this.updateDisplayType();
        let id = this.gsettings.connect('changed::mem-display', () => {
            this.updateDisplayType();
        });
        this.settingsSignals.push(id);
        this.absUnits = gsettings.get_boolean('mem-abs-units');
        id = this.gsettings.connect('changed::mem-abs-units', (settings) => {
            this.absUnits = settings.get_boolean('mem-abs-units');
            this.vitals?.notify('ram-usage');
            this.vitals?.notify('ram-size-free');
        });
        this.settingsSignals.push(id);
        this.visible = gsettings.get_boolean('show-mem');
        id = this.gsettings.connect('changed::show-mem', (settings) => {
            this.visible = settings.get_boolean('show-mem');
        });
        this.settingsSignals.push(id);
        this.buildMenu();
        this.addMenuButtons();
        this.updateColor();
    }
    updateDisplayType() {
        this.displayType = getDisplayTypeSetting(this.gsettings, 'mem-display');
        if (this.displayType === DisplayType.Both) {
            this.usage.show();
            this.meter.show();
        }
        else {
            if (this.displayType === DisplayType.Chart) {
                this.usage.hide();
                this.meter.show();
            }
            else {
                this.usage.show();
                this.meter.hide();
            }
        }
        return this.displayType;
    }
    buildMenu() {
        let label = new St.Label({
            text: _('Memory usage'),
            style_class: 'tophat-menu-header',
        });
        this.addMenuRow(label, 0, 2, 1);
        label = new St.Label({
            text: _('RAM used:'),
            style_class: 'tophat-menu-label',
        });
        this.addMenuRow(label, 0, 1, 1);
        this.menuMemUsage.text = MeterNoVal;
        this.menuMemUsage.add_style_class_name('tophat-menu-value');
        this.addMenuRow(this.menuMemUsage, 1, 1, 1);
        this.addMenuRow(this.menuMemCap, 0, 2, 1);
        this.menuMemSize.text = _(`size ${MeterNoVal}`);
        this.menuMemSize.add_style_class_name('tophat-menu-details align-right tophat-menu-section-end');
        this.addMenuRow(this.menuMemSize, 0, 2, 1);
        label = new St.Label({
            text: _('Swap used:'),
            style_class: 'tophat-menu-label',
        });
        this.addMenuRow(label, 0, 1, 1);
        this.menuSwapUsage.text = MeterNoVal;
        this.menuSwapUsage.add_style_class_name('tophat-menu-value');
        this.addMenuRow(this.menuSwapUsage, 1, 1, 1);
        this.addMenuRow(this.menuSwapCap, 0, 2, 1);
        this.menuSwapSize.text = _(`size ${MeterNoVal}`);
        this.menuSwapSize.add_style_class_name('tophat-menu-details align-right tophat-menu-section-end');
        this.addMenuRow(this.menuSwapSize, 0, 2, 1);
        if (this.historyChart) {
            this.addMenuRow(this.historyChart, 0, 2, 1);
        }
        label = new St.Label({
            text: _('Top processes'),
            style_class: 'tophat-menu-header',
        });
        this.addMenuRow(label, 0, 2, 1);
        for (let i = 0; i < NumTopProcs; i++) {
            this.topProcs[i].cmd.set_style_class_name('tophat-menu-cmd-name');
            this.addMenuRow(this.topProcs[i].cmd, 0, 1, 1);
            this.topProcs[i].setTooltip();
            this.topProcs[i].usage.set_style_class_name('tophat-menu-cmd-usage');
            if (i === NumTopProcs - 1) {
                this.topProcs[i].usage.add_style_class_name('tophat-menu-section-end');
            }
            this.addMenuRow(this.topProcs[i].usage, 1, 1, 1);
        }
    }
    bindVitals(vitals) {
        super.bindVitals(vitals);
        let id = vitals.connect('notify::ram-size', () => {
            // console.log(`ram-size: ${vitals.ram_size}`);
            const total = GBytesToHumanString(vitals.ram_size);
            const free = GBytesToHumanString(vitals.ram_size_free);
            this.menuMemSize.text = _(`${free} available of ${total}`);
        });
        this.vitalsSignals.push(id);
        id = vitals.connect('notify::ram-size-free', () => {
            // console.log(`ram-size-free: ${vitals.ram_size_free}`);
            const total = GBytesToHumanString(vitals.ram_size);
            const free = GBytesToHumanString(vitals.ram_size_free);
            this.menuMemSize.text = _(`${free} available of ${total}`);
            if (this.absUnits) {
                const used = GBytesToHumanString(vitals.ram_size - vitals.ram_size_free);
                this.usage.text = used;
            }
        });
        this.vitalsSignals.push(id);
        id = vitals.connect('notify::ram-usage', () => {
            // console.log(`ram-usage: ${vitals.ram_usage}`);
            const s = (vitals.ram_usage * 100).toFixed(0) + '%';
            if (!this.absUnits) {
                // If we're using absolute units, listen for ram-size-free instead
                this.usage.text = s;
            }
            this.menuMemUsage.text = s;
            this.meter.setBarSizes([vitals.ram_usage]);
            this.menuMemCap.setUsage(vitals.ram_usage);
        });
        this.vitalsSignals.push(id);
        id = vitals.connect('notify::swap-size', () => {
            // console.log(`swap-size: ${vitals.swap_size}`);
            const total = GBytesToHumanString(vitals.swap_size);
            const free = GBytesToHumanString(vitals.swap_size_free);
            this.menuSwapSize.text = _(`${free} available of ${total}`);
        });
        this.vitalsSignals.push(id);
        id = vitals.connect('notify::swap-size-free', () => {
            // console.log(`swap-size-free: ${vitals.swap_size_free}`);
            const total = GBytesToHumanString(vitals.swap_size);
            const free = GBytesToHumanString(vitals.swap_size_free);
            this.menuSwapSize.text = _(`${free} available of ${total}`);
        });
        this.vitalsSignals.push(id);
        id = vitals.connect('notify::swap-usage', () => {
            // console.log(`swap-usage: ${vitals.swap_usage}`);
            const s = (vitals.swap_usage * 100).toFixed(0) + '%';
            this.menuSwapUsage.text = s;
            this.menuSwapCap.setUsage(vitals.swap_usage);
        });
        this.vitalsSignals.push(id);
        id = vitals.connect('notify::mem-history', () => {
            this.historyChart?.update(vitals.getMemHistory());
        });
        this.vitalsSignals.push(id);
        id = vitals.connect('notify::mem-top-procs', () => {
            const procs = vitals.getTopMemProcs(NumTopProcs);
            for (let i = 0; i < NumTopProcs; i++) {
                this.topProcs[i].setCmd(procs[i].cmd);
                if (procs[i].count > 1) {
                    this.topProcs[i].setCmd(this.topProcs[i].cmd.text + ` (x${procs[i].count})`);
                }
                this.topProcs[i].usage.text = bytesToHumanString(procs[i].memUsage());
            }
        });
        this.vitalsSignals.push(id);
    }
    updateColor() {
        const [color, useAccent] = super.updateColor();
        this.menuMemCap?.setColor(color);
        this.menuSwapCap?.setColor(color);
        return [color, useAccent];
    }
});
