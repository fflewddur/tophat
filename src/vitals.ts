import Gio from 'gi://Gio';

import { File } from './file.js';

const MAX_HISTORY = 100;
const RE_MEM_INFO = /:\s+(\d+)/;

export class Vitals {
  private procs = new Map<string, Process>();
  private uptime = 0;
  private cpuModel: CpuModel;
  private cpuUsageHistory = new Array<CpuUsage>(MAX_HISTORY);
  private cpuState: CpuState;
  private memInfo: MemInfo;
  private memUsageHistory = new Array<MemUsage>(MAX_HISTORY);

  constructor(model: CpuModel) {
    this.cpuModel = model;
    this.cpuState = new CpuState(model.cores);
    this.memInfo = new MemInfo();
  }

  public read() {
    // Because /proc is a virtual FS, maybe we can get away with sync IO?
    console.time('read /proc/');
    this.loadUptime();
    this.loadStat();
    this.loadMeminfo();
    this.loadProcessList();
    console.timeEnd('read /proc/');
  }

  private loadUptime() {
    const f = new File('/proc/uptime');
    const contents = f.readSync();
    this.uptime = parseInt(contents.substring(0, contents.indexOf(' ')));
    console.log(`[TopHat] uptime = ${this.uptime}`);
  }

  private loadStat() {
    const f = new File('/proc/stat');
    const contents = f.readSync();
    const lines = contents.split('\n');
    const usage = new CpuUsage(this.cpuModel.cores);
    lines.forEach((line: string) => {
      if (line.startsWith('cpu')) {
        const re =
          /^cpu(\d*)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)/;
        const m = line.match(re);
        if (m && !m[1]) {
          // These are aggregate CPU statistics
          const usedTime =
            parseInt(m[2]) +
            parseInt(m[3]) +
            parseInt(m[4]) +
            parseInt(m[6]) +
            parseInt(m[7]) +
            parseInt(m[8]) +
            parseInt(m[9]) +
            parseInt(m[10]);
          const idleTime = parseInt(m[5]);
          this.cpuState.update(usedTime, idleTime);
          usage.aggregate = this.cpuState.usage();
        } else if (m) {
          // These are per-core statistics
          const core = parseInt(m[1]);
          const usedTime =
            parseInt(m[2]) +
            parseInt(m[3]) +
            parseInt(m[4]) +
            parseInt(m[6]) +
            parseInt(m[7]) +
            parseInt(m[8]) +
            parseInt(m[9]) +
            parseInt(m[10]);
          const idleTime = parseInt(m[5]);
          this.cpuState.updateCore(core, usedTime, idleTime);
          usage.core[core] = this.cpuState.coreUsage(core);
        }
      }
      if (this.cpuUsageHistory.unshift(usage) > MAX_HISTORY) {
        this.cpuUsageHistory.pop();
      }
    });
    console.log(`CPU usage: ${usage}`);
  }

  private loadMeminfo() {
    const f = new File('/proc/meminfo');
    const contents = f.readSync();
    const lines = contents.split('\n');
    const usage = new MemUsage();
    lines.forEach((line: string) => {
      if (line.startsWith('MemTotal:')) {
        this.memInfo.total = readKb(line);
      } else if (line.startsWith('MemAvailable:')) {
        this.memInfo.available = readKb(line);
      } else if (line.startsWith('SwapTotal:')) {
        this.memInfo.swapTotal = readKb(line);
      } else if (line.startsWith('SwapFree:')) {
        this.memInfo.swapAvailable = readKb(line);
      }
    });
    usage.usedMem =
      (this.memInfo.total - this.memInfo.available) / this.memInfo.total;
    usage.usedSwap =
      (this.memInfo.swapTotal - this.memInfo.swapAvailable) /
      this.memInfo.swapTotal;
    if (this.memUsageHistory.unshift(usage) > MAX_HISTORY) {
      this.memUsageHistory.pop();
    }
    console.log(
      `Mem usage: ${(usage.usedMem * 100).toFixed(0)}% of ${(this.memInfo.total / 1000 / 1000).toFixed(1)} GB\n` +
        `Swap usage: ${(usage.usedSwap * 100).toFixed(0)}% of ${(this.memInfo.swapTotal / 1000 / 1000).toFixed(1)} GB`
    );
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
        const p = this.loadProcessStat(name);
        this.procs.set(p.id, p);
        this.loadSmapsRollupForProcess(p);
        this.loadIoForProcess(p);
      }
    }
  }

  private loadProcessStat(name: string): Process {
    const f = new File('/proc/' + name + '/stat');
    const contents = f.readSync();
    // console.log(`[TopHat] contents for ${f.name()}: ${contents}`);
    let p = this.procs.get(name);
    if (p === undefined) {
      p = new Process();
    }
    p.id = name;
    p.parseStat(contents);

    return p;
  }

  private loadSmapsRollupForProcess(p: Process): void {
    const f = new File('/proc/' + p.id + '/smaps_rollup');
    const contents = f.readSync(false);
    p.parseSmapsRollup(contents);
  }

  private loadIoForProcess(p: Process): void {
    const f = new File('/proc/' + p.id + '/io');
    const contents = f.readSync(false);
    p.parseIo(contents);
  }

  public getTopCpuProcs(n: number) {
    log('Top CPU processes:');
    let top = Array.from(this.procs.values());
    top = top.sort((x, y) => {
      return x.cpuUsage() - y.cpuUsage();
    });
    top = top.reverse().slice(0, n);
    top.forEach((p) => {
      if (p.cpuUsage() > 0) {
        console.log(
          `  ${p.cmd} (${p.id}) ` +
            `usage: ${((p.cpuUsage() / this.cpuState.totalTime()) * 100).toFixed(0)}%`
        );
      }
    });
    //TODO: return list of details for UI
  }

  public getTopMemProcs(n: number) {
    log('Top memory processes:');
    let top = Array.from(this.procs.values());
    top = top.sort((x, y) => {
      return x.memUsage() - y.memUsage();
    });
    top = top.reverse().slice(0, n);
    top.forEach((p) => {
      console.log(
        `  ${p.cmd} (${p.id}) usage: ${(p.memUsage() / 1000).toFixed(0)} MB`
      );
    });
    // TODO: return list of details for UI
  }

  public getTopDiskProcs(n: number) {
    log('Top disk processes:');
    let top = Array.from(this.procs.values());
    top = top.sort((x, y) => {
      return x.diskReads() + x.diskWrites() - (y.diskReads() + y.diskWrites());
    });
    top = top.reverse().slice(0, n);
    top.forEach((p) => {
      if (p.diskReads() + p.diskWrites() > 0) {
        console.log(
          `  ${p.cmd} (${p.id}) read: ${(p.diskReads() / 1000).toFixed(0)} KB written: ${(p.diskWrites() / 1000).toFixed(0)} KB`
        );
      }
    });
    // TODO: return list of details for UI
  }
}

