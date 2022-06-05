# TopHat
TopHat is [intended to be] an elegant system resource monitor for the GNOME shell. It display CPU, memory, and network activity in the GNOME top bar.

## Requirements

- GNOME 3.38 or newer
- GIRepository (gir) bindings for the gtop system monitoring library (e.g., gir1.2-gtop-2.0 on Debian-based systems)

## Tested against

- CenOS Stream 9
- Debian 11.3
- Fedora 36
- Ubuntu 22.04 LTS

## Contributing and dev notes

To view logged output, use the command `journalctl -f -o cat /usr/bin/gnome-shell`.

To simulate heavy system load, use the `stress-ng` tool, e.g. `stress-ng --timeout 10s --cpu 8`.

To install manually:
    
    mkdir -p ~/.local/share/gnome-shell/extensions/
    ln -s [path to tophat repository] ~/.local/share/gnome-shell/extensions/tophat@fflewddur.github.io
