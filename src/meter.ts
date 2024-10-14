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

import Atk from 'gi://Atk';
import St from 'gi://St';
import { registerGObjectClass } from './helpers.js';

@registerGObjectClass
export class TopHatMeter extends St.Widget {
  private meterName;
  private box;

  constructor(name: string) {
    super({
      reactive: true,
      can_focus: true,
      track_hover: true,
      style_class: 'tophat-monitor panel-button',
      accessible_name: name,
      accessible_role: Atk.Role.MENU,
      x_expand: true,
      y_expand: true,
    });
    this.meterName = name;
    this.box = new St.BoxLayout();
    this.add_child(this.box);

    // for testing
    this.box.add_child(new St.Label({ text: this.meterName }));
  }
}
