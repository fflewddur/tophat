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

import GLib from 'gi://GLib';

export class CpuMonitor {
  private loop = 0;

  public start() {
    console.log(`[TopHat] Starting CPU monitor`);
    this.loop = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 5, () =>
      this.runLoop()
    );
  }

  public stop() {
    console.log('[TopHat] Stopping CPU monitor');
    GLib.source_remove(this.loop);
    this.loop = 0;
  }

  private runLoop() {
    // console.log(`[TopHat] runLoop() for ${this.model.name} w/ ${this.model.cores} logical cores`);
    return true;
  }
}
