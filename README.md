# TopHat
TopHat is an elegant system resource monitor for the GNOME shell. It displays CPU, memory, and network activity in the GNOME top bar.

<img src="./screenshots/cpu.png?raw=true" width="360px" alt="Screenshot of processor usage indicator">
<img src="./screenshots/mem.png?raw=true" width="360px" alt="Screenshot of memory usage indicator">
<img src="./screenshots/net.png?raw=true" width="360px" alt="Screenshot of network usage indicator">

## Installation

Install TopHat from the [GNOME Shell extensions page](https://extensions.gnome.org/extension/5219/tophat/).

## Requirements

- GNOME 3.38 or newer
- The gtop system monitoring library (e.g., 'libgtop' on Debian-based systems, likely already installed as part of GNOME)
- GIRepository (gir) bindings for the gtop system monitoring library (e.g., 'gir1.2-gtop-2.0' on Debian-based systems)

## Tested against

- CentOS Stream 9
- Debian 11.4
- Fedora 36
- Pop!_OS 22.04 LTS
- Ubuntu 22.04 LTS

## Contributing and dev notes

To view logged output, use the command `journalctl -f -o cat /usr/bin/gnome-shell`.

To simulate heavy system load, use the `stress-ng` tool, e.g. `stress-ng --timeout 10s --cpu 8`.

To install manually:
    
    mkdir -p ~/.local/share/gnome-shell/extensions/
    ln -s [path to tophat repository] ~/.local/share/gnome-shell/extensions/tophat@fflewddur.github.io

## License

TopHat is distributed under the terms of the GNU General Public License, version 3 or later. See the [license][license] file for details.

### Credits

TopHat was designed and written by [Todd Kulesza](https://github.com/fflewddur), with much inspiration from the GNOME [system-monitor extension](https://extensions.gnome.org/extension/120/system-monitor/) and [iStat Menus](https://bjango.com/mac/istatmenus/).

### Icons

The images in the 'icons' directory are derived works from [thenounproject.com](https://thenounproject.com) and used under the [Creative Commons Attribution license](https://creativecommons.org/licenses/by/3.0/). The authors of each original work are:

icons/cpu.svg: [jai](https://thenounproject.com/jairam.182/)  
icons/mem.svg: [Loudoun Design Co.](https://thenonproject.com/LoudounDesignCo/)  
icons/net.svg: [Pixel Bazaar](https://thenounproject.com/pixelbazaar/)  

All icons were edited to make them more legible at small sizes.

[bug-tracker]: https://github.com/fflewddur/tophat/issues
[license]: COPYING
