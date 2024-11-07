import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import GLib from 'gi://GLib';

import { File } from './file.js';

export const SummaryInterval = 3;
export const MaxHistoryLen = 50;

const SECTOR_SIZE = 512; // in bytes
const RE_MEM_INFO = /:\s+(\d+)/;
const RE_NET_DEV = /^\s*(\w+):/;
const RE_NET_ACTIVITY =
  /:\s*(\d+)\s+\d+\s+\d+\s+\d+\s+\d+\s+\d+\s+\d+\s+\d+\s+(\d+)/;
const RE_DISK_STATS =
  /^\s*\d+\s+\d+\s+(\w+)\s+\d+\s+\d+\s+(\d+)\s+\d+\s+\d+\s+\d+\s+(\d+)/;
const RE_NVME_DEV = /^nvme\d+n\d+$/;
const RE_BLOCK_DEV = /^[^\d]+$/;

export const Vitals = GObject.registerClass(
  {
    GTypeName: 'Vitals',
    Properties: {
      uptime: GObject.ParamSpec.int(
        'uptime',
        'System uptime',
        'System uptime in seconds',
        GObject.ParamFlags.READWRITE,
        0,
        0,
        0
      ),
      'cpu-usage': GObject.ParamSpec.int(
        'cpu-usage',
        'CPU usage',
        'Proportion of CPU usage as a value between 0 - 100',
        GObject.ParamFlags.READWRITE,
        0,
        100,
        0
      ),
      'cpu-model': GObject.ParamSpec.string(
        'cpu-model',
        'CPU model',
        'CPU model',
        GObject.ParamFlags.READWRITE,
        ''
      ),
      'cpu-freq': GObject.ParamSpec.int(
        'cpu-freq',
        'CPU frequency',
        'Average CPU frequency across all cores',
        GObject.ParamFlags.READWRITE,
        0,
        0,
        0
      ),
      'cpu-temp': GObject.ParamSpec.int(
        'cpu-temp',
        'CPU temperature',
        'CPU temperature in degrees Celsius',
        GObject.ParamFlags.READWRITE,
        0,
        0,
        0
      ),
      'cpu-history': GObject.ParamSpec.string(
        'cpu-history',
        'CPU usage history',
        'CPU usage history',
        GObject.ParamFlags.READWRITE,
        ''
      ),
      'cpu-top-procs': GObject.ParamSpec.string(
        'cpu-top-procs',
        'CPU top processes',
        'Top CPU-consuming processes',
        GObject.ParamFlags.READWRITE,
        ''
      ),
      'ram-usage': GObject.ParamSpec.int(
        'ram-usage',
        'RAM usage',
        'Proportion of RAM usage as a value between 0 - 100',
        GObject.ParamFlags.READWRITE,
        0,
        100,
        0
      ),
      'ram-size': GObject.ParamSpec.int(
        'ram-size',
        'RAM size',
        'Size of system memory in GB',
        GObject.ParamFlags.READWRITE,
        0,
        0,
        0
      ),
      'ram-size-free': GObject.ParamSpec.int(
        'ram-size-free',
        'RAM size free',
        'Size of available system memory in GB',
        GObject.ParamFlags.READWRITE,
        0,
        0,
        0
      ),
      'swap-usage': GObject.ParamSpec.int(
        'swap-usage',
        'Swap usage',
        'Proportion of swap usage as a value between 0 - 100',
        GObject.ParamFlags.READWRITE,
        0,
        100,
        0
      ),
      'swap-size': GObject.ParamSpec.int(
        'swap-size',
        'Swap size',
        'Size of swap space in GB',
        GObject.ParamFlags.READWRITE,
        0,
        0,
        0
      ),
      'swap-size-free': GObject.ParamSpec.int(
        'swap-size-free',
        'Swap size free',
        'Size of available swap space in GB',
        GObject.ParamFlags.READWRITE,
        0,
        0,
        0
      ),
      'mem-history': GObject.ParamSpec.string(
        'mem-history',
        'Memory usage history',
        'Memory usage history',
        GObject.ParamFlags.READWRITE,
        ''
      ),
      'mem-top-procs': GObject.ParamSpec.string(
        'mem-top-procs',
        'Memory top processes',
        'Top memory-consuming processes',
        GObject.ParamFlags.READWRITE,
        ''
      ),
      'net-recv': GObject.ParamSpec.int(
        'net-recv',
        'Network bytes received',
        'Number of bytes recently received via network interfaces',
        GObject.ParamFlags.READWRITE,
        0,
        0,
        0
      ),
      'net-sent': GObject.ParamSpec.int(
        'net-sent',
        'Network bytes sent',
        'Number of bytes recently sent via network interfaces',
        GObject.ParamFlags.READWRITE,
        0,
        0,
        0
      ),
      'net-recv-total': GObject.ParamSpec.int(
        'net-recv-total',
        'Total network bytes received',
        'Number of bytes received via network interfaces',
        GObject.ParamFlags.READWRITE,
        0,
        0,
        0
      ),
      'net-sent-total': GObject.ParamSpec.int(
        'net-sent-total',
        'Total network bytes sent',
        'Number of bytes sent via network interfaces',
        GObject.ParamFlags.READWRITE,
        0,
        0,
        0
      ),
      'disk-read': GObject.ParamSpec.int(
        'disk-read',
        'Bytes read from disk',
        'Number of bytes recently read from disk',
        GObject.ParamFlags.READWRITE,
        0,
        0,
        0
      ),
      'disk-wrote': GObject.ParamSpec.int(
        'disk-wrote',
        'Bytes written to disk',
        'Number of bytes recently written to disk',
        GObject.ParamFlags.READWRITE,
        0,
        0,
        0
      ),
      'disk-top-procs': GObject.ParamSpec.string(
        'disk-top-procs',
        'Disk activity top processes',
        'Top processes in terms of disk activity',
        GObject.ParamFlags.READWRITE,
        ''
      ),
    },
  },
  class Vitals extends GObject.Object {
    private procs = new Map<string, Process>();
    public cpuModel: CpuModel;
    private cpuUsageHistory = new Array<CpuUsage>(MaxHistoryLen);
    private cpuState: CpuState;
    public memInfo: MemInfo;
    private memUsageHistory = new Array<MemUsage>(MaxHistoryLen);
    private netState: NetDevState;
    private netActivityHistory = new Array<NetActivity>(MaxHistoryLen);
    private diskState: DiskState;
    private diskActivityHistory = new Array<DiskActivity>(MaxHistoryLen);
    private _uptime = 0;
    private _cpu_usage = 0;
    private _cpu_freq = 0;
    private _cpu_temp = 0;
    private _cpu_history = '';
    private _cpu_top_procs = '';
    private _ram_usage = 0;
    private _ram_size = 0;
    private _ram_size_free = 0;
    private _swap_usage = -1;
    private _swap_size = -1;
    private _swap_size_free = 0;
    private _mem_history = '';
    private _mem_top_procs = '';
    private _net_recv = 0;
    private _net_sent = 0;
    private _net_recv_total = 0;
    private _net_sent_total = 0;
    private _disk_read = 0;
    private _disk_wrote = 0;
    private _disk_top_procs = '';
    private summaryLoop = 0;
    private detailsLoop = 0;

    constructor(model: CpuModel) {
      super();
      this.cpuModel = model;
      this.cpuState = new CpuState(model.cores, model.tempMonitors.size);
      this.memInfo = new MemInfo();
      this.netState = new NetDevState();
      this.diskState = new DiskState();
    }

    public start(): void {
      setTimeout(() => this.readSummaries(), 0);
      if (this.summaryLoop === 0) {
        this.summaryLoop = GLib.timeout_add_seconds(
          GLib.PRIORITY_DEFAULT,
          SummaryInterval,
          () => this.readSummaries()
        );
      }
      if (this.detailsLoop === 0) {
        this.detailsLoop = GLib.timeout_add_seconds(
          GLib.PRIORITY_DEFAULT,
          9,
          () => this.readDetails()
        );
      }
    }

    public stop(): void {
      if (this.summaryLoop > 0) {
        GLib.source_remove(this.summaryLoop);
        this.summaryLoop = 0;
      }
      if (this.detailsLoop > 0) {
        GLib.source_remove(this.detailsLoop);
        this.detailsLoop = 0;
      }
    }

    // readSummaries queries all of the info needed by the topbar widgets
    public readSummaries(): boolean {
      // Because /proc is a virtual FS, maybe we can get away with sync IO?
      console.time('readSummaries()');
      this.loadUptime();
      this.loadStat();
      this.loadMeminfo();
      this.loadNetDev();
      this.loadDiskstats();
      console.timeEnd('readSummaries()');
      return true;
    }

    // readDetails queries the info needed by the monitor menus
    public readDetails(): boolean {
      // Because /proc is a virtual FS, maybe we can get away with sync IO?
      console.time('readDetails()');
      this.loadTemps();
      this.loadFreqs();
      this.loadStatDetails();
      this.loadProcessList();
      // FIXME: Compute a hash from the top processes instead of using a random number to trigger the UI refresh
      this.cpu_top_procs = Math.random().toFixed(8);
      this.mem_top_procs = Math.random().toFixed(8);
      this.disk_top_procs = Math.random().toFixed(8);
      console.timeEnd('readDetails()');
      return true;
    }

    private loadUptime() {
      const f = new File('/proc/uptime');
      const contents = f.readSync();
      this.uptime = parseInt(contents.substring(0, contents.indexOf(' ')));
      // console.log(`[TopHat] uptime = ${this.uptime}`);
    }

    private loadStat() {
      const f = new File('/proc/stat');
      const contents = f.readSync();
      const lines = contents.split('\n');
      const usage = new CpuUsage(this.cpuModel.cores);
      lines.forEach((line: string) => {
        if (line.startsWith('cpu')) {
          const re = /^cpu(\d*)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)/;
          const m = line.match(re);
          if (m && !m[1]) {
            // These are aggregate CPU statistics
            const usedTime = parseInt(m[2]) + parseInt(m[4]);
            const idleTime = parseInt(m[5]);
            this.cpuState.update(usedTime, idleTime);
            usage.aggregate = this.cpuState.usage();
          } else if (m) {
            // These are per-core statistics
            const core = parseInt(m[1]);
            const usedTime = parseInt(m[2]) + parseInt(m[4]);
            const idleTime = parseInt(m[5]);
            this.cpuState.updateCore(core, usedTime, idleTime);
            usage.core[core] = this.cpuState.coreUsage(core);
          }
        }
        if (this.cpuUsageHistory.unshift(usage) > MaxHistoryLen) {
          this.cpuUsageHistory.pop();
        }
      });
      this.cpu_usage = usage.aggregate;
      // FIXME: Compute a hash of the history array instead of using a random number
      this.cpu_history = Math.random().toFixed(8);
    }

    private loadStatDetails() {
      const f = new File('/proc/stat');
      const contents = f.readSync();
      const lines = contents.split('\n');
      for (const line of lines) {
        if (line.startsWith('cpu')) {
          const re = /^cpu(\d*)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)/;
          const m = line.match(re);
          if (m && !m[1]) {
            // These are aggregate CPU statistics
            const usedTime = parseInt(m[2]) + parseInt(m[4]);
            const idleTime = parseInt(m[5]);
            this.cpuState.updateDetails(usedTime + idleTime);
            break;
          }
        }
      }
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
      if (this.memUsageHistory.unshift(usage) > MaxHistoryLen) {
        this.memUsageHistory.pop();
      }
      this.ram_usage = usage.usedMem;
      this.ram_size = this.memInfo.total * 1024;
      this.ram_size_free = this.memInfo.available * 1024;
      this.swap_usage = usage.usedSwap;
      this.swap_size = this.memInfo.swapTotal * 1024;
      this.swap_size_free = this.memInfo.swapAvailable * 1024;
      // FIXME: Compute a hash of the history array instead of using a random number
      this.mem_history = Math.random().toFixed(8);
    }

    private loadNetDev() {
      const f = new File('/proc/net/dev');
      const contents = f.readSync();
      const lines = contents.split('\n');
      let bytesRecv = 0;
      let bytesSent = 0;

      lines.forEach((line) => {
        let m = line.match(RE_NET_DEV);
        if (m) {
          const dev = m[1];
          if (dev !== 'lo') {
            m = line.match(RE_NET_ACTIVITY);
            if (m) {
              bytesRecv += parseInt(m[1]);
              bytesSent += parseInt(m[2]);
            }
          }
        }
      });
      this.netState.update(bytesRecv, bytesSent);
      this.net_recv_total = bytesRecv;
      this.net_sent_total = bytesSent;
      const netActivity = new NetActivity();
      netActivity.bytesRecv = this.netState.recvActivity();
      netActivity.bytesSent = this.netState.sentActivity();
      if (this.netActivityHistory.unshift(netActivity) > MaxHistoryLen) {
        this.netActivityHistory.pop();
      }
      this.net_recv = netActivity.bytesRecv;
      this.net_sent = netActivity.bytesSent;
    }

    private loadDiskstats() {
      const f = new File('/proc/diskstats');
      const contents = f.readSync();
      const lines = contents.split('\n');
      let bytesRead = 0;
      let bytesWritten = 0;

      lines.forEach((line) => {
        const m = line.match(RE_DISK_STATS);
        if (m) {
          const dev = m[1];
          if (dev.startsWith('loop')) {
            return;
          }
          if (dev.startsWith('nvme')) {
            const dm = dev.match(RE_NVME_DEV);
            if (dm) {
              bytesRead += parseInt(m[2]) * SECTOR_SIZE;
              bytesWritten += parseInt(m[3]) * SECTOR_SIZE;
            }
          } else {
            const dm = dev.match(RE_BLOCK_DEV);
            if (dm) {
              bytesRead += parseInt(m[2]) * SECTOR_SIZE;
              bytesWritten += parseInt(m[3]) * SECTOR_SIZE;
            }
          }
        }
      });
      this.diskState.update(bytesRead, bytesWritten);
      const diskActivity = new DiskActivity();
      diskActivity.bytesRead = this.diskState.readActivity();
      diskActivity.bytesWritten = this.diskState.writeActivity();
      if (this.diskActivityHistory.unshift(diskActivity) > MaxHistoryLen) {
        this.diskActivityHistory.pop();
      }
      this.disk_read = diskActivity.bytesRead;
      this.disk_wrote = diskActivity.bytesWritten;
    }

    private loadTemps() {
      this.cpuModel.tempMonitors.forEach((file, i) => {
        this.cpuState.temps[i] = parseInt(new File(file).readSync());
        if (i === 0) {
          this.cpu_temp = this.cpuState.temps[i];
        }
      });
    }

    private loadFreqs() {
      const f = new File('/proc/cpuinfo');
      const lines = f.readSync();
      const blocks = lines.split('\n\n');
      let freq = 0;
      for (const block of blocks) {
        const m = block.match(/cpu MHz\s*:\s*(\d+)/);
        if (m) {
          freq += parseInt(m[1]);
        }
      }
      this.cpu_freq = freq / this.cpuModel.cores;
    }

    private loadProcessList() {
      const curProcs = new Map<string, Process>();
      const directory = Gio.File.new_for_path('/proc/');
      const iter = directory.enumerate_children(
        Gio.FILE_ATTRIBUTE_STANDARD_NAME,
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
          curProcs.set(p.id, p);
          p.setTotalTime(
            this.cpuState.totalTimeDetails - this.cpuState.totalTimeDetailsPrev
          );
          this.loadSmapsRollupForProcess(p);
          this.loadIoForProcess(p);
        }
      }
      this.procs = curProcs;
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
      // log('Top CPU processes:');
      let top = Array.from(this.procs.values());
      top = top.sort((x, y) => {
        return x.cpuUsage() - y.cpuUsage();
      });
      top = top.reverse().slice(0, n);
      // top.forEach((p) => {
      //   if (p.cpuUsage() > 0) {
      //     // console.log(
      //     //   `  ${p.cmd} (${p.id}) ` +
      //     //     `usage: ${((p.cpuUsage() / this.cpuState.totalTime()) * 100).toFixed(0)}%`
      //     // );
      //   }
      // });
      return top;
    }

    public getTopMemProcs(n: number) {
      // log('Top memory processes:');
      let top = Array.from(this.procs.values());
      top = top.sort((x, y) => {
        return x.memUsage() - y.memUsage();
      });
      top = top.reverse().slice(0, n);
      // top.forEach((p) => {
      //   console.log(
      //     `  ${p.cmd} (${p.id}) usage: ${(p.memUsage() / 1000).toFixed(0)} MB`
      //   );
      // });
      return top;
    }

    public getTopDiskProcs(n: number) {
      // log('Top disk processes:');
      let top = Array.from(this.procs.values());
      top = top.sort((x, y) => {
        return (
          x.diskReads() + x.diskWrites() - (y.diskReads() + y.diskWrites())
        );
      });
      top = top.reverse().slice(0, n);
      // top.forEach((p) => {
      //   if (p.diskReads() + p.diskWrites() > 0) {
      //     // console.log(
      //     //   `  ${p.cmd} (${p.id}) read: ${(p.diskReads() / 1000).toFixed(0)} KB written: ${(p.diskWrites() / 1000).toFixed(0)} KB`
      //     // );
      //   }
      // });
      return top;
    }

    // Properties

    public get cpu_usage(): number {
      return this._cpu_usage;
    }

    private set cpu_usage(v: number) {
      if (this.cpu_usage === v) {
        return;
      }
      this._cpu_usage = v;
      this.notify('cpu-usage');
    }

    public get cpu_model(): string {
      return this.cpuModel.name;
    }

    public get cpu_freq(): number {
      return this._cpu_freq;
    }

    private set cpu_freq(v: number) {
      if (this.cpu_freq === v) {
        return;
      }
      this._cpu_freq = v;
      this.notify('cpu-freq');
    }

    public get cpu_temp(): number {
      return this._cpu_temp;
    }

    private set cpu_temp(v: number) {
      if (this.cpu_temp === v) {
        return;
      }
      this._cpu_temp = v;
      this.notify('cpu-temp');
    }

    public get cpu_top_procs() {
      return this._cpu_top_procs;
    }

    private set cpu_top_procs(v: string) {
      if (this.cpu_top_procs === v) {
        return;
      }
      this._cpu_top_procs = v;
      this.notify('cpu-top-procs');
    }

    public get cpu_history() {
      return this._cpu_history;
    }

    private set cpu_history(v: string) {
      if (this.cpu_history === v) {
        return;
      }
      this._cpu_history = v;
      this.notify('cpu-history');
    }

    public get ram_usage(): number {
      return this._ram_usage;
    }

    private set ram_usage(v: number) {
      if (this.ram_usage === v) {
        return;
      }
      this._ram_usage = v;
      this.notify('ram-usage');
    }

    public get ram_size(): number {
      return this._ram_size;
    }

    private set ram_size(v: number) {
      if (this.ram_size === v) {
        return;
      }
      this._ram_size = v;
      this.notify('ram-size');
    }

    public get ram_size_free(): number {
      return this._ram_size_free;
    }

    public set ram_size_free(v: number) {
      if (this._ram_size_free === v) {
        return;
      }
      this._ram_size_free = v;
      this.notify('ram-size-free');
    }

    public get swap_usage(): number {
      return this._swap_usage;
    }

    private set swap_usage(v: number) {
      if (this.swap_usage === v) {
        return;
      }
      this._swap_usage = v;
      this.notify('swap-usage');
    }

    public get swap_size(): number {
      return this._swap_size;
    }

    private set swap_size(v: number) {
      if (this.swap_size === v) {
        return;
      }
      this._swap_size = v;
      this.notify('swap-size');
    }

    public get swap_size_free(): number {
      return this._swap_size_free;
    }

    public set swap_size_free(v: number) {
      if (this.swap_size_free === v) {
        return;
      }
      this._swap_size_free = v;
      this.notify('swap-size-free');
    }

    public get mem_history() {
      return this._mem_history;
    }

    private set mem_history(v: string) {
      if (this.mem_history === v) {
        return;
      }
      this._mem_history = v;
      this.notify('mem-history');
    }

    public get mem_top_procs() {
      return this._mem_top_procs;
    }

    private set mem_top_procs(v: string) {
      if (this.mem_top_procs === v) {
        return;
      }
      this._mem_top_procs = v;
      this.notify('mem-top-procs');
    }

    public get net_recv() {
      return this._net_recv;
    }

    private set net_recv(v: number) {
      if (this.net_recv === v) {
        return;
      }
      this._net_recv = v;
      this.notify('net-recv');
    }

    public get net_sent() {
      return this._net_sent;
    }

    private set net_sent(v: number) {
      if (this.net_sent === v) {
        return;
      }
      this._net_sent = v;
      this.notify('net-sent');
    }

    public get net_recv_total() {
      return this._net_recv_total;
    }

    private set net_recv_total(v: number) {
      if (this.net_recv_total === v) {
        return;
      }
      this._net_recv_total = v;
      this.notify('net-recv-total');
    }

    public get net_sent_total() {
      return this._net_sent_total;
    }

    private set net_sent_total(v: number) {
      if (this.net_sent_total === v) {
        return;
      }
      this._net_sent_total = v;
      this.notify('net-sent-total');
    }

    public get disk_read() {
      return this._disk_read;
    }

    private set disk_read(v: number) {
      if (this.disk_read === v) {
        return;
      }
      this._disk_read = v;
      this.notify('disk-read');
    }

    public get disk_wrote() {
      return this._disk_wrote;
    }

    private set disk_wrote(v: number) {
      if (this.disk_wrote === v) {
        return;
      }
      this._disk_wrote = v;
      this.notify('disk-wrote');
    }

    public get disk_top_procs() {
      return this._disk_top_procs;
    }

    private set disk_top_procs(v: string) {
      if (this.disk_top_procs === v) {
        return;
      }
      this._disk_top_procs = v;
      this.notify('disk-top-procs');
    }

    public get uptime(): number {
      return this._uptime;
    }

    private set uptime(v: number) {
      if (this.uptime === v) {
        return;
      }
      this._uptime = v;
      this.notify('uptime');
    }
  }
);

