# Settings schema

After making any changes, this needs to be recompiled with the command
`glib-compile-schemas --strict [path-to-schemas-directory]`.

To view all available settings and their current values, use the command
`gsettings --schemadir
~/.local/share/gnome-shell/extensions/tophat@fflewddur.github.io/schemas
list-recursively org.gnome.shell.extensions.tophat`.

Settings that don't have a control in TopHat's preferences panel can be
adjusted with the command `gsettings --schemadir
~/.local/share/gnome-shell/extensions/tophat@fflewddur.github.io/schemas set
org.gnome.shell.extensions.tophat [key] [value]`.
