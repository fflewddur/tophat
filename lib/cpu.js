'use strict';

// Copyright (C) 2020 Todd Kulesza <todd@dropline.net>

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

/* global global */
/* exported TopHatCpuIndicator, TopHatCpuIndicatorNext, TopHatContainer */

const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const {Atk, Clutter, GObject, St} = imports.gi;
const GTop = imports.gi.GTop;
const Shell = imports.gi.Shell;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;
const Main = imports.ui.main;
const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Config = Me.imports.lib.config;
const Shared = Me.imports.lib.shared;
const _ = Config.Domain.gettext;

class CPUUse {
    constructor(user = 0, sys = 0) {
        this.user = user;
        this.sys = sys;
    }

    computeFromIdle(userUsage, idleUsage) {
        this.user = userUsage;
        this.sys = 100 - userUsage - idleUsage;
    }

    total() {
        return this.user + this.sys;
    }

    copy() {
        return new CPUUse(this.user, this.sys);
    }
}

class ProcessCPUUse {
    constructor(pid = 0) {
        this.pid = pid;
        this.cmd = '';
        this.cpuTimeNow = 0;
        this.cpuTimePrev = 0;
    }

    updateTime(time) {
        this.cpuTimePrev = this.cpuTimeNow;
        this.cpuTimeNow = time.rtime;
        this.freq = time.frequency;
    }

    cpuTime() {
        return this.cpuTimeNow - this.cpuTimePrev;
    }

    cpuUsage() {
        if (this.freq === 0) {
            return 0;
        }
        return this.cpuTime() / this.freq * Shared.SECOND_AS_MILLISECONDS / Config.UPDATE_INTERVAL_PROCLIST;
    }

    toString() {
        return `use: ${this.cpuUsage()} cmd: ${this.cmd} pid: ${this.pid}`;
    }
}

