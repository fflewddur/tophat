import Gio from 'gi://Gio';
// import GLib from 'gi://GLib';

import { File } from './file.js';

export class Vitals {
  private procs = new Map<string, Process>();

  public read() {
    // Because /proc is a virtual FS, maybe we can get away with sync IO?
    console.time('read /proc/');
    // TODO: load /proc/uptime
    // TODO: load /proc/stat
    // TODO: load /proc/meminfo
    // TODO: load /proc/[id]/statm for memory info
    this.loadProcessList();
    console.timeEnd('read /proc/');
  }

  private loadProcessList() {
    const directory = Gio.File.new_for_path('/proc/');
    // console.log('enumerating children...');
    const iter = directory.enumerate_children(
      'standard::*',
      Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS,
      null
    );
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
        const f = new File('/proc/' + name + '/stat');
        const contents = f.readSync();
        // console.log(`[TopHat] contents for ${f.name()}: ${contents}`);
        let p = this.procs.get(name);
        if (p === undefined) {
          p = new Process();
        }
        p.id = name;
        p.parseStat(contents);
        this.procs.set(p.id, p);
        console.log(
          `[TopHat] ${p.id} ${p.cmd} cpu:${p.cpu} cpuPrev:${p.cpuPrev} vsize:${p.vsize} rss:${p.rss}`
        );
      }
    }
  }
}

class Process {
  public id = '';
  public cmd = '';
  public utime = 0;
  public stime = 0;
  public guest_time = 0;
  public vsize = 0;
  public rss = 0;
  public cpu = 0;
  public cpuPrev = 0;

  parseStat(stat: string) {
    const open = stat.indexOf('(');
    const close = stat.indexOf(')');
    if (open > 0 && close > 0) {
      this.cmd = stat.substring(open + 1, close);
    }
    const fields = stat.substring(close + 2).split(' ');
    this.utime = parseInt(fields[11]);
    this.stime = parseInt(fields[12]);
    this.guest_time = parseInt(fields[40]);
    this.vsize = parseInt(fields[20]);
    this.rss = parseInt(fields[21]);
    this.cpuPrev = this.cpu;
    this.cpu = this.utime + this.stime + this.guest_time;
  }
}