class CpuState {
  public usedTime: number;
  public usedTimePrev: number;
  public idleTime: number;
  public idleTimePrev: number;
  public coreUsedTime: Array<number>;
  public coreUsedTimePrev: Array<number>;
  public coreIdleTime: Array<number>;
  public coreIdleTimePrev: Array<number>;

  constructor(cores: number, usedTime = 0, idleTime = 0) {
    this.usedTime = usedTime;
    this.usedTimePrev = 0;
    this.idleTime = idleTime;
    this.idleTimePrev = 0;
    this.coreUsedTime = new Array<number>(cores);
    this.coreUsedTimePrev = new Array<number>(cores);
    this.coreIdleTime = new Array<number>(cores);
    this.coreIdleTimePrev = new Array<number>(cores);
    for (let i = 0; i < cores; i++) {
      this.coreUsedTime[i] = 0;
      this.coreIdleTime[i] = 0;
      this.coreUsedTimePrev[i] = 0;
      this.coreIdleTimePrev[i] = 0;
    }
  }

  public update(usedTime: number, idleTime: number) {
    this.usedTimePrev = this.usedTime;
    this.usedTime = usedTime;
    this.idleTimePrev = this.idleTime;
    this.idleTime = idleTime;
  }

  public updateCore(core: number, usedTime: number, idleTime: number) {
    this.coreUsedTimePrev[core] = this.coreUsedTime[core];
    this.coreUsedTime[core] = usedTime;
    this.coreIdleTimePrev[core] = this.coreIdleTime[core];
    this.coreIdleTime[core] = idleTime;
  }

