import Gio from 'gi://Gio';
// import GLib from 'gi://GLib';

export class Vitals {
  public read() {
    // Because /proc is a virtual FS, maybe we can get away with sync IO
    console.time('read /proc/');
    // console.log('Vitals.read()');
    const ps = this.getProcessList();
    console.log(`ps len=${ps.length}`);
    console.log(`ps: ${ps.join(', ')}`);
    console.timeEnd('read /proc/');
  }

  private getProcessList(): string[] {
    const directory = Gio.File.new_for_path('/proc/');
    // console.log('enumerating children...');
    const iter = directory.enumerate_children(
      'standard::*',
      Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS,
      null
    );
    const pl = new Array<string>();
    while (true) {
      const fileInfo = iter.next_file(null);
      if (fileInfo === null) {
        break;
      }
      const name = fileInfo.get_name();
      if (
        name[0] == '0' ||
        name[0] == '1' ||
        name[0] == '2' ||
        name[0] == '3' ||
        name[0] == '4' ||
        name[0] == '5' ||
        name[0] == '6' ||
        name[0] == '7' ||
        name[0] == '8' ||
        name[0] == '9'
      ) {
        pl.push(name);
      }
      // console.log(`[TopHat] file: ${fileInfo.get_name()}`);
    }
    return pl;
  }
}
