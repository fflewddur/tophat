// Based upon https://github.com/corecoding/Vitals/blob/master/helpers/file.js

const GLib = imports.gi.GLib;
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

File.prototype.list = function () {
    return new Promise((resolve, reject) => {
        let maxItems = 125, results = [];

        try {
            this.file.enumerate_children_async(Gio.FILE_ATTRIBUTE_STANDARD_NAME, Gio.FileQueryInfoFlags.NONE, GLib.PRIORITY_LOW, null, function (file, outerRes) {
                try {
                    let outerEnumerator = file.enumerate_children_finish(outerRes);
                    let callback = (enumerator, res) => {
                        try {
                            let files = enumerator.next_files_finish(res);
                            for (let i = 0; i < files.length; i++) {
                                results.push(files[i].get_attribute_as_string(Gio.FILE_ATTRIBUTE_STANDARD_NAME));
                            }

                            if (files.length === 0) {
                                enumerator.close_async(GLib.PRIORITY_LOW, null, function () { });
                                resolve(results);
                            } else {
                                enumerator.next_files_async(maxItems, GLib.PRIORITY_LOW, null, callback);
                            }
                        } catch (e) {
                            reject(e.message);
                        }
                    };

                    outerEnumerator.next_files_async(maxItems, GLib.PRIORITY_LOW, null, callback);
                } catch (e) {
                    reject(e.message);
                }
            });
        } catch (e) {
            reject(e.message);
        }
    });
};