var TopHatCpuIndicator = GObject.registerClass(
    class TopHatCpuIndicator extends PanelMenu.Button {
        _init(settings) {
            super._init(0.0, `${Me.metadata.name} CPU Indicator`, false);

            // Initialize libgtop values
            this.cpuCores = GTop.glibtop_get_sysinfo().ncpu;
            this.cpu = new GTop.glibtop_cpu();
            GTop.glibtop_get_cpu(this.cpu);
            this.cpuUsage = new CPUUse();
            this.cpuCoreUsage = new Array(this.cpuCores);
            this.cpuPrev = {
                user: this.cpu.user,
                idle: this.cpu.idle,
                total: this.cpu.total,
                xcpu_user: new Array(this.cpuCores),
                xcpu_idle: new Array(this.cpuCores),
                xcpu_total: new Array(this.cpuCores),
            };
            for (let i = 0; i < this.cpuCores; i++) {
                this.cpuPrev.xcpu_user[i] = this.cpu.xcpu_user[i];
                this.cpuPrev.xcpu_idle[i] = this.cpu.xcpu_idle[i];
                this.cpuPrev.xcpu_total[i] = this.cpu.xcpu_total[i];
                this.cpuCoreUsage[i] = new CPUUse();
            }
            this.history = new Array(0);
            this.processes = new Map();

            let hbox = new St.BoxLayout();
            this.add_child(hbox);

            let gicon = Gio.icon_new_for_string(`${Me.path}/icons/cpu-icon.svg`);
            let icon = new St.Icon({gicon, icon_size: 18, style_class: 'icon'});
            hbox.add_child(icon);

            this._buildMeter(hbox);
            this._buildMenu();

            this.refreshChartsTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, Config.UPDATE_INTERVAL_CPU, () => this.refreshCharts());
            this.refreshProcessesTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, Config.UPDATE_INTERVAL_PROCLIST, () => this.refreshProcesses());

            settings.bind(
                'show-cpu',
                this,
                'visible',
                Gio.SettingsBindFlags.DEFAULT
            );
            settings.bind(
                'show-icons',
                icon,
                'visible',
                Gio.SettingsBindFlags.DEFAULT
            );
        }

        get role() {
            return `${Me.metadata.name} CPU Indicator`;
        }

        _buildMeter(parent) {
            this.meter = new St.DrawingArea({style_class: 'meter'});
            // Leave 1px of padding between each bar
            let meterWidth = Config.CPU_BAR_WIDTH * this.cpuCores + this.cpuCores - 1;
            this.meter.style = `width: ${meterWidth}px;`;
            parent.add_child(this.meter);
            this.meter.connect('repaint', () => this.repaintMeter());
        }

        _buildMenu() {
            let statusMenu = new PopupMenu.PopupMenuSection();
            let grid = new St.Widget({
                style_class: 'menu-grid',
                layout_manager: new Clutter.GridLayout({orientation: Clutter.Orientation.VERTICAL}),
            });
            let lm = grid.layout_manager;
            statusMenu.box.add_child(grid);

            let row = 0;
            let label = new St.Label({text: _('Processor usage'), style_class: 'menu-header'});
            lm.attach(label, 0, row, 2, 1);
            row++;

            label = new St.Label({text: _('Total CPU:'), style_class: 'menu-label'});
            lm.attach(label, 0, row, 1, 1);
            this.menuCpuUsage = new St.Label({text: '0%', style_class: 'menu-value'});
            lm.attach(this.menuCpuUsage, 1, row, 1, 1);
            row++;

            this.historyChart = new St.DrawingArea({style_class: 'chart'});
            this.historyChart.connect('repaint', () => this.repaintHistory());
            lm.attach(this.historyChart, 0, row, 2, 1);
            row++;

            // FIXME: Don't hardcode this, base it on Config.HISTORY_MAX_SIZE
            label = new St.Label({text: _('2 mins ago'), style_class: 'chart-label-then'});
            lm.attach(label, 0, row, 1, 1);
            label = new St.Label({text: _('now'), style_class: 'chart-label-now'});
            lm.attach(label, 1, row, 1, 1);
            row++;

            label = new St.Label({text: _('Top processes'), style_class: 'menu-header'});
            lm.attach(label, 0, row, 2, 1);
            row++;

            this.topProcesses = [];
            for (let i = 0; i < Config.N_TOP_PROCESSES; i++) {
                let cmd = new St.Label({text: '', style_class: 'menu-cmd-name'});
                lm.attach(cmd, 0, row, 1, 1);
                let usage = new St.Label({text: '', style_class: 'menu-cmd-usage'});
                lm.attach(usage, 1, row, 1, 1);
                let p = new Shared.TopProcess(cmd, usage);
                this.topProcesses.push(p);
                row++;
            }

            this.menu.addMenuItem(statusMenu);

            let appSys = Shell.AppSystem.get_default();
            let app = appSys.lookup_app('gnome-system-monitor.desktop');
            let menuItem = new PopupMenu.PopupImageMenuItem(_('System Monitor'), 'org.gnome.SystemMonitor-symbolic');
            menuItem.connect('activate', () => {
                this.menu.close(true);
                app.activate();
            });
            menuItem.connect('leave-event', widget => {
                widget.set_hover(false);
                widget.remove_style_pseudo_class('focus');
            });
            this.menu.addMenuItem(menuItem);
        }

        refreshCharts() {
            GTop.glibtop_get_cpu(this.cpu);

            // Total CPU usage
            let userDelta = this.cpu.user - this.cpuPrev.user;
            let idleDelta = this.cpu.idle - this.cpuPrev.idle;
            let totalDelta = this.cpu.total - this.cpuPrev.total;
            let idleUsage = Math.round(100 * idleDelta / totalDelta);
            let userUsage = Math.round(100 * userDelta / totalDelta);
            this.cpuUsage.computeFromIdle(userUsage, idleUsage);

            // Per-core CPU usage
            for (let i = 0; i < this.cpuCores; i++) {
                userDelta = this.cpu.xcpu_user[i] - this.cpuPrev.xcpu_user[i];
                idleDelta = this.cpu.xcpu_idle[i] - this.cpuPrev.xcpu_idle[i];
                totalDelta = this.cpu.xcpu_total[i] - this.cpuPrev.xcpu_total[i];
                let coreIdleUsage = Math.round(100 * idleDelta / totalDelta);
                let coreUserUsage = Math.round(100 * userDelta / totalDelta);
                this.cpuCoreUsage[i].computeFromIdle(coreUserUsage, coreIdleUsage);
            }

            // Save values
            this.cpuPrev.user = this.cpu.user;
            this.cpuPrev.idle = this.cpu.idle;
            this.cpuPrev.total = this.cpu.total;
            for (let i = 0; i < this.cpuCores; i++) {
                this.cpuPrev.xcpu_user[i] = this.cpu.xcpu_user[i];
                this.cpuPrev.xcpu_idle[i] = this.cpu.xcpu_idle[i];
                this.cpuPrev.xcpu_total[i] = this.cpu.xcpu_total[i];
            }
            while (this.history.length >= Config.HISTORY_MAX_SIZE) {
                this.history.shift();
            }
            this.history.push(this.cpuUsage.copy());

            // Update UI
            // log(`[TopHat] CPU: ${this.cpuUsage}% on ${this.cpuCores} cores (${this.cpuCoreUsage.join()})`);
            // this.valueCPU.text = `${this.cpuUsage}%`;
            let cpuTotal = this.cpuUsage.total();
            if (cpuTotal < 1) {
                cpuTotal = '< 1';
            }
            this.menuCpuUsage.text = `${cpuTotal}%`;
            this.meter.queue_repaint();
            this.historyChart.queue_repaint();

            return true;
        }

        refreshProcesses() {
            // Build list of N most CPU-intensive processes
            let processes = Shared.getProcessList();

            let updatedProcesses = new Map();
            processes.forEach(pid => {
                let procInfo = this.processes.get(pid);
                if (procInfo === undefined) {
                    procInfo = new ProcessCPUUse(pid);
                    procInfo.cmd = Shared.getProcessName(pid);
                }

                if (procInfo.cmd) {
                    let time = new GTop.glibtop_proc_time();
                    GTop.glibtop_get_proc_time(time, pid);
                    procInfo.updateTime(time);
                    updatedProcesses.set(pid, procInfo);
                }
            });
            this.processes = updatedProcesses;

            // Get the top 5 processes by CPU usage
            let procList = new Array(0);
            this.processes.forEach(e => {
                if (e.cpuTime() > 0) {
                    procList.push(e);
                }
            });
            procList.sort((a, b) => {
                return b.cpuTime() - a.cpuTime();
            });
            procList = procList.slice(0, Config.N_TOP_PROCESSES);
            while (procList.length < Config.N_TOP_PROCESSES) {
                // If we don't have at least N_TOP_PROCESSES active, fill out
                // the array with empty ones
                procList.push(new ProcessCPUUse());
            }
            for (let i = 0; i < Config.N_TOP_PROCESSES; i++) {
                this.topProcesses[i].cmd.text = procList[i].cmd;
                let cpuUse = '';
                if (procList[i].cmd) {
                    cpuUse = procList[i].cpuUsage() * 100 / this.cpuCores;
                    if (cpuUse < 1) {
                        cpuUse = '< 1';
                        // cpuUse = cpuUse.toFixed(2);
                    } else {
                        cpuUse = Math.round(cpuUse);
                    }
                    cpuUse += '%';
                }
                this.topProcesses[i].usage.text = cpuUse;
            }
            // log(`[TopHat] ${procList}`);
            return true;
        }

        repaintMeter() {
            let [width, height] = this.meter.get_surface_size();
            let barWidth = Math.floor((width - (this.cpuCores - 1)) / this.cpuCores);
            let ctx = this.meter.get_context();
            var unused, fg, bg;
            [unused, fg] = Clutter.Color.from_string(Config.METER_FG_COLOR);
            [unused, bg] = Clutter.Color.from_string(Config.METER_BG_COLOR);

            Clutter.cairo_set_source_color(ctx, bg);
            ctx.rectangle(0, 0, width, height);
            ctx.fill();

            if (Config.CPU_SHOW_CORES) {
                Clutter.cairo_set_source_color(ctx, fg);
                for (let i = 0; i < this.cpuCores; i++) {
                    let barHeight = Math.ceil(this.cpuCoreUsage[i].total() / 100.0 * height);
                    let x = i * barWidth + i;
                    let y = height - barHeight;
                    ctx.rectangle(x, y, barWidth - 1, barHeight);
                }
                ctx.fill();
            } else {
                Clutter.cairo_set_source_color(ctx, fg);
                let fillHeight = Math.ceil(this.cpuUsage.total() / 100.0 * height);
                ctx.rectangle(0, height - fillHeight, width, height);
                ctx.fill();
            }

            ctx.$dispose();
        }

        repaintHistory() {
            let [width, height] = this.historyChart.get_surface_size();
            let pointSpacing = width / (Config.HISTORY_MAX_SIZE - 1);
            let xStart = (Config.HISTORY_MAX_SIZE - this.history.length) * pointSpacing;
            let ctx = this.historyChart.get_context();
            var unused, fg, bg;
            [unused, fg] = Clutter.Color.from_string(Config.METER_FG_COLOR);
            [unused, bg] = Clutter.Color.from_string(Config.METER_BG_COLOR);

            Clutter.cairo_set_source_color(ctx, bg);
            ctx.rectangle(0, 0, width, height);
            ctx.fill();

            Clutter.cairo_set_source_color(ctx, fg);
            ctx.moveTo(xStart, height);
            for (let i = 0; i < this.history.length; i++) {
                let pointHeight = Math.ceil(this.history[i].total() / 100.0 * height);
                let x = xStart + pointSpacing * i;
                let y = height - pointHeight;
                ctx.lineTo(x, y);
            }
            ctx.lineTo(xStart + (this.history.length - 1) * pointSpacing, height);
            ctx.closePath();
            ctx.fill();

            ctx.$dispose();
        }

        destroy() {
            if (this.refreshChartsTimer !== 0) {
                GLib.source_remove(this.refreshChartsTimer);
                this.refreshChartsTimer = 0;
            }
            if (this.refreshProcessesTimer !== 0) {
                GLib.source_remove(this.refreshProcessesTimer);
                this.refreshProcessesTimer = 0;
            }
            super.destroy();
        }
    });

