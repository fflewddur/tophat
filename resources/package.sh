#! /bin/bash

VERSION=`grep "\"version\":" ./resources/metadata.json | awk '{ print $2 }' | sed -e 's/,$//' -e 's/^"//' -e 's/"$//'`

if [ -z "${VERSION}" ]; then
    echo "Error: Could not parse version from metadata.json"
    exit 1
fi

echo "Packaging TopHat v$VERSION..."

gnome-extensions pack --force --extra-source=container.js --extra-source=cpu.js --extra-source=disk.js --extra-source=file.js --extra-source=helpers.js --extra-source=history.js --extra-source=mem.js --extra-source=meter.js --extra-source=monitor.js --extra-source=net.js --extra-source=vitals.js --extra-source=icons --extra-source=../LICENSE --extra-source=../README.md --extra-source=../RELEASES.md --extra-source=classic.css --schema=./schemas/gschemas.compiled --schema=../resources/schemas/org.gnome.shell.extensions.tophat.gschema.xml --podir=../po ./dist && echo "Extension successfully packaged"

mv tophat@fflewddur.github.io.shell-extension.zip tophat@fflewddur.github.io.v$VERSION.shell-extension.zip