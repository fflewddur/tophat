// Based upon https://github.com/corecoding/Vitals/blob/master/helpers/file.js

import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

var Decoder;
try {
    Decoder = new TextDecoder('utf-8');
} catch (error) {
    console.error(`Could not create TextDecoder: ${error}`);
}

export class File {
    constructor(path) {
        if (path.indexOf('https://') === -1) {
            this.file = Gio.File.new_for_path(path);
        } else {
            this.file = Gio.File.new_for_uri(path);
        }
    }

    exists() {
        let exists = false;
        try {
            exists = this.file.query_exists(null);
        } catch (err) {
            console.error(`[TopHat] Error reading ${this.file.get_path()}: ${err}`);
        }
        return exists;
    }

    read(delimiter = '', stripHeader = false) {
        return new Promise((resolve, reject) => {
            try {
                this.file.load_contents_async(null, function (file, res) {
                    try {
                        // grab contents of file or website
                        let contents = file.load_contents_finish(res)[1];

                        // convert contents to string
                        contents = Decoder.decode(contents).trim();

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
    }

    readSync() {
        let contents = null;
        try {
            contents = this.file.load_contents(null)[1];
            contents = Decoder.decode(contents).trim();
        } catch (e) {
            console.error(`[TopHat] Error reading ${this.file.get_path()}: ${e}`);
        }
        return contents;
    }

    list() {
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
    }
}





