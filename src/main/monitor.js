// Vigia a saúde de uma conta e recarrega sozinho quando ela cai.
//
// Sinais usados (todos passivos — nada é injetado nem enviado à página):
//  • a página travou (render-process-gone) ou parou de responder por um tempo;
//  • a página não carregou (did-fail-load);
//  • o WebSocket do jogo fechou e o próprio jogo não reabriu outro em 30 s
//    (observado pelo protocolo de depuração do Chromium, só eventos de abrir/fechar);
//  • o computador ficou sem internet (avisado pelo processo principal).
const { EventEmitter } = require('node:events');

const BACKOFF = [10, 30, 60, 120, 300];  // segundos entre tentativas
const GRACE_SOCKET = 30_000;             // tempo para o jogo reconectar sozinho
const WAIT_SOCKET_AFTER_RELOAD = 45_000; // depois de recarregar, quanto esperar o jogo conectar
const UNRESPONSIVE_WAIT = 20_000;
const STABLE_RESET = 120_000;            // conta saudável por 2 min zera as tentativas

const MESSAGES = {
  crash: 'A página travou',
  unresponsive: 'A página parou de responder',
  loadfail: 'A página não carregou',
  disconnected: 'Desconectada do jogo',
  login: 'Sem conexão com o jogo — talvez seja preciso entrar de novo',
  offline: 'Sem internet',
};

class AccountMonitor extends EventEmitter {
  constructor(wc, { auto = true, online = true } = {}) {
    super();
    this.wc = wc;
    this.auto = auto;
    this.online = online;
    this.problem = null;      // { kind, message, since }
    this.retryAt = null;
    this.attempts = 0;
    this.paused = false;
    this.sockets = new Set();
    this.seenSocket = false;
    this.failedThisLoad = false;
    this.timers = {};
    this.listen();
  }

  // ---------- sinais ----------
  listen() {
    const wc = this.wc;
    wc.on('did-start-navigation', (e, _url, inPlace, isMain) => {
      const main = e?.isMainFrame ?? isMain, same = e?.isSameDocument ?? inPlace;
      if (!main || same) return;
      this.sockets.clear();
      this.seenSocket = false;
      this.failedThisLoad = false;
      this.clear('socket');
      this.attachDebugger();
    });
    wc.on('did-fail-load', (_e, code, _desc, _url, isMain) => {
      if (!isMain || code === -3) return; // -3: navegação interrompida por outra
      this.failedThisLoad = true;
      this.raise('loadfail');
    });
    wc.on('did-finish-load', () => {
      if (this.failedThisLoad) return;
      if (['crash', 'loadfail', 'unresponsive', 'offline'].includes(this.problem?.kind)) this.resolve();
    });
    wc.on('render-process-gone', (_e, details) => {
      if (wc.isDestroyed() || details?.reason === 'clean-exit') return;
      this.sockets.clear();
      this.raise('crash');
    });
    wc.on('unresponsive', () => this.later('hang', UNRESPONSIVE_WAIT, () => this.raise('unresponsive')));
    wc.on('responsive', () => { this.clear('hang'); if (this.problem?.kind === 'unresponsive') this.resolve(); });
    this.attachDebugger();
  }

  attachDebugger() {
    const dbg = this.wc.debugger;
    if (this.wc.isDestroyed()) return;
    try {
      if (!dbg.isAttached()) {
        dbg.attach('1.3');
        if (!this.debuggerWired) {
          this.debuggerWired = true;
          dbg.on('message', (_e, method, params) => this.onProtocol(method, params));
        }
      }
      dbg.sendCommand('Network.enable', { maxTotalBufferSize: 1_000_000, maxResourceBufferSize: 100_000 }).catch(() => {});
    } catch { /* DevTools aberto ou página fechando: segue sem o sinal do socket */ }
  }

  pageHost() { try { return new URL(this.wc.getURL()).host; } catch { return ''; } }

