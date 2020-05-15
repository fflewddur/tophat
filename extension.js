'use strict';

// TopHat: An elegant system resource monitor for the GNOME shell
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

const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const GObject = imports.gi.GObject;
// const Pango = imports.gi.Pango;
// const PangoCairo = imports.gi.PangoCairo;
const GTop = imports.gi.GTop;
const Main = imports.ui.main;
const Clutter = imports.gi.Clutter;
const St = imports.gi.St;
const PanelMenu = imports.ui.panelMenu;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

// For compatibility checks
const Config = imports.misc.config;
const SHELL_MINOR = parseInt(Config.PACKAGE_VERSION.split('.')[1]);

// Time between resource updates, in milliseconds
const UPDATE_INTERVAL_CPU = 1000;
const UPDATE_INTERVAL_MEM = 2000;
const UPDATE_INTERVAL_NET = 2000;

const SECOND_AS_MICROSECONDS = 1000000;

const METER_BG_COLOR = '#222';
const METER_FG_COLOR = '#1dacd6';

var TopHatCpuIndicator = class TopHatCpuIndicator extends PanelMenu.Button {
    _init() {
        super._init(0.0, `${Me.metadata.name} CPU Indicator`, false);

        let hbox = new St.BoxLayout();
        this.add_child(hbox);

        let gicon = Gio.icon_new_for_string(`${Me.path}/icons/cpu.svg`);
        let icon = new St.Icon({ gicon, icon_size: 24 });
        hbox.add_child(icon);

        // Exploration of vertical labels
        // this.label = new St.DrawingArea({ style_class: 'label' });
        // hbox.add_child(this.label);
        // this.label.connect('repaint', () => {
        //     log('repaint');
        //     let font = Pango.FontDescription.from_string('Monospace 8');
        //     let ctx = this.label.get_context();
        //     // let [width, height] = this.meter.get_surface_size();
        //     var _, fg;
        //     [_, fg] = Clutter.Color.from_string('#eee');

        //     Clutter.cairo_set_source_color(ctx, fg);
        //     let layout = PangoCairo.create_layout(ctx);
        //     layout.set_font_description(font);
        //     layout.set_line_spacing(0.8);
        //     layout.set_text('C\rP\rU', 5);
        //     PangoCairo.show_layout(ctx, layout);

        // });
        // this.label.queue_repaint();

        this.meter = new St.DrawingArea({ style_class: 'meter' });
        hbox.add_child(this.meter);
        this.meter.connect('repaint', () => this.repaint());

        this.valueCPU = new St.Label({ text: '0%', style_class: 'value' });
        hbox.add_child(this.valueCPU);

        // Initialize libgtop values
        this.cpu = new GTop.glibtop_cpu();
        this.cpuCores = GTop.glibtop_get_sysinfo().ncpu;
        GTop.glibtop_get_cpu(this.cpu);
        this.cpuPrev = {
            'user': this.cpu.user,
            'sys': this.cpu.sys,
            'nice': this.cpu.nice,
            'total': this.cpu.total,
        };
        this.cpuUsage = 0;

        this.refreshTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, UPDATE_INTERVAL_CPU, () => this.refresh());

        // Menu
        hbox = new St.BoxLayout();
        let label = new St.Label({ text: 'CPU details to go here' });
        hbox.add_child(label);
        this.menu.box.add_child(hbox);

        this.menu.addAction('Menu Item', this.menuAction, null);
    }

    menuAction() {
        log('[TopHat] CPU menu item activated');
    }

    refresh() {
        GTop.glibtop_get_cpu(this.cpu);
        let userDelta = this.cpu.user - this.cpuPrev.user;
        let sysDelta = this.cpu.sys - this.cpuPrev.sys;
        let niceDelta = this.cpu.nice - this.cpuPrev.nice;
        let totalDelta = this.cpu.total - this.cpuPrev.total;
        this.cpuUsage = Math.round(100 * (userDelta + sysDelta + niceDelta) / totalDelta);
        this.cpuPrev.user = this.cpu.user;
        this.cpuPrev.sys = this.cpu.sys;
        this.cpuPrev.nice = this.cpu.nice;
        this.cpuPrev.total = this.cpu.total;
        log(`[TopHat] CPU: ${this.cpuUsage}% on ${this.cpuCores} cores`);
        this.valueCPU.text = `${this.cpuUsage}%`;

        this.meter.queue_repaint();

        return true;
    }

    repaint() {
        let [width, height] = this.meter.get_surface_size();
        let ctx = this.meter.get_context();
        var _, fg, bg;
        [_, fg] = Clutter.Color.from_string(METER_FG_COLOR);
        [_, bg] = Clutter.Color.from_string(METER_BG_COLOR);

        Clutter.cairo_set_source_color(ctx, bg);
        ctx.rectangle(0, 0, width, height);
        ctx.fill();

        Clutter.cairo_set_source_color(ctx, fg);
        let fillHeight = Math.ceil(this.cpuUsage / 100.0 * height);
        ctx.rectangle(0, height - fillHeight, width, height);
        ctx.fill();
    }

    destroy() {
        if (this.refreshTimer !== 0) {
            GLib.source_remove(this.refreshTimer);
            this.refreshTimer = 0;
        }
        super.destroy();
    }
};

