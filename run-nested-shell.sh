#!/bin/sh -e

# export G_MESSAGES_DEBUG=all
export MUTTER_DEBUG_DUMMY_MODE_SPECS=1280x720
# export SHELL_DEBUG=all

dbus-run-session -- \
    gnome-shell --nested \
                --wayland
