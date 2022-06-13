/* eslint-disable no-unused-vars */
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

const GTop = imports.gi.GTop;

const SECOND_AS_MICROSECONDS = 1000000;
const SECOND_AS_MILLISECONDS = 1000;

var TopProcess = class TopProcess {
    constructor(cmd, usage) {
        this.cmd = cmd;
        this.usage = usage;
    }
};

function getProcessList() {
    let extra_info = new GTop.glibtop_proclist();
    // let exclude = GTop.GLIBTOP_EXCLUDE_IDLE;
    let exclude = 0;
    var processes = GTop.glibtop_get_proclist(
        extra_info, GTop.GLIBTOP_KERN_PROC_ALL, exclude
    );
    return processes;
}

function getProcessName(pid) {
    let argSize = new GTop.glibtop_proc_args();
    let args = GTop.glibtop_get_proc_args(argSize, pid, 0);

    var cmd = '';
    if (args) {
        let lastSeparator = args.lastIndexOf('/');
        cmd = args;
        if (lastSeparator >= 0) {
            cmd = cmd.slice(lastSeparator + 1);
        }
        cmd = cmd.slice(0, 35);
        // procInfo.cmd = cmd;
        // log(`[TopHat] cmd: '${cmd}'`);
    }

    return cmd;
}
