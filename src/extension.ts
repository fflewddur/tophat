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

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

export default class TopHat extends Extension {
    protected x = 10;
    
    enable() {
        console.log(`[TopHat] enabling version ${this.metadata.version}`);
        console.log("[TopHat] enabled()");
    }

    disable() {
        console.log(`[TopHat] disabling version ${this.metadata.version}`);
        console.log("[TopHat] disabled()");
    }
}