  public usage(): number {
    const usedTimeDelta = this.usedTime - this.usedTimePrev;
    const idleTimeDelta = this.idleTime - this.idleTimePrev;
    return usedTimeDelta / (usedTimeDelta + idleTimeDelta);
  }

  public coreUsage(core: number): number {
    const usedTimeDelta = this.coreUsedTime[core] - this.coreUsedTimePrev[core];
    const idleTimeDelta = this.coreIdleTime[core] - this.coreIdleTimePrev[core];
    return usedTimeDelta / (usedTimeDelta + idleTimeDelta);
  }

  public totalTime(): number {
    return (
      this.usedTime - this.usedTimePrev + (this.idleTime - this.idleTimePrev)
    );
  }
}

class CpuUsage {
  public aggregate: number;
  public core: Array<number>;

  constructor(cores: number) {
    this.aggregate = 0;
    this.core = new Array<number>(cores);
    for (let i = 0; i < cores; i++) {
      this.core[i] = 0;
    }
  }

  public toString(): string {
    let s = `aggregate: ${this.aggregate.toFixed(2)}`;
    this.core.forEach((usage, index) => {
      s += ` core[${index}]: ${this.core[index].toFixed(2)}`;
    });
    return s;
  }
}

export class CpuModel {
  public name: string;
  public cores: number;

  constructor(name = 'Unknown', cores = 1) {
    this.name = name;
    this.cores = cores;
  }
}

class MemInfo {
  public total = 0;
  public available = 0;
  public swapTotal = 0;
  public swapAvailable = 0;
}

class MemUsage {
  public usedMem = 0;
  public usedSwap = 0;

  public toString(): string {
    return `Memory usage: ${this.usedMem.toFixed(2)} Swap usage: ${this.usedSwap.toFixed(2)}`;
  }
}

class Process {
  public id = '';
  public cmd = '';
  public utime = 0;
  public stime = 0;
  public guest_time = 0;
  public pss = 0;
  public cpu = 0;
  public cpuPrev = 0;
  public diskRead = 0;
  public diskWrite = 0;
  public diskReadPrev = 0;
  public diskWritePrev = 0;

  public cpuUsage(): number {
    return this.cpu - this.cpuPrev;
  }

  public memUsage(): number {
    return this.pss;
  }

  public diskReads(): number {
    return this.diskRead - this.diskReadPrev;
  }

  public diskWrites(): number {
    return this.diskWrite - this.diskWritePrev;
  }

  public parseStat(stat: string) {
    const open = stat.indexOf('(');
    const close = stat.indexOf(')');
    if (open > 0 && close > 0) {
      this.cmd = stat.substring(open + 1, close);
    }
    const fields = stat.substring(close + 2).split(' ');
    this.utime = parseInt(fields[11]);
    this.stime = parseInt(fields[12]);
    this.guest_time = parseInt(fields[40]);
    this.cpuPrev = this.cpu;
    this.cpu = this.utime + this.stime + this.guest_time;
  }

  public parseSmapsRollup(content: string) {
    const lines = content.split('\n');
    lines.forEach((line) => {
      if (line.startsWith('Pss:')) {
        this.pss = readKb(line);
      }
    });
  }

  public parseIo(content: string) {
    const lines = content.split('\n');
    lines.forEach((line) => {
      if (line.startsWith('read_bytes:')) {
        this.diskReadPrev = this.diskRead;
        this.diskRead = readKb(line);
      } else if (line.startsWith('write_bytes')) {
        this.diskWritePrev = this.diskWrite;
        this.diskWrite = readKb(line);
      }
    });
  }
}

function readKb(line: string): number {
  const m = line.match(RE_MEM_INFO);
  let kb = 0;
  if (m) {
    kb = parseInt(m[1]);
  }
  return kb;
}
