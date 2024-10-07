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

import Gio from 'gi://Gio';

export class File {
  private file: Gio.File;

  constructor(path: string) {
    this.file = Gio.File.new_for_path(path);
  }

  read(): Promise<string> {
    return new Promise((resolve, reject) => {
      try {
        this.file.load_contents_async(null, (file, res) => {
          try {
            const bytes = file?.load_contents_finish(res)[1];
            const decoder = new TextDecoder('utf-8');
            const contents = decoder.decode(bytes).trim();
            resolve(contents);
          } catch (e: unknown) {
            if (e instanceof Error) {
              reject(e.message);
            } else {
              reject(e);
            }
          }
        });
      } catch (e: unknown) {
        if (e instanceof Error) {
          reject(e.message);
        } else {
          reject(e);
        }
      }
    });
  }

  readSync(): string {
    let contents = '';
    try {
      const bytes = this.file.load_contents(null)[1];
      const decoder = new TextDecoder('utf-8');
      contents = decoder.decode(bytes).trim();
    } catch (e: unknown) {
      console.error(`[TopHat] Error reading ${this.file.get_path()}: ${e}`);
    }
    return contents;
  }
}
