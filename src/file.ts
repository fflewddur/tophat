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