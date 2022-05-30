# TopHat
TopHat is [intended to be] an elegant system resource monitor for the GNOME shell. It's still very much a work-in-progress.

## Requirements

- GNOME 42+
- gir1.2-gtop-2.0

## Contributing and dev notes

To view logged output, use the command `journalctl -f -o cat /usr/bin/gnome-shell`.

To simulate heavy system load, use the `stress-ng` tool, e.g. `stress-ng --timeout 10s --cpu 8`.
