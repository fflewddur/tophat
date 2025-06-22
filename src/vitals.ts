import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import GLib from 'gi://GLib';
import NM from 'gi://NM';

import { gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';

import { File } from './file.js';
import { NumTopProcs } from './monitor.js';
import { FSUsage, ONE_GB_IN_B, readFileSystems } from './helpers.js';

Gio._promisify(Gio.File.prototype, 'enumerate_children_async');
Gio._promisify(Gio.FileEnumerator.prototype, 'next_files_async');

const SummaryIntervalDefault = 2.5; // in seconds
const DetailsInterval = 5; // in seconds
const DetailsIntervalBackground = 60; // in seconds
const FileSystemInterval = 60; // in seconds
export const MaxHistoryLen = 50;

const MillisecondsPerSecond = 1000;
const SECTOR_SIZE = 512; // in bytes
const RE_MEM_INFO = /:\s+(\d+)/;
const RE_NET_DEV = /^\s*(\w+):/;
const RE_NET_ACTIVITY =
  /:\s*(\d+)\s+\d+\s+\d+\s+\d+\s+\d+\s+\d+\s+\d+\s+\d+\s+(\d+)/;
const RE_DISK_STATS =
  /^\s*\d+\s+\d+\s+(\w+)\s+\d+\s+\d+\s+(\d+)\s+\d+\s+\d+\s+\d+\s+(\d+)/;
const RE_NVME_DEV = /^nvme\d+n\d+$/;
const RE_BLOCK_DEV = /^[^\d]+$/;
const RE_CMD = /\/*[^\s]*\/([^\s]*)/;
const RE_LAUNCHER = /[^\s]*(python\d*|gjs)\b[^/]*(\/.*)$/;

export interface IActivity {
  val(): number;
  valAlt(): number;
  copy(): IActivity;
}

export interface IHistory {
  val(): number;
  copy(): IHistory;
}

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
        'Average CPU frequency across all cores, in GHz',
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
      'net-history': GObject.ParamSpec.string(
        'net-history',
        'Network activity history',
        'Network activity history',
        GObject.ParamFlags.READWRITE,
        ''
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
      'disk-read-total': GObject.ParamSpec.int(
        'disk-read-total',
        'Total bytes read from disk',
        'Number of bytes read from disk since system start.',
        GObject.ParamFlags.READWRITE,
        0,
        0,
        0
      ),
      'disk-wrote-total': GObject.ParamSpec.int(
        'disk-wrote-total',
        'Total bytes written to disk',
        'Number of bytes written to disk since system start.',
        GObject.ParamFlags.READWRITE,
        0,
        0,
        0
      ),
      'disk-history': GObject.ParamSpec.string(
        'disk-history',
        'Disk activity history',
        'Disk activity history.',
        GObject.ParamFlags.READWRITE,
        ''
      ),
      'disk-top-procs': GObject.ParamSpec.string(
        'disk-top-procs',
        'Disk activity top processes',
        'Top processes in terms of disk activity.',
        GObject.ParamFlags.READWRITE,
        ''
      ),
      'fs-usage': GObject.ParamSpec.int(
        'fs-usage',
        'Proportion of filesystem that is used',
        'Proportion of filesystem that is used.',
        GObject.ParamFlags.READWRITE,
        0,
        100,
        0
      ),
      'fs-list': GObject.ParamSpec.string(
        'fs-list',
        'Usage of each mounted filesystem',
        'Usage of each mounted filesystem.',
        GObject.ParamFlags.READWRITE,
        ''
      ),
      'summary-interval': GObject.ParamSpec.float(
        'summary-interval',
        'Refresh interval for the summary loop',
        'Refresh interval for the summary loop, in seconds.',
        GObject.ParamFlags.READWRITE,
        0,
        0,
        0
      ),
    },
  },
  class Vitals extends GObject.Object {
    private gsettings: Gio.Settings;
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
    private filesystems = new Array<FSUsage>();
    private props = new Properties();
    private summaryLoop = 0;
    private detailsLoop = 0;
    private fsLoop = 0;
    private groupRelated;
    private showCpu;
    private showMem;
    private showNet;
    private showDisk;
    private showFS;
    private netDev;
    private netDevs;
    private fsMount;
    private fsToHide;
    private settingSignals;
    private nm: NM.Client | null;
    private detailsInterval = DetailsIntervalBackground;
    private detailsNeededCtr = 0;

    constructor(model: CpuModel, gsettings: Gio.Settings) {
      super();
      this.gsettings = gsettings;
      this.cpuModel = model;
      this.cpuState = new CpuState(model.cores, model.tempMonitors.size);
      this.memInfo = new MemInfo();
      this.netState = new NetDevState();
      this.nm = null;

      for (let i = 0; i < this.cpuUsageHistory.length; i++) {
        this.cpuUsageHistory[i] = new CpuUsage(model.cores);
      }
      for (let i = 0; i < this.memUsageHistory.length; i++) {
        this.memUsageHistory[i] = new MemUsage();
      }
      for (let i = 0; i < this.netActivityHistory.length; i++) {
        this.netActivityHistory[i] = new NetActivity();
      }
      this.diskState = new DiskState();
      for (let i = 0; i < this.diskActivityHistory.length; i++) {
        this.diskActivityHistory[i] = new DiskActivity();
      }
      this.settingSignals = new Array<number>(0);
      this.summary_interval =
        SummaryIntervalDefault * refreshRateModifier(this.gsettings);
      let id = this.gsettings.connect('changed::refresh-rate', (settings) => {
        this.summary_interval =
          SummaryIntervalDefault * refreshRateModifier(settings);
        this.stop();
        this.start();
      });
      this.settingSignals.push(id);

      this.groupRelated = gsettings.get_boolean('group-procs');
      id = this.gsettings.connect(
        'changed::group-procs',
        (settings: Gio.Settings) => {
          this.groupRelated = settings.get_boolean('group-procs');
        }
      );
      this.settingSignals.push(id);
      this.showCpu = gsettings.get_boolean('show-cpu');
      id = this.gsettings.connect(
        'changed::show-cpu',
        (settings: Gio.Settings) => {
          this.showCpu = settings.get_boolean('show-cpu');
        }
      );
      this.settingSignals.push(id);

      this.showMem = gsettings.get_boolean('show-mem');
      id = this.gsettings.connect('changed::show-mem', (settings) => {
        this.showMem = settings.get_boolean('show-mem');
      });
      this.settingSignals.push(id);

      this.showNet = gsettings.get_boolean('show-net');
      id = this.gsettings.connect('changed::show-net', (settings) => {
        this.showNet = settings.get_boolean('show-net');
      });
      this.settingSignals.push(id);

      this.showDisk = gsettings.get_boolean('show-disk');
      id = this.gsettings.connect('changed::show-disk', (settings) => {
        this.showDisk = settings.get_boolean('show-disk');
      });
      this.settingSignals.push(id);

      this.showFS = gsettings.get_boolean('show-fs');
      id = this.gsettings.connect('changed::show-fs', (settings) => {
        this.showFS = settings.get_boolean('show-fs');
        if (this.showFS) {
          // The filesystem loop has a long refresh interval, so if the user enables this mid-session,
          // kick this off an immediate refresh to avoid missing data in the UI.
          this.loadFS();
        }
      });
      this.settingSignals.push(id);

      this.fsToHide = gsettings
        .get_string('fs-hide-in-menu')
        .split(';')
        .filter((s) => {
          return s.length > 0;
        });
      id = this.gsettings.connect('changed::fs-hide-in-menu', (settings) => {
        this.fsToHide = settings
          .get_string('fs-hide-in-menu')
          .split(';')
          .filter((s: string) => {
            return s.length > 0;
          });
        this.readFileSystemUsage();
      });
      this.netDev = gsettings.get_string('network-device');
      if (this.netDev === _('Automatic')) {
        this.netDev = '';
      }
      id = this.gsettings.connect('changed::network-device', (settings) => {
        this.netDev = settings.get_string('network-device');
        if (this.netDev === _('Automatic')) {
          this.netDev = '';
        }
        this.readSummaries();
      });
      this.settingSignals.push(id);

      this.fsMount = gsettings.get_string('mount-to-monitor');
      if (this.fsMount === _('Automatic')) {
        this.fsMount = '';
      }
      id = this.gsettings.connect('changed::mount-to-monitor', (settings) => {
        this.fsMount = settings.get_string('mount-to-monitor');
        if (this.fsMount === _('Automatic')) {
          this.fsMount = '';
        }
        this.readFileSystemUsage();
      });
      this.settingSignals.push(id);

      this.netDevs = new Array<string>();
      NM.Client.new_async(null, (obj, result) => {
        if (!obj) {
          console.error('[TopHat] obj is null');
          return;
        }
        this.nm = NM.Client.new_finish(result);
        if (!this.nm) {
          console.error('[TopHat] client is null');
          return;
        }
        this.nm.connect('notify::devices', (nm: NM.Client) => {
          this.updateNetDevices(nm);
        });
        this.updateNetDevices(this.nm);
      });
    }

    public start(): void {
      // Load our baseline immediately
      this.readSummaries();
      this.readDetails();
      this.readFileSystemUsage();

      // Regularly update from procfs and friends
      if (this.summaryLoop === 0) {
        this.summaryLoop = GLib.timeout_add(
          GLib.PRIORITY_LOW,
          this.summary_interval * MillisecondsPerSecond,
          () => this.readSummaries()
        );
      }
      if (this.detailsLoop === 0) {
        this.detailsLoop = GLib.timeout_add(
          GLib.PRIORITY_LOW,
          this.detailsInterval * MillisecondsPerSecond,
          () => this.readDetails()
        );
      }
      if (this.fsLoop === 0) {
        this.fsLoop = GLib.timeout_add(
          GLib.PRIORITY_LOW,
          FileSystemInterval * MillisecondsPerSecond,
          () => this.readFileSystemUsage()
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
      if (this.fsLoop > 0) {
        GLib.source_remove(this.fsLoop);
        this.fsLoop = 0;
      }
    }

    // readSummaries queries all of the info needed by the topbar widgets
    public readSummaries(): boolean {
      if (this.showCpu) {
        this.loadStat();
      }
      if (this.showMem) {
        this.loadMeminfo();
      }
      if (this.showNet) {
        this.loadNetDev();
      }
      if (this.showDisk || this.showFS) {
        this.loadDiskstats();
      }
      return true;
    }

    // readDetails queries the info needed by the monitor menus
    public readDetails(): boolean {
      const promises = new Array<Promise<void>>(0);
      if (this.showCpu) {
        promises.push(this.loadUptime());
        promises.push(this.loadTemps());
        promises.push(this.loadFreqs());
        promises.push(this.loadStatDetails());
      }
      Promise.allSettled(promises).then(async () => {
        if (this.showCpu || this.showMem || this.showDisk || this.showFS) {
          await this.loadProcessList();
          if (this.detailsLoop > 0) {
            GLib.source_remove(this.detailsLoop);
            this.detailsLoop = GLib.timeout_add(
              GLib.PRIORITY_LOW,
              this.detailsInterval * MillisecondsPerSecond,
              () => this.readDetails()
            );
          }
        }
      });

      return true;
    }

    // readFileSystemUsage runs the df command to monitor file system use
    public readFileSystemUsage(): boolean {
      if (this.showFS || this.showDisk) {
        this.loadFS();
      }
      return true;
    }

    public detailsNeededInUI(needed: boolean): void {
      // Use a counter so that if the user is moving one menu
      // to another, we don't interrupt the faster refresh cadence.
      if (needed) {
        this.detailsNeededCtr++;
      } else {
        this.detailsNeededCtr--;
      }

      // If we're switching from background to interactive mode, schedule
      // a quick refresh to fill the UI with recent data
      if (needed && this.detailsInterval === DetailsIntervalBackground) {
        if (this.detailsLoop > 0) {
          GLib.source_remove(this.detailsLoop);
          this.detailsLoop = GLib.timeout_add(
            GLib.PRIORITY_LOW,
            1.5 * MillisecondsPerSecond,
            () => this.readDetails()
          );
        }
      }
      // readDetails() will use this value for it's next refresh interval
      if (this.detailsNeededCtr > 0) {
        this.detailsInterval = DetailsInterval;
      } else {
        this.detailsInterval = DetailsIntervalBackground;
      }
    }

    private loadUptime(): Promise<void> {
      return new Promise<void>((resolve, reject) => {
        const f = new File('/proc/uptime');
        f.read()
          .then((line) => {
            this.uptime = parseInt(line.substring(0, line.indexOf(' ')));
            // console.log(`[TopHat] uptime = ${this.uptime}`);
            resolve();
          })
          .catch((e) => {
            console.warn(`[TopHat] error in loadUptime(): ${e}`);
            reject(e);
          });
      });
    }

    private loadStat() {
      const f = new File('/proc/stat');
      f.read()
        .then((contents) => {
          const lines = contents.split('\n');
          const usage = new CpuUsage(this.cpuModel.cores);
          lines.forEach((line: string) => {
            if (line.startsWith('cpu')) {
              const re = /^cpu(\d*)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)/;
              const m = line.match(re);
              if (m && !m[1]) {
                // These are aggregate CPU statistics
                const usedTime =
                  parseInt(m[2]) + parseInt(m[3]) + parseInt(m[4]);
                const idleTime = parseInt(m[5]);
                this.cpuState.update(usedTime, idleTime);
                usage.aggregate = this.cpuState.usage();
              } else if (m) {
                // These are per-core statistics
                const core = parseInt(m[1]);
                const usedTime =
                  parseInt(m[2]) + parseInt(m[3]) + parseInt(m[4]);
                const idleTime = parseInt(m[5]);
                this.cpuState.updateCore(core, usedTime, idleTime);
                usage.core[core] = this.cpuState.coreUsage(core);
              }
            }
          });
          if (this.cpuUsageHistory.unshift(usage) > MaxHistoryLen) {
            this.cpuUsageHistory.pop();
          }
          this.cpu_usage = usage.aggregate;
          this.cpu_history = this.hashCpuHistory();
        })
        .catch((e) => {
          console.warn(`[TopHat] error in loadStat(): ${e}`);
        });
    }

    private loadStatDetails(): Promise<void> {
      return new Promise<void>((resolve, reject) => {
        const f = new File('/proc/stat');
        f.read()
          .then((contents) => {
            const lines = contents.split('\n');
            for (const line of lines) {
              if (line.startsWith('cpu')) {
                const re = /^cpu(\d*)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)/;
                const m = line.match(re);
                if (m && !m[1]) {
                  // These are aggregate CPU statistics
                  const usedTime =
                    parseInt(m[2]) + parseInt(m[3]) + parseInt(m[4]);
                  const idleTime = parseInt(m[5]);
                  this.cpuState.updateDetails(usedTime + idleTime);
                  break;
                }
              }
            }
            resolve();
          })
          .catch((e) => {
            console.warn(`[TopHat] error in loadStatDetails(): ${e}`);
            reject(e);
          });
      });
    }

    private loadMeminfo() {
      const f = new File('/proc/meminfo');
      f.read()
        .then((contents) => {
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
          usage.usedMem = this.memInfo.usedMem();
          usage.usedSwap = this.memInfo.usedSwap();
          if (this.memUsageHistory.unshift(usage) > MaxHistoryLen) {
            this.memUsageHistory.pop();
          }
          this.ram_usage = usage.usedMem;
          this.ram_size = this.memInfo.memSize();
          this.ram_size_free = this.memInfo.freeMem();
          this.swap_usage = usage.usedSwap;
          this.swap_size = this.memInfo.swapSize();
          this.swap_size_free = this.memInfo.freeSwap();
          this.mem_history = this.hashMemHistory();
        })
        .catch((e) => {
          console.warn(`[TopHat] error in loadMeminfo(): ${e}`);
        });
    }

    private loadNetDev() {
      const f = new File('/proc/net/dev');
      f.read()
        .then((contents) => {
          const lines = contents.split('\n');
          let bytesRecv = 0;
          let bytesSent = 0;

          lines.forEach((line) => {
            let m = line.match(RE_NET_DEV);
            if (m) {
              const dev = m[1];
              if (
                (this.netDev && this.netDev === dev) ||
                (!this.netDev && this.netDevs.indexOf(dev) >= 0)
              ) {
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
          this.net_history = this.hashNetHistory();
        })
        .catch((e) => {
          console.warn(`[TopHat] error in loadNetDev(): ${e}`);
        });
    }

    private loadDiskstats() {
      const f = new File('/proc/diskstats');
      f.read()
        .then((contents) => {
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
          this.disk_read_total = bytesRead;
          this.disk_wrote_total = bytesWritten;
          this.disk_history = this.hashDiskHistory();
        })
        .catch((e) => {
          console.warn(`[TopHat] error in loadDiskStats(): ${e}`);
        });
    }

    private loadTemps(): Promise<void> {
      return new Promise<void>((resolve, reject) => {
        if (this.cpuModel.tempMonitors.size === 0) {
          resolve();
          return;
        }
        this.cpuModel.tempMonitors.forEach((file, i) => {
          const f = new File(file);
          f.read()
            .then((contents) => {
              this.cpuState.temps[i] = parseInt(contents);
              if (i === 0) {
                this.cpu_temp = Math.round(this.cpuState.temps[i] / 1000);
              }
              resolve();
            })
            .catch((e) => {
              console.warn(`[TopHat] error in loadTemp(): ${e}`);
              reject(e);
            });
        });
      });
    }

    private loadFreqs(): Promise<void> {
      return new Promise<void>((resolve, reject) => {
        const f = new File('/proc/cpuinfo');
        f.read()
          .then((contents) => {
            const blocks = contents.split('\n\n');
            let freq = 0;
            for (const block of blocks) {
              const m = block.match(/cpu MHz\s*:\s*(\d+)/);
              if (m) {
                freq += parseInt(m[1]);
              }
            }
            this.cpu_freq = Math.round(freq / this.cpuModel.cores / 100) / 10;
            resolve();
          })
          .catch((e) => {
            console.warn(`[TopHat] error in loadFreqs(): ${e}`);
            reject(e);
          });
      });
    }

    private async loadProcessList() {
      // This method needs to ensure it doesn't overwhelm the OS
      const curProcs = new Map<string, Process>();
      const directory = Gio.File.new_for_path('/proc/');
      try {
        // console.time('ls procfs');
        const iter = await directory
          .enumerate_children_async(
            Gio.FILE_ATTRIBUTE_STANDARD_NAME,
            Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS,
            GLib.PRIORITY_LOW,
            null
          )
          .catch((e) => {
            console.error(
              `Error enumerating children in loadProcessList(): ${e}`
            );
          });

        const psFiles = [];
        while (iter) {
          const fileInfos = await iter
            .next_files_async(10, GLib.PRIORITY_LOW, null)
            .catch((e) => {
              console.error(
                `Error calling next_files_async() in loadProcessList(): ${e}`
              );
            });
          if (!fileInfos || fileInfos.length === 0) {
            break;
          }
          for (const fileInfo of fileInfos) {
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
              psFiles.push(name);
            }
          }
        }
        // console.timeEnd('ls procfs');
        // console.time('reading process details');
        let promises = [];
        let i = 0;
        for (const name of psFiles) {
          promises.push(this.readProcFiles(name, curProcs));
          if (i >= 5) {
            await Promise.allSettled(promises);
            // sleep for 1 ms
            await new Promise((r) => setTimeout(r, 1));
            promises = [];
            i = 0;
          } else {
            i++;
          }
        }
        await Promise.allSettled(promises);
        this.procs = curProcs;
        // console.timeEnd('reading process details');
        // console.time('hashing procs');
        this.cpu_top_procs = this.hashTopCpuProcs();
        this.mem_top_procs = this.hashTopMemProcs();
        this.disk_top_procs = this.hashTopDiskProcs();
        // console.timeEnd('hashing procs');
      } catch (e) {
        console.error(`[TopHat] Error in loadProcessList(): ${e}`);
      }
    }

    private async readProcFiles(
      name: string,
      curProcs: Map<string, Process>
    ): Promise<void> {
      return new Promise<void>((resolve) => {
        this.loadProcessStat(name)
          .then((p) => {
            // console.log('loadProcessStat()');
            curProcs.set(p.id, p);
            p.setTotalTime(
              this.cpuState.totalTimeDetails -
                this.cpuState.totalTimeDetailsPrev
            );
            const actions = [];
            actions.push(this.loadCmdForProcess(p));
            if (this.showMem) {
              actions.push(this.loadSmapsRollupForProcess(p));
            }
            if (this.showDisk || this.showFS) {
              actions.push(this.loadIoForProcess(p));
            }
            Promise.allSettled(actions).then(() => {
              resolve();
            });
          })
          .catch(() => {
            // We expect to be unable to read many of these
            resolve();
          });
      });
    }

    private hashTopCpuProcs() {
      let toHash = '';
      for (const p of this.getTopCpuProcs(NumTopProcs)) {
        if (p) {
          toHash += `${p.cmd};${p.cpuUsage().toFixed(4)};`;
        }
      }
      const cs = GLib.Checksum.new(GLib.ChecksumType.MD5);
      cs.update(toHash);
      return cs.get_string();
    }

    private hashTopMemProcs() {
      let toHash = '';
      for (const p of this.getTopMemProcs(NumTopProcs)) {
        if (p) {
          toHash += `${p.cmd};${p.memUsage().toFixed(0)};`;
        }
      }
      const cs = GLib.Checksum.new(GLib.ChecksumType.MD5);
      cs.update(toHash);
      return cs.get_string();
    }

    private hashTopDiskProcs() {
      let toHash = '';
      for (const p of this.getTopDiskProcs(NumTopProcs)) {
        if (p) {
          toHash += `${p.cmd};${p.diskReads().toFixed(0)};${p.diskWrites().toFixed(0)};`;
        }
      }
      const cs = GLib.Checksum.new(GLib.ChecksumType.MD5);
      cs.update(toHash);
      return cs.get_string();
    }

    private async loadProcessStat(name: string): Promise<Process> {
      return new Promise<Process>((resolve, reject) => {
        const f = new File('/proc/' + name + '/stat');
        f.read()
          .then((contents) => {
            let p = this.procs.get(name);
            if (p === undefined) {
              p = new Process();
            }
            p.id = name;
            p.parseStat(contents);
            resolve(p);
          })
          .catch((e) => {
            // We expect to be unable to read many of these
            reject(e);
          });
      });
    }

    private async loadSmapsRollupForProcess(p: Process): Promise<void> {
      return new Promise<void>((resolve) => {
        const f = new File('/proc/' + p.id + '/smaps_rollup');
        f.read()
          .then((contents) => {
            p.parseSmapsRollup(contents);
            resolve();
          })
          .catch(() => {
            // We expect to be unable to read many of these
            resolve();
          });
      });
    }

    private async loadIoForProcess(p: Process): Promise<void> {
      return new Promise<void>((resolve) => {
        const f = new File('/proc/' + p.id + '/io');
        f.read()
          .then((contents) => {
            p.parseIo(contents);
            resolve();
          })
          .catch(() => {
            // We expect to be unable to read many of these
            resolve();
          });
      });
    }

    private loadCmdForProcess(p: Process): Promise<void> {
      return new Promise<void>((resolve) => {
        if (p.cmdLoaded) {
          resolve();
          return;
        }
        const f = new File('/proc/' + p.id + '/cmdline');
        f.read()
          .then((contents) => {
            p.parseCmd(contents);
            resolve();
          })
          .catch(() => {
            // We expect to be unable to read many of these
            resolve();
          });
      });
    }

    private loadFS(): void {
      // console.time('loadFS()');
      readFileSystems().then((fileSystems) => {
        this.filesystems = fileSystems.filter(
          (fs) => !this.fsToHide.includes(fs.mount)
        );
        if (!this.fsMount) {
          // Default to /home if it exists, / otherwise
          this.fsMount = '/';
          let hasHome = false;
          for (const v of this.filesystems) {
            if (v.mount === '/home') {
              hasHome = true;
            }
          }
          if (hasHome) {
            this.fsMount = '/home';
          }
          this.gsettings.set_string('mount-to-monitor', this.fsMount);
        }
        for (const fs of this.filesystems) {
          if (this.fsMount === fs.mount) {
            this.fs_usage = fs.usage();
          }
        }
        this.fs_list = this.hashFilesystems();
        // console.timeEnd('loadFS()');
      });
    }

    private updateNetDevices(client: NM.Client) {
      const devices = client.get_devices();
      this.netDevs = new Array<string>();
      for (const d of devices) {
        const dt = d.get_device_type();
        if (dt !== NM.DeviceType.BRIDGE && dt !== NM.DeviceType.LOOPBACK) {
          this.netDevs.push(d.get_iface());
        }
      }
    }

    public getTopCpuProcs(n: number) {
      let top = Array.from(this.procs.values());
      if (this.groupRelated) {
        top = groupRelatedProcs(top);
      }
      top = top.sort((x, y) => {
        return x.cpuUsage() - y.cpuUsage();
      });
      top = top
        .filter((p) => {
          return p.cpuUsage();
        })
        .reverse()
        .slice(0, n);
      return top;
    }

    public getTopMemProcs(n: number) {
      let top = Array.from(this.procs.values());
      if (this.groupRelated) {
        top = groupRelatedProcs(top);
      }
      top = top.sort((x, y) => {
        return x.memUsage() - y.memUsage();
      });
      // No need to filter this list; every proc always uses some memory
      top = top.reverse().slice(0, n);
      return top;
    }

    public getTopDiskProcs(n: number) {
      let top = Array.from(this.procs.values());
      if (this.groupRelated) {
        top = groupRelatedProcs(top);
      }
      top = top.sort((x, y) => {
        return (
          x.diskReads() + x.diskWrites() - (y.diskReads() + y.diskWrites())
        );
      });
      top = top
        .reverse()
        .slice(0, n)
        .filter((p) => {
          return p.diskReads() + p.diskWrites();
        });
      return top;
    }

    public getCpuCoreUsage() {
      const usage = new Array<number>(this.cpuModel.cores);
      for (let i = 0; i < usage.length; i++) {
        usage[i] = this.cpuState.coreUsage(i);
      }
      return usage;
    }

    public getCpuHistory() {
      return this.cpuUsageHistory;
    }

    public getMemHistory() {
      return this.memUsageHistory;
    }

    public getNetActivity() {
      return this.netActivityHistory;
    }

    public getDiskActivity() {
      return this.diskActivityHistory;
    }

    public getFilesystems() {
      return this.filesystems;
    }

    private hashCpuHistory() {
      // console.time('hashCpuHistory');
      let toHash = '';
      for (const u of this.cpuUsageHistory) {
        if (u) {
          toHash += (u.aggregate * 100).toFixed(0);
        }
      }
      const cs = GLib.Checksum.new(GLib.ChecksumType.MD5);
      cs.update(toHash);
      // console.log(`cpu toHash: ${toHash}`);
      const hash = cs.get_string();
      // console.timeEnd('hashCpuHistory');
      return hash;
    }

    private hashMemHistory() {
      // console.time('hashMemHistory');
      let toHash = '';
      for (const u of this.memUsageHistory) {
        if (u) {
          toHash += (u.usedMem * 100).toFixed(0);
        }
      }
      const cs = GLib.Checksum.new(GLib.ChecksumType.MD5);
      cs.update(toHash);
      // console.log(`mem toHash: ${toHash}`);
      const hash = cs.get_string();
      // console.timeEnd('hashMemHistory');
      return hash;
    }

    private hashNetHistory() {
      // console.time('hashNetHistory');
      let toHash = '';
      for (const u of this.netActivityHistory) {
        if (u) {
          // TODO: divide these vals by 1000 to avoid non-visible updates?
          toHash += `${u.bytesRecv.toFixed(0)}${u.bytesSent.toFixed(0)}`;
        }
      }
      const cs = GLib.Checksum.new(GLib.ChecksumType.MD5);
      cs.update(toHash);
      // console.log(`net toHash: ${toHash}`);
      const hash = cs.get_string();
      // console.timeEnd('hashNetHistory');
      return hash;
    }

    private hashDiskHistory() {
      // console.time('hashDiskHistory');
      let toHash = '';
      for (const u of this.diskActivityHistory) {
        if (u) {
          // TODO: divide these vals by 1000 to avoid non-visible updates?
          toHash += `${u.bytesRead.toFixed(0)}${u.bytesWritten.toFixed(0)}`;
        }
      }
      const cs = GLib.Checksum.new(GLib.ChecksumType.MD5);
      cs.update(toHash);
      // console.log(`disk toHash: ${toHash}`);
      const hash = cs.get_string();
      // console.timeEnd('hashDiskHistory');
      return hash;
    }

    private hashFilesystems() {
      // console.time('hashFS');
      let toHash = '';
      for (const fs of this.filesystems) {
        if (fs) {
          toHash += `${fs.mount}${fs.usage()}`;
        }
      }
      const cs = GLib.Checksum.new(GLib.ChecksumType.MD5);
      cs.update(toHash);
      // console.log(`fs toHash: ${toHash}`);
      const hash = cs.get_string();
      // console.timeEnd('hashFS');
      return hash;
    }

    // Properties

    public get cpu_usage(): number {
      return this.props.cpu_usage;
    }

    private set cpu_usage(v: number) {
      if (this.cpu_usage === v) {
        return;
      }
      this.props.cpu_usage = v;
      this.notify('cpu-usage');
    }

    public get cpu_model(): string {
      return this.cpuModel.name;
    }

    public get cpu_freq(): number {
      return this.props.cpu_freq;
    }

    private set cpu_freq(v: number) {
      if (this.cpu_freq === v) {
        return;
      }
      this.props.cpu_freq = v;
      this.notify('cpu-freq');
    }

    public get cpu_temp(): number {
      return this.props.cpu_temp;
    }

    private set cpu_temp(v: number) {
      if (this.cpu_temp === v) {
        return;
      }
      this.props.cpu_temp = v;
      this.notify('cpu-temp');
    }

    public get cpu_top_procs() {
      return this.props.cpu_top_procs;
    }

    private set cpu_top_procs(v: string) {
      if (this.cpu_top_procs === v) {
        return;
      }
      this.props.cpu_top_procs = v;
      this.notify('cpu-top-procs');
    }

    public get cpu_history() {
      return this.props.cpu_history;
    }

    private set cpu_history(v: string) {
      if (this.cpu_history === v) {
        return;
      }
      this.props.cpu_history = v;
      this.notify('cpu-history');
    }

    public get ram_usage(): number {
      return this.props.ram_usage;
    }

    private set ram_usage(v: number) {
      if (this.ram_usage === v) {
        return;
      }
      this.props.ram_usage = v;
      this.notify('ram-usage');
    }

    public get ram_size(): number {
      return this.props.ram_size;
    }

    private set ram_size(v: number) {
      if (this.ram_size === v) {
        return;
      }
      this.props.ram_size = v;
      this.notify('ram-size');
    }

    public get ram_size_free(): number {
      return this.props.ram_size_free;
    }

    public set ram_size_free(v: number) {
      if (this.props.ram_size_free === v) {
        return;
      }
      this.props.ram_size_free = v;
      this.notify('ram-size-free');
    }

    public get swap_usage(): number {
      return this.props.swap_usage;
    }

    private set swap_usage(v: number) {
      if (this.swap_usage === v) {
        return;
      }
      this.props.swap_usage = v;
      this.notify('swap-usage');
    }

    public get swap_size(): number {
      return this.props.swap_size;
    }

    private set swap_size(v: number) {
      if (this.swap_size === v) {
        return;
      }
      this.props.swap_size = v;
      this.notify('swap-size');
    }

    public get swap_size_free(): number {
      return this.props.swap_size_free;
    }

    public set swap_size_free(v: number) {
      if (this.swap_size_free === v) {
        return;
      }
      this.props.swap_size_free = v;
      this.notify('swap-size-free');
    }

    public get mem_history() {
      return this.props.mem_history;
    }

    private set mem_history(v: string) {
      if (this.mem_history === v) {
        return;
      }
      this.props.mem_history = v;
      this.notify('mem-history');
    }

    public get mem_top_procs() {
      return this.props.mem_top_procs;
    }

    private set mem_top_procs(v: string) {
      if (this.mem_top_procs === v) {
        return;
      }
      this.props.mem_top_procs = v;
      this.notify('mem-top-procs');
    }

    public get net_recv() {
      return this.props.net_recv;
    }

    private set net_recv(v: number) {
      if (this.net_recv === v) {
        return;
      }
      this.props.net_recv = v;
      this.notify('net-recv');
    }

    public get net_sent() {
      return this.props.net_sent;
    }

    private set net_sent(v: number) {
      if (this.net_sent === v) {
        return;
      }
      this.props.net_sent = v;
      this.notify('net-sent');
    }

    public get net_recv_total() {
      return this.props.net_recv_total;
    }

    private set net_recv_total(v: number) {
      if (this.net_recv_total === v) {
        return;
      }
      this.props.net_recv_total = v;
      this.notify('net-recv-total');
    }

    public get net_sent_total() {
      return this.props.net_sent_total;
    }

    private set net_sent_total(v: number) {
      if (this.net_sent_total === v) {
        return;
      }
      this.props.net_sent_total = v;
      this.notify('net-sent-total');
    }

    public get net_history() {
      return this.props.net_history;
    }

    private set net_history(v: string) {
      if (this.net_history === v) {
        return;
      }
      this.props.net_history = v;
      this.notify('net-history');
    }

    public get disk_read() {
      return this.props.disk_read;
    }

    private set disk_read(v: number) {
      if (this.disk_read === v) {
        return;
      }
      this.props.disk_read = v;
      this.notify('disk-read');
    }

    public get disk_wrote() {
      return this.props.disk_wrote;
    }

    private set disk_wrote(v: number) {
      if (this.disk_wrote === v) {
        return;
      }
      this.props.disk_wrote = v;
      this.notify('disk-wrote');
    }

    public get disk_read_total() {
      return this.props.disk_read_total;
    }

    private set disk_read_total(v: number) {
      if (this.disk_read_total === v) {
        return;
      }
      this.props.disk_read_total = v;
      this.notify('disk-read-total');
    }

    public get disk_wrote_total() {
      return this.props.disk_wrote_total;
    }

    private set disk_wrote_total(v: number) {
      if (this.disk_wrote_total === v) {
        return;
      }
      this.props.disk_wrote_total = v;
      this.notify('disk-wrote-total');
    }

    public get disk_history() {
      return this.props.disk_history;
    }

    private set disk_history(v: string) {
      if (this.disk_history === v) {
        return;
      }
      this.props.disk_history = v;
      this.notify('disk-history');
    }

    public get disk_top_procs() {
      return this.props.disk_top_procs;
    }

    private set disk_top_procs(v: string) {
      if (this.disk_top_procs === v) {
        return;
      }
      this.props.disk_top_procs = v;
      this.notify('disk-top-procs');
    }

    public get fs_usage() {
      return this.props.fs_usage;
    }

    private set fs_usage(v: number) {
      if (this.fs_usage === v) {
        return;
      }
      this.props.fs_usage = v;
      this.notify('fs-usage');
    }

    public get fs_list() {
      return this.props.fs_list;
    }

    public set fs_list(v: string) {
      if (this.fs_list === v) {
        return;
      }
      this.props.fs_list = v;
      this.notify('fs-list');
    }
    public get uptime(): number {
      return this.props.uptime;
    }

    private set uptime(v: number) {
      if (this.uptime === v) {
        return;
      }
      this.props.uptime = v;
      this.notify('uptime');
    }

    public get summary_interval() {
      return this.props.summary_interval;
    }

    private set summary_interval(v: number) {
      if (this.summary_interval === v) {
        return;
      }
      this.props.summary_interval = v;
      this.notify('summary-interval');
    }

    public override vfunc_dispose(): void {
      for (const s of this.settingSignals) {
        this.gsettings.disconnect(s);
      }
      super.vfunc_dispose();
    }
  }
);

class Properties {
  uptime = 0;
  cpu_usage = 0;
  cpu_freq = 0;
  cpu_temp = 0;
  cpu_history = '';
  cpu_top_procs = '';
  ram_usage = 0;
  ram_size = 0;
  ram_size_free = 0;
  swap_usage = -1;
  swap_size = -1;
  swap_size_free = 0;
  mem_history = '';
  mem_top_procs = '';
  net_recv = -1;
  net_sent = -1;
  net_recv_total = 0;
  net_sent_total = 0;
  net_history = '';
  disk_read = -1;
  disk_wrote = -1;
  disk_read_total = 0;
  disk_wrote_total = 0;
  disk_history = '';
  disk_top_procs = '';
  fs_usage = 0;
  fs_list = '';
  summary_interval = 0;
}

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
    return (
      Math.round((usedTimeDelta / (usedTimeDelta + idleTimeDelta)) * 1000) /
      1000
    );
  }

  public coreUsage(core: number): number {
    const usedTimeDelta = this.coreUsedTime[core] - this.coreUsedTimePrev[core];
    const idleTimeDelta = this.coreIdleTime[core] - this.coreIdleTimePrev[core];
    return (
      Math.round((usedTimeDelta / (usedTimeDelta + idleTimeDelta)) * 100) / 100
    );
  }

  public totalTime(): number {
    return (
      this.usedTime - this.usedTimePrev + (this.idleTime - this.idleTimePrev)
    );
  }
}

class CpuUsage implements IHistory {
  public aggregate: number;
  public core: Array<number>;

  constructor(cores: number) {
    this.aggregate = 0;
    this.core = new Array<number>(cores);
    for (let i = 0; i < cores; i++) {
      this.core[i] = 0;
    }
  }

  public val() {
    return this.aggregate;
  }

  public copy() {
    const c = new CpuUsage(this.core.length);
    c.aggregate = this.aggregate;
    for (const val of this.core) {
      c.core.push(val);
    }
    return c;
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

  public usedMem(): number {
    let u =
      Math.round(((this.total - this.available) / this.total) * 100) / 100;
    if (Number.isNaN(u)) {
      u = 0;
    }
    return u;
  }

  public usedSwap(): number {
    let u =
      Math.round(
        ((this.swapTotal - this.swapAvailable) / this.swapTotal) * 100
      ) / 100;
    if (Number.isNaN(u)) {
      u = 0;
    }
    return u;
  }

  public memSize(): number {
    let s = (Math.round((this.total * 1024) / ONE_GB_IN_B) * 10) / 10;
    if (Number.isNaN(s)) {
      s = 0;
    }
    return s;
  }

  public swapSize(): number {
    let s = Math.round(((this.swapTotal * 1024) / ONE_GB_IN_B) * 10) / 10;
    if (Number.isNaN(s)) {
      s = 0;
    }
    return s;
  }

  public freeMem(): number {
    let f = Math.round(((this.available * 1024) / ONE_GB_IN_B) * 10) / 10;
    if (Number.isNaN(f)) {
      f = 0;
    }
    return f;
  }

  public freeSwap(): number {
    let f = Math.round(((this.swapAvailable * 1024) / ONE_GB_IN_B) * 10) / 10;
    if (Number.isNaN(f)) {
      f = 0;
    }
    return f;
  }
}

class MemUsage implements IHistory {
  public usedMem = 0;
  public usedSwap = 0;

  public val() {
    return this.usedMem;
  }

  public copy() {
    const c = new MemUsage();
    c.usedMem = this.usedMem;
    c.usedSwap = this.usedSwap;
    return c;
  }

  public toString(): string {
    return `Memory usage: ${this.usedMem.toFixed(2)} Swap usage: ${this.usedSwap.toFixed(2)}`;
  }
}

class NetDevState {
  private bytesRecv = -1;
  private bytesRecvPrev = -1;
  private bytesSent = -1;
  private bytesSentPrev = -1;
  private ts = 0; // timestamp in seconds
  private tsPrev = 0;

  public update(bytesRecv: number, bytesSent: number, now = 0): void {
    if (!now) {
      now = Date.now();
    }
    if (now <= this.ts) {
      // This update was processed too slowly and is out of date
      return;
    }
    this.bytesRecvPrev = this.bytesRecv;
    this.bytesRecv = bytesRecv;
    this.bytesSentPrev = this.bytesSent;
    this.bytesSent = bytesSent;
    this.tsPrev = this.ts;
    this.ts = now;
  }

  // recvActivity returns the number of bytes received per second
  // during the most recent interval
  public recvActivity() {
    if (this.bytesRecvPrev < 0) {
      return 0;
    }
    if (this.ts <= this.tsPrev) {
      console.warn('recvActivity times are reversed!');
    }
    const retval = Math.round(
      (this.bytesRecv - this.bytesRecvPrev) / ((this.ts - this.tsPrev) / 1000)
    );
    if (retval < 0) {
      console.warn(
        `negative value for network activity: bytesRecv=${this.bytesRecv}, bytesRecvPrev=${this.bytesRecvPrev}`
      );
    }
    return retval;
  }

  // sentActivity return the number of bytes sent per second
  // during the most recent interval
  public sentActivity() {
    if (this.bytesSentPrev < 0) {
      return 0;
    }
    if (this.ts <= this.tsPrev) {
      console.warn('sentActivity times are reversed!');
    }
    const retval = Math.round(
      (this.bytesSent - this.bytesSentPrev) / ((this.ts - this.tsPrev) / 1000)
    );
    if (retval < 0) {
      console.warn(
        `negative value for network activity: bytesSent=${this.bytesSent}, bytesSentPrev=${this.bytesSentPrev}`
      );
    }
    return retval;
  }
}

class NetActivity implements IActivity {
  public bytesRecv = 0;
  public bytesSent = 0;

  public val() {
    return this.bytesRecv;
  }

  public valAlt() {
    return this.bytesSent;
  }

  public copy() {
    const c = new NetActivity();
    c.bytesRecv = this.bytesRecv;
    c.bytesSent = this.bytesSent;
    return c;
  }
}

class DiskState {
  private bytesRead = -1;
  private bytesReadPrev = -1;
  private bytesWritten = -1;
  private bytesWrittenPrev = -1;
  private ts = 0; // timestamp in seconds
  private tsPrev = 0;

  public update(bytesRead: number, bytesWritten: number, now = 0): void {
    if (!now) {
      now = Date.now();
    }
    if (now <= this.ts) {
      // This update was processed too slowly and is out of date
      return;
    }
    this.bytesReadPrev = this.bytesRead;
    this.bytesRead = bytesRead;
    this.bytesWrittenPrev = this.bytesWritten;
    this.bytesWritten = bytesWritten;
    this.tsPrev = this.ts;
    this.ts = now;
  }

  // readActivity returns the number of bytes read per second
  // during the most recent interval
  public readActivity(): number {
    if (this.bytesReadPrev < 0) {
      return 0;
    }
    if (this.ts <= this.tsPrev) {
      console.warn('readActivity times are reversed!');
    }
    const retval = Math.round(
      (this.bytesRead - this.bytesReadPrev) / ((this.ts - this.tsPrev) / 1000)
    );
    // console.log(`returning readActivity: ${retval}`);
    return retval;
  }

  // writeActivity return the number of bytes written per second
  // during the most recent interval
  public writeActivity(): number {
    if (this.bytesWrittenPrev < 0) {
      return 0;
    }
    if (this.ts <= this.tsPrev) {
      console.warn('writeActivity times are reversed!');
    }
    const retval = Math.round(
      (this.bytesWritten - this.bytesWrittenPrev) /
        ((this.ts - this.tsPrev) / 1000)
    );
    // console.log(`returning writeActivity: ${retval}`);
    return retval;
  }
}

class DiskActivity implements IActivity {
  public bytesRead = 0;
  public bytesWritten = 0;

  public val() {
    return this.bytesWritten;
  }

  public valAlt() {
    return this.bytesRead;
  }

  public copy() {
    const c = new DiskActivity();
    c.bytesRead = this.bytesRead;
    c.bytesWritten = this.bytesWritten;
    return c;
  }
}

class Process {
  public id = '';
  private iterationCpu = 0; // Number of times we've loaded CPU activity for this process
  private iterationIo = 0; // Number of times we've loaded IO activity for this process
  public cmd = '';
  public cmdLoaded = false;
  private utime = 0;
  private stime = 0;
  public pss = 0;
  public cpu = 0;
  public cpuPrev = 0;
  public cpuTotal = 0;
  public diskRead = 0;
  public diskWrite = 0;
  public diskReadPrev = 0;
  public diskWritePrev = 0;
  public count = 1;

  public cpuUsage(): number {
    // if (this.cpuPrev < 0) {
    // return 0;
    // }
    return (this.cpu - this.cpuPrev) / this.cpuTotal;
  }

  public memUsage(): number {
    return this.pss;
  }

  public diskReads(): number {
    // if (this.diskReadPrev < 0) {
    //   return 0;
    // }
    return (this.diskRead - this.diskReadPrev) / DetailsInterval;
  }

  public diskWrites(): number {
    // if (this.diskWritePrev < 0) {
    //   return 0;
    // }
    return (this.diskWrite - this.diskWritePrev) / DetailsInterval;
  }

  public setTotalTime(t: number) {
    this.cpuTotal = t;
  }

  public parseStat(stat: string) {
    const open = stat.indexOf('(');
    const close = stat.indexOf(')');
    if (!this.cmd && open > 0 && close > 0) {
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

  public parseCmd(content: string) {
    if (content) {
      this.cmd = content;
      // If this is an absolute cmd path, remove the path
      if (content[0] === '/' || content[0] === '.') {
        let m = content.match(RE_CMD);
        if (m) {
          const cmd = m[1];
          m = content.match(RE_LAUNCHER);
          if (m && m[2]) {
            this.parseCmd(m[2]);
          } else {
            this.cmd = cmd;
          }
        }
      }
      this.cmdLoaded = true;
    }
  }

  public groupWith(other: Process) {
    this.utime += other.utime;
    this.stime += other.stime;
    this.pss += other.pss;
    this.cpu += other.cpu;
    this.cpuPrev += other.cpuPrev;
    this.diskRead += other.diskRead;
    this.diskReadPrev += other.diskReadPrev;
    this.diskWrite += other.diskWrite;
    this.diskWritePrev += other.diskWritePrev;
    this.count += other.count;
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

function refreshRateModifier(settings: Gio.Settings): number {
  const val = settings.get_string('refresh-rate');
  let modifier = 1.0;
  switch (val) {
    case 'slow':
      modifier = 2.0;
      break;
    case 'fast':
      modifier = 0.5;
      break;
  }
  return modifier;
}

// Take an array of processes and aggregate their statistics by their 'cmd' property
function groupRelatedProcs(top: Process[]) {
  const grouped = new Map<string, Process>();
  for (const v of top) {
    let p = grouped.get(v.cmd);
    if (p) {
      p.groupWith(v);
    } else {
      p = new Process();
      p.cmd = v.cmd;
      p.cmdLoaded = v.cmdLoaded;
      p.cpu = v.cpu;
      p.cpuPrev = v.cpuPrev;
      p.cpuTotal = v.cpuTotal;
      p.diskRead = v.diskRead;
      p.diskReadPrev = v.diskReadPrev;
      p.diskWrite = v.diskWrite;
      p.diskWritePrev = v.diskWritePrev;
      p.pss = v.pss;
    }
    grouped.set(p.cmd, p);
  }
  top = Array.from(grouped.values());
  return top;
}