  onProtocol(method, params) {
    if (method === 'Network.webSocketCreated') {
      let host = '';
      try { host = new URL(params.url).host; } catch {}
      if (!host || host !== this.pageHost()) return; // só o socket do próprio jogo
      this.sockets.add(params.requestId);
      this.seenSocket = true;
      this.clear('socket');
      this.clear('awaitSocket');
      if (['disconnected', 'login'].includes(this.problem?.kind)) this.resolve();
    } else if (method === 'Network.webSocketClosed') {
      if (!this.sockets.delete(params.requestId) || this.sockets.size) return;
      this.later('socket', GRACE_SOCKET, () => { if (!this.sockets.size) this.raise('disconnected'); });
    }
  }

  // ---------- estado ----------
  raise(kind) {
    if (!this.online && kind !== 'crash') kind = 'offline';
    const isNew = this.problem?.kind !== kind;
    if (isNew) {
      const first = !this.problem;
      this.problem = { kind, message: MESSAGES[kind], since: Date.now() };
      this.clear('stable');
      if (first) this.emit('alert', this.problem);
    }
    this.schedule();
    this.emit('change');
  }

  resolve() {
    if (!this.problem) return;
    this.problem = null;
    this.paused = false;
    this.retryAt = null;
    this.clear('retry');
    this.clear('awaitSocket');
    this.later('stable', STABLE_RESET, () => { this.attempts = 0; });
    this.emit('change');
  }

  schedule() {
    if (this.timers.retry || !this.problem) return;
    if (!this.auto || this.paused || !this.online || this.problem.kind === 'login') { this.retryAt = null; return; }
    if (this.attempts >= BACKOFF.length) { this.paused = true; this.retryAt = null; return; }
    const delay = BACKOFF[this.attempts] * 1000;
    this.retryAt = Date.now() + delay;
    this.later('retry', delay, () => this.retry());
  }

  retry() {
    this.retryAt = null;
    this.attempts++;
    const kind = this.problem?.kind;
    this.emit('reload', kind);
    if (kind === 'disconnected') {
      // Recarregou e o jogo não conectou: se acontecer duas vezes, provavelmente o login expirou.
      this.later('awaitSocket', WAIT_SOCKET_AFTER_RELOAD, () => {
        if (this.sockets.size || this.problem?.kind !== 'disconnected') return;
        if (this.attempts >= 2) { this.problem = { ...this.problem, kind: 'login', message: MESSAGES.login }; this.emit('change'); }
        else this.schedule();
        this.emit('change');
      });
    }
    this.emit('change');
  }

  // O jogador recarregou ou mudou o endereço: recomeça do zero.
  manual() {
    this.attempts = 0;
    this.paused = false;
    this.retryAt = null;
    for (const k of ['retry', 'awaitSocket', 'socket', 'hang']) this.clear(k);
    if (this.problem) { this.problem = null; this.emit('change'); }
  }

  dismiss() { this.manual(); }

  setAuto(auto) {
    this.auto = auto;
    if (!auto) { this.clear('retry'); this.retryAt = null; } else { this.paused = false; this.schedule(); }
    this.emit('change');
  }

  setOnline(online) {
    if (this.online === online) return;
    this.online = online;
    if (!online) {
      this.clear('retry');
      this.retryAt = null;
      if (this.problem && this.problem.kind !== 'crash') this.problem = { ...this.problem, kind: 'offline', message: MESSAGES.offline };
    } else if (this.problem) {
      // A internet voltou: recarrega já, sem esperar a contagem.
      this.attempts = 0;
      this.paused = false;
      this.retry();
    }
    this.emit('change');
  }

  get public() {
    if (!this.problem) return null;
    return { kind: this.problem.kind, message: this.problem.message, since: this.problem.since,
      retryAt: this.retryAt, paused: this.paused, auto: this.auto, attempts: this.attempts };
  }

  later(name, ms, fn) { this.clear(name); this.timers[name] = setTimeout(() => { delete this.timers[name]; fn(); }, ms); }
  clear(name) { clearTimeout(this.timers[name]); delete this.timers[name]; }

  dispose() {
    for (const k of Object.keys(this.timers)) this.clear(k);
    try { if (!this.wc.isDestroyed() && this.wc.debugger.isAttached()) this.wc.debugger.detach(); } catch {}
    this.removeAllListeners();
  }
}

module.exports = { AccountMonitor, BACKOFF, MESSAGES };