// Exploration of grouped indicators

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
            // accessible_name: nameText ?? '',
            // accessible_role: Atk.Role.MENU,
        });
        this.monitors = [];
        this.box = new St.BoxLayout();
        this.box.add_child(new St.Label({text: 'TopHat Container'}));
        this.add_child(this.box);
        this.remove_style_class_name('panel-button');

        // this.setMenu(new PopupMenu.PopupMenu(this, menuAlignment, St.Side.TOP, 0));

        // // Build a testing menu
        // let statusMenu = new PopupMenu.PopupMenuSection();
        // let grid = new St.Widget({
        //     style_class: 'menu-grid',
        //     layout_manager: new Clutter.GridLayout({orientation: Clutter.Orientation.VERTICAL}),
        // });
        // let lm = grid.layout_manager;
        // statusMenu.box.add_child(grid);

        // let row = 0;
        // let label = new St.Label({text: 'Testing', style_class: 'menu-header'});
        // lm.attach(label, 0, row, 2, 1);
        // row++;

        // this.menu.addMenuItem(statusMenu);
        // if (dontCreateMenu)
        //     this.menu = new PopupMenu.PopupDummyMenu(this);
        // else
        //     this.setMenu(new PopupMenu.PopupMenu(this, menuAlignment, St.Side.TOP, 0));
    }

    addMonitor(monitor) {
        log('TopHat addMonitor()');
        // log(`parent: ${monitor.priv.parent}`);
        this.monitors.push(monitor);
        this.box.add_child(monitor);
    }

    // setSensitive(sensitive) {
    //     this.reactive = sensitive;
    //     this.can_focus = sensitive;
    //     this.track_hover = sensitive;
    // }

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

    vfunc_event(event) {
        // log(`TopHat container event: ${event.type()}`);
        // if (this.menu &&
        //     (event.type() == Clutter.EventType.TOUCH_BEGIN ||
        //      event.type() == Clutter.EventType.BUTTON_PRESS))
        //     this.menu.toggle();

        return Clutter.EVENT_PROPAGATE;
    }

    // vfunc_show() {
    //     log('TopHat container show');
    //     super.vfunc_show();
    // }

    // vfunc_hide() {
    //     super.vfunc_hide();

    //     if (this.menu) {
    //         this.menu.close();
    //     }
    // }

    // _onMenuKeyPress(actor, event) {
    //     if (global.focus_manager.navigate_from_event(event))
    //         return Clutter.EVENT_STOP;

    //     let symbol = event.get_key_symbol();
    //     if (symbol == Clutter.KEY_Left || symbol == Clutter.KEY_Right) {
    //         let group = global.focus_manager.get_group(this);
    //         if (group) {
    //             let direction = symbol == Clutter.KEY_Left ? St.DirectionType.LEFT : St.DirectionType.RIGHT;
    //             group.navigate_focus(this, direction, false);
    //             return Clutter.EVENT_STOP;
    //         }
    //     }
    //     return Clutter.EVENT_PROPAGATE;
    // }

    _onOpenStateChanged(menu, open) {
        log(`Tophat container _onOpenStateChanged: open=${open}`);
        this.monitors.forEach(m => {
            log(`Tophat container monitor: style_class='${m.get_style_class_name()}' pseudo_class='${m.get_style_pseudo_class()}' hover=${m.get_hover()})`);
        });
        // if (open)
        //     this.add_style_pseudo_class('active');
        // else
        //     this.remove_style_pseudo_class('active');

        // // Setting the max-height won't do any good if the minimum height of the
        // // menu is higher then the screen; it's useful if part of the menu is
        // // scrollable so the minimum height is smaller than the natural height
        // let workArea = Main.layoutManager.getWorkAreaForMonitor(Main.layoutManager.primaryIndex);
        // let scaleFactor = St.ThemeContext.get_for_stage(global.stage).scale_factor;
        // let verticalMargins = this.menu.actor.margin_top + this.menu.actor.margin_bottom;

        // // The workarea and margin dimensions are in physical pixels, but CSS
        // // measures are in logical pixels, so make sure to consider the scale
        // // factor when computing max-height
        // let maxHeight = Math.round((workArea.height - verticalMargins) / scaleFactor);
        // this.menu.actor.style = `max-height: ${maxHeight}px;`;
    }

    _onDestroy() {
        // if (this.menu)
        //     this.menu.destroy();
        super._onDestroy();
    }
});