var TopHatMemIndicator = class TopHatMemIndicator extends PanelMenu.Button {
    _init() {
        super._init(0.0, `${Me.metadata.name} Memory Indicator`, false);

        let hbox = new St.BoxLayout();
        this.add_child(hbox);

        let gicon = Gio.icon_new_for_string(`${Me.path}/icons/mem.svg`);
        let icon = new St.Icon({ gicon, icon_size: 24 });
        hbox.add_child(icon);

        this.meter = new St.DrawingArea({ style_class: 'meter' });
        hbox.add_child(this.meter);
        this.meter.connect('repaint', () => this.repaint());

        let valueRAM = new St.Label({ text: '0%', style_class: 'value' });
        hbox.add_child(valueRAM);
        this.valueRAM = valueRAM;

        // Initialize libgtop values
        this.mem = new GTop.glibtop_mem();
        this.memUsage = 0;

        this.refreshTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, UPDATE_INTERVAL_MEM, () => this.refresh());

        // Menu
        hbox = new St.BoxLayout();
        let label = new St.Label({ text: 'Memory details to go here' });
        hbox.add_child(label);
        this.menu.box.add_child(hbox);
        // hbox.add_child(valueRAM);

        this.menu.addAction('Menu Item', this.menuAction, null);
    }

    menuAction() {
        log('[TopHat] Menu item activated');
    }

    refresh() {
        GTop.glibtop_get_mem(this.mem);
        let memTotal = this.mem.total / 1024 / 1024;
        let memUsed = this.mem.user / 1024 / 1024;
        this.memUsage = Math.round(memUsed / memTotal * 100);
        log(`[TopHat] Memory: ${this.memUsage}% of ${Math.round(memTotal)} MB`);
        this.valueRAM.text = `${this.memUsage}%`;

        this.meter.queue_repaint();

        return true;
    }

    repaint() {
        let [width, height] = this.meter.get_surface_size();
        let ctx = this.meter.get_context();
        var _, fg, bg;
        [_, fg] = Clutter.Color.from_string(METER_FG_COLOR);
        [_, bg] = Clutter.Color.from_string(METER_BG_COLOR);

        Clutter.cairo_set_source_color(ctx, bg);
        ctx.rectangle(0, 0, width, height);
        ctx.fill();

        Clutter.cairo_set_source_color(ctx, fg);
        let fillHeight = Math.ceil(this.memUsage / 100.0 * height);
        ctx.rectangle(0, height - fillHeight, width, height);
        ctx.fill();
    }

    destroy() {
        if (this.refreshTimer !== 0) {
            GLib.source_remove(this.refreshTimer);
            this.refreshTimer = 0;
        }
        super.destroy();
    }
};