export type Vitals = InstanceType<typeof Vitals>;

class CpuState {
  public usedTime: number;
  public usedTimePrev: number;
  public idleTime: number;
  public idleTimePrev: number;
  public coreUsedTime: Array<number>;
  public coreUsedTimePrev: Array<number>;
  public coreIdleTime: Array<number>;
  public coreIdleTimePrev: Array<number>;
  public freqs: Array<number>;
  public temps: Array<number>;
  public totalTimeDetails: number; // track for the details loop
  public totalTimeDetailsPrev: number;

  constructor(cores: number, sockets: number, usedTime = 0, idleTime = 0) {
    this.usedTime = usedTime;
    this.usedTimePrev = 0;
    this.idleTime = idleTime;
    this.idleTimePrev = 0;
    this.totalTimeDetails = 0;
    this.totalTimeDetailsPrev = 0;
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
    this.freqs = [];
    this.temps = [];
    for (let i = 0; i < sockets; i++) {
      this.freqs.push(0);
      this.temps.push(0);
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

  public updateDetails(totalTime: number) {
    this.totalTimeDetailsPrev = this.totalTimeDetails;
    this.totalTimeDetails = totalTime;
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
  public sockets: number;
  public tempMonitors: Map<number, string>;

  constructor(
    name = 'Unknown',
    cores = 1,
    sockets = 1,
    tempMonitors: Map<number, string>
  ) {
    this.name = name;
    this.cores = cores;
    this.sockets = sockets;
    this.tempMonitors = tempMonitors;
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

class NetDevState {
  public bytesRecv = 0;
  public bytesRecvPrev = 0;
  public bytesSent = 0;
  public bytesSentPrev = 0;

  public update(bytesRecv: number, bytesSent: number): void {
    this.bytesRecvPrev = this.bytesRecv;
    this.bytesRecv = bytesRecv;
    this.bytesSentPrev = this.bytesSent;
    this.bytesSent = bytesSent;
  }

  public recvActivity() {
    return this.bytesRecv - this.bytesRecvPrev;
  }

  public sentActivity() {
    return this.bytesSent - this.bytesSentPrev;
  }
}

class NetActivity {
  public bytesRecv = 0;
  public bytesSent = 0;
}

class DiskState {
  public bytesRead = 0;
  public bytesReadPrev = 0;
  public bytesWritten = 0;
  public bytesWrittenPrev = 0;

  public update(bytesRead: number, bytesWritten: number): void {
    this.bytesReadPrev = this.bytesRead;
    this.bytesRead = bytesRead;
    this.bytesWrittenPrev = this.bytesWritten;
    this.bytesWritten = bytesWritten;
  }

  public readActivity(): number {
    return this.bytesRead - this.bytesReadPrev;
  }

  public writeActivity(): number {
    return this.bytesWritten - this.bytesWrittenPrev;
  }
}

class DiskActivity {
  public bytesRead = 0;
  public bytesWritten = 0;
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
  public cpuTotal = 0;
  public diskRead = 0;
  public diskWrite = 0;
  public diskReadPrev = 0;
  public diskWritePrev = 0;

  public cpuUsage(): number {
    return (this.cpu - this.cpuPrev) / this.cpuTotal;
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

  public setTotalTime(t: number) {
    this.cpuTotal = t;
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
    this.cpuPrev = this.cpu;
    this.cpu = this.utime + this.stime;
  }

  public parseSmapsRollup(content: string) {
    const lines = content.split('\n');
    lines.forEach((line) => {
      if (line.startsWith('Pss:')) {
        this.pss = readKb(line) * 1024;
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