var TopHatCpuIndicatorNext = GObject.registerClass({
    Signals: {'menu-set': {}},
}, class TopHatCpuIndicatorNext extends St.Widget {
    _init() {
        super._init({
            // menuAlignment,
            // nameText,
            // dontCreateMenu,
            reactive: true,
            can_focus: true,
            track_hover: true,
            style_class: 'panel-button',
            accessible_name: 'TopHatCPUIndicator',
            accessible_role: Atk.Role.MENU,
            x_expand: true,
            y_expand: true,

        });

        this._delegate = this;

        let box = new St.BoxLayout();
        box.add_child(new St.Label({text: 'CPU Indicator'}));
        this.add_child(box);

        // if (dontCreateMenu)
        //     this.menu = new PopupMenu.PopupDummyMenu(this);
        // else
        this.setMenu(new PopupMenu.PopupMenu(this, 0.0, St.Side.TOP, 0));

        // Build the menu
        let statusMenu = new PopupMenu.PopupMenuSection();
        let grid = new St.Widget({
            style_class: 'menu-grid',
            layout_manager: new Clutter.GridLayout({orientation: Clutter.Orientation.VERTICAL}),
        });
        let lm = grid.layout_manager;
        statusMenu.box.add_child(grid);

        let row = 0;
        let label = new St.Label({text: _('Processor usage'), style_class: 'menu-header'});
        lm.attach(label, 0, row, 2, 1);
        row++;

        this.menu.addMenuItem(statusMenu);

        global.stage.connect('notify::key-focus', () => {
            log('TopHat CPU monitor: key-focus event');
        });
    }

    // setSensitive(sensitive) {
    //     this.reactive = sensitive;
    //     this.can_focus = sensitive;
    //     this.track_hover = sensitive;
    // }

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

    vfunc_event(event) {
        // log(`TopHat CPU event: ${event.type()}`);
        if (this.menu &&
            (event.type() === Clutter.EventType.TOUCH_BEGIN ||
             event.type() === Clutter.EventType.BUTTON_PRESS)) {
            log('TopHat: toggling menu');
            this.menu.toggle();
        }

        return Clutter.EVENT_PROPAGATE;
    }

    vfunc_enter_event(event) {
        log(`TopHat CPU enter_event: ${event}`);
    }

    vfunc_key_focus_in() {
        log('TopHat CPU key_focus_in');
    }

    vfunc_hide() {
        super.vfunc_hide();

        if (this.menu) {
            this.menu.close();
        }
    }

    _onMenuKeyPress(actor, event) {
        log('TopHat: _onMenuKeyPress()');
        if (global.focus_manager.navigate_from_event(event)) {
            return Clutter.EVENT_STOP;
        }

        let symbol = event.get_key_symbol();
        if (symbol === Clutter.KEY_Left || symbol === Clutter.KEY_Right) {
            let group = global.focus_manager.get_group(this);
            if (group) {
                let direction = symbol === Clutter.KEY_Left ? St.DirectionType.LEFT : St.DirectionType.RIGHT;
                group.navigate_focus(this, direction, false);
                return Clutter.EVENT_STOP;
            }
        }
        return Clutter.EVENT_PROPAGATE;
    }

    _onOpenStateChanged(menu, open) {
        log(`TopHat: _onOpenStateChanged() open=${open}`);
        if (open) {
            this.add_style_pseudo_class('active');
        } else {
            this.remove_style_pseudo_class('active');
        }

        // Setting the max-height won't do any good if the minimum height of the
        // menu is higher then the screen; it's useful if part of the menu is
        // scrollable so the minimum height is smaller than the natural height
        let workArea = Main.layoutManager.getWorkAreaForMonitor(Main.layoutManager.primaryIndex);
        let scaleFactor = St.ThemeContext.get_for_stage(global.stage).scale_factor;
        let verticalMargins = this.menu.actor.margin_top + this.menu.actor.margin_bottom;

        // The workarea and margin dimensions are in physical pixels, but CSS
        // measures are in logical pixels, so make sure to consider the scale
        // factor when computing max-height
        let maxHeight = Math.round((workArea.height - verticalMargins) / scaleFactor);
        this.menu.actor.style = `max-height: ${maxHeight}px;`;
    }

    _onDestroy() {
        if (this.menu) {
            this.menu.destroy();
        }
        super._onDestroy();
    }
});
