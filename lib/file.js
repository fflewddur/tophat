// Based upon https://github.com/corecoding/Vitals/blob/master/helpers/file.js

// const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio;
const Me = imports.misc.extensionUtils.getCurrentExtension();
// Me.imports.helpers.polyfills;
const ByteArray = imports.byteArray;

var Decoder;
try {
    Decoder = new TextDecoder('utf-8');
} catch (error) {}

// convert Uint8Array into a literal string
function convertUint8ArrayToString(contents) {
    // Starting with Gnome 41, we use TextDecoder as ByteArray is deprecated
    if (Decoder) {
        return Decoder.decode(contents).trim();
    }

    // Supports ByteArray on Gnome 40
    // fixes #304, replaces invalid character
    contents[contents.indexOf(208)] = 0;
    return ByteArray.toString(contents).trim();
}

function File(path) {
    if (path.indexOf('https://') === -1) {
        this.file = Gio.File.new_for_path(path);
    } else {
        this.file = Gio.File.new_for_uri(path);
    }
}

File.prototype.exists = function () {
    let exists = false;
    try {
        exists = this.file.query_exists(null);
    } catch (err) {
        log(`[${Me.metadata.name}] Error reading ${this.file.get_path()}: ${err}`);
    }
    return exists;
};

File.prototype.read = function (delimiter = '', stripHeader = false) {
    return new Promise((resolve, reject) => {
        try {
            this.file.load_contents_async(null, function (file, res) {
                try {
                    // grab contents of file or website
                    let contents = file.load_contents_finish(res)[1];

                    // convert contents to string
                    contents = convertUint8ArrayToString(contents);

                    // split contents by delimiter if passed in
                    if (delimiter) {
                        contents = contents.split(delimiter);
                    }

                    // optionally strip header when converting to a list
                    if (stripHeader) {
                        contents.shift();
                    }

                    // return results
                    resolve(contents);
                } catch (e) {
                    reject(e.message);
                }
            });
        } catch (e) {
            reject(e.message);
        }
    });
};