var TopHatNetIndicator = class TopHatNetIndicator extends PanelMenu.Button {
    _init() {
        super._init(0.0, `${Me.metadata.name} Network Indicator`, false);

        let hbox = new St.BoxLayout();
        this.add_child(hbox);

        let gicon = Gio.icon_new_for_string(`${Me.path}/icons/net.svg`);
        let icon = new St.Icon({ gicon, icon_size: 24 });
        hbox.add_child(icon);

        let vbox = new St.BoxLayout({ vertical: true });
        hbox.add_child(vbox);

        let valueNetUp = new St.Label({ text: '0', style_class: 'value-net' });
        vbox.add_child(valueNetUp);
        this.valueNetUp = valueNetUp;

        let valueNetDown = new St.Label({ text: '0', style_class: 'value-net' });
        vbox.add_child(valueNetDown);
        this.valueNetDown = valueNetDown;

        // Initialize libgtop values
        this.net = new GTop.glibtop_netload();
        let bytesIn = 0;
        let bytesOut = 0;
        let netlist = new GTop.glibtop_netlist();
        this.netDevices = GTop.glibtop_get_netlist(netlist);
        for (const dev of this.netDevices) {
            log(`[TopHat] Found network device '${dev}'`);
            GTop.glibtop_get_netload(this.net, dev);
            bytesIn += this.net.bytes_in;
            bytesOut += this.net.bytes_out;
        }
        this.timePrev = GLib.get_monotonic_time();
        this.netPrev = {
            bytes_in: bytesIn,
            bytes_out: bytesOut,
        };

        this.refreshTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, UPDATE_INTERVAL_NET, () => this.refresh());

        // Menu
        hbox = new St.BoxLayout();
        let label = new St.Label({ text: 'Network details to go here' });
        hbox.add_child(label);
        this.menu.box.add_child(hbox);

        this.menu.addAction('Menu Item', this.menuAction, null);
    }

    menuAction() {
        log('[TopHat] Menu item activated');
    }

    refresh() {
        let bytesIn = 0;
        let bytesOut = 0;
        let time = GLib.get_monotonic_time();
        for (const dev of this.netDevices) {
            GTop.glibtop_get_netload(this.net, dev);
            bytesIn += this.net.bytes_in;
            bytesOut += this.net.bytes_out;
        }
        let bytesInDelta = bytesIn - this.netPrev.bytes_in;
        let bytesOutDelta = bytesOut - this.netPrev.bytes_out;
        let timeDelta = (time - this.timePrev) / SECOND_AS_MICROSECONDS;
        this.timePrev = time;
        this.netPrev.bytes_in = bytesIn;
        this.netPrev.bytes_out = bytesOut;
        let netIn = bytesToHumanString(Math.round(bytesInDelta / timeDelta));
        let netOut = bytesToHumanString(Math.round(bytesOutDelta / timeDelta));
        this.valueNetDown.text = `${netIn}/s`;
        this.valueNetUp.text = `${netOut}/s`;
        log(`[TopHat] Net: bytes_in=${netIn}/s bytes_out=${netOut}/s time=${timeDelta}`);

        return true;
    }

    destroy() {
        if (this.refreshTimer !== 0) {
            log('Stopping timer');
            GLib.source_remove(this.refreshTimer);
            this.refreshTimer = 0;
        }
        super.destroy();
    }
};

// Convert a number of bytes to a more logical human-readable string
// (e.g., 1024 -> 1 KB)
function bytesToHumanString(bytes) {
    if (bytes < 1024)
        // Indicate network activity, but don't clutter the UI w/ # of bytes
        return '1 KB';
    else if (bytes < 1024 * 1024)
        return `${(bytes / 1024).toFixed(0)} KB`;
    else
        return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// Compatibility with gnome-shell >= 3.32
if (SHELL_MINOR > 30) {
    TopHatCpuIndicator = GObject.registerClass(
        { GTypeName: 'TopHatCpuIndicator' },
        TopHatCpuIndicator,
    );
    TopHatMemIndicator = GObject.registerClass(
        { GTypeName: 'TopHatMemIndicator' },
        TopHatMemIndicator,
    );
    TopHatNetIndicator = GObject.registerClass(
        { GTypeName: 'TopHatNetIndicator' },
        TopHatNetIndicator,
    );
}

class TopHat {
    constructor() {
        this.cpu = new TopHatCpuIndicator();
        this.mem = new TopHatMemIndicator();
        this.net = new TopHatNetIndicator();
        // TODO Add disk usage/activity indicator
    }

    addToPanel() {
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 500, () => {
            // TODO Make a top-level container that passes click signals to the appropriate indicator
            Main.panel.addToStatusArea(`${Me.metadata.name} Network Indicator`, this.net);
            Main.panel.addToStatusArea(`${Me.metadata.name} Memory Indicator`, this.mem);
            Main.panel.addToStatusArea(`${Me.metadata.name} CPU Indicator`, this.cpu);
        });
    }

    destroy() {
        this.cpu.destroy();
        this.mem.destroy();
        this.net.destroy();
    }
}

// We're going to declare `tophat` in the scope of the whole script so it can
// be accessed in both `enable()` and `disable()`
var tophat = null;

function init() {
}

function enable() {
    log(`[${Me.metadata.name}] enabling version ${Me.metadata.version}`);

    tophat = new TopHat();
    tophat.addToPanel();

    log(`[${Me.metadata.name}] enabled`);
}

function disable() {
    log(`[${Me.metadata.name}] disabling version ${Me.metadata.version}`);

    if (tophat !== null) {
        tophat.destroy();
        tophat = null;
    }

    log(`[${Me.metadata.name}] disabled`);
}
