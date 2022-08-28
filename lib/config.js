/* eslint-disable no-unused-vars */
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

// For compatibility checks
// const Config = imports.misc.config;
// const SHELL_MINOR = parseInt(Config.PACKAGE_VERSION.split('.')[1]);

// Time between resource updates, in milliseconds
var UPDATE_INTERVAL_CPU = 1000;
var UPDATE_INTERVAL_MEM = 2000;
var UPDATE_INTERVAL_NET = 2000;
var UPDATE_INTERVAL_PROCLIST = 5000;

var METER_BG_COLOR = '#00000033';
var METER_FG_COLOR = '#1dacd6';
var METER_FG2_COLOR = '#d92121';

var CPU_SHOW_CORES = true;
var CPU_BAR_WIDTH = 6; // width of bars for each CPU core, in pixels

var HISTORY_MAX_SIZE = 120;

var N_TOP_PROCESSES = 6;

const Gettext = imports.gettext;
const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

var Domain = Gettext.domain(Me.metadata.uuid);